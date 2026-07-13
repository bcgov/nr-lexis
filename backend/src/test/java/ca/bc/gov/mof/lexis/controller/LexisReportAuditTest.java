package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import ca.bc.gov.mof.lexis.service.report.LexisReportGenerationException;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class LexisReportAuditTest {

  @Mock private ObjectProvider<LexisReportService> reportServiceProvider;
  @Mock private LexisReportService reportService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private LexisPrincipalService principalService;
  @Mock private Authentication authentication;

  @BeforeEach
  void setUpSecurityContext() {
    SecurityContextHolder.getContext().setAuthentication(authentication);
  }

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void successfulModernReportShouldAuditStableActorAndFormatsWithoutFilters(
      CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication))
        .thenReturn("idir\\jsmith\nforged=true");
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(
            Optional.of(
                new LexisGeneratedReport(
                    "forced-report.pdf", "application/pdf", new byte[] {1, 2, 3, 4})));

    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    LexisReportController controller = reportController(meterRegistry);
    var response =
        controller.offerReport(
            new LexisReportRequestDto(
                Map.of("clientNumber", "secret-filter-value"), " xls "));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(output).contains("outcome=generation_succeeded");
    assertThat(meterRegistry.find("lexis_report_stream_writes_total").counter()).isNull();
    consume(response);
    assertThat(output)
        .contains("event=lexis_report")
        .contains("actor=idir\\jsmith_forged_true")
        .contains("reportAction=offerReport")
        .contains("requestedFormat=XLS")
        .contains("effectiveFormat=PDF")
        .contains("status=200")
        .contains("outcome=generation_succeeded")
        .contains("outcome=stream_write_succeeded")
        .contains("durationMs=")
        .contains("bytes=4")
        .doesNotContain("clientNumber")
        .doesNotContain("secret-filter-value");
    assertThat(
            meterRegistry
                .get("lexis_report_stream_writes_total")
                .tags(
                    "report_action", "offerReport",
                    "format", "PDF",
                    "outcome", "success")
                .counter()
                .count())
        .isEqualTo(1.0);
  }

  @Test
  void failedClientTransferShouldAuditAndCountFailureWhilePropagatingIOException(
      CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(
            Optional.of(
                new LexisGeneratedReport(
                    "report.pdf", "application/pdf", new byte[] {1, 2, 3})));
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    var response =
        reportController(meterRegistry)
            .offerReport(new LexisReportRequestDto(Map.of(), "PDF"));
    OutputStream failingOutput =
        new OutputStream() {
          @Override
          public void write(int value) throws IOException {
            throw new IOException("client disconnected");
          }

          @Override
          public void write(byte[] bytes, int offset, int length) throws IOException {
            throw new IOException("client disconnected");
          }
        };

    assertThatThrownBy(() -> response.getBody().writeTo(failingOutput))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("client disconnected");

    assertThat(output)
        .contains("outcome=generation_succeeded")
        .contains("event=lexis_report_stream")
        .contains("outcome=stream_write_failed")
        .doesNotContain("outcome=stream_write_succeeded");
    assertThat(
            meterRegistry
                .get("lexis_report_stream_writes_total")
                .tags(
                    "report_action", "offerReport",
                    "format", "PDF",
                    "outcome", "failure")
                .counter()
                .count())
        .isEqualTo(1.0);
  }

  @Test
  void reportFailureShouldEmitFailureAuditWithoutFilters(CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenThrow(
            new LexisReportGenerationException(
                "generation failed", new IllegalStateException("database unavailable")));

    var response =
        reportController()
            .offerReport(
                new LexisReportRequestDto(
                    Map.of("clientNumber", "another-secret-filter"), "CSV"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(output)
        .contains("event=lexis_report")
        .contains("actor=idir\\jsmith")
        .contains("reportAction=offerReport")
        .contains("requestedFormat=CSV")
        .contains("effectiveFormat=UNAVAILABLE")
        .contains("status=500")
        .contains("outcome=generation_failed")
        .contains("bytes=0")
        .doesNotContain("clientNumber")
        .doesNotContain("another-secret-filter");
  }

  @Test
  void invalidFormatShouldBeAuditedThenUseTheExistingValidationResponse(CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");

    assertThatThrownBy(
            () ->
                reportController()
                    .offerReport(
                        new LexisReportRequestDto(
                            Map.of("privateFilter", "must-not-be-logged"), "PPTX")))
        .isInstanceOf(LexisReportValidationException.class);

    assertThat(output)
        .contains("event=lexis_report")
        .contains("requestedFormat=INVALID")
        .contains("status=400")
        .contains("outcome=validation_failed")
        .doesNotContain("privateFilter")
        .doesNotContain("must-not-be-logged");
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void reportShouldFailClosedAndAuditWhenStableActorCannotBeResolved(CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication)).thenReturn(null);

    var response = reportController().offerReport(new LexisReportRequestDto(Map.of(), "PDF"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(output)
        .contains("event=lexis_report")
        .contains("actor=UNRESOLVED")
        .contains("reportAction=offerReport")
        .contains("status=403")
        .contains("outcome=identity_rejected")
        .contains("bytes=0");
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void generatedLegacyReportShouldUseTheSameSingleAuditPath(CapturedOutput output) {
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\legacy-user");
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(
            Optional.of(
                new LexisGeneratedReport(
                    "legacy-offer.csv", "application/vnd.ms-excel", new byte[] {8, 9})));

    LegacyReportRouteController controller =
        new LegacyReportRouteController(reportController());
    MockHttpServletRequest servletRequest =
        new MockHttpServletRequest("POST", "/api/lexis/offerReport.do");
    MultiValueMap<String, String> multiValueParameters = new LinkedMultiValueMap<>();
    multiValueParameters.put("actionMapping", List.of("generateCsv"));
    multiValueParameters.put("clientNumber", List.of("legacy-private-filter"));

    var response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateCsv",
                "clientNumber", "legacy-private-filter"),
            multiValueParameters,
            servletRequest,
            authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    consume(response);
    String logs = output.getOut();
    assertThat(logs)
        .contains("actor=idir\\legacy-user")
        .contains("reportAction=offerReport")
        .contains("requestedFormat=CSV")
        .contains("effectiveFormat=CSV")
        .contains("status=200")
        .contains("outcome=generation_succeeded")
        .contains("outcome=stream_write_succeeded")
        .contains("bytes=2")
        .doesNotContain("legacy-private-filter");
    assertThat(countOccurrences(logs, "event=lexis_report actor=")).isEqualTo(1);
    assertThat(countOccurrences(logs, "event=lexis_report_stream actor=")).isEqualTo(1);
  }

  private LexisReportController reportController() {
    return new LexisReportController(
        reportServiceProvider, provincialAuthorizationService, principalService);
  }

  private LexisReportController reportController(SimpleMeterRegistry meterRegistry) {
    return new LexisReportController(
        reportServiceProvider,
        provincialAuthorizationService,
        principalService,
        meterRegistry);
  }

  private void consume(ResponseEntity<StreamingResponseBody> response) {
    if (response.getBody() == null) {
      return;
    }
    try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
      response.getBody().writeTo(outputStream);
    } catch (IOException exception) {
      throw new AssertionError("Unable to consume streamed report response", exception);
    }
  }

  private int countOccurrences(String value, String needle) {
    int count = 0;
    int fromIndex = 0;
    while ((fromIndex = value.indexOf(needle, fromIndex)) >= 0) {
      count++;
      fromIndex += needle.length();
    }
    return count;
  }
}

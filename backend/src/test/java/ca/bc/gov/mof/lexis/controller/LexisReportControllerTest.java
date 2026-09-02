package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.test.ReportTestArtifacts.report;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import ca.bc.gov.mof.lexis.service.report.LexisReportCapacityException;
import ca.bc.gov.mof.lexis.service.report.LexisReportGenerationException;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisReportController")
class LexisReportControllerTest {

  @Mock private ObjectProvider<LexisReportService> reportServiceProvider;
  @Mock private LexisReportService reportService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private LexisPrincipalService principalService;
  @Mock private Authentication authentication;

  @BeforeEach
  void setUpAuthenticatedActor() {
    SecurityContextHolder.getContext().setAuthentication(authentication);
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
  }

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void reportShouldReturnServiceUnavailableWhenServiceMissing() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(null);
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(sampleRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(new String(responseBody(response), StandardCharsets.UTF_8))
        .contains("temporarily unavailable");
    verifyNoInteractions(reportService);
  }

  @Test
  void reportShouldReturnNoContentOnlyWhenServiceReturnsNoData() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(Optional.empty());
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(sampleRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
  }

  @Test
  void reportGenerationFailureShouldReturnServerError() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenThrow(new LexisReportGenerationException("Oracle failed", new RuntimeException("down")));
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(sampleRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(new String(responseBody(response), StandardCharsets.UTF_8))
        .contains("Unable to generate")
        .doesNotContain("Oracle failed")
        .doesNotContain("down");
  }

  @Test
  void reportCapacityShouldReturnRetryableServiceUnavailable() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenThrow(new LexisReportCapacityException());
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(sampleRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("5");
    assertThat(new String(responseBody(response), StandardCharsets.UTF_8))
        .contains("try again shortly");
  }

  @Test
  void reportShouldRejectUnknownFormatBeforeCallingService() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    assertThatThrownBy(
            () -> controller.offerReport(new LexisReportRequestDto(Map.of(), "PPTX")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessage("Report format must be PDF, CSV, XLS, or XLSX.");
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void reportShouldRejectKnownUnsupportedFormatsBeforeCallingService() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    for (String format : java.util.List.of("DOC", "DOCX", "RTF")) {
      assertThatThrownBy(
              () -> controller.offerReport(new LexisReportRequestDto(Map.of(), format)))
          .isInstanceOf(LexisReportValidationException.class)
          .hasMessage("Report format must be PDF, CSV, XLS, or XLSX.");
    }
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void reportShouldRejectNullParameterValuesBeforeCallingService() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);
    Map<String, String> parameters = new HashMap<>();
    parameters.put("fromDate", null);

    assertThatThrownBy(
            () ->
                controller.offerReport(
                    new LexisReportRequestDto(parameters, "PDF")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessage("Report parameter 'fromDate' must not be null.");
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void reportShouldRejectInvalidAndReversedDateRangesBeforeCallingService() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    assertThatThrownBy(
            () ->
                controller.offerReport(
                    new LexisReportRequestDto(
                        Map.of("listingFromDate", "2026-02-30"), "PDF")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessageContaining("listingFromDate")
        .hasMessageContaining("yyyy-MM-dd");
    assertThatThrownBy(
            () ->
                controller.offerReport(
                    new LexisReportRequestDto(
                        Map.of(
                            "withdrawnFromDate", "2026-07-02",
                            "withdrawnToDate", "2026-07-01"),
                        "PDF")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessageContaining("withdrawnFromDate")
        .hasMessageContaining("must not be reversed");
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void reportShouldNormalizeLegacyDatesAndFormatBeforeCallingService() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(Optional.of(sampleGeneratedReport()));
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    responseBody(
        controller.offerReport(
            new LexisReportRequestDto(
                Map.of(
                    "fromDate", " 07/01/2026 ",
                    "toDate", "07/12/2026"),
                " csv ")));

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportService).generateReport(eq("offerReport"), requestCaptor.capture());
    assertThat(requestCaptor.getValue())
        .isEqualTo(
            new LexisReportRequestDto(
                Map.of(
                    "fromDate", "2026-07-01",
                    "toDate", "2026-07-12"),
                "CSV"));
  }

  @Test
  void biweeklyListingShouldDelegateToReportService() {
    assertDelegatesTo("biweeklyListing", controller -> controller.biweeklyListing(sampleRequest()));
  }

  @Test
  void offerReportShouldDelegateToReportService() {
    assertDelegatesTo("offerReport", controller -> controller.offerReport(sampleRequest()));
  }

  @Test
  void speciesGradeReportShouldDelegateToReportService() {
    assertDelegatesTo("speciesGradeReport", controller -> controller.speciesGradeReport(sampleRequest()));
  }

  @Test
  void exemptionReportShouldDelegateToReportService() {
    assertDelegatesTo("exemptionReport", controller -> controller.exemptionReport(sampleRequest()));
  }

  @Test
  void applicationReportShouldDelegateToReportService() {
    assertDelegatesTo("applicationReport", controller -> controller.applicationReport(sampleRequest()));
  }

  @Test
  void applicationReportShouldRejectUnboundedRequest() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    assertThatThrownBy(
            () ->
                controller.applicationReport(
                    new LexisReportRequestDto(Map.of("region", "0"), "PDF")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessageContaining("Choose at least one Application Report filter before generating");
    verifyNoInteractions(reportService);
  }

  @Test
  void reportValidationErrorShouldPropagateToApiExceptionHandler() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);
    when(reportService.generateReport(eq("biweeklyListing"), any(LexisReportRequestDto.class)))
        .thenThrow(
            new LexisReportValidationException(
                "Choose a Listing from date and Listing to date before generating the Advertising List."));

    assertThatThrownBy(
            () -> controller.biweeklyListing(new LexisReportRequestDto(Map.of(), "PDF")))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessageContaining("Listing from date")
        .hasMessageContaining("Listing to date");
  }

  @Test
  void approvedExemptionReportShouldDelegateToReportService() {
    assertDelegatesTo(
        "approvedExemptionReport",
        controller -> controller.approvedExemptionReport(approvedExemptionRequest(), authentication));
    verify(provincialAuthorizationService).requireExemption(authentication, "EX-205");
    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportService).generateReport(eq("approvedExemptionReport"), requestCaptor.capture());
    assertThat(requestCaptor.getValue().parameters())
        .containsEntry("exemptionNumber", "EX-205");
  }

  @Test
  void permitReportShouldDelegateToReportService() {
    assertDelegatesTo(
        "permitReport", controller -> controller.permitReport(permitRequest(), authentication));
    verify(provincialAuthorizationService).requirePermit(authentication, 7000123L);
    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportService).generateReport(eq("permitReport"), requestCaptor.capture());
    assertThat(requestCaptor.getValue().parameters())
        .containsEntry("permitNumber", "7000123");
  }

  @Test
  void approvedExemptionReportShouldRejectMissingExemptionNumberBeforeAuthorization() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    assertThatThrownBy(() -> controller.approvedExemptionReport(sampleRequest(), authentication))
        .isInstanceOf(LexisReportValidationException.class)
        .hasMessageContaining("Exemption number is required");
    verifyNoInteractions(provincialAuthorizationService, reportServiceProvider, reportService);
  }

  @Test
  void permitReportShouldRejectMissingOrInvalidPermitNumberBeforeAuthorization() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    for (String permitNumber : java.util.List.of("", "0", "-1", "not-a-number")) {
      assertThatThrownBy(
              () ->
                  controller.permitReport(
                      new LexisReportRequestDto(Map.of("permitNumber", permitNumber), "PDF"),
                      authentication))
          .isInstanceOf(LexisReportValidationException.class)
          .hasMessageContaining("positive integer");
    }
    verifyNoInteractions(provincialAuthorizationService, reportServiceProvider, reportService);
  }

  @Test
  void contextualReportsShouldReturnForbiddenWhenObjectAuthorizationFails() {
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);
    doThrow(new AccessDeniedException("outside scope"))
        .when(provincialAuthorizationService)
        .requireExemption(authentication, "EX-205");
    doThrow(new AccessDeniedException("outside scope"))
        .when(provincialAuthorizationService)
        .requirePermit(authentication, 7000123L);

    ResponseEntity<StreamingResponseBody> exemptionResponse =
        controller.approvedExemptionReport(approvedExemptionRequest(), authentication);
    ResponseEntity<StreamingResponseBody> permitResponse =
        controller.permitReport(permitRequest(), authentication);

    assertThat(exemptionResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(permitResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  @Test
  void permitLedgerReportShouldDelegateToReportService() {
    assertDelegatesTo("permitLedgerReport", controller -> controller.permitLedgerReport(sampleRequest()));
  }

  @Test
  void feeReportShouldDelegateToReportService() {
    assertDelegatesTo("feeReport", controller -> controller.feeReport(sampleRequest()));
  }

  @Test
  void transportReportShouldDelegateToReportService() {
    assertDelegatesTo("transportReport", controller -> controller.transportReport(sampleRequest()));
  }

  @Test
  void teacReportShouldDelegateToReportService() {
    assertDelegatesTo("teacReport", controller -> controller.teacReport(sampleRequest()));
  }

  @Test
  void tenureReportShouldDelegateToReportService() {
    assertDelegatesTo("tenureReport", controller -> controller.tenureReport(sampleRequest()));
  }

  @Test
  void nullRequestShouldDefaultToPdfAndEmptyParameters() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenAnswer(
            invocation -> {
              LexisReportRequestDto request = invocation.getArgument(1);
              assertThat(request.parameters()).isEmpty();
              assertThat(request.format()).isEqualTo("PDF");
              return Optional.of(sampleGeneratedReport());
            });

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    responseBody(response);
  }

  private void assertDelegatesTo(
      String expectedReportAction,
      Function<LexisReportController, ResponseEntity<StreamingResponseBody>> invoker) {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);
    when(reportService.generateReport(eq(expectedReportAction), any(LexisReportRequestDto.class)))
        .thenReturn(Optional.of(sampleGeneratedReport()));

    ResponseEntity<StreamingResponseBody> response = invoker.apply(controller);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("lexis-report.pdf");
    assertThat(response.getHeaders().getContentLength()).isEqualTo(3L);
    TemporaryReportStreamingBody stagedBody =
        (TemporaryReportStreamingBody) response.getBody();
    assertThat(stagedBody).isNotNull();
    assertThat(Files.exists(stagedBody.temporaryFile())).isTrue();
    assertThat(responseBody(response)).containsExactly(1, 2, 3);
    assertThat(Files.exists(stagedBody.temporaryFile())).isFalse();
    verify(reportService).generateReport(eq(expectedReportAction), any(LexisReportRequestDto.class));
  }

  @Test
  void streamedReportShouldDeleteTemporaryFileWhenClientTransferFails() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenReturn(Optional.of(sampleGeneratedReport()));
    LexisReportController controller =
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService);

    ResponseEntity<StreamingResponseBody> response = controller.offerReport(sampleRequest());
    TemporaryReportStreamingBody stagedBody =
        (TemporaryReportStreamingBody) response.getBody();
    assertThat(stagedBody).isNotNull();
    assertThat(Files.exists(stagedBody.temporaryFile())).isTrue();
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

    assertThatThrownBy(() -> stagedBody.writeTo(failingOutput))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("client disconnected");
    assertThat(Files.exists(stagedBody.temporaryFile())).isFalse();
  }

  private byte[] responseBody(ResponseEntity<StreamingResponseBody> response) {
    if (response.getBody() == null) {
      return new byte[0];
    }
    try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
      response.getBody().writeTo(outputStream);
      return outputStream.toByteArray();
    } catch (IOException exception) {
      throw new AssertionError("Unable to read streamed report response", exception);
    }
  }

  private LexisGeneratedReport sampleGeneratedReport() {
    return report("lexis-report.pdf", "application/pdf", (byte) 1, (byte) 2, (byte) 3);
  }

  private LexisReportRequestDto sampleRequest() {
    return new LexisReportRequestDto(Map.of("fromDate", "2026-01-01"), "PDF");
  }

  private LexisReportRequestDto approvedExemptionRequest() {
    return new LexisReportRequestDto(Map.of("exemptionNumber", " EX-205 "), "PDF");
  }

  private LexisReportRequestDto permitRequest() {
    return new LexisReportRequestDto(Map.of("permitNumber", " 007000123 "), "PDF");
  }
}

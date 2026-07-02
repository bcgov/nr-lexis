package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.service.report.LexisGeneratedReport;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisReportController")
class LexisReportControllerTest {

  @Mock private ObjectProvider<LexisReportService> reportServiceProvider;
  @Mock private LexisReportService reportService;

  @Test
  void reportShouldReturnNoContentWhenServiceMissing() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(null);
    LexisReportController controller = new LexisReportController(reportServiceProvider);

    ResponseEntity<byte[]> response = controller.offerReport(sampleRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(reportService);
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
    LexisReportController controller = new LexisReportController(reportServiceProvider);

    ResponseEntity<byte[]> response =
        controller.applicationReport(new LexisReportRequestDto(Map.of("region", "0"), "PDF"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_PLAIN);
    assertThat(new String(response.getBody()))
        .contains("Choose at least one Application Report filter before generating");
    verifyNoInteractions(reportService);
  }

  @Test
  void reportValidationErrorShouldReturnPlainTextBadRequest() {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    LexisReportController controller = new LexisReportController(reportServiceProvider);
    when(reportService.generateReport(eq("biweeklyListing"), any(LexisReportRequestDto.class)))
        .thenThrow(
            new LexisReportValidationException(
                "Choose a Listing from date and Listing to date before generating the Advertising List."));

    ResponseEntity<byte[]> response =
        controller.biweeklyListing(new LexisReportRequestDto(Map.of(), "PDF"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.TEXT_PLAIN);
    assertThat(new String(response.getBody()))
        .contains("Listing from date")
        .contains("Listing to date");
  }

  @Test
  void approvedExemptionReportShouldDelegateToReportService() {
    assertDelegatesTo(
        "approvedExemptionReport", controller -> controller.approvedExemptionReport(sampleRequest()));
  }

  @Test
  void permitReportShouldDelegateToReportService() {
    assertDelegatesTo("permitReport", controller -> controller.permitReport(sampleRequest()));
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
    LexisReportController controller = new LexisReportController(reportServiceProvider);
    when(reportService.generateReport(eq("offerReport"), any(LexisReportRequestDto.class)))
        .thenAnswer(
            invocation -> {
              LexisReportRequestDto request = invocation.getArgument(1);
              assertThat(request.parameters()).isEmpty();
              assertThat(request.format()).isEqualTo("PDF");
              return Optional.of(sampleGeneratedReport());
            });

    ResponseEntity<byte[]> response = controller.offerReport(null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  private void assertDelegatesTo(
      String expectedReportAction, Function<LexisReportController, ResponseEntity<byte[]>> invoker) {
    when(reportServiceProvider.getIfAvailable()).thenReturn(reportService);
    LexisReportController controller = new LexisReportController(reportServiceProvider);
    when(reportService.generateReport(eq(expectedReportAction), any(LexisReportRequestDto.class)))
        .thenReturn(Optional.of(sampleGeneratedReport()));

    ResponseEntity<byte[]> response = invoker.apply(controller);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PDF);
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("lexis-report.pdf");
    assertThat(response.getBody()).containsExactly(1, 2, 3);
    verify(reportService).generateReport(eq(expectedReportAction), any(LexisReportRequestDto.class));
  }

  private LexisGeneratedReport sampleGeneratedReport() {
    return new LexisGeneratedReport("lexis-report.pdf", "application/pdf", new byte[] {1, 2, 3});
  }

  private LexisReportRequestDto sampleRequest() {
    return new LexisReportRequestDto(Map.of("fromDate", "2026-01-01"), "PDF");
  }
}

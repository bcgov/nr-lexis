package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
class LegacyReportRouteControllerTest {

  @Mock private LexisReportController reportController;

  @Test
  void shouldReturnNoContentForViewAction() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/lexis/offerReport");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of("actionMapping", "view"),
            new LinkedMultiValueMap<>(Map.of("actionMapping", java.util.List.of("view"))),
            request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(reportController);
  }

  @Test
  void shouldDelegateGenerateWithExplicitPdfFormatAndNormalizeLegacyClientNumber() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/offerReport.do");

    when(reportController.offerReport(any())).thenReturn(ResponseEntity.ok(new byte[] {1, 2, 3}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "PDF");
    multi.add("clientNumber", "123.4");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "PDF",
                "clientNumber", "123.4"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).offerReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("clientNumber", "000123.4");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generate");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldPreserveApplicationClientNumberBecauseLegacyFormDidNotNormalizeIt() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/applicationReport.do");

    when(reportController.applicationReport(any())).thenReturn(ResponseEntity.ok(new byte[] {1, 2}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("clientNumber", "1234567");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "clientNumber", "1234567"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).applicationReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.parameters()).containsEntry("clientNumber", "1234567");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultGenerateToCsvAndJoinMultiValueRegion() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/teacReport");

    when(reportController.teacReport(any())).thenReturn(ResponseEntity.ok(new byte[] {9, 9}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("region", "1904");
    multi.add("region", "1905");
    multi.add("exportSchedule", "12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "exportSchedule", "12345"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).teacReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("CSV");
    assertThat(delegated.parameters()).containsEntry("region", "1904,1905");
    assertThat(delegated.parameters()).containsEntry("exportSchedule", "12345");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generate");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldRouteTenureGenerateActionMappingsAndKeepSpreadsheetFormat() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {7, 7}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateTenureReport");
    multi.add("outputFormat", "XLS");
    multi.add("reportingDistrict", "DSE");
    multi.add("clientNumber", "77881");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateTenureReport",
                "outputFormat", "XLS",
                "reportingDistrict", "DSE"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("XLS");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generateTenureReport");
    assertThat(delegated.parameters()).containsEntry("reportingDistrict", "DSE");
    assertThat(delegated.parameters()).containsEntry("clientNumber", "00077881");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldMapLegacyTenureCsvValueToSpreadsheetFormat() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {7, 7}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateFileReport");
    multi.add("outputFormat", "CSV");
    multi.add("forestFileId", "A12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateFileReport",
                "outputFormat", "CSV",
                "forestFileId", "A12345"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("XLS");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generateFileReport");
    assertThat(delegated.parameters()).containsEntry("forestFileId", "A12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultLegacyTenureGenerateToSpreadsheetWhenOutputFormatMissing() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {7, 8}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateMarkReport");
    multi.add("timberMark1", "TM001");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateMarkReport",
                "timberMark1", "TM001"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("XLS");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generateMarkReport");
    assertThat(delegated.parameters()).containsEntry("timberMark1", "TM001");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldMapLegacyTenureNonPdfOutputValuesToSpreadsheetFormat() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {7, 9}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateTenureReport");
    multi.add("outputFormat", "unexpected");
    multi.add("tenureType1", "A01");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateTenureReport",
                "outputFormat", "unexpected",
                "tenureType1", "A01"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("XLS");
    assertThat(delegated.parameters()).containsEntry("legacyActionMapping", "generateTenureReport");
    assertThat(delegated.parameters()).containsEntry("tenureType1", "A01");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultApprovedExemptionGenerateToPdfWhenOutputFormatMissing() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/approvedExemptionReport.do");

    when(reportController.approvedExemptionReport(any()))
        .thenReturn(ResponseEntity.ok(new byte[] {4, 2}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("exemptionNumber", "E-12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "exemptionNumber", "E-12345"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).approvedExemptionReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("exemptionNumber", "E-12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultPermitReportGenerateToPdfWhenOutputFormatMissing() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/permitReport.do");

    when(reportController.permitReport(any()))
        .thenReturn(ResponseEntity.ok(new byte[] {4, 3}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("permitNumber", "900100");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "permitNumber", "900100"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).permitReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("permitNumber", "900100");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldHandleIndustryBiweeklyGeneratePdfActionMapping() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/lexis/biweeklyListing.do");

    when(reportController.biweeklyListing(any())).thenReturn(ResponseEntity.ok(new byte[] {8, 8}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateIndustryPDF");
    multi.add("jurisdiction", "P");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateIndustryPDF",
                "jurisdiction", "P"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).biweeklyListing(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("jurisdiction", "P");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }
}

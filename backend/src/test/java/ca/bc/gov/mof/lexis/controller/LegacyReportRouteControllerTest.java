package ca.bc.gov.mof.lexis.controller;

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
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
class LegacyReportRouteControllerTest {

  @Mock private LexisReportController reportController;
  @Mock private Authentication authentication;
  @Mock private ObjectProvider<LexisReportService> reportServiceProvider;
  @Mock private LexisReportService reportService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private LexisPrincipalService principalService;

  @Test
  void shouldReturnNoContentForViewAction() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/lexis/offerReport");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of("actionMapping", "view"),
            new LinkedMultiValueMap<>(Map.of("actionMapping", java.util.List.of("view"))),
            request,
            authentication);

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
            request,
            authentication);

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
            request,
            authentication);

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
            request,
            authentication);

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
  void shouldMapLegacyNonPdfOutputFormatsToCsvForGenerateActions() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/offerReport.do");

    when(reportController.offerReport(any())).thenReturn(ResponseEntity.ok(new byte[] {3, 4}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "XLS");
    multi.add("region", "1904");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "XLS"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).offerReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("CSV");
    assertThat(delegated.parameters()).containsEntry("region", "1904");
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
            request,
            authentication);

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
            request,
            authentication);

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
            request,
            authentication);

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
  void shouldRejectUnsupportedLegacyOutputFormat() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateTenureReport");
    multi.add("outputFormat", "unexpected");
    multi.add("tenureType1", "A01");

    assertThatThrownBy(
            () ->
                controller.legacyReport(
                    Map.of(
                        "actionMapping", "generateTenureReport",
                        "outputFormat", "unexpected",
                        "tenureType1", "A01"),
                    multi,
                    request,
                    authentication))
        .isInstanceOf(ca.bc.gov.mof.lexis.service.report.LexisReportValidationException.class)
        .hasMessage("Report format must be PDF, CSV, XLS, or XLSX.");
    verifyNoInteractions(reportController);
  }

  @Test
  void shouldNormalizeLegacySpeciesGradeMarkAndFileFieldsToUppercase() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/speciesGradeReport.do");

    when(reportController.speciesGradeReport(any())).thenReturn(ResponseEntity.ok(new byte[] {5, 1}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "PDF");
    multi.add("timberMark", "tm123");
    multi.add("forestFileId", "a12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "PDF",
                "timberMark", "tm123",
                "forestFileId", "a12345"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).speciesGradeReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.parameters())
        .containsEntry("timberMark", "TM123")
        .containsEntry("forestFileId", "A12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldNormalizeLegacyPermitLedgerTimberMarkToUppercase() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/permitLedgerReport.do");

    when(reportController.permitLedgerReport(any())).thenReturn(ResponseEntity.ok(new byte[] {5, 2}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "PDF");
    multi.add("timberMark", "tm456");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "PDF",
                "timberMark", "tm456"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).permitLedgerReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.parameters()).containsEntry("timberMark", "TM456");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldNormalizeLegacyTenureIndexedFieldsAndForestFileToUppercase() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {5, 3}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateMarkReport");
    multi.add("outputFormat", "PDF");
    multi.add("tenureType1", "a01");
    multi.add("timberMark1", "tm001");
    multi.add("forestFileId", "a12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateMarkReport",
                "outputFormat", "PDF",
                "tenureType1", "a01",
                "timberMark1", "tm001",
                "forestFileId", "a12345"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.parameters())
        .containsEntry("tenureType1", "A01")
        .containsEntry("timberMark1", "TM001")
        .containsEntry("forestFileId", "A12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldNormalizeRepeatedLegacyValuesBeforeJoiningThem() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/tenureReport.do");

    when(reportController.tenureReport(any())).thenReturn(ResponseEntity.ok(new byte[] {5, 4}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generateMarkReport");
    multi.add("outputFormat", "PDF");
    multi.add("timberMark1", "tm001");
    multi.add("timberMark1", "tm002");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generateMarkReport",
                "outputFormat", "PDF"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).tenureReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.parameters()).containsEntry("timberMark1", "TM001,TM002");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultApprovedExemptionGenerateToPdfWhenOutputFormatMissing() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/approvedExemptionReport.do");

    when(reportController.approvedExemptionReport(any(), eq(authentication)))
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
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).approvedExemptionReport(requestCaptor.capture(), eq(authentication));

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("exemptionNumber", "E-12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldKeepApprovedExemptionReportPdfOnlyWhenOutputFormatIsProvided() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/approvedExemptionReport.do");

    when(reportController.approvedExemptionReport(any(), eq(authentication)))
        .thenReturn(ResponseEntity.ok(new byte[] {4, 4}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "CSV");
    multi.add("exemptionNumber", "E-12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "CSV",
                "exemptionNumber", "E-12345"),
            multi,
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).approvedExemptionReport(requestCaptor.capture(), eq(authentication));

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

    when(reportController.permitReport(any(), eq(authentication)))
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
            request,
            authentication);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).permitReport(requestCaptor.capture(), eq(authentication));

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("permitNumber", "900100");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void legacyApprovedExemptionReportShouldRejectMissingExemptionBeforeAuthorization() {
    LegacyReportRouteController controller = actualContextualReportController();
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/approvedExemptionReport.do");
    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");

    assertThatThrownBy(
            () ->
                controller.legacyReport(
                    Map.of("actionMapping", "generate"), multi, request, authentication))
        .isInstanceOf(ca.bc.gov.mof.lexis.service.report.LexisReportValidationException.class)
        .hasMessageContaining("Exemption number is required");
    verifyNoInteractions(provincialAuthorizationService, reportServiceProvider, reportService);
  }

  @Test
  void legacyPermitReportShouldRejectInvalidPermitBeforeAuthorization() {
    LegacyReportRouteController controller = actualContextualReportController();
    MockHttpServletRequest request =
        new MockHttpServletRequest("POST", "/api/lexis/permitReport.do");
    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("permitNumber", "not-a-number");

    assertThatThrownBy(
            () ->
                controller.legacyReport(
                    Map.of(
                        "actionMapping", "generate",
                        "permitNumber", "not-a-number"),
                    multi,
                    request,
                    authentication))
        .isInstanceOf(ca.bc.gov.mof.lexis.service.report.LexisReportValidationException.class)
        .hasMessageContaining("positive integer");
    verifyNoInteractions(provincialAuthorizationService, reportServiceProvider, reportService);
  }

  @Test
  void legacyContextualReportsShouldReturnForbiddenWithoutCallingReportService() {
    LegacyReportRouteController controller = actualContextualReportController();
    doThrow(new AccessDeniedException("outside scope"))
        .when(provincialAuthorizationService)
        .requireExemption(authentication, "EX-205");
    doThrow(new AccessDeniedException("outside scope"))
        .when(provincialAuthorizationService)
        .requirePermit(authentication, 7000123L);

    MockHttpServletRequest exemptionRequest =
        new MockHttpServletRequest("POST", "/api/lexis/approvedExemptionReport.do");
    MultiValueMap<String, String> exemptionParameters = new LinkedMultiValueMap<>();
    exemptionParameters.add("actionMapping", "generate");
    exemptionParameters.add("exemptionNumber", "EX-205");
    ResponseEntity<byte[]> exemptionResponse =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "exemptionNumber", "EX-205"),
            exemptionParameters,
            exemptionRequest,
            authentication);

    MockHttpServletRequest permitRequest =
        new MockHttpServletRequest("POST", "/api/lexis/permitReport.do");
    MultiValueMap<String, String> permitParameters = new LinkedMultiValueMap<>();
    permitParameters.add("actionMapping", "generate");
    permitParameters.add("permitNumber", "7000123");
    ResponseEntity<byte[]> permitResponse =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "permitNumber", "7000123"),
            permitParameters,
            permitRequest,
            authentication);

    assertThat(exemptionResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(permitResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(reportServiceProvider, reportService);
  }

  private LegacyReportRouteController actualContextualReportController() {
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    return new LegacyReportRouteController(
        new LexisReportController(
            reportServiceProvider, provincialAuthorizationService, principalService));
  }

}

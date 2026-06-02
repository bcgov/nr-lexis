package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ExemptionDetailsRpcController")
class ExemptionDetailsRpcControllerTest {

  @Mock private ObjectProvider<ExemptionDetailsRpcService> serviceProvider;
  @Mock private ExemptionDetailsRpcService service;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;

  private ExemptionDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller =
        new ExemptionDetailsRpcController(serviceProvider, sessionService, authorizationService);
  }

  @Test
  void applicationsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ExemptionDetailsRpcController.ExemptionApplicationsResponseDto> response =
        controller.getApplications("EX-205", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void applicationsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(null)).thenReturn(List.of("LEXIS_READ_ONLY"));
    when(authorizationService.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewFederalApplication"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewOICApplication"))
        .thenReturn(true);
    when(service.getApplications("EX-205", true, true))
        .thenReturn(
            new ExemptionDetailsRpcService.ExemptionApplicationsResponse(
                List.of(
                    new ExemptionDetailsRpcService.ApplicationItem(
                        1000456L, "95.0", "94.0", false, "P")),
                false,
                "00077881"));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionApplicationsResponseDto> response =
        controller.getApplications("EX-205", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applications()).hasSize(1);
    assertThat(response.getBody().applications().get(0).applicationNumber()).isEqualTo(1000456L);
    verify(service).getApplications("EX-205", true, true);
  }

  @Test
  void permitsShouldReturnPayloadAndVisibilityFlags() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_READ_ONLY"));
    when(sessionService.getConfiguredIndustryRoles())
        .thenReturn(Set.of("LEXIS_PROVINCIAL_SUBMITTER", "LEXIS_FEDERAL_SUBMITTER"));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.getPermits("EX-205", true, true, "00077881"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcService.PermitItem(
                    7000123L, "50.0", "Active", "03/10/2026", true)));

    ResponseEntity<List<ExemptionDetailsRpcController.PermitItemDto>> response =
        controller.getPermits("EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).permitNumber()).isEqualTo(7000123L);
    verify(service).getPermits("EX-205", true, true, "00077881");
  }

  @Test
  void blanketTotalsShouldReturnPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getBlanketOicTotals("EX-205"))
        .thenReturn(new ExemptionDetailsRpcService.BlanketOicTotalsResponse("100.0", "60.0"));

    ResponseEntity<ExemptionDetailsRpcController.BlanketOicTotalsResponseDto> response =
        controller.getBlanketOicTotals("EX-205");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().requestedVolume()).isEqualTo("100.0");
    assertThat(response.getBody().completedVolume()).isEqualTo("60.0");
  }

  @Test
  void documentDownloadShouldReturnAttachmentPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocument(55L))
        .thenReturn(Optional.of(new ExemptionDetailsRpcService.DocumentContent("x".getBytes())));

    ResponseEntity<byte[]> response = controller.getDocument("55", "../unsafe/doc.pdf");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("doc.pdf");
    assertThat(response.getBody()).isNotNull();
    verify(service).getDocument(55L);
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeDocument(55L);
  }

  @Test
  void checkExemptionNumberLegacyShouldReturnLegacyValidationPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.checkExemptionNumber("EX-205"))
        .thenReturn(
            new ExemptionDetailsRpcService.ExemptionNumberValidationResult(
                false, "* - this exemption number has already been assigned"));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionNumberValidationResponseDto> response =
        controller.checkExemptionNumberLegacy("EX-205");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isFalse();
    assertThat(response.getBody().message())
        .isEqualTo("* - this exemption number has already been assigned");
    verify(service).checkExemptionNumber("EX-205");
  }

  @Test
  void addExemptionLegacyShouldMapAliasesAndReturnPersistencePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addExemption(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionResult(
                true, "The exemption was saved successfully.", "EX-205", true, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-205");
    params.add("approvedVolume", "250.5");
    params.add("approvalDate", "2026-03-01");
    params.add("expiryDate", "2026-12-31");
    params.add("otherConditions", "Conditions");
    params.add("exemptionTypeCode", "B");
    params.add("exemptionStatusCode", "ACT");
    params.add("region", "11,12");

    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.addExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().exemptionNumber()).isEqualTo("EX-205");
    assertThat(response.getBody().refreshPage()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcService.CreateExemptionRequest> requestCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcService.CreateExemptionRequest.class);
    verify(service).addExemption(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ExemptionDetailsRpcService.CreateExemptionRequest request = requestCaptor.getValue();
    assertThat(request.approvedVolume()).isEqualTo(250.5d);
    assertThat(request.approvalDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.expiryDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    assertThat(request.regionNumbers()).containsExactly(11L, 12L);
  }
}

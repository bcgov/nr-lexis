package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;

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
}

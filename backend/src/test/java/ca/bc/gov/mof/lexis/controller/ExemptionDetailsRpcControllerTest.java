package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ExemptionDetailsRpcController")
class ExemptionDetailsRpcControllerTest {

  @Mock private ObjectProvider<ExemptionDetailsRpcService> serviceProvider;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ExemptionDetailsRpcService service;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ClientLookupService clientLookupService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private LexisPrincipalService principalService;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ExemptionService exemptionService;

  private ExemptionDetailsRpcController controller;
  private PermitOperationMutex operationMutex;

  @BeforeEach
  void setup() {
    operationMutex = new PermitOperationMutex();
    lenient()
        .when(applicationDetailsServiceProvider.getIfAvailable())
        .thenReturn(applicationDetailsService);
    lenient()
        .when(applicationDetailsService.getPermitNumbersForApplicationMutation(anyLong()))
        .thenReturn(List.of());
    lenient()
        .when(service.getApplicationNumbersForMutation(anyString()))
        .thenReturn(List.of());
    lenient()
        .when(service.getPermitNumbersForMutation(anyString()))
        .thenReturn(List.of());
    controller =
        new ExemptionDetailsRpcController(
            serviceProvider,
            applicationDetailsServiceProvider,
            clientLookupServiceProvider,
            sessionService,
            authorizationService,
            principalService,
            new ApplicationPermitOperationCoordinator(operationMutex));
    controller.setExemptionService(exemptionService);
  }

  @Test
  void createPreviewShouldAuthorizeApplicationsAndReturnDerivedDefaults() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/createExemption")).thenReturn(true);
    when(authorizationService.canPerformAction(roles, "viewFederalApplication"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.previewCreateExemption(List.of(1000456L, 1000457L), true))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionPreview(
                true,
                "M",
                "NEW",
                "300.1",
                LocalDate.of(2026, 10, 10),
                List.of(1000456L, 1000457L),
                List.of()));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);

    ResponseEntity<ExemptionDetailsRpcController.CreateExemptionPreviewResponseDto> response =
        controller.previewCreateExemption(
            List.of(1000456L, 1000457L), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().approvedVolume()).isEqualTo("300.1");
    assertThat(response.getBody().expiryDate()).isEqualTo(LocalDate.of(2026, 10, 10));
    assertThat(response.getBody().applicationNumbers())
        .containsExactly(1000456L, 1000457L);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000457L);
  }

  @Test
  void createPreviewShouldRejectMissingCreateAuthorityBeforeLookup() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\reader", "n/a");
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/createExemption")).thenReturn(false);

    ResponseEntity<ExemptionDetailsRpcController.CreateExemptionPreviewResponseDto> response =
        controller.previewCreateExemption(List.of(1000456L), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
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
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(sessionService.parseRolesFromPrincipal(null)).thenReturn(List.of("LEXIS_READ_ONLY"));
    when(authorizationService.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewFederalApplication"))
        .thenReturn(true);
    when(service.getApplications(
            org.mockito.ArgumentMatchers.eq("EX-205"),
            org.mockito.ArgumentMatchers.eq(true),
            org.mockito.ArgumentMatchers.any()))
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
    @SuppressWarnings("unchecked")
    ArgumentCaptor<Predicate<Long>> accessCaptor =
        ArgumentCaptor.forClass(Predicate.class);
    verify(service).getApplications(
        org.mockito.ArgumentMatchers.eq("EX-205"),
        org.mockito.ArgumentMatchers.eq(true),
        accessCaptor.capture());
    when(provincialAuthorizationService.canAccessApplication(null, 1000456L))
        .thenReturn(true);
    assertThat(accessCaptor.getValue().test(1000456L)).isTrue();
    verify(provincialAuthorizationService).canAccessApplication(null, 1000456L);
  }

  @Test
  void permitsShouldApplyPermitDetailAndObjectAuthorizationForScopedSubmitter() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    List<String> roles = List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(
            roles, "/permitDetails"))
        .thenReturn(true);
    when(service.getPermits(
            org.mockito.ArgumentMatchers.eq("EX-205"),
            org.mockito.ArgumentMatchers.any()))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcService.PermitItem(
                    7000123L, "50.0", "Active", "03/10/2026", true),
                new ExemptionDetailsRpcService.PermitItem(
                    7000124L, "25.0", "Complete", "03/11/2026", false)));

    ResponseEntity<List<ExemptionDetailsRpcController.PermitItemDto>> response =
        controller.getPermits("EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).permitNumber()).isEqualTo(7000123L);
    assertThat(response.getBody())
        .extracting(ExemptionDetailsRpcController.PermitItemDto::permitNumber)
        .doesNotContain(7000124L);
    @SuppressWarnings("unchecked")
    ArgumentCaptor<Predicate<Long>> accessCaptor =
        ArgumentCaptor.forClass(Predicate.class);
    verify(service).getPermits(
        org.mockito.ArgumentMatchers.eq("EX-205"), accessCaptor.capture());
    when(provincialAuthorizationService.canAccessPermit(authentication, 7000123L))
        .thenReturn(true);
    when(provincialAuthorizationService.canAccessPermit(authentication, 7000124L))
        .thenReturn(false);
    assertThat(accessCaptor.getValue().test(7000123L)).isTrue();
    assertThat(accessCaptor.getValue().test(7000124L)).isFalse();
  }

  @Test
  void applicationContextPredicateShouldUseObjectAccessWithoutApplicationDetailAction() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "viewFederalApplication"))
        .thenReturn(false);
    when(service.getApplications(
            org.mockito.ArgumentMatchers.eq("EX-205"),
            org.mockito.ArgumentMatchers.eq(false),
            org.mockito.ArgumentMatchers.any()))
        .thenReturn(
            new ExemptionDetailsRpcService.ExemptionApplicationsResponse(
                List.of(), false, ""));
    when(provincialAuthorizationService.canAccessApplication(authentication, 1000456L))
        .thenReturn(true);

    controller.getApplications("EX-205", authentication);

    @SuppressWarnings("unchecked")
    ArgumentCaptor<Predicate<Long>> accessCaptor =
        ArgumentCaptor.forClass(Predicate.class);
    verify(service).getApplications(
        org.mockito.ArgumentMatchers.eq("EX-205"),
        org.mockito.ArgumentMatchers.eq(false),
        accessCaptor.capture());
    assertThat(accessCaptor.getValue().test(1000456L)).isTrue();
    verify(authorizationService, never())
        .canPerformAction(roles, "/applicationDetails");
  }

  @Test
  void exemptionApproverPermitContextPredicateShouldFailWithoutPermitDetailAction() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/permitDetails"))
        .thenReturn(false);
    when(service.getPermits(
            org.mockito.ArgumentMatchers.eq("EX-205"),
            org.mockito.ArgumentMatchers.any()))
        .thenReturn(List.of());

    ResponseEntity<List<ExemptionDetailsRpcController.PermitItemDto>> response =
        controller.getPermits("EX-205", authentication);

    assertThat(response.getBody()).isEmpty();
    @SuppressWarnings("unchecked")
    ArgumentCaptor<Predicate<Long>> accessCaptor =
        ArgumentCaptor.forClass(Predicate.class);
    verify(service).getPermits(
        org.mockito.ArgumentMatchers.eq("EX-205"), accessCaptor.capture());
    assertThat(accessCaptor.getValue().test(7000123L)).isFalse();
    verify(provincialAuthorizationService, never())
        .canAccessPermit(authentication, 7000123L);
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
  void documentDetailsShouldHideApplicationDocumentsWithoutApplicationDetailAuthority() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcService.DocumentItem(
                    55L,
                    "application.pdf",
                    "Application copy",
                    "Application document",
                    "application",
                    null,
                    1000456L,
                    false)));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<List<ExemptionDetailsRpcController.DocumentItemDto>> response =
          controller.getDocumentDetails("EX-205");

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getBody()).isEmpty();
      verify(provincialAuthorizationService, never())
          .requireApplication(authentication, 1000456L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldRejectApplicationDocumentWithoutApplicationDetailAuthority() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    ExemptionDetailsRpcService.DocumentItem applicationDocument =
        new ExemptionDetailsRpcService.DocumentItem(
            55L,
            "application.pdf",
            "Application copy",
            "Application document",
            "application",
            null,
            1000456L,
            false);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForExemption(55L, "EX-205"))
        .thenReturn(Optional.of(applicationDocument));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("55", "application.pdf", "EX-205"))
          .isInstanceOf(AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied exemption.");
      verify(service, never()).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldRejectApplicationDocumentWithoutApplicationObjectAccess() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\application-approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    ExemptionDetailsRpcService.DocumentItem applicationDocument =
        new ExemptionDetailsRpcService.DocumentItem(
            55L,
            "application.pdf",
            "Application copy",
            "Application document",
            "application",
            null,
            1000456L,
            false);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForExemption(55L, "EX-205"))
        .thenReturn(Optional.of(applicationDocument));
    org.mockito.Mockito.doThrow(new AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("55", "application.pdf", "EX-205"))
          .isInstanceOf(AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied exemption.");
      verify(service, never()).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldReturnAttachmentPayload() throws Exception {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForExemption(55L, "EX-205"))
        .thenReturn(
            Optional.of(
                new ExemptionDetailsRpcService.DocumentItem(
                    55L,
                    "doc.pdf",
                    "",
                    "Uploaded",
                    "exemption",
                    "EX-205",
                    null,
                    true)));
    when(service.streamDocument(55L))
        .thenReturn(Optional.of(output -> output.write("test-content".getBytes())));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<StreamingResponseBody> response =
          controller.streamDocument("55", "../unsafe/doc.pdf", "EX-205");

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("doc.pdf");
      assertThat(response.getBody()).isNotNull();
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      response.getBody().writeTo(output);
      assertThat(output.toByteArray()).containsExactly("test-content".getBytes());
      verify(provincialAuthorizationService).requireExemption(authentication, "EX-205");
      verify(service).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205")).thenReturn(true);
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemptionDetail("ACT")));
    when(service.removeDocument(55L)).thenReturn(true);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldRejectLinkedApplicationDocument() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205"))
        .thenReturn(false);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\admin", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_ADMIN"));

    assertThatThrownBy(
            () -> controller.removeDocument("55", "EX-205", authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage(
            "Document is not an exemption-owned attachment for the supplied exemption.");
    verify(service, never()).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldFailClosedWhenRpcServiceIsUnavailable() {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\admin", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    verifyNoInteractions(service);
  }

  @Test
  void removeDocumentShouldFailWhenExemptionIsLockedByAnotherEditor() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205")).thenReturn(true);
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemptionDetail("ACT")));
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(editLockService.acquireExemption(
            "EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This exemption is currently locked.", null));
    controller.setApplicationEditLockService(editLockService);

    assertThatThrownBy(() -> controller.removeDocument("55", "EX-205", authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This exemption is currently locked.");
    verify(service, org.mockito.Mockito.never()).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldSerializeWithDirectExemptionPermit() throws Exception {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205")).thenReturn(true);
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemptionDetail("ACT")));
    when(service.getPermitNumbersForMutation("EX-205"))
        .thenReturn(List.of(7000123L));

    CountDownLatch deletionEntered = new CountDownLatch(1);
    CountDownLatch releaseDeletion = new CountDownLatch(1);
    when(service.removeDocument(55L))
        .thenAnswer(
            ignored -> {
              deletionEntered.countDown();
              if (!releaseDeletion.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release document deletion.");
              }
              return true;
            });

    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto>> deletion =
          executor.submit(
              () -> controller.removeDocument("55", "EX-205", authentication));
      assertThat(deletionEntered.await(5, TimeUnit.SECONDS)).isTrue();

      Future<Boolean> competingPermitMutation =
          executor.submit(() -> operationMutex.execute(7000123L, () -> true));
      assertThatThrownBy(
              () -> competingPermitMutation.get(150, TimeUnit.MILLISECONDS))
          .isInstanceOf(TimeoutException.class);

      releaseDeletion.countDown();
      assertThat(deletion.get(5, TimeUnit.SECONDS).getStatusCode())
          .isEqualTo(HttpStatus.OK);
      assertThat(competingPermitMutation.get(5, TimeUnit.SECONDS)).isTrue();
    } finally {
      releaseDeletion.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void removeDocumentShouldRejectExemptionApprover() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(exemptionService);
    verifyNoInteractions(service);
  }

  @Test
  void removeDocumentShouldRejectExpiredExemption() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205")).thenReturn(true);
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemptionDetail("EXP")));
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\admin", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service, never()).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldFailClosedWhenCanonicalExemptionIsUnavailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.documentCanBeRemovedFromExemption(55L, "EX-205")).thenReturn(true);
    when(exemptionService.findByExemptionNumber("EX-205")).thenReturn(Optional.empty());
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\admin", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));

    ResponseEntity<ExemptionDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service, never()).removeDocument(55L);
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
  void addApplicationToExemptionLegacyShouldUseAuthzFlagsAndReturnLinkPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_APPLICATION_APPROVER"), "saveExemption"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(List.of("LEXIS_APPLICATION_APPROVER"), "viewFederalApplication"))
        .thenReturn(true);
    when(service.addApplicationToExemption(1000456L, "EX-205", "IDIR\\JSMITH", true))
        .thenReturn(new ExemptionDetailsRpcService.ApplicationExemptionLinkResult(true, List.of()));

    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto> response =
        controller.addApplicationToExemptionLegacy("1000456", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().errors()).isEmpty();
    verify(service).addApplicationToExemption(1000456L, "EX-205", "IDIR\\JSMITH", true);
  }

  @Test
  void removeApplicationFromExemptionLegacyShouldReturnLinkPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "saveExemption"))
        .thenReturn(true);
    when(service.removeApplicationFromExemption(1000456L, "EX-205", "IDIR\\JSMITH"))
        .thenReturn(new ExemptionDetailsRpcService.ApplicationExemptionLinkResult(true, List.of()));

    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto> response =
        controller.removeApplicationFromExemptionLegacy("1000456", "EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    verify(service).removeApplicationFromExemption(1000456L, "EX-205", "IDIR\\JSMITH");
  }

  @Test
  void addApplicationToExemptionRoutesShouldDenyExemptionApprover() {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);

    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto>
        modernResponse =
            controller.addApplicationToExemption("1000456", "EX-205", authentication);
    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto>
        legacyResponse =
            controller.addApplicationToExemptionLegacy("1000456", "EX-205", authentication);

    assertThat(modernResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(legacyResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void removeApplicationFromExemptionRoutesShouldDenyExemptionApprover() {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);

    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto>
        modernResponse =
            controller.removeApplicationFromExemption("1000456", "EX-205", authentication);
    ResponseEntity<ExemptionDetailsRpcController.ApplicationExemptionLinkResponseDto>
        legacyResponse =
            controller.removeApplicationFromExemptionLegacy("1000456", "EX-205", authentication);

    assertThat(modernResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(legacyResponse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void addExemptionLegacyShouldMapAliasesAndReturnPersistencePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(service.addExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"),
            org.mockito.ArgumentMatchers.eq(true)))
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
    params.add("applicationNumber", "1000456");
    params.add("applications", "1000456,1000457");
    params.add("feeRate", "18.25");
    params.add("enableRateOverride", "true");
    params.add("region", "11,12");

    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "viewFederalApplication"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(provincialAuthorizationService.canViewBlanketOic(authentication)).thenReturn(true);
    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.addExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().exemptionNumber()).isEqualTo("EX-205");
    assertThat(response.getBody().refreshPage()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcService.CreateExemptionRequest> requestCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcService.CreateExemptionRequest.class);
    verify(service)
        .addExemption(
            requestCaptor.capture(),
            org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"),
            org.mockito.ArgumentMatchers.eq(true));
    ExemptionDetailsRpcService.CreateExemptionRequest request = requestCaptor.getValue();
    assertThat(request.approvedVolume()).isEqualTo(250.5d);
    assertThat(request.approvalDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.expiryDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    assertThat(request.feeRate()).isEqualTo(18.25d);
    assertThat(request.enableRateOverride()).isTrue();
    assertThat(request.applicationNumbers()).containsExactly(1000456L, 1000457L);
    assertThat(request.canViewFederalApplications()).isTrue();
    assertThat(request.regionNumbers()).containsExactly(11L, 12L);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireApplication(authentication, 1000457L);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireOrgUnits(
            authentication,
            List.of(11L, 12L),
            ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
  }

  @Test
  void addExemptionShouldRejectRequestedRegionOutsideScopeBeforePersistence() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "saveExemption")).thenReturn(true);
    when(authorizationService.canPerformAction(roles, "viewFederalApplication"))
        .thenReturn(true);
    doThrow(new AccessDeniedException("outside org scope"))
        .when(provincialAuthorizationService)
        .requireOrgUnits(
            authentication,
            List.of(12L),
            ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionTypeCode", "M");
    params.add("region", "12");

    assertThatThrownBy(() -> controller.addExemptionLegacy(params, authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("outside org scope");

    verify(service, never())
        .addExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyBoolean());
  }

  @Test
  void addExemptionShouldRejectMalformedSelectedApplicationNumbers() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "saveExemption")).thenReturn(true);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applications", "1000456,not-a-number");

    assertThatThrownBy(() -> controller.addExemptionLegacy(params, authentication))
        .isInstanceOf(ResponseStatusException.class)
        .satisfies(
            exception ->
                assertThat(((ResponseStatusException) exception).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST));
    verifyNoInteractions(service);
  }

  @Test
  void addExemptionShouldRejectBlanketOicOutsideRoleScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "BOIC-205");
    params.add("exemptionTypeCode", "B");

    assertThatThrownBy(() -> controller.addExemptionLegacy(params, authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("Blanket OIC");
    verifyNoInteractions(service);
  }

  @Test
  void addExemptionShouldAcquireAndReleaseApplicationLocks() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    controller.setApplicationEditLockService(editLockService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "saveExemption"))
        .thenReturn(true);
    when(editLockService.snapshot(1000456L, "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquire(1000456L, "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.addExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"),
            org.mockito.ArgumentMatchers.eq(false)))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionResult(
                true, "Saved", "EX-205", true, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-205");
    params.add("exemptionTypeCode", "E");
    params.add("applicationNumber", "1000456");

    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.addExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireApplication(authentication, 1000456L);
    verify(editLockService).acquire(1000456L, "IDIR\\JSMITH", "IDIR\\JSMITH", false);
    verify(editLockService).release(1000456L, "IDIR\\JSMITH");
  }

  @Test
  void addExemptionShouldNotTrustARequestedActiveStatusFromANonApprover() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\submitter", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\SUBMITTER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "saveExemption")).thenReturn(true);
    when(authorizationService.canPerformAction(roles, "viewFederalApplication")).thenReturn(false);
    when(authorizationService.canPerformAction(roles, "approveExemption")).thenReturn(false);
    when(service.addExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("IDIR\\SUBMITTER"),
            org.mockito.ArgumentMatchers.eq(false)))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionResult(
                false,
                null,
                null,
                false,
                List.of("Insufficient privileges to set this Exemption as Active."),
                List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-205");
    params.add("approvedVolume", "250.5");
    params.add("approvalDate", "2026-07-01");
    params.add("expiryDate", "2026-12-31");
    params.add("exemptionTypeCode", "M");
    params.add("exemptionStatusCode", "ACT");

    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.addExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().errors())
        .contains("Insufficient privileges to set this Exemption as Active.");
    verify(service)
        .addExemption(
            org.mockito.ArgumentMatchers.argThat(
                request -> "ACT".equals(request.exemptionStatusCode())),
            org.mockito.ArgumentMatchers.eq("IDIR\\SUBMITTER"),
            org.mockito.ArgumentMatchers.eq(false));
  }

  @Test
  void updateExemptionLegacyShouldMapAliasesAndApprovalAuthz() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(provincialAuthorizationService.canViewBlanketOic(authentication)).thenReturn(true);
    when(service.updateExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"),
            org.mockito.ArgumentMatchers.eq(true)))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionResult(
                true, "The exemption was updated successfully.", "EX-206", false, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-206");
    params.add("legacyExemptionNumber", "EX-205");
    params.add("approvedVolume", "350.5");
    params.add("approvalDate", "03/01/2026");
    params.add("exemptionExpiryDate", "12/31/2026");
    params.add("otherConditions", "Updated conditions");
    params.add("exemptionTypeCode", "B");
    params.add("exemptionStatusCode", "ACT");
    params.add("feeRate", "18.25");
    params.add("region", "11,12");

    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.updateExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().exemptionNumber()).isEqualTo("EX-206");
    assertThat(response.getBody().refreshPage()).isFalse();

    ArgumentCaptor<ExemptionDetailsRpcService.UpdateExemptionRequest> requestCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcService.UpdateExemptionRequest.class);
    verify(service).updateExemption(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"), org.mockito.ArgumentMatchers.eq(true));
    ExemptionDetailsRpcService.UpdateExemptionRequest request = requestCaptor.getValue();
    assertThat(request.exemptionNumber()).isEqualTo("EX-206");
    assertThat(request.previousExemptionNumber()).isEqualTo("EX-205");
    assertThat(request.approvedVolume()).isEqualTo(350.5d);
    assertThat(request.approvalDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.expiryDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    assertThat(request.feeRate()).isEqualTo(18.25d);
    assertThat(request.enableRateOverride()).isFalse();
    assertThat(request.regionNumbers()).containsExactly(11L, 12L);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireOrgUnits(
            authentication,
            List.of(11L, 12L),
            ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
  }

  @Test
  void updateExemptionShouldRejectMoveOutsideRegionScopeBeforePersistence() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "saveExemption")).thenReturn(true);
    doThrow(new AccessDeniedException("outside org scope"))
        .when(provincialAuthorizationService)
        .requireOrgUnits(
            authentication,
            List.of(12L),
            ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-205");
    params.add("exemptionTypeCode", "M");
    params.add("region", "12");

    assertThatThrownBy(() -> controller.updateExemptionLegacy(params, authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("outside org scope");

    verify(service, never())
        .updateExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyBoolean());
  }

  @Test
  void cancellationShouldAuthorizeCanonicalPreviousExemptionAndLockLinkedApplications() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(editLockService.acquireExemption(
            "EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.acquireExemption(
            "EX-206", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.getApplicationNumbersForMutation("EX-205"))
        .thenReturn(List.of(1000456L));
    when(editLockService.snapshot(1000456L, "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquire(1000456L, "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.updateExemption(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("IDIR\\JSMITH"),
            org.mockito.ArgumentMatchers.eq(true)))
        .thenReturn(
            new ExemptionDetailsRpcService.CreateExemptionResult(
                true, "updated", "EX-206", false, List.of(), List.of()));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    controller.setApplicationEditLockService(editLockService);

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-206");
    params.add("legacyExemptionNumber", "EX-205");
    params.add("exemptionStatusCode", "CAN");

    ResponseEntity<ExemptionDetailsRpcController.ExemptionPersistenceResponseDto> response =
        controller.updateExemptionLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService, atLeastOnce())
        .requireExemption(authentication, "EX-205");
    verify(provincialAuthorizationService, never())
        .requireExemption(authentication, "EX-206");
    verify(editLockService)
        .acquireExemption("EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false);
    verify(service, atLeastOnce()).getApplicationNumbersForMutation("EX-205");
    verify(editLockService).acquire(1000456L, "IDIR\\JSMITH", "IDIR\\JSMITH", false);
    verify(editLockService).release(1000456L, "IDIR\\JSMITH");
  }

  @Test
  void updateExemptionShouldRejectChangingToBlanketOicOutsideRoleScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "saveExemption"))
        .thenReturn(true);

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exemptionNumber", "EX-205");
    params.add("exemptionTypeCode", "B");

    assertThatThrownBy(() -> controller.updateExemptionLegacy(params, authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("Blanket OIC");
    verifyNoInteractions(service);
  }

  @Test
  void getClientDataLegacyShouldReturnLegacyClientPayload() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00077881",
                    "Acme Forestry",
                    "123 Main St",
                    "Victoria",
                    "BC",
                    "V8W 1A1",
                    "CA",
                    "250-555-0100",
                    "250-555-0199",
                    "user@example.com")));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().clientNumber()).isEqualTo("00077881");
    assertThat(response.getBody().companyName()).isEqualTo("Acme Forestry");
    assertThat(response.getBody().notfound()).isNull();
  }

  @Test
  void getClientLocationsLegacyShouldReturnLocations() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientLocations("77881"))
        .thenReturn(List.of(new ClientLookupService.ClientLocation("00 - Main", "00", false)));

    ResponseEntity<List<ExemptionDetailsRpcController.ExemptionClientLocationResponseDto>> response =
        controller.getClientLocationsLegacy("77881");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).locationCode()).isEqualTo("00");
  }

  @Test
  void getContactsForLocationLegacyShouldReturnContacts() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getContactsForLocation("77881", "00"))
        .thenReturn(List.of(new ClientLookupService.ClientContact("Jane Smith", "123")));

    ResponseEntity<List<ExemptionDetailsRpcController.ExemptionClientContactResponseDto>> response =
        controller.getContactsForLocationLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).contactName()).isEqualTo("Jane Smith");
    assertThat(response.getBody().get(0).contactId()).isEqualTo("123");
  }

  @Test
  void approveExemptionsLegacyShouldUseApprovalAuthzAndReturnSendGridPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(service.approveExemptions("EX-205,EX-206", "IDIR\\JSMITH", true))
        .thenReturn(
            new ExemptionDetailsRpcService.ExemptionApprovalResult(
                true,
                true,
                List.of(List.of("EX-205", "client@example.com")),
                "",
                "",
                List.of(),
                List.of()));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionApprovalResponseDto> response =
        controller.approveExemptionsLegacy("EX-205,EX-206", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().sendGrid()).containsExactly(List.of("EX-205", "client@example.com"));
    verify(service).approveExemptions("EX-205,EX-206", "IDIR\\JSMITH", true);
  }

  @Test
  void approveExemptionsShouldReleaseOnlyMutationAcquiredLocksInDeterministicOrder() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    controller.setApplicationEditLockService(editLockService);
    when(editLockService.snapshotExemption("EX-205", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.snapshotExemption("EX-206", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquireExemption(
            "EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.acquireExemption(
            "EX-206", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.approveExemptions("ex-206, EX-205,ex-205", "IDIR\\JSMITH", true))
        .thenReturn(
            new ExemptionDetailsRpcService.ExemptionApprovalResult(
                true, true, List.of(), "", "", List.of(), List.of()));

    var response =
        controller.approveExemptions(
            "ex-206, EX-205,ex-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    org.mockito.InOrder inOrder = org.mockito.Mockito.inOrder(editLockService);
    inOrder.verify(editLockService)
        .acquireExemption("EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false);
    inOrder.verify(editLockService)
        .acquireExemption("EX-206", "IDIR\\JSMITH", "IDIR\\JSMITH", false);
    verify(editLockService, never()).releaseExemption("EX-205", "IDIR\\JSMITH");
    verify(editLockService).releaseExemption("EX-206", "IDIR\\JSMITH");
  }

  @Test
  void approveExemptionsShouldReleasePartialAcquisitionsWhenLaterLockConflicts() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\JSMITH");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    controller.setApplicationEditLockService(editLockService);
    when(editLockService.snapshotExemption("EX-205", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquireExemption(
            "EX-205", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.snapshotExemption("EX-206", "IDIR\\JSMITH", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquireExemption(
            "EX-206", "IDIR\\JSMITH", "IDIR\\JSMITH", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This exemption is currently locked.", null));

    assertThatThrownBy(
            () -> controller.approveExemptions("EX-206,EX-205", authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This exemption is currently locked.");

    verify(editLockService).releaseExemption("EX-205", "IDIR\\JSMITH");
    verify(service, never()).approveExemptions(
        org.mockito.ArgumentMatchers.any(),
        org.mockito.ArgumentMatchers.any(),
        org.mockito.ArgumentMatchers.anyBoolean());
  }

  @Test
  void sendExemptionApprovalEmailLegacyShouldMapLegacyExemptionNumber() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(service.sendExemptionApprovalEmail("EX-205", "client@example.com"))
        .thenReturn(new ExemptionDetailsRpcService.ExemptionApprovalEmailResult(true, "Email sent successfully."));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionApprovalEmailResponseDto> response =
        controller.sendExemptionApprovalEmailLegacy(null, "EX-205", "client@example.com", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().message()).isEqualTo("Email sent successfully.");
    verify(service).sendExemptionApprovalEmail("EX-205", "client@example.com");
  }

  @Test
  void sendExemptionApprovalEmailsLegacyShouldReturnBatchEmailPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_EXEMPTION_APPROVER"), "approveExemption"))
        .thenReturn(true);
    when(service.sendExemptionApprovalEmails("EX-205:client@example.com"))
        .thenReturn(new ExemptionDetailsRpcService.ExemptionApprovalEmailResult(true, "Emails sent successfully."));

    ResponseEntity<ExemptionDetailsRpcController.ExemptionApprovalEmailResponseDto> response =
        controller.sendExemptionApprovalEmailsLegacy("EX-205:client@example.com", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().message()).isEqualTo("Emails sent successfully.");
    verify(service).sendExemptionApprovalEmails("EX-205:client@example.com");
  }

  private ExemptionDetailDto exemptionDetail(String status) {
    return new ExemptionDetailDto(
        "EX-205",
        "M",
        "Ministerial",
        status,
        status,
        "00077881",
        null,
        1000456L,
        "EXE",
        LocalDate.of(2026, 1, 1),
        LocalDate.of(2026, 12, 31),
        100d,
        25d,
        75d,
        null,
        false,
        List.of(),
        List.of());
  }
}

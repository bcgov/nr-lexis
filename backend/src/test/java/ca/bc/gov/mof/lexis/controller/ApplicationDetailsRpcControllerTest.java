package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.OracleAggregateRowLockService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
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
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationDetailsRpcController")
class ApplicationDetailsRpcControllerTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ObjectProvider<ApplicationReviewService> applicationReviewServiceProvider;
  @Mock private ApplicationDetailsRpcService service;
  @Mock private ClientLookupService clientLookupService;
  @Mock private ApplicationReviewService applicationReviewService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private HttpServletRequest servletRequest;
  @Mock private HttpSession session;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ApplicationEditPolicyService applicationEditPolicyService;

  private ApplicationDetailsRpcController controller;
  private ApplicationPermitOperationCoordinator operationCoordinator;

  @BeforeEach
  void setup() {
    operationCoordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex());
    controller =
        new ApplicationDetailsRpcController(
            serviceProvider,
            clientLookupServiceProvider,
            applicationReviewServiceProvider,
            sessionService,
            authorizationService,
            editLockService,
            provincialAuthorizationService,
            applicationEditPolicyService,
            operationCoordinator);
    lenient()
        .when(editLockService.requireEditable(any(), any(), any()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(editLockService.snapshot(any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    lenient()
        .when(editLockService.snapshotExemption(any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    lenient()
        .when(editLockService.acquireExemption(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(provincialAuthorizationService.canCreateForClient(any(), any(), any()))
        .thenReturn(true);
    lenient()
        .when(service.findApplicationNumberForPackage(any()))
        .thenReturn(Optional.of(1000456L));
    lenient()
        .when(service.findApplicationNumberForScale(any()))
        .thenReturn(Optional.of(1000456L));
    lenient()
        .when(service.findApplicationNumberForRemark(any()))
        .thenReturn(Optional.of(1000456L));
  }

  @Test
  void documentDetailsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void documentDetailsShouldMapServiceResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(7L, "test.pdf", "Not on file", "Uploaded")));

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).id()).isEqualTo(7L);
    assertThat(response.getBody().get(0).name()).isEqualTo("test.pdf");
    assertThat(response.getBody().get(0).source()).isEqualTo("application");
    assertThat(response.getBody().get(0).deletable()).isTrue();
    verify(service).getDocumentDetails(1000456L);
  }

  @Test
  void documentDetailsShouldHidePermitDocumentsWithoutPermitDetailAuthority() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\application-approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/permitDetails")).thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.DocumentItem(
                    55L,
                    "permit.pdf",
                    "Permit copy",
                    "Permit document",
                    "permit",
                    null,
                    7000123L,
                    false)));
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
          controller.getDocumentDetails("1000456");

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getBody()).isEmpty();
      verify(provincialAuthorizationService, never())
          .requirePermit(authentication, 7000123L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldRejectPermitDocumentWithoutPermitDetailAuthority() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\application-approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    ApplicationDetailsRpcService.DocumentItem permitDocument =
        new ApplicationDetailsRpcService.DocumentItem(
            55L,
            "permit.pdf",
            "Permit copy",
            "Permit document",
            "permit",
            null,
            7000123L,
            false);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/permitDetails")).thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForApplication(55L, 1000456L))
        .thenReturn(Optional.of(permitDocument));
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("55", "permit.pdf", "1000456"))
          .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied application.");
      verify(service, never()).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldRejectPermitDocumentWithoutPermitObjectAccess() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\application-approver", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    ApplicationDetailsRpcService.DocumentItem permitDocument =
        new ApplicationDetailsRpcService.DocumentItem(
            55L,
            "permit.pdf",
            "Permit copy",
            "Permit document",
            "permit",
            null,
            7000123L,
            false);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/permitDetails")).thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForApplication(55L, 1000456L))
        .thenReturn(Optional.of(permitDocument));
    org.mockito.Mockito.doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requirePermit(authentication, 7000123L);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("55", "permit.pdf", "1000456"))
          .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied application.");
      verify(service, never()).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldReturnAttachmentPayload() throws Exception {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\application-approver", "n/a");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findDocumentForApplication(55L, 1000456L))
        .thenReturn(Optional.of(directApplicationDocument(55L, "test.pdf", "", "Uploaded")));
    when(service.streamDocument(55L))
        .thenReturn(Optional.of(output -> output.write("test-content".getBytes())));
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<StreamingResponseBody> response =
          controller.streamDocument("55", "../unsafe/path/test.pdf", "1000456");

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getHeaders().getContentDisposition().isAttachment()).isTrue();
      assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("test.pdf");
      assertThat(response.getBody()).isNotNull();
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      response.getBody().writeTo(output);
      assertThat(output.toByteArray()).containsExactly("test-content".getBytes());
      verify(provincialAuthorizationService).requireApplication(authentication, 1000456L);
      verify(service).streamDocument(55L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "Not on file", "Uploaded")));
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(editLockService, times(2))
        .requireEditable(1000456L, "idir\\jsmith", "idir\\jsmith");
    verify(editLockService, never()).snapshot(1000456L, "idir\\jsmith", false);
    verify(service, times(2)).getDocumentDetails(1000456L);
    verify(service, times(2)).getApplicationSummarySnapshot(1000456L);
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldAllowApproverWithoutFileUploadAction() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "Not on file", "Uploaded")));
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldFailClosedWhenRpcServiceIsUnavailable() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    verifyNoInteractions(service);
  }

  @Test
  void removeDocumentShouldRejectWhenDocumentDoesNotBelongToApplication() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(77L, "other.pdf", "Not on file", "Uploaded")));

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service).getDocumentDetails(1000456L);
    org.mockito.Mockito.verify(service, org.mockito.Mockito.never())
        .getApplicationSummarySnapshot(org.mockito.ArgumentMatchers.anyLong());
    org.mockito.Mockito.verify(service, org.mockito.Mockito.never())
        .removeDocument(org.mockito.ArgumentMatchers.anyLong());
  }

  @Test
  void removeDocumentShouldRejectLinkedPermitDocument() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.DocumentItem(
                    55L,
                    "permit.pdf",
                    "Permit copy",
                    "Permit document",
                    "permit",
                    null,
                    7000123L,
                    false)));

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service, never()).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldRejectWhenApplicationLockedByAnotherUser() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "Not on file", "Uploaded")));
    when(editLockService.requireEditable(1000456L, "idir\\jsmith", "idir\\jsmith"))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This application is currently locked for editing by another user.",
                null));

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("false");
    verify(service, never()).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldRejectExpiredApplicationsForApprovers() {
    TestingAuthenticationToken authentication = authorized();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "Not on file", "Uploaded")));
    when(service.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(summarySnapshotWithStatus("EXP")));

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service).getDocumentDetails(1000456L);
    verify(service).getApplicationSummarySnapshot(1000456L);
    org.mockito.Mockito.verify(service, org.mockito.Mockito.never()).removeDocument(org.mockito.ArgumentMatchers.anyLong());
  }

  @Test
  void removeDocumentShouldAllowScopedIndustryForPermittedApplication() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "", "Uploaded")));
    when(service.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(summarySnapshotWithStatus("PMT")));
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldAllowScopedIndustryForExpiredApplication() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(List.of(directApplicationDocument(55L, "test.pdf", "", "Uploaded")));
    when(service.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(summarySnapshotWithStatus("EXP")));
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldRejectReadOnlyUserEvenWhenDocumentExists() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions("idir\\readonly", List.of("LEXIS_READ_ONLY"));

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void getRemarkShouldReturnNotFoundWhenRemarkMissing() {
    TestingAuthenticationToken authentication = authorized("/applicationRemarks");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemark(999L)).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.GetRemarkResponseDto> response =
        controller.getRemark("999", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isTrue();
    verify(service).getRemark(999L);
  }

  @Test
  void getRemarkShouldRejectWithoutApplicationRemarksAction() {
    TestingAuthenticationToken authentication = unauthorized("/applicationRemarks");

    ResponseEntity<ApplicationDetailsRpcController.GetRemarkResponseDto> response =
        controller.getRemark("999", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void persistRemarkShouldReturnOkStatus() {
    TestingAuthenticationToken authentication = authorized("/applicationRemarks");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    Instant now = Instant.parse("2026-05-27T17:00:00Z");
    when(service.persistRemark("new", 1000456L, "Long remark", "idir\\jsmith"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.PersistedRemark(
                    44L, "Long remark", "Long remark", "idir\\jsmith", now)));

    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("ok");
    assertThat(response.getBody().remarkId()).isEqualTo(44L);
    assertThat(response.getBody().user()).isEqualTo("idir\\jsmith");
    verify(service).persistRemark("new", 1000456L, "Long remark", "idir\\jsmith");
  }

  @Test
  void persistRemarkShouldReturnExplicitValidationFailureForUnsupportedCharacters() {
    TestingAuthenticationToken authentication = authorized("/applicationRemarks");
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "éè", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("validation_error");
    assertThat(response.getBody().message())
        .isEqualTo("Application remarks contain unsupported special characters. Remove them and try again.");
    verify(service, never()).persistRemark(any(), any(), any(), any());
  }

  @Test
  void persistRemarkShouldRejectWithoutApplicationRemarksAction() {
    TestingAuthenticationToken authentication = unauthorized("/applicationRemarks");

    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void checkFormChangesShouldReturnDefaultUnchangedWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(new LinkedMultiValueMap<>());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isFalse();
  }

  @Test
  void checkFormChangesShouldCompareLegacyApplicationSummaryFields() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));

    MultiValueMap<String, String> params = matchingSummaryParameters();

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isFalse();
    verify(service).getApplicationSummarySnapshot(1000456L);
  }

  @Test
  void checkFormChangesShouldReportChangedWhenLegacyAdditionalRemarksArePresent() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));

    MultiValueMap<String, String> params = matchingSummaryParameters();
    params.add("additionalRemarks", "Needs review");

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChangesLegacy(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isTrue();
  }

  @Test
  void checkFormChangesShouldForceChangedWhenStoredOwnerContactIsBlankLikeLegacy() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(summarySnapshotWithBlankOwnerContact()));

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(matchingSummaryParameters());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isTrue();
  }

  @Test
  void checkUnusedVolumeShouldReturnDefaultUsedWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationDetailsRpcController.CheckUnusedVolumeResponseDto> response =
        controller.checkUnusedVolume("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volumeUsedInd()).isTrue();
  }

  @Test
  void checkUnusedVolumeShouldMapLegacyPayloadFromService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.isApplicationVolumeUsed(1000456L)).thenReturn(false);

    ResponseEntity<ApplicationDetailsRpcController.CheckUnusedVolumeResponseDto> response =
        controller.checkUnusedVolumeLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volumeUsedInd()).isFalse();
    verify(service).isApplicationVolumeUsed(1000456L);
  }

  @Test
  void releaseLockShouldReturnLegacyOkPayloadAndClearApplicationSessionState() {
    when(servletRequest.getSession(false)).thenReturn(session);
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");

    ResponseEntity<ApplicationDetailsRpcController.ReleaseLockResponseDto> response =
        controller.releaseLockLegacy("1000456", servletRequest, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().release()).isEqualTo("ok");
    verify(editLockService).release(1000456L, "idir\\jsmith");
    verify(session).removeAttribute("exemptionApplication");
    verify(session).removeAttribute("applicationNumber");
  }

  @Test
  void sendApplicationRejectEmailLegacyShouldDelegateToReviewEmailService() {
    when(applicationReviewServiceProvider.getIfAvailable()).thenReturn(applicationReviewService);
    OracleAggregateRowLockService rowLocks =
        org.mockito.Mockito.mock(OracleAggregateRowLockService.class);
    ApplicationDetailsRpcController emailController =
        controllerWithOracleLocks(rowLocks);
    when(applicationReviewService.sendStatusEmail(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.any(ApplicationReviewStatusEmailRequestDto.class)))
        .thenReturn(new ApplicationReviewStatusEmailResultDto(true, "Status email sent."));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("toEmailAddress", "client@example.test");
    params.add("additionalRemarks", "Rejected during review");
    TestingAuthenticationToken authentication = authorized("/applicationsReview");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationStatusEmailResponseDto> response =
        emailController.sendApplicationRejectEmailLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().message()).isEqualTo("Status email sent.");

    ArgumentCaptor<ApplicationReviewStatusEmailRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusEmailRequestDto.class);
    verify(applicationReviewService).sendStatusEmail(org.mockito.ArgumentMatchers.eq(1000456L), requestCaptor.capture());
    assertThat(requestCaptor.getValue().statusCode()).isEqualTo("REJ");
    assertThat(requestCaptor.getValue().clientEmailAddress()).isEqualTo("client@example.test");
    assertThat(requestCaptor.getValue().remark()).isEqualTo("Rejected during review");
    verify(provincialAuthorizationService).requireApplication(authentication, 1000456L);
    verifyNoInteractions(rowLocks);
  }

  @Test
  void sendApplicationWithdrawnEmailLegacyShouldUseWithdrawnStatus() {
    when(applicationReviewServiceProvider.getIfAvailable()).thenReturn(applicationReviewService);
    OracleAggregateRowLockService rowLocks =
        org.mockito.Mockito.mock(OracleAggregateRowLockService.class);
    ApplicationDetailsRpcController emailController =
        controllerWithOracleLocks(rowLocks);
    when(applicationReviewService.sendStatusEmail(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.any(ApplicationReviewStatusEmailRequestDto.class)))
        .thenReturn(new ApplicationReviewStatusEmailResultDto(false, "Status email could not be sent."));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("toEmailAddress", "client@example.test");
    params.add("additionalRemarks", "Withdrawn");
    TestingAuthenticationToken authentication = authorized("/applicationsReview");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationStatusEmailResponseDto> response =
        emailController.sendApplicationWithdrawnEmailLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();

    ArgumentCaptor<ApplicationReviewStatusEmailRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusEmailRequestDto.class);
    verify(applicationReviewService).sendStatusEmail(org.mockito.ArgumentMatchers.eq(1000456L), requestCaptor.capture());
    assertThat(requestCaptor.getValue().statusCode()).isEqualTo("WDN");
    verify(provincialAuthorizationService).requireApplication(authentication, 1000456L);
    verifyNoInteractions(rowLocks);
  }

  private ApplicationDetailsRpcController controllerWithOracleLocks(
      OracleAggregateRowLockService rowLocks) {
    @SuppressWarnings("unchecked")
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        org.mockito.Mockito.mock(ObjectProvider.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex(rowLockProvider));
    return new ApplicationDetailsRpcController(
        serviceProvider,
        clientLookupServiceProvider,
        applicationReviewServiceProvider,
        sessionService,
        authorizationService,
        editLockService,
        provincialAuthorizationService,
        applicationEditPolicyService,
        coordinator);
  }

  @Test
  void addApplicationLegacyShouldMapAliasesAndReturnLegacyPersistencePayload() {
    TestingAuthenticationToken authentication =
        authorized("createApplication", "/changeApplicantType");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "The application was saved successfully.", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationDate", "2026-03-01");
    params.add("exemptionTerm", "30");
    params.add("receivedDate", "2026-03-02");
    params.add("applicationVolume", "125.5");
    params.add("averageLogVolume", "2.4");
    params.add("productLocation", "Camp 1");
    params.add("applicantClientNumber", "00022222");
    params.add("agentClientLocationCode", "01");
    params.add("ownerClientNumber", "00011111");
    params.add("ownerClientLocationCode", "02");
    params.add("exemptionTypeCode", "U");
    params.add("applicantType", "A");
    params.add("region", "11");
    params.add("productTypeCode", "H");
    params.add("growthTypeCode", "O");
    params.add("ownerContactName", "Owner Contact");
    params.add("comments", "Ready for review");
    params.add("validation", "false");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().applicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service).addApplication(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.CreateApplicationRequest request = requestCaptor.getValue();
    assertThat(request.applicationDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.receivedDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.agentClientNumber()).isEqualTo("00022222");
    assertThat(request.ownerClientNumber()).isEqualTo("00011111");
    assertThat(request.ownerClientLocationCode()).isEqualTo("02");
    assertThat(request.exemptionReasonCode()).isEqualTo("U");
    assertThat(request.applicantTypeCode()).isEqualTo("A");
    assertThat(request.productTypeCode()).isEqualTo("H");
    assertThat(request.remarkBody()).isEqualTo("Ready for review");
    assertThat(request.validationEnabled()).isTrue();
    verify(provincialAuthorizationService)
        .requireOrgUnit(
            authentication,
            11L,
            ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
  }

  @Test
  void addApplicationShouldRejectAgentApplicantWithoutChangeApplicantTypeAuthority() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00011111");
    params.add("applicantType", "A");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(serviceProvider, never()).getIfAvailable();
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldDefaultApplicantTypeToOwnerWithoutChangeApplicantTypeAuthority() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00011111");
    params.add("applicantType", "   ");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service)
        .addApplication(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().applicantTypeCode()).isEqualTo("O");
  }

  @Test
  void addApplicationShouldDiscardAgentFieldsForOwnerApplicant() {
    TestingAuthenticationToken authentication =
        authorized("createApplication", "/changeApplicantType");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicantType", "O");
    params.add("agentClientNumber", "00022222");
    params.add("agentClientLocationCode", "03");
    params.add("agentContactName", "Forged agent");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service)
        .addApplication(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().agentClientNumber()).isNull();
    assertThat(requestCaptor.getValue().agentClientLocationCode()).isNull();
    assertThat(requestCaptor.getValue().agentContactName()).isNull();
  }

  @Test
  void addApplicationShouldRejectRequestedOrganizationUnitOutsideScopeBeforePersistence() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    doThrow(new org.springframework.security.access.AccessDeniedException("outside org scope"))
        .when(provincialAuthorizationService)
        .requireOrgUnit(
            authentication,
            12L,
            ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00011111");
    params.add("region", "12");

    assertThatThrownBy(() -> controller.addApplicationLegacy(params, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("outside org scope");

    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldCanonicalizeScopedSubmitterOwnerIdentity() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("77881");
    when(clientLookupService.getClientDataRequired("00077881", "02"))
        .thenReturn(Optional.of(clientData("00077881")));
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("bceid\\submitter")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00099999");
    params.add("ownerClientLocationCode", "02");
    params.add("agentClientNumber", "00022222");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service)
        .addApplication(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("bceid\\submitter"));
    ApplicationDetailsRpcService.CreateApplicationRequest request = requestCaptor.getValue();
    assertThat(request.ownerClientNumber()).isEqualTo("00077881");
    assertThat(request.ownerClientLocationCode()).isEqualTo("02");
    assertThat(request.agentClientNumber()).isNull();
    verify(clientLookupService).getClientDataRequired("00077881", "02");
    verify(provincialAuthorizationService)
        .canCreateForClient(authentication, "00077881", null);
  }

  @Test
  void addApplicationShouldDefaultScopedSubmitterOwnerLocationToMainLocation() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("00077881");
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(Optional.of(clientData("00077881")));
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("bceid\\submitter")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00099999");
    params.add("ownerClientLocationCode", "   ");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service)
        .addApplication(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("bceid\\submitter"));
    assertThat(requestCaptor.getValue().ownerClientNumber()).isEqualTo("00077881");
    assertThat(requestCaptor.getValue().ownerClientLocationCode()).isEqualTo("00");
  }

  @Test
  void addApplicationShouldRejectUnknownLocationForScopedSubmitter() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("00077881");
    when(clientLookupService.getClientDataRequired("00077881", "99"))
        .thenReturn(Optional.empty());
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00099999");
    params.add("ownerClientLocationCode", "99");

    assertThatThrownBy(() -> controller.addApplicationLegacy(params, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage(
            "The selected owner location is not valid for the authenticated client.");
    verify(service, never()).addApplication(any(), any());
    verify(clientLookupService, never()).getClientDataRequired("00099999", "99");
  }

  @Test
  void addApplicationShouldRejectMismatchedScopedLocationLookupIdentity() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("00077881");
    when(clientLookupService.getClientDataRequired("00077881", "02"))
        .thenReturn(Optional.of(clientData("00099999")));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientNumber", "00099999");
    params.add("ownerClientLocationCode", "02");

    assertThatThrownBy(() -> controller.addApplicationLegacy(params, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage(
            "The selected owner location is not valid for the authenticated client.");
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldFailClosedWhenScopedLocationLookupFails() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("00077881");
    IllegalStateException lookupFailure = new IllegalStateException("Oracle lookup failed");
    when(clientLookupService.getClientDataRequired("00077881", "03"))
        .thenThrow(lookupFailure);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientLocationCode", "03");

    assertThatThrownBy(() -> controller.addApplicationLegacy(params, authentication))
        .isSameAs(lookupFailure);
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldFailClosedWhenScopedLocationLookupIsUnavailable() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenReturn("00077881");
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("ownerClientLocationCode", "03");

    assertThatThrownBy(() -> controller.addApplicationLegacy(params, authentication))
        .isInstanceOf(ResponseStatusException.class)
        .satisfies(
            exception ->
                assertThat(((ResponseStatusException) exception).getStatusCode())
                    .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldFailClosedWhenSubmitterScopeCannotBeResolved() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(provincialAuthorizationService.scopedForestClientNumber(authentication))
        .thenThrow(
            new org.springframework.security.access.AccessDeniedException(
                "Provincial Submitter authority is missing its forest-client scope."));

    assertThatThrownBy(
            () -> controller.addApplicationLegacy(new LinkedMultiValueMap<>(), authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Provincial Submitter authority is missing its forest-client scope.");
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldRecheckExemptionAndClientScopeInsideAggregateLock() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(provincialAuthorizationService.canCreateForClient(
            authentication, "00011111", null))
        .thenReturn(true, false);

    MultiValueMap<String, String> params = linkedApplicationCreateParameters();
    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(provincialAuthorizationService, times(2))
        .requireExemption(authentication, "EX-205");
    verify(provincialAuthorizationService, times(2))
        .canCreateForClient(authentication, "00011111", null);
    verify(service, never()).addApplication(any(), any());
  }

  @Test
  void addApplicationShouldRejectAnInteractiveExemptionLockConflict() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(editLockService.acquireExemption(
            "EX-205", "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This exemption is currently locked.", null));

    assertThatThrownBy(
            () ->
                controller.addApplicationLegacy(
                    linkedApplicationCreateParameters(), authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This exemption is currently locked.");

    verify(service, never()).addApplication(any(), any());
    verify(editLockService, never()).releaseExemption(any(), any());
  }

  @Test
  void addApplicationShouldReleaseANewTemporaryExemptionLockWhenCreateFails() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenThrow(new IllegalStateException("Oracle failed"));

    assertThatThrownBy(
            () ->
                controller.addApplicationLegacy(
                    linkedApplicationCreateParameters(), authentication))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Oracle failed");

    verify(editLockService).releaseExemption("EX-205", "idir\\jsmith");
  }

  @Test
  void addApplicationShouldPreserveAnExistingSameUserExemptionLock() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(editLockService.snapshotExemption("EX-205", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true,
                "The application was saved successfully.",
                1000456L,
                List.of(),
                List.of()));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(
            linkedApplicationCreateParameters(), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(editLockService, never()).releaseExemption(any(), any());
  }

  @Test
  void addApplicationShouldHoldCanonicalExemptionLockThroughServiceReturn() throws Exception {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    CountDownLatch serviceEntered = new CountDownLatch(1);
    CountDownLatch releaseService = new CountDownLatch(1);
    when(service.addApplication(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenAnswer(
            ignored -> {
              serviceEntered.countDown();
              if (!releaseService.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release application create.");
              }
              return new ApplicationDetailsRpcService.CreateApplicationResult(
                  true,
                  "The application was saved successfully.",
                  1000456L,
                  List.of(),
                  List.of());
            });

    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto>>
          createFuture =
              executor.submit(
                  () ->
                      controller.addApplicationLegacy(
                          linkedApplicationCreateParameters(), authentication));
      assertThat(serviceEntered.await(5, TimeUnit.SECONDS)).isTrue();

      CountDownLatch competingAttempted = new CountDownLatch(1);
      Future<Boolean> competingMutation =
          executor.submit(
              () -> {
                competingAttempted.countDown();
                return operationCoordinator.executeKnownAggregate(
                    List.of(" ex-205 "), List.of(), List.of(), () -> true);
              });
      assertThat(competingAttempted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(
              () -> competingMutation.get(150, TimeUnit.MILLISECONDS))
          .isInstanceOf(TimeoutException.class);

      releaseService.countDown();
      assertThat(createFuture.get(5, TimeUnit.SECONDS).getStatusCode())
          .isEqualTo(HttpStatus.OK);
      assertThat(competingMutation.get(5, TimeUnit.SECONDS)).isTrue();
    } finally {
      releaseService.countDown();
      executor.shutdownNow();
    }

    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service).addApplication(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().exemptionNumber()).isEqualTo("EX-205");
    verify(provincialAuthorizationService, times(2))
        .requireExemption(authentication, "EX-205");
    verify(provincialAuthorizationService, times(2))
        .canCreateForClient(authentication, "00011111", null);
    verify(editLockService).releaseExemption("EX-205", "idir\\jsmith");
  }

  @Test
  void addApplicationLegacyShouldRejectWithoutCreateApplicationAction() {
    TestingAuthenticationToken authentication = unauthorized("createApplication");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(new LinkedMultiValueMap<>(), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void updateApplicationSummaryShouldEnforceSummaryPolicyBeforeMutation() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.updateApplicationSummary(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("ownerClientNumber", "00011111");
    params.add("agentClientNumber", "00022222");
    params.add("region", "76");
    params.add("validation", "false");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.updateApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(applicationEditPolicyService, times(2))
        .requireSummaryEdit(authentication, service, 1000456L);
    verify(provincialAuthorizationService, times(2))
        .requireOrgUnit(
            authentication,
            76L,
            ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
    ArgumentCaptor<ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest.class);
    verify(service)
        .updateApplicationSummary(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().validationEnabled()).isTrue();
  }

  @Test
  void updateApplicationSummaryShouldRejectMoveOutsideOrganizationUnitScope() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    doThrow(new org.springframework.security.access.AccessDeniedException("outside org scope"))
        .when(provincialAuthorizationService)
        .requireOrgUnit(
            authentication,
            12L,
            ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("ownerClientNumber", "00011111");
    params.add("region", "12");

    assertThatThrownBy(() -> controller.updateApplicationLegacy(params, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("outside org scope");

    verify(service, never()).updateApplicationSummary(any(), any());
  }

  @Test
  void updateApplicationSummaryShouldPersistApplicantTypeForAuthorizedApprover() {
    TestingAuthenticationToken authentication =
        authorized("createApplication", "/changeApplicantType");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.updateApplicationSummary(any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("ownerClientNumber", "00011111");
    params.add("applicantType", "A");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.updateApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest.class);
    verify(service)
        .updateApplicationSummary(
            requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().applicantTypeCode()).isEqualTo("A");
  }

  @Test
  void updateApplicationSummaryShouldAllowScopedSubmitterWhenApplicantTypeIsOmitted() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "idir\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00011111"),
            "createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.updateApplicationSummary(any(), org.mockito.ArgumentMatchers.eq("idir\\submitter")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "Saved", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("ownerClientNumber", "00011111");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.updateApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service)
        .updateApplicationSummary(any(), org.mockito.ArgumentMatchers.eq("idir\\submitter"));
  }

  @Test
  void updateApplicationSummaryShouldRejectScopedSubmitterApplicantTypeChange() {
    TestingAuthenticationToken authentication =
        authenticatedWithActions(
            "idir\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00011111"),
            "createApplication");

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("ownerClientNumber", "00011111");
    params.add("applicantType", "A");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.updateApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service, never()).updateApplicationSummary(any(), any());
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
                    "contact@example.com")));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().clientNumber()).isEqualTo("00077881");
    assertThat(response.getBody().companyName()).isEqualTo("Acme Forestry");
    assertThat(response.getBody().notfound()).isNull();
    verify(clientLookupService).getClientData("77881", "00");
  }

  @Test
  void getClientDataLegacyShouldReturnNotFoundFlagWhenClientMissing() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00")).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isEqualTo("true");
  }

  @Test
  void getClientLocationsLegacyShouldMarkSavedLocationSelected() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientLocations("22222"))
        .thenReturn(
            List.of(
                new ClientLookupService.ClientLocation("Main Office", "01", false),
                new ClientLookupService.ClientLocation("Reload Yard", "02", false)));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientLocationResponseDto>>
        response = controller.getClientLocationsLegacy("22222", "1000456", "agent");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::locationCode,
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::selected)
        .containsExactly(tuple("01", true), tuple("02", false));
  }

  @Test
  void getContactsForLocationLegacyShouldPreferSavedApplicationContactAndIncludeClientData() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientData("11111", "02"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00011111",
                    "Owner Forestry",
                    "456 Forest Rd",
                    "Nanaimo",
                    "BC",
                    "V9R 1A1",
                    "CA",
                    "250-555-0200",
                    null,
                    "owner@example.com")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    ApplicationDetailsRpcController.ApplicationClientContactResponseDto contact =
        response.getBody().get(0);
    assertThat(contact.contactName()).isEqualTo("Owner Contact");
    assertThat(contact.contactId()).isEqualTo("-1");
    assertThat(contact.clientNumber()).isEqualTo("00011111");
    assertThat(contact.companyName()).isEqualTo("Owner Forestry");
    verify(clientLookupService).getClientData("11111", "02");
  }

  @Test
  void getContactsForLocationLegacyShouldFallbackToClientContacts() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L)).thenReturn(Optional.empty());
    when(clientLookupService.getContactsForLocation("11111", "02"))
        .thenReturn(List.of(new ClientLookupService.ClientContact("Fallback Contact", "22")));
    when(clientLookupService.getClientData("11111", "02")).thenReturn(Optional.empty());

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).contactName()).isEqualTo("Fallback Contact");
    assertThat(response.getBody().get(0).contactId()).isEqualTo("22");
    verify(clientLookupService).getContactsForLocation("11111", "02");
  }

  @Test
  void getSpeciesCodesLegacyShouldReturnLegacyCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesCodes())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("FIR", "Douglas-fir"),
                new ApplicationDetailsRpcService.CodeItem("HEM", "Hemlock")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getSpeciesCodesLegacy();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("FIR", "Douglas-fir"), tuple("HEM", "Hemlock"));
    verify(service).getSpeciesCodes();
  }

  @Test
  void getPackageStatusCodesLegacyShouldReturnLegacyCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageStatusCodes())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("ACT", "Active"),
                new ApplicationDetailsRpcService.CodeItem("SHT", "Shutout")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getPackageStatusCodesLegacy();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("ACT", "Active"), tuple("SHT", "Shutout"));
    verify(service).getPackageStatusCodes();
  }

  @Test
  void getGradeCodesLegacyShouldUseLegacyAndModernParameterAliases() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getGradeCodes("11", "FIR"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("J", "Grade J"),
                new ApplicationDetailsRpcService.CodeItem("U", "Grade U")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getGradeCodesLegacy("FIR", "11", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("J", "Grade J"), tuple("U", "Grade U"));
    verify(service).getGradeCodes("11", "FIR");
  }

  @Test
  void getGradeCodesShouldFallbackToShortParameterAliases() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getGradeCodes("22", "HEM"))
        .thenReturn(List.of(new ApplicationDetailsRpcService.CodeItem("K", "Grade K")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getGradeCodes(null, null, "HEM", "22");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).code()).isEqualTo("K");
    verify(service).getGradeCodes("22", "HEM");
  }

  @Test
  void getEndUseForSpeciesRegionLegacyShouldParseSpeciesJsonAndReturnCodes() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getEndUsesForSpeciesRegion("11", List.of("FI", "HE")))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("LU", "Lumber"),
                new ApplicationDetailsRpcService.CodeItem("UT", "Utility")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getEndUseForSpeciesRegionLegacy("[\"FI\",\"HE\"]", "11", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("LU", "Lumber"), tuple("UT", "Utility"));
    verify(service).getEndUsesForSpeciesRegion("11", List.of("FI", "HE"));
  }

  @Test
  void getRemainingSpeciesLegacyShouldReturnCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemainingSpecies("11", "S", List.of("FI")))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.SpeciesCodeItem("HE"),
                new ApplicationDetailsRpcService.SpeciesCodeItem("SP")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationRemainingSpeciesResponseDto>>
        response = controller.getRemainingSpeciesLegacy("[\"FI\"]", "11", null, "S", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(ApplicationDetailsRpcController.ApplicationRemainingSpeciesResponseDto::code)
        .containsExactly("HE", "SP");
    verify(service).getRemainingSpecies("11", "S", List.of("FI"));
  }

  @Test
  void getSelectedEndUseLegacyShouldReturnLegacySuccessPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSelectedEndUse(1000456L)).thenReturn(Optional.of("LUM"));

    ResponseEntity<ApplicationDetailsRpcController.SelectedEndUseResponseDto> response =
        controller.getSelectedEndUseLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().selectedEndUse()).isEqualTo("LUM");
    verify(service).getSelectedEndUse(1000456L);
  }

  @Test
  void getPackageSelectedEndUseLegacyShouldReturnFalseWhenMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageSelectedEndUse("PKG-903")).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.SelectedEndUseResponseDto> response =
        controller.getPackageSelectedEndUseLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().selectedEndUse()).isNull();
    verify(service).getPackageSelectedEndUse("PKG-903");
  }

  @Test
  void getSpeciesForApplicationLegacyShouldReturnApplicationFieldNames() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesForApplication(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.SpeciesEndUseItem("FIR", "LUM", "Lumber"),
                new ApplicationDetailsRpcService.SpeciesEndUseItem("HEM", "PUL", "Pulp")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto>>
        response = controller.getSpeciesForApplicationLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::species,
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::enduse,
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::endUseDescription)
        .containsExactly(tuple("FIR", "LUM", "Lumber"), tuple("HEM", "PUL", "Pulp"));
    verify(service).getSpeciesForApplication(1000456L);
  }

  @Test
  void getSpeciesForPackageLegacyShouldReturnPackageFieldNames() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesForPackage("PKG-903"))
        .thenReturn(List.of(new ApplicationDetailsRpcService.SpeciesEndUseItem("CED", "LUM", "Lumber")));

    ResponseEntity<List<ApplicationDetailsRpcController.PackageSpeciesEndUseResponseDto>> response =
        controller.getSpeciesForPackageLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).species()).isEqualTo("CED");
    assertThat(response.getBody().get(0).enduse()).isEqualTo("LUM");
    assertThat(response.getBody().get(0).packageEndUseDescription()).isEqualTo("Lumber");
    assertThat(response.getBody().get(0).packageEndUse()).isEqualTo("LUM");
    verify(service).getSpeciesForPackage("PKG-903");
  }

  @Test
  void getUniqueScalesForApplicationLegacyShouldReturnTimberMarks() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getUniqueScalesForApplication(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationScaleItem("TM001"),
                new ApplicationDetailsRpcService.ApplicationScaleItem("TM002")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationScaleResponseDto>> response =
        controller.getUniqueScalesForApplicationLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(ApplicationDetailsRpcController.ApplicationScaleResponseDto::timberMark)
        .containsExactly("TM001", "TM002");
    verify(service).getUniqueScalesForApplication(1000456L);
  }

  @Test
  void findPermitLegacyShouldReturnOnlyPermitsWithinDetailAndObjectScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = authorized("/permitDetails");
    when(service.findPermits(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPermitItem(7000123L, "Complete"),
                new ApplicationDetailsRpcService.ApplicationPermitItem(7000456L, "Active")));
    when(provincialAuthorizationService.canAccessPermit(authentication, 7000123L))
        .thenReturn(true);
    when(provincialAuthorizationService.canAccessPermit(authentication, 7000456L))
        .thenReturn(false);

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationPermitResponseDto>> response =
        controller.findPermitLegacy("1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationPermitResponseDto::permitNumber,
            ApplicationDetailsRpcController.ApplicationPermitResponseDto::permitStatusDescription)
        .containsExactly(tuple(7000123L, "Complete"));
    verify(service).findPermits(1000456L);
    verify(provincialAuthorizationService).canAccessPermit(authentication, 7000123L);
    verify(provincialAuthorizationService).canAccessPermit(authentication, 7000456L);
  }

  @Test
  void findPermitsShouldReturnNoChildrenWithoutPermitDetailAuthority() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = authorized();
    when(service.findPermits(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPermitItem(
                    7000123L, "Complete")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationPermitResponseDto>> response =
        controller.findPermits("1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEmpty();
    verify(provincialAuthorizationService, never())
        .canAccessPermit(authentication, 7000123L);
  }

  @Test
  void getScalesForPackageLegacyShouldReturnLegacyScaleRows() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScalesForPackage("PKG-903"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    true, "TM001", "Douglas-fir", 12L, "Grade J", "10.5", "55", "C"),
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    false, "Unmanufactured", "Hemlock", 8L, "Grade U", "6.0", "56", "")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto>> response =
        controller.getScalesForPackageLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::permitted,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::timberMark,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::species,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::pieces,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::grade,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::volume,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::id,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::cascadeSplitCode)
        .containsExactly(
            tuple(true, "TM001", "Douglas-fir", 12L, "Grade J", "10.5", "55", "C"),
            tuple(false, "Unmanufactured", "Hemlock", 8L, "Grade U", "6.0", "56", ""));
    verify(service).getScalesForPackage("PKG-903");
  }

  @Test
  void getPackageDetailsLegacyShouldReturnLegacyPackagePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageDetails("PKG-903"))
        .thenReturn(
            new ApplicationDetailsRpcService.PackageDetailsItem(
                true,
                "PKG-903",
                "10.3",
                3.6d,
                "6.0",
                "24.0",
                "ACT",
                "Reviewed",
                "Active",
                "N",
                "S",
                "Standing",
                "H",
                "Harvested"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPackageDetailsResponseDto> response =
        controller.getPackageDetailsLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-903");
    assertThat(response.getBody().volume()).isEqualTo("10.3");
    assertThat(response.getBody().scaledVolume()).isEqualTo(3.6d);
    assertThat(response.getBody().length()).isEqualTo("6.0");
    assertThat(response.getBody().diameter()).isEqualTo("24.0");
    assertThat(response.getBody().status()).isEqualTo("ACT");
    assertThat(response.getBody().comments()).isEqualTo("Reviewed");
    assertThat(response.getBody().statusDesc()).isEqualTo("Active");
    assertThat(response.getBody().reprocessed()).isEqualTo("N");
    assertThat(response.getBody().ageClass()).isEqualTo("S");
    assertThat(response.getBody().ageClassDescription()).isEqualTo("Standing");
    assertThat(response.getBody().productType()).isEqualTo("H");
    assertThat(response.getBody().productTypeDescription()).isEqualTo("Harvested");
    verify(service).getPackageDetails("PKG-903");
  }

  @Test
  void getScaleByIdLegacyShouldReturnLegacyScaleDetailPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScaleById("55"))
        .thenReturn(
            new ApplicationDetailsRpcService.ApplicationScaleDetailItem(
                true, "TM001", "FIR", "12", "J", "10.5", "55"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationScaleDetailResponseDto> response =
        controller.getScaleByIdLegacy("55", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().timberMark()).isEqualTo("TM001");
    assertThat(response.getBody().species()).isEqualTo("FIR");
    assertThat(response.getBody().pieces()).isEqualTo("12");
    assertThat(response.getBody().grade()).isEqualTo("J");
    assertThat(response.getBody().volume()).isEqualTo("10.5");
    assertThat(response.getBody().id()).isEqualTo("55");
    verify(service).getScaleById("55");
  }

  @Test
  void getScaleByIdLegacyShouldAcceptScaleIdAliasFromLegacyJavascript() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScaleById("55"))
        .thenReturn(
            new ApplicationDetailsRpcService.ApplicationScaleDetailItem(
                true, "TM001", "FIR", "12", "J", "10.5", "55"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationScaleDetailResponseDto> response =
        controller.getScaleByIdLegacy(null, "55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().id()).isEqualTo("55");
    verify(service).getScaleById("55");
  }

  @Test
  void isPackageValidLegacyShouldReturnFalseWithMessageWhenPackageExists() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.isPackageValid("PKG-903"))
        .thenReturn(new ApplicationDetailsRpcService.PackageValidityItem(false, "Package PKG-903 already exists."));

    ResponseEntity<ApplicationDetailsRpcController.PackageValidityResponseDto> response =
        controller.isPackageValidLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isFalse();
    assertThat(response.getBody().message()).isEqualTo("Package PKG-903 already exists.");
    verify(service).isPackageValid("PKG-903");
  }

  @Test
  void addPackageToApplicationLegacyShouldMapLegacyParamsAndReturnPackagePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addPackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.PackagePersistenceResult(
                true, "PKG-903", "125.5", "12.0", "24.0", "A", List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("packageNumber", "PKG-903");
    params.add("applicationNumber", "1000456");
    params.add("packageDialogPackageVolume", "125.5");
    params.add("packageDialogAverageLength", "12.0");
    params.add("packageDialogAverageDiameter", "24.0");
    params.add("packageDialogPackageStatus", "A");
    params.add("packageDialogPackageComment", "Test package");
    params.add("packageDialogReprocessedIndicator", "N");
    params.add("createPackageEndUse", "LU");
    params.add("createPackageSpeciesTableValues", "FI,HE");

    ResponseEntity<ApplicationDetailsRpcController.PackagePersistenceResponseDto> response =
        controller.addPackageToApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-903");
    assertThat(response.getBody().packageName()).isEqualTo("PKG-903");

    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(service).addPackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    verify(applicationEditPolicyService, times(2))
        .requirePackageAddOrDelete(authentication, service, 1000456L);
    ApplicationDetailsRpcService.PackageMutationRequest request = requestCaptor.getValue();
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.volume()).isEqualTo(125.5d);
    assertThat(request.status()).isEqualTo("A");
    assertThat(request.endUseCode()).isEqualTo("LU");
    assertThat(request.speciesCodes()).containsExactly("FI", "HE");
  }

  @Test
  void addPackageToApplicationLegacyShouldReturnConflictWhenApplicationLockedByAnotherUser() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(editLockService.requireEditable(1000456L, "idir\\jsmith", "idir\\jsmith"))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This application is currently locked for editing by another user.",
                null));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("packageNumber", "PKG-904");
    params.add("applicationNumber", "1000456");

    ResponseEntity<ApplicationDetailsRpcController.PackagePersistenceResponseDto> response =
        controller.addPackageToApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly("This application is currently locked for editing by another user.");
    verify(service, never()).addPackage(any(), any());
  }

  @Test
  void updatePackageLegacyShouldMapLegacyParamsAndReturnPackagePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.updatePackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.PackagePersistenceResult(
                true, "PKG-904", "100.0", "10.0", "20.0", "A", List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("packageNumber", "PKG-903");
    params.add("newPackageNumber", "PKG-904");
    params.add("applicationNumber", "1000456");
    params.add("packageDialogPackageVolume", "100.0");
    params.add("packageDialogAverageLength", "10.0");
    params.add("packageDialogAverageDiameter", "20.0");
    params.add("packageDialogPackageStatus", "A");
    params.add("updatePackageEndUse", "LU");
    params.add("updatePackageSpeciesTableValues", "CE");

    ResponseEntity<ApplicationDetailsRpcController.PackagePersistenceResponseDto> response =
        controller.updatePackageLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-904");

    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(service).updatePackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    verify(applicationEditPolicyService, times(2))
        .requirePackageEdit(authentication, service, 1000456L);
    verify(applicationEditPolicyService, times(2))
        .requirePackageNumberUpdate(authentication, service, 1000456L);
    ApplicationDetailsRpcService.PackageMutationRequest request = requestCaptor.getValue();
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.newPackageNumber()).isEqualTo("PKG-904");
    assertThat(request.speciesCodes()).containsExactly("CE");
  }

  @Test
  void addScaleToPackageLegacyShouldMapLegacyParamsAndReturnScalePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addScaleToPackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.ScalePersistenceResult(
                true,
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    false, "A12345", "Douglas-fir", 10L, "Sawlog", "12.5", "55", ""),
                List.of(),
                List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("timberMark", "A12345");
    params.add("scaleVolume", "12.5");
    params.add("scalePieces", "10");
    params.add("gradeCode", "1");
    params.add("speciesCode", "FI");
    params.add("applicationNumber", "1000456");
    params.add("packageNumber", "PKG-903");

    ResponseEntity<ApplicationDetailsRpcController.ScalePersistenceResponseDto> response =
        controller.addScaleToPackageLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().result()).isNotNull();
    assertThat(response.getBody().result().id()).isEqualTo("55");
    assertThat(response.getBody().result().pieces()).isEqualTo(10L);

    ArgumentCaptor<ApplicationDetailsRpcService.ScaleMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.ScaleMutationRequest.class);
    verify(service).addScaleToPackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    verify(applicationEditPolicyService, times(2))
        .requireScaleAddOrDelete(authentication, service, 1000456L);
    ApplicationDetailsRpcService.ScaleMutationRequest request = requestCaptor.getValue();
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.pieces()).isEqualTo(10L);
    assertThat(request.volume()).isEqualTo(12.5d);
  }

  @Test
  void deleteScaleByIdLegacyShouldPassAuthenticatedUserAndReturnSuccess() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.deleteScaleById("55", "idir\\jsmith")).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deleteScaleByIdLegacy("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    verify(service).deleteScaleById("55", "idir\\jsmith");
    verify(applicationEditPolicyService, times(2))
        .requireScaleAddOrDelete(authentication, service, 1000456L);
  }

  @Test
  void deleteScaleByIdLegacyShouldRejectWithoutCreateApplicationAction() {
    TestingAuthenticationToken authentication = unauthorized("createApplication");

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deleteScaleByIdLegacy("55", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void deletePackageByIdLegacyShouldPassAuthenticatedUserAndReturnSuccess() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deletePackageByIdLegacy("PKG-903", "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    verify(service).deletePackageById("PKG-903", "idir\\jsmith");
    verify(applicationEditPolicyService, times(2))
        .requirePackageAddOrDelete(authentication, service, 1000456L);
  }

  private TestingAuthenticationToken authorized(String... actions) {
    return authenticatedWithActions(
        "idir\\jsmith", List.of("LEXIS_APPLICATION_APPROVER"), actions);
  }

  private TestingAuthenticationToken authenticatedWithActions(
      String userId, List<String> roles, String... actions) {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken(userId, "n/a");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    for (String action : actions) {
      when(authorizationService.canPerformAction(roles, action)).thenReturn(true);
    }
    return authentication;
  }

  private TestingAuthenticationToken unauthorized(String action) {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\readonly", "n/a");
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, action)).thenReturn(false);
    return authentication;
  }

  private ApplicationDetailsRpcService.DocumentItem directApplicationDocument(
      long id, String name, String description, String type) {
    return new ApplicationDetailsRpcService.DocumentItem(
        id,
        name,
        description,
        type,
        "application",
        1000456L,
        null,
        true);
  }

  private ClientLookupService.ClientData clientData(String clientNumber) {
    return new ClientLookupService.ClientData(
        clientNumber, null, null, null, null, null, null, null, null, null);
  }

  private MultiValueMap<String, String> linkedApplicationCreateParameters() {
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("exemptionNumber", " ex-205 ");
    parameters.add("ownerClientNumber", "00011111");
    return parameters;
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot summarySnapshot() {
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        1000456L,
        null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        125.5d,
        2.4d,
        "Camp 1",
        1234L,
        "00022222",
        "01",
        "00011111",
        "02",
        null,
        "U",
        "NEW",
        "A",
        11L,
        "H",
        "P",
        "O",
        "Agent Contact",
        "Owner Contact",
        "N");
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot summarySnapshotWithBlankOwnerContact() {
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        1000456L,
        null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        125.5d,
        2.4d,
        "Camp 1",
        1234L,
        "00022222",
        "01",
        "00011111",
        "02",
        null,
        "U",
        "NEW",
        "A",
        11L,
        "H",
        "P",
        "O",
        "Agent Contact",
        null,
        "N");
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot summarySnapshotWithStatus(String status) {
    ApplicationDetailsRpcService.ApplicationSummarySnapshot snapshot = summarySnapshot();
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        snapshot.applicationNumber(),
        snapshot.federalApplicationNumber(),
        snapshot.applicationDate(),
        snapshot.termDays(),
        snapshot.receivedDate(),
        snapshot.applicationVolume(),
        snapshot.averageLogVolume(),
        snapshot.productLocation(),
        snapshot.exportScheduleId(),
        snapshot.agentClientNumber(),
        snapshot.agentClientLocationCode(),
        snapshot.ownerClientNumber(),
        snapshot.ownerClientLocationCode(),
        snapshot.exemptionNumber(),
        snapshot.exemptionReasonCode(),
        status,
        snapshot.applicantTypeCode(),
        snapshot.orgUnitNumber(),
        snapshot.productTypeCode(),
        snapshot.jurisdictionCode(),
        snapshot.growthTypeCode(),
        snapshot.agentContactName(),
        snapshot.ownerContactName(),
        snapshot.oicIndicator());
  }

  private MultiValueMap<String, String> matchingSummaryParameters() {
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("applicationDate", "2026-03-01");
    params.add("exemptionTerm", "30");
    params.add("dateReceived", "2026-03-02");
    params.add("averageLogVolume", "2.4");
    params.add("logLocation", "Camp 1");
    params.add("exportScheduleId", "1234");
    params.add("agentClientNumber", "00022222");
    params.add("agentClientLocationCode", "01");
    params.add("agentContactName", "Agent Contact");
    params.add("ownerClientNumber", "00011111");
    params.add("ownerClientLocationCode", "02");
    params.add("ownerContactName", "Owner Contact");
    params.add("exemptionReason", "U");
    params.add("region", "11");
    params.add("productType", "H");
    return params;
  }
}

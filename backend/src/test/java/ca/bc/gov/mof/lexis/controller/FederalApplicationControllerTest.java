package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationOfferDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationRemarkDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationValidationDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | FederalApplicationController")
class FederalApplicationControllerTest {

  @Mock private ObjectProvider<FederalApplicationService> serviceProvider;
  @Mock private FederalApplicationService service;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private Authentication authentication;

  private FederalApplicationController controller;

  @BeforeEach
  void setUpAuthorizationDefaults() {
    PermitOperationMutex operationMutex = new PermitOperationMutex();
    controller =
        new FederalApplicationController(
            serviceProvider,
            sessionService,
            authorizationService,
            editLockService,
            new ApplicationPermitOperationCoordinator(operationMutex));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    lenient()
        .when(editLockService.snapshot(any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    lenient()
        .when(editLockService.requireEditable(any(), any(), any()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(
            provincialAuthorizationService.constrainOrgUnits(
                any(), any(), any()))
        .thenReturn(
            new ProvincialAuthorizationService.OrgUnitConstraint(false, List.of()));
  }

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<FederalApplicationSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationSearchOptionsDto dto =
        new FederalApplicationSearchOptionsDto(
            List.of(new CodeNameDto("APR", "Approved")),
            List.of(new CodeNameDto("F", "Federal")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<FederalApplicationSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<FederalApplicationSearchResponseDto> response =
        controller.search(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            0,
            25,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationSearchResponseDto dto =
        new FederalApplicationSearchResponseDto(
            List.of(
                new FederalApplicationSearchResultDto(
                    1000456L,
                    "FED-1000456",
                    "Approved",
                    "00077881",
                    "Federal request",
                    "Federal",
                    "EX-300",
                    LocalDate.of(2026, 2, 20),
                    LocalDate.of(2026, 2, 26),
                    true,
                    false)),
            1,
            0,
            25);
    when(service.search(any(FederalApplicationSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<FederalApplicationSearchResponseDto> response =
        controller.search(
            null,
            " FED-1000456 ",
            " PKG-901 ",
            " EX-300 ",
            " APR ",
            "2026-02-20",
            "03/10/2026",
            "2026-02-26",
            null,
            " 00077881 ",
            " 00055667 ",
            0,
            25,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<FederalApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    FederalApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.federalApplicationNumber()).isEqualTo(" FED-1000456 ");
    assertThat(criteria.packageNumber()).isEqualTo(" PKG-901 ");
    assertThat(criteria.exemptionNumber()).isEqualTo(" EX-300 ");
    assertThat(criteria.applicationStatus()).isEqualTo(" APR ");
    assertThat(criteria.receivedFromDate()).isEqualTo(LocalDate.of(2026, 2, 20));
    assertThat(criteria.receivedToDate()).isEqualTo(LocalDate.of(2026, 3, 10));
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 26));
    assertThat(criteria.ownerClientNumber()).isEqualTo(" 00077881 ");
    assertThat(criteria.agentClientNumber()).isEqualTo(" 00055667 ");
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<FederalApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            "00055667",
            "00",
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of("PKG-901"),
            List.of("Reviewed"),
            List.of(
                new FederalApplicationOfferDto(
                    "800", "Federal Buyer", LocalDate.of(2026, 2, 22))),
            null);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(
            provincialAuthorizationService.canAccessFederalApplication(
                authentication, 1000456L))
        .thenReturn(true);

    ResponseEntity<FederalApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
  }

  @Test
  void detailShouldAcquireAndReturnApplicationLockForFederalManager() {
    FederalApplicationDetailDto dto = federalDetail();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(provincialAuthorizationService.canAccessFederalApplication(authentication, 1000456L))
        .thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(
            authorizationService.canPerformAction(
                List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(
            editLockService.acquire(
                1000456L, "idir\\approver", "idir\\approver", true))
        .thenReturn(
            new ApplicationEditLockDto(
                false,
                true,
                null,
                null,
                Instant.parse("2026-07-12T20:20:00Z")));

    ResponseEntity<FederalApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().locked()).isFalse();
    assertThat(response.getBody().lockHeldByCurrentUser()).isTrue();
    assertThat(response.getBody().lockedBy()).isNull();
    verify(editLockService)
        .acquire(1000456L, "idir\\approver", "idir\\approver", true);
    verify(editLockService, never()).snapshot(any(), any(), anyBoolean());
  }

  @Test
  void detailShouldReturnCompetingLockOwnerToAuthorizedFederalManager() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(federalDetail()));
    when(provincialAuthorizationService.canAccessFederalApplication(authentication, 1000456L))
        .thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(
            authorizationService.canPerformAction(
                List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(authentication.getName()).thenReturn("idir\\approver2");
    when(
            editLockService.acquire(
                1000456L, "idir\\approver2", "idir\\approver2", true))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                "Reviewer One",
                "This application is currently locked for editing by Reviewer One.",
                Instant.parse("2026-07-12T20:20:00Z")));

    FederalApplicationDetailDto detail =
        controller.getByApplicationNumber(1000456L, authentication).getBody();

    assertThat(detail).isNotNull();
    assertThat(detail.locked()).isTrue();
    assertThat(detail.lockHeldByCurrentUser()).isFalse();
    assertThat(detail.lockedBy()).isEqualTo("Reviewer One");
    assertThat(detail.lockMessage()).contains("Reviewer One");
  }

  @Test
  void detailShouldOnlySnapshotAndHideCompetingOwnerFromReadOnlyViewer() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(federalDetail()));
    when(provincialAuthorizationService.canAccessFederalApplication(authentication, 1000456L))
        .thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_READ_ONLY"));
    when(
            authorizationService.canPerformAction(
                List.of("LEXIS_READ_ONLY"), "manageFederalApplication"))
        .thenReturn(false);
    when(authentication.getName()).thenReturn("idir\\viewer");
    when(editLockService.snapshot(1000456L, "idir\\viewer", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                "Reviewer One",
                "This application is currently locked for editing by Reviewer One.",
                Instant.parse("2026-07-12T20:20:00Z")));

    FederalApplicationDetailDto detail =
        controller.getByApplicationNumber(1000456L, authentication).getBody();

    assertThat(detail).isNotNull();
    assertThat(detail.locked()).isTrue();
    assertThat(detail.lockedBy()).isNull();
    assertThat(detail.lockMessage()).doesNotContain("Reviewer One");
    verify(editLockService).snapshot(1000456L, "idir\\viewer", false);
    verify(editLockService, never()).acquire(any(), any(), any(), anyBoolean());
  }

  @Test
  void detailShouldFailClosedWhenApplicationLockStateCannotBeResolved() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(federalDetail()));
    when(provincialAuthorizationService.canAccessFederalApplication(authentication, 1000456L))
        .thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(
            authorizationService.canPerformAction(
                List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(
            editLockService.acquire(
                1000456L, "idir\\approver", "idir\\approver", true))
        .thenThrow(new IllegalStateException("lock registry failed"));

    FederalApplicationDetailDto detail =
        controller.getByApplicationNumber(1000456L, authentication).getBody();

    assertThat(detail).isNotNull();
    assertThat(detail.locked()).isTrue();
    assertThat(detail.lockHeldByCurrentUser()).isFalse();
    assertThat(detail.lockedBy()).isNull();
    assertThat(detail.lockMessage()).contains("could not be verified");
  }

  @Test
  void detailShouldHideAnApplicationOutsideTheReadOnlyOrganizationScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            null,
            null,
            null,
            "F",
            null,
            null,
            null,
            true,
            List.of(),
            List.of(),
            List.of(),
            null);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(
            provincialAuthorizationService.canAccessFederalApplication(
                authentication, 1000456L))
        .thenReturn(false);

    ResponseEntity<FederalApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    assertThat(response.getBody()).isNull();
  }

  @Test
  void permitShouldFailBeforeLookupWhenApplicationIsOutsideReadOnlyOrganizationScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);

    assertThatThrownBy(() -> controller.getFederalPermit(1000456L, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);

    verify(service, never()).findPermitByApplicationNumber(any());
  }

  @Test
  void permitShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationPermitDto dto =
        new FederalApplicationPermitDto(
            99123L,
            LocalDate.of(2026, 3, 12),
            "US",
            "SEA",
            "MV Federal",
            LocalDate.of(2026, 3, 15),
            "VAN",
            null);
    when(service.findPermitByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));

    ResponseEntity<FederalApplicationPermitDto> response =
        controller.getFederalPermit(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);
  }

  @Test
  void remarksShouldAllowReadOnlyViewerAndRequireFederalParentAccess() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<FederalApplicationRemarkDto> remarks =
        List.of(
            new FederalApplicationRemarkDto(
                44L, "Review note", "idir\\reviewer", Instant.parse("2026-07-10T20:00:00Z")));
    when(service.findRemarksByApplicationNumber(1000456L)).thenReturn(Optional.of(remarks));

    ResponseEntity<List<FederalApplicationRemarkDto>> response =
        controller.getRemarks(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(remarks);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);
    verifyNoInteractions(sessionService, authorizationService);
  }

  @Test
  void remarksShouldReturnStructuredRowsForAuthorizedApprover() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<FederalApplicationRemarkDto> remarks =
        List.of(
            new FederalApplicationRemarkDto(
                44L, "Review note", "idir\\reviewer", Instant.parse("2026-07-10T20:00:00Z")));
    when(service.findRemarksByApplicationNumber(1000456L)).thenReturn(Optional.of(remarks));

    ResponseEntity<List<FederalApplicationRemarkDto>> response =
        controller.getRemarks(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(remarks);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);
  }

  @Test
  void updateRemarkShouldBindApplicationAndRemarkIdentifiers() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(authentication.getName()).thenReturn("idir\\approver");
    FederalApplicationService.FederalRemarkMutationRequest request =
        new FederalApplicationService.FederalRemarkMutationRequest("Updated note");
    FederalApplicationService.FederalRemarkMutationResult result =
        new FederalApplicationService.FederalRemarkMutationResult(
            true,
            "Updated",
            new FederalApplicationRemarkDto(44L, "Updated note", "idir\\reviewer", Instant.EPOCH),
            List.of());
    when(service.updateRemark(1000456L, 44L, request, "idir\\approver"))
        .thenReturn(result);

    ResponseEntity<FederalApplicationService.FederalRemarkMutationResult> response =
        controller.updateRemark(1000456L, 44L, request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).updateRemark(1000456L, 44L, request, "idir\\approver");
    verify(editLockService).release(1000456L, "idir\\approver");
  }

  @Test
  void federalMutationShouldPreserveAnExistingSameUserApplicationLock() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(editLockService.snapshot(1000456L, "idir\\approver", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    FederalApplicationService.FederalRemarkMutationRequest request =
        new FederalApplicationService.FederalRemarkMutationRequest("New note");
    FederalApplicationService.FederalRemarkMutationResult result =
        new FederalApplicationService.FederalRemarkMutationResult(true, "Added", null, List.of());
    when(service.addRemark(1000456L, request, "idir\\approver")).thenReturn(result);

    ResponseEntity<FederalApplicationService.FederalRemarkMutationResult> response =
        controller.addRemark(1000456L, request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(editLockService).requireEditable(1000456L, "idir\\approver", "idir\\approver");
    verify(editLockService, never()).release(1000456L, "idir\\approver");
  }

  @Test
  void federalMutationShouldFailBeforeOracleMutationWhenApplicationLockIsHeldByAnotherUser() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "manageFederalApplication"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(editLockService.requireEditable(1000456L, "idir\\approver", "idir\\approver"))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "Application is locked by another user.", null));
    FederalApplicationService.FederalStatusMutationRequest request =
        new FederalApplicationService.FederalStatusMutationRequest("APP", "Approved");

    assertThatThrownBy(
            () -> controller.updateFederalStatus(1000456L, request, authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessageContaining("locked by another user");

    verify(service, never()).updateStatus(any(), any(), any());
    verify(editLockService, never()).release(1000456L, "idir\\approver");
  }

  @Test
  void verifyClientsShouldReturnValidationPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.verifyApplicationClients(List.of(1000456L, 1000999L))).thenReturn(true);

    ResponseEntity<FederalApplicationValidationDto> response =
        controller.verifyClients("1000456,1000999", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new FederalApplicationValidationDto(true));
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000999L);
    verify(service).verifyApplicationClients(List.of(1000456L, 1000999L));
  }

  @Test
  void verifyClientsShouldPropagateOracleFailureToApiExceptionHandling() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("federal client lookup unavailable");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.verifyApplicationClients(List.of(1000456L, 1000999L))).thenThrow(failure);

    assertThatThrownBy(
            () -> controller.verifyClients("1000456,1000999", authentication))
        .isSameAs(failure);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000999L);
  }

  @Test
  void verifyClientsShouldFailBeforeValidationWhenAnyApplicationIsOutOfScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    lenient()
        .doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireFederalApplication(authentication, 1000999L);

    assertThatThrownBy(
            () -> controller.verifyClients("1000456,1000999", authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);

    verify(service, never()).verifyApplicationClients(any());
  }

  @Test
  void addPermitShouldRequireFederalManagementAction() {
    Authentication authentication = org.mockito.Mockito.mock(Authentication.class);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_EXEMPTION_APPROVER"), "manageFederalApplication"))
        .thenReturn(false);

    ResponseEntity<FederalApplicationService.FederalMutationResult> response =
        controller.addFederalPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null, LocalDate.now(), "US", "TRK", null, LocalDate.now(), "VAN", null),
            authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  private FederalApplicationDetailDto federalDetail() {
    return new FederalApplicationDetailDto(
        1000456L,
        "FED-1000456",
        "APR",
        "Approved",
        "00077881",
        "00",
        "00055667",
        "00",
        null,
        "F",
        "Federal reason",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 26),
        false,
        List.of(),
        List.of(),
        List.of(),
        null);
  }
}

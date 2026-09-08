package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;

class BlanketOicPackageControllerTest {

  @ParameterizedTest
  @ValueSource(strings = {
      "LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER", "LEXIS_PROVINCIAL_SUBMITTER_00001074"
  })
  void permitEditorsCanCreatePackageUsingResolvedAuditIdentity(String role) {
    Fixture fixture = fixture(List.of(role));
    BlanketOicPackageService.PackageMutationRequest request = request();
    BlanketOicPackageService.MutationResult expected =
        new BlanketOicPackageService.MutationResult(
            true, "saved", 777L, 1000456L, "PKG-1", List.of(), List.of());
    when(fixture.service.addPackage(request, "IDIR\\jsmith")).thenReturn(expected);

    var response = fixture.controller.addPackage(request, fixture.authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(expected);
    verify(fixture.service).addPackage(request, "IDIR\\jsmith");
    verify(fixture.provincialAuthorizationService, times(2))
        .requirePermit(fixture.authentication, 777L);
  }

  @Test
  void exemptionApproverCannotMutateBlanketOicPackages() {
    Fixture fixture = fixture(List.of("LEXIS_EXEMPTION_APPROVER"));
    when(fixture.authorizationService.canPerformAction(
        List.of("LEXIS_EXEMPTION_APPROVER"), "savePermit"))
        .thenReturn(false);

    assertThatThrownBy(() -> fixture.controller.updatePackage(request(), fixture.authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("permission to change Blanket OIC permit packages");
    verifyNoInteractions(fixture.service, fixture.provincialAuthorizationService);
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER", "LEXIS_PROVINCIAL_SUBMITTER_00001074"
  })
  void updatePackageLocksAndReleasesExistingHiddenApplication(String role) {
    Fixture fixture = fixture(List.of(role));
    fixture.controller.setApplicationEditLockService(fixture.editLockService);
    when(fixture.editLockService.acquirePermit(777L, "IDIR\\jsmith", "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(fixture.service.findHiddenApplicationNumber(777L)).thenReturn(Optional.of(1000456L));
    when(fixture.editLockService.snapshot(1000456L, "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(fixture.editLockService.acquire(1000456L, "IDIR\\jsmith", "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    BlanketOicPackageService.MutationResult expected =
        new BlanketOicPackageService.MutationResult(
            true, "saved", 777L, 1000456L, "PKG-1", List.of(), List.of());
    when(fixture.service.updatePackage(request(), "IDIR\\jsmith")).thenReturn(expected);

    var response = fixture.controller.updatePackage(request(), fixture.authentication);

    assertThat(response.getBody()).isEqualTo(expected);
    verify(fixture.editLockService).release(1000456L, "IDIR\\jsmith");
  }

  @ParameterizedTest
  @ValueSource(strings = {
      "LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER", "LEXIS_PROVINCIAL_SUBMITTER_00001074"
  })
  void deletePackagePreservesExistingSameUserHiddenApplicationLock(String role) {
    Fixture fixture = fixture(List.of(role));
    fixture.controller.setApplicationEditLockService(fixture.editLockService);
    when(fixture.editLockService.acquirePermit(777L, "IDIR\\jsmith", "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(fixture.service.findHiddenApplicationNumber(777L)).thenReturn(Optional.of(1000456L));
    when(fixture.editLockService.snapshot(1000456L, "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(fixture.editLockService.acquire(1000456L, "IDIR\\jsmith", "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    BlanketOicPackageService.MutationResult expected =
        new BlanketOicPackageService.MutationResult(
            true, "deleted", 777L, 1000456L, "PKG-1", List.of(), List.of());
    when(fixture.service.deletePackage(777L, "PKG-1", "IDIR\\jsmith")).thenReturn(expected);

    var response =
        fixture.controller.deletePackage(
            new BlanketOicPackageController.DeletePackageRequest(777L, "PKG-1"),
            fixture.authentication);

    assertThat(response.getBody()).isEqualTo(expected);
    verify(fixture.editLockService, never()).release(1000456L, "IDIR\\jsmith");
  }

  @ParameterizedTest
  @ValueSource(strings = {"create", "update", "delete"})
  void packageMutationsRequireSavePermitCapabilityEvenForStaff(String operation) {
    Fixture fixture = fixture(List.of("LEXIS_ADMIN"));
    when(fixture.authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "savePermit"))
        .thenReturn(false);

    assertThatThrownBy(() -> mutate(fixture, operation)).isInstanceOf(AccessDeniedException.class);

    verifyNoInteractions(fixture.service, fixture.provincialAuthorizationService);
  }

  @ParameterizedTest
  @ValueSource(strings = {"create", "update", "delete"})
  void submitterCannotMutatePackagesOnAnInaccessiblePermit(String operation) {
    Fixture fixture = fixture(List.of("LEXIS_PROVINCIAL_SUBMITTER_00001074"));
    doThrow(new AccessDeniedException("Permit is outside the selected client scope."))
        .when(fixture.provincialAuthorizationService).requirePermit(fixture.authentication, 777L);

    assertThatThrownBy(() -> mutate(fixture, operation)).isInstanceOf(AccessDeniedException.class);

    verifyNoInteractions(fixture.service);
  }

  @ParameterizedTest
  @ValueSource(strings = {"create", "update", "delete"})
  void submitterCannotMutatePackagesWhileAnotherUserHoldsThePermitLock(String operation) {
    Fixture fixture = fixture(List.of("LEXIS_PROVINCIAL_SUBMITTER_00001074"));
    fixture.controller.setApplicationEditLockService(fixture.editLockService);
    when(fixture.editLockService.acquirePermit(777L, "IDIR\\jsmith", "IDIR\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "Permit is locked.", null));

    assertThatThrownBy(() -> mutate(fixture, operation)).isInstanceOf(EditLockConflictException.class);

    verify(fixture.service, never()).addPackage(request(), "IDIR\\jsmith");
    verify(fixture.service, never()).updatePackage(request(), "IDIR\\jsmith");
    verify(fixture.service, never()).deletePackage(777L, "PKG-1", "IDIR\\jsmith");
  }

  private void mutate(Fixture fixture, String operation) {
    switch (operation) {
      case "create" -> fixture.controller.addPackage(request(), fixture.authentication);
      case "update" -> fixture.controller.updatePackage(request(), fixture.authentication);
      case "delete" -> fixture.controller.deletePackage(
          new BlanketOicPackageController.DeletePackageRequest(777L, "PKG-1"),
          fixture.authentication);
      default -> throw new IllegalArgumentException(operation);
    }
  }

  @SuppressWarnings("unchecked")
  private Fixture fixture(List<String> roles) {
    ObjectProvider<BlanketOicPackageService> provider = mock(ObjectProvider.class);
    BlanketOicPackageService service = mock(BlanketOicPackageService.class);
    LexisSessionService sessionService = mock(LexisSessionService.class);
    LexisAuthorizationService authorizationService = mock(LexisAuthorizationService.class);
    ProvincialAuthorizationService provincialAuthorizationService =
        mock(ProvincialAuthorizationService.class);
    LexisPrincipalService principalService = mock(LexisPrincipalService.class);
    ApplicationEditLockService editLockService = mock(ApplicationEditLockService.class);
    Authentication authentication = mock(Authentication.class);
    when(provider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "savePermit"))
        .thenReturn(true);
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\jsmith");
    ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex operationMutex =
        new ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex();
    BlanketOicPackageController controller =
        new BlanketOicPackageController(
            provider,
            sessionService,
            authorizationService,
            principalService,
            new ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator(
                operationMutex));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    return new Fixture(
        controller,
        service,
        editLockService,
        authentication,
        authorizationService,
        provincialAuthorizationService);
  }

  private BlanketOicPackageService.PackageMutationRequest request() {
    return new BlanketOicPackageService.PackageMutationRequest(
        777L, "PKG-1", null, 100.0d, 10.0d, 20.0d, "ACT", "", "N", "O", "H",
        "LU", List.of("FI"));
  }

  private record Fixture(
      BlanketOicPackageController controller,
      BlanketOicPackageService service,
      ApplicationEditLockService editLockService,
      Authentication authentication,
      LexisAuthorizationService authorizationService,
      ProvincialAuthorizationService provincialAuthorizationService) {}
}

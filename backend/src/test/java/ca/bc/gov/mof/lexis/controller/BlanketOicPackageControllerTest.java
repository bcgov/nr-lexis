package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;

class BlanketOicPackageControllerTest {

  @Test
  void applicationApproverCanCreatePackageUsingResolvedAuditIdentity() {
    Fixture fixture = fixture(List.of("LEXIS_APPLICATION_APPROVER"));
    BlanketOicPackageService.PackageMutationRequest request = request();
    BlanketOicPackageService.MutationResult expected =
        new BlanketOicPackageService.MutationResult(
            true, "saved", 777L, 1000456L, "PKG-1", List.of(), List.of());
    when(fixture.service.addPackage(request, "IDIR\\jsmith")).thenReturn(expected);

    var response = fixture.controller.addPackage(request, fixture.authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(expected);
    verify(fixture.service).addPackage(request, "IDIR\\jsmith");
  }

  @Test
  void exemptionApproverCannotMutateBlanketOicPackages() {
    Fixture fixture = fixture(List.of("LEXIS_EXEMPTION_APPROVER"));

    assertThatThrownBy(() -> fixture.controller.updatePackage(request(), fixture.authentication))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("Administrator or Application Approver");
  }

  @Test
  void updatePackageLocksAndReleasesExistingHiddenApplication() {
    Fixture fixture = fixture(List.of("LEXIS_ADMIN"));
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

  @Test
  void deletePackagePreservesExistingSameUserHiddenApplicationLock() {
    Fixture fixture = fixture(List.of("LEXIS_ADMIN"));
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

  @SuppressWarnings("unchecked")
  private Fixture fixture(List<String> roles) {
    ObjectProvider<BlanketOicPackageService> provider = mock(ObjectProvider.class);
    BlanketOicPackageService service = mock(BlanketOicPackageService.class);
    LexisSessionService sessionService = mock(LexisSessionService.class);
    LexisPrincipalService principalService = mock(LexisPrincipalService.class);
    ApplicationEditLockService editLockService = mock(ApplicationEditLockService.class);
    Authentication authentication = mock(Authentication.class);
    when(provider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\jsmith");
    ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex operationMutex =
        new ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex();
    return new Fixture(
        new BlanketOicPackageController(
            provider,
            sessionService,
            principalService,
            new ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator(
                operationMutex)),
        service,
        editLockService,
        authentication);
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
      Authentication authentication) {}
}

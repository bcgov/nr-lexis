package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.controller.ApplicationDetailsRpcController;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

/** Crosses the controller with the real configured role, region, client and child-policy rules. */
@ExtendWith(MockitoExtension.class)
class ApplicationScaleDeleteAuthorizationTest {
  private static final long APPLICATION = 1000456L;
  private static final long PERMIT = 7000123L;
  private static final String EA_RSC = "LEXIS_EXEMPTION_APPROVER_REGION_REGION-SOUTH_COAST";
  private static final String RO_RCB = "LEXIS_READ_ONLY_REGION_REGION-CARIBOO";
  private static final String AA_RCB = "LEXIS_APPLICATION_APPROVER_REGION_REGION-CARIBOO";
  private static final String AA_RSC = "LEXIS_APPLICATION_APPROVER_REGION_REGION-SOUTH_COAST";

  @Mock private ObjectProvider<LexisApplicationService> applicationProvider;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> detailsProvider;
  @Mock private ObjectProvider<PermitService> permitProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private ApplicationDetailsRpcService details;
  @Mock private PermitService permitService;
  @Mock private ApplicationEditLockService editLocks;

  private final LexisSessionService sessionService =
      new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final LexisAuthorizationService authorizationService =
      ProvincialRegionAuthorizationTest.configuredAuthorizationService(sessionService);
  private ProvincialAuthorizationService access;
  private ApplicationDetailsRpcController controller;

  @BeforeEach
  void setUp() {
    access = new ProvincialAuthorizationService(
        sessionService, authorizationService, applicationProvider, detailsProvider,
        null, permitProvider, null);
    var policy = new ApplicationEditPolicyService(
        sessionService, authorizationService);
    controller = new ApplicationDetailsRpcController(
        detailsProvider, null, null, sessionService, authorizationService, editLocks,
        access, policy, new ApplicationPermitOperationCoordinator(new PermitOperationMutex()));
    lenient().when(applicationProvider.getIfAvailable()).thenReturn(applicationService);
    lenient().when(detailsProvider.getIfAvailable()).thenReturn(details);
    lenient().when(permitProvider.getIfAvailable()).thenReturn(permitService);
    lenient().when(details.findApplicationNumberForScale("55"))
        .thenReturn(Optional.of(APPLICATION));
    lenient().when(details.findApplicationNumberForPackage("TESTPKG"))
        .thenReturn(Optional.of(APPLICATION));
    lenient().when(details.findPermitNumberForScale("55")).thenReturn(Optional.of(PERMIT));
    lenient().when(details.getPermitNumbersForApplicationMutation(APPLICATION))
        .thenReturn(List.of(PERMIT));
    lenient().when(details.getApplicationEditContext(APPLICATION))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.ApplicationEditContext(
            APPLICATION, "EXE", "P", "S", null, null,
            false, false, false, "N", true, false)));
    lenient().when(editLocks.requireEditable(any(), any(), any()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    regions(1909L, 1909L);
  }

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @ParameterizedTest
  @ValueSource(strings = {"NONE", RO_RCB, AA_RCB})
  void eligibleEaChildDeleteDoesNotBorrowOrRequireAnotherRolesPermitView(String extraRole) {
    var roles = new ArrayList<>(List.of(EA_RSC));
    if (!"NONE".equals(extraRole)) roles.add(extraRole);
    var actor = authenticate("idir\\approver", roles.toArray(String[]::new));
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();
    assertThat(access.canAccessPermit(actor, PERMIT)).isFalse();
    when(details.deleteScaleById("55", "idir\\approver")).thenReturn(true);

    var result = controller.deleteScaleById("55", Long.toString(APPLICATION), actor);

    assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(result.getBody().success()).isTrue();
    assertThat(access.canAccessPermit(actor, PERMIT)).isFalse();
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  void readOnlyRegionalGrantCannotLendLinkedOrUnassignedDeletePermission(boolean linked) {
    regions(1903L, 1903L);
    when(details.findPermitNumberForScale("55"))
        .thenReturn(linked ? Optional.of(PERMIT) : Optional.empty());
    var actor = authenticate("idir\\approver", EA_RSC, RO_RCB);
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();

    assertThatThrownBy(() -> controller.deleteScaleById("55", Long.toString(APPLICATION), actor))
        .isInstanceOf(AccessDeniedException.class);

    verify(details, never()).deleteScaleById(any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"application", "permit"})
  void eaDeleteRequiresBothCurrentRecordsInItsMutationRegion(String outsideRecord) {
    regions("application".equals(outsideRecord) ? 1903L : 1909L,
        "permit".equals(outsideRecord) ? 1903L : 1909L);
    var actor = authenticate("idir\\approver", EA_RSC);

    assertThatThrownBy(() -> controller.deleteScaleById("55", Long.toString(APPLICATION), actor))
        .isInstanceOf(AccessDeniedException.class);

    verify(details, never()).deleteScaleById(any(), any());
  }

  @Test
  void unscopedEaCannotDelete() {
    var actor = authenticate("idir\\approver", "LEXIS_EXEMPTION_APPROVER");

    assertThatThrownBy(() -> controller.deleteScaleById("55", Long.toString(APPLICATION), actor))
        .isInstanceOf(AccessDeniedException.class);

    verify(details, never()).deleteScaleById(any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"00011111", "00099999"})
  void normalSubmitterStillRequiresItsRecordedClient(String client) {
    var actor = authenticate("bceid\\owner", "LEXIS_PROVINCIAL_SUBMITTER",
        "LEXIS_PROVINCIAL_SUBMITTER_" + client);
    if ("00099999".equals(client)) {
      assertThatThrownBy(() -> controller.deleteScaleById("55", Long.toString(APPLICATION), actor))
          .isInstanceOf(AccessDeniedException.class);
      verify(details, never()).deleteScaleById(any(), any());
    } else {
      when(details.deleteScaleById("55", "bceid\\owner")).thenReturn(true);
      assertThat(controller.deleteScaleById("55", Long.toString(APPLICATION), actor)
          .getBody().success()).isTrue();
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageEdit", "packageDelete", "scaleAdd"})
  void eaReadOnlyGrantCannotLendItsRegionToOtherExistingItemMutations(String action) {
    regions(1903L, 1903L);
    var actor = authenticate("idir\\approver", EA_RSC, RO_RCB);
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();
    stubItemWrites();

    assertThatThrownBy(() -> mutateItem(action, actor))
        .isInstanceOf(AccessDeniedException.class);

    verifyNoItemWrite();
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageAdd", "packageEdit", "packageDelete", "scaleAdd"})
  void applicationApproverReadOnlyGrantCannotLendItsRegionToItemMutations(String action) {
    regions(1903L, 1903L);
    var actor = authenticate("idir\\approver", AA_RSC, RO_RCB);
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();
    stubItemWrites();

    assertThatThrownBy(() -> mutateItem(action, actor))
        .isInstanceOf(AccessDeniedException.class);

    verifyNoItemWrite();
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageEdit", "packageDelete", "scaleAdd"})
  void eligibleEaStillMutatesExistingMinisterialItemsInItsOwnRegion(String action) {
    var actor = authenticate("idir\\approver", EA_RSC, RO_RCB);
    stubItemWrites();

    assertThat(mutateItem(action, actor)).isEqualTo(HttpStatus.OK);
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageAdd", "packageEdit", "packageDelete", "scaleAdd"})
  void applicationApproverRetainsInRegionItemMutations(String action) {
    var actor = authenticate("idir\\approver", AA_RSC, RO_RCB);
    stubItemWrites();

    assertThat(mutateItem(action, actor)).isEqualTo(HttpStatus.OK);
  }

  @Test
  void eaCannotCreatePackageEvenOnEligibleMinisterialApplication() {
    var actor = authenticate("idir\\approver", EA_RSC);

    assertThat(mutateItem("packageAdd", actor)).isEqualTo(HttpStatus.FORBIDDEN);

    verifyNoItemWrite();
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageAdd", "packageEdit", "packageDelete", "scaleAdd"})
  void anotherRegionsAaCannotBorrowEaRegionForOrdinaryOicItems(String action) {
    when(details.getApplicationEditContext(APPLICATION))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.ApplicationEditContext(
            APPLICATION, "NEW", "P", "H", null, null,
            false, false, false, "N", false, false)));
    var actor = authenticate("idir\\approver", AA_RCB, EA_RSC);
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();

    assertThatThrownBy(() -> mutateItem(action, actor))
        .isInstanceOf(AccessDeniedException.class);

    verifyNoItemWrite();
  }

  @Test
  void linkedDeleteWriterBoundaryDoesNotTreatAnEaGrantAsOrdinaryOicAuthority() {
    when(details.getApplicationEditContext(APPLICATION))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.ApplicationEditContext(
            APPLICATION, "NEW", "P", "H", null, null,
            false, false, false, "N", false, false)));
    var actor = authenticate("idir\\approver", AA_RCB, EA_RSC);

    assertThatThrownBy(() -> access.requireApplicationScaleDeleteAccess(
        actor, APPLICATION, PERMIT)).isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void packageCreationWriterBoundaryCannotUseEaRegionWithAnotherRegionsAa() {
    var actor = authenticate("idir\\approver", AA_RCB, EA_RSC);

    assertThatThrownBy(() -> access.requireApplicationItemMutation(
        actor, APPLICATION, ProvincialAuthorizationService.ApplicationItemMutation.CREATE_PACKAGE))
        .isInstanceOf(AccessDeniedException.class);
  }

  @ParameterizedTest
  @ValueSource(strings = {"packageAdd", "packageEdit", "packageDelete", "scaleAdd"})
  void writerRegionIsRecheckedInsideCoordinatedItemMutation(String action) {
    var currentRegion = new AtomicLong(1909L);
    when(applicationService.findAccessByApplicationNumber(APPLICATION))
        .thenAnswer(invocation -> Optional.of(new ApplicationAccessContextDto(
            APPLICATION, "P", currentRegion.get(), "00011111", "00022222")));
    when(details.getPermitNumbersForApplicationMutation(APPLICATION))
        .thenAnswer(invocation -> {
          currentRegion.set(1903L);
          return List.of(PERMIT);
        });
    var actor = authenticate("idir\\approver", AA_RSC, RO_RCB);
    stubItemWrites();

    assertThatThrownBy(() -> mutateItem(action, actor))
        .isInstanceOf(AccessDeniedException.class);

    verifyNoItemWrite();
  }

  @Test
  void normalSubmitterRequiresCurrentPermitClientEvenWhenItOwnsTheApplication() {
    when(permitService.findAccessByPermitNumber(PERMIT))
        .thenReturn(Optional.of(new PermitAccessDto(
            PERMIT, "00088888", "00099999", 1909L)));
    var actor = authenticate("bceid\\owner", "LEXIS_PROVINCIAL_SUBMITTER",
        "LEXIS_PROVINCIAL_SUBMITTER_00011111");
    assertThat(access.canAccessApplication(actor, APPLICATION)).isTrue();

    assertThatThrownBy(() -> controller.deleteScaleById(
        "55", Long.toString(APPLICATION), actor)).isInstanceOf(AccessDeniedException.class);

    verify(details, never()).deleteScaleById(any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"00011111", "00099999"})
  void packageCreationRetainsRecordedSubmitterClientScope(String client) {
    var actor = authenticate("bceid\\owner", "LEXIS_PROVINCIAL_SUBMITTER",
        "LEXIS_PROVINCIAL_SUBMITTER_" + client);
    stubItemWrites();
    if ("00011111".equals(client)) {
      assertThat(mutateItem("packageAdd", actor)).isEqualTo(HttpStatus.OK);
    } else {
      assertThatThrownBy(() -> mutateItem("packageAdd", actor))
          .isInstanceOf(AccessDeniedException.class);
      verifyNoItemWrite();
    }
  }

  private HttpStatus mutateItem(String action, TestingAuthenticationToken actor) {
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", Long.toString(APPLICATION));
    parameters.add("packageNumber", "TESTPKG");
    return switch (action) {
      case "packageAdd" -> (HttpStatus) controller.addPackageToApplication(parameters, actor).getStatusCode();
      case "packageEdit" -> (HttpStatus) controller.updatePackage(parameters, actor).getStatusCode();
      case "packageDelete" -> (HttpStatus) controller.deletePackageById(
          "TESTPKG", Long.toString(APPLICATION), actor).getStatusCode();
      case "scaleAdd" -> (HttpStatus) controller.addScaleToPackage(parameters, actor).getStatusCode();
      default -> throw new IllegalArgumentException("Unknown item action: " + action);
    };
  }

  private void stubItemWrites() {
    var packageResult = new ApplicationDetailsRpcService.PackagePersistenceResult(
        true, "TESTPKG", "1.0", "1.0", "10.0", "A", List.of(), List.of());
    lenient().when(details.addPackage(any(), any())).thenReturn(packageResult);
    lenient().when(details.updatePackage(any(), any())).thenReturn(packageResult);
    lenient().when(details.deletePackageById(any(), any())).thenReturn(true);
    lenient().when(details.addScaleToPackage(any(), any()))
        .thenReturn(new ApplicationDetailsRpcService.ScalePersistenceResult(
            true, null, List.of(), List.of()));
  }

  private void verifyNoItemWrite() {
    verify(details, never()).addPackage(any(), any());
    verify(details, never()).updatePackage(any(), any());
    verify(details, never()).deletePackageById(any(), any());
    verify(details, never()).addScaleToPackage(any(), any());
  }

  private void regions(long applicationRegion, long permitRegion) {
    lenient().when(applicationService.findAccessByApplicationNumber(APPLICATION))
        .thenReturn(Optional.of(new ApplicationAccessContextDto(
            APPLICATION, "P", applicationRegion, "00011111", "00022222")));
    lenient().when(permitService.findAccessByPermitNumber(PERMIT))
        .thenReturn(Optional.of(new PermitAccessDto(
            PERMIT, "00022222", "00011111", permitRegion)));
  }

  private TestingAuthenticationToken authenticate(String principal, String... roles) {
    var authentication = new TestingAuthenticationToken(principal, "n/a", roles);
    SecurityContextHolder.getContext().setAuthentication(authentication);
    return authentication;
  }
}

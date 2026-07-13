package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
class ProvincialAuthorizationServiceTest {

  @Mock private LexisPrincipalService principalService;
  @Mock private ObjectProvider<LexisApplicationService> applicationServiceProvider;
  @Mock private ObjectProvider<ExemptionService> exemptionServiceProvider;
  @Mock private ObjectProvider<PermitService> permitServiceProvider;
  @Mock private ObjectProvider<PurchaseOfferService> offerServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private ExemptionService exemptionService;
  @Mock private PermitService permitService;
  @Mock private PurchaseOfferService offerService;

  private ProvincialAuthorizationService service;

  @BeforeEach
  void setUp() {
    service =
        new ProvincialAuthorizationService(
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"),
            principalService,
            applicationServiceProvider,
            exemptionServiceProvider,
            permitServiceProvider,
            offerServiceProvider);
  }

  @Test
  void scopedSubmitterCanOnlyAccessApplicationsOwnedOrRepresentedByItsClient() {
    Authentication authentication = submitter("00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", "00099999", 76L)));
    when(applicationService.findByApplicationNumber(2L))
        .thenReturn(Optional.of(application(2L, "00088888", "00099999", 76L)));

    assertThat(service.canAccessApplication(authentication, 1L)).isTrue();
    assertThat(service.canAccessApplication(authentication, 2L)).isFalse();
  }

  @Test
  void scopedSubmitterCannotAccessMatchingFederalApplicationThroughGenericAuthorization() {
    Authentication authentication = submitter("00012345");
    LexisApplicationDetailDto federal =
        application(1L, "00012345", "00099999", 76L, "F");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L)).thenReturn(Optional.of(federal));

    assertThat(service.canAccessApplication(authentication, federal)).isFalse();
    assertThat(service.canAccessApplication(authentication, 1L)).isFalse();
  }

  @Test
  void missingAndAmbiguousSubmitterScopesFailClosed() {
    Authentication missing =
        new TestingAuthenticationToken("user", "n/a", "LEXIS_PROVINCIAL_SUBMITTER");
    Authentication ambiguous =
        new TestingAuthenticationToken(
            "user",
            "n/a",
            "LEXIS_PROVINCIAL_SUBMITTER_00012345",
            "LEXIS_PROVINCIAL_SUBMITTER_00067890");

    assertThatThrownBy(() -> service.hasClientScope(missing))
        .isInstanceOf(AccessDeniedException.class);
    assertThatThrownBy(() -> service.hasClientScope(ambiguous))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void blanketOicIsVisibleToIndustryButDeniedToExemptionApprover() {
    ExemptionDetailDto blanket = blanketOic();
    Authentication exemptionApprover =
        new TestingAuthenticationToken(
            "approver", "n/a", "LEXIS_EXEMPTION_APPROVER");
    Authentication applicationApprover =
        new TestingAuthenticationToken(
            "reviewer", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication administrator =
        new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN");
    Authentication industryExemptionApprover =
        new TestingAuthenticationToken(
            "industry-approver",
            "n/a",
            "LEXIS_PROVINCIAL_SUBMITTER_00012345",
            "LEXIS_EXEMPTION_APPROVER");

    assertThat(service.canAccessExemption(submitter("00012345"), blanket)).isTrue();
    assertThat(service.canAccessExemption(exemptionApprover, blanket)).isFalse();
    assertThat(service.canAccessExemption(applicationApprover, blanket)).isTrue();
    assertThat(service.canAccessExemption(administrator, blanket)).isTrue();
    assertThat(service.canAccessExemption(industryExemptionApprover, blanket)).isTrue();

    assertThat(service.canViewBlanketOic(exemptionApprover)).isFalse();
    assertThat(service.canViewBlanketOic(applicationApprover)).isTrue();
    assertThat(service.canViewBlanketOic(administrator)).isTrue();
    assertThat(service.canViewBlanketOic(industryExemptionApprover)).isTrue();
  }

  @Test
  void scopedSubmittersCannotOpenNewExemptions() {
    ExemptionDetailDto exemption =
        new ExemptionDetailDto(
            "EX-NEW",
            "M",
            "Ministerial",
            "NEW",
            "New",
            "00012345",
            null,
            null,
            null,
            null,
            null,
            100,
            0,
            100,
            null,
            false,
            List.of(),
            List.of());

    assertThat(service.canAccessExemption(submitter("00012345"), exemption)).isFalse();
  }

  @Test
  void currentFamStaffRolesAreGlobalAcrossEveryOrganizationUnitSurface() {
    List<Authentication> staff =
        List.of(
            new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN"),
            new TestingAuthenticationToken(
                "application-approver", "n/a", "LEXIS_APPLICATION_APPROVER"),
            new TestingAuthenticationToken(
                "exemption-approver", "n/a", "LEXIS_EXEMPTION_APPROVER"),
            new TestingAuthenticationToken("read-only", "n/a", "LEXIS_READ_ONLY"));

    for (Authentication authentication : staff) {
      for (ProvincialAuthorizationService.OrgUnitSurface surface :
          ProvincialAuthorizationService.OrgUnitSurface.values()) {
        ProvincialAuthorizationService.OrgUnitConstraint constrained =
            service.constrainOrgUnits(authentication, List.of(12L, 76L), surface);

        assertThat(constrained.restricted()).isFalse();
        assertThat(constrained.denied()).isFalse();
        assertThat(constrained.orgUnitNumbers()).containsExactly(12L, 76L);
      }
    }

    verifyNoInteractions(principalService);
  }

  @Test
  void globalStaffWritesDoNotRequireIdentityOrganizationUnitClaims() {
    Authentication applicationApprover =
        new TestingAuthenticationToken(
            "application-approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication exemptionApprover =
        new TestingAuthenticationToken(
            "exemption-approver", "n/a", "LEXIS_EXEMPTION_APPROVER");
    Authentication noOrgApprover =
        new TestingAuthenticationToken(
            "no-org", "n/a", "LEXIS_APPLICATION_APPROVER");

    service.requireOrgUnits(
        applicationApprover,
        List.of(76L, 1826L),
        ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
    service.requireOrgUnits(
        exemptionApprover,
        List.of(76L, 1826L),
        ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
    service.requireOrgUnit(
        noOrgApprover,
        76L,
        ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);

    verifyNoInteractions(principalService);
  }

  @Test
  void administratorsAndScopedSubmittersRemainUnrestrictedByOrganizationUnitWrites() {
    Authentication administrator =
        new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN");
    Authentication scopedSubmitter = submitter("00012345");

    service.requireOrgUnits(
        administrator,
        List.of(76L, 1826L),
        ProvincialAuthorizationService.OrgUnitSurface.APPLICATION_WRITE);
    service.requireOrgUnits(
        scopedSubmitter,
        List.of(76L, 1826L),
        ProvincialAuthorizationService.OrgUnitSurface.EXEMPTION_WRITE);
  }

  @Test
  void globalStaffSearchWithoutRequestedRegionsRemainsUnfiltered() {
    Authentication readOnly =
        new TestingAuthenticationToken("readonly", "n/a", "LEXIS_READ_ONLY");

    ProvincialAuthorizationService.OrgUnitConstraint constrained =
        service.constrainOrgUnits(
            readOnly,
            List.of(),
            ProvincialAuthorizationService.OrgUnitSurface.OFFER_SEARCH);

    assertThat(constrained.restricted()).isFalse();
    assertThat(constrained.denied()).isFalse();
    assertThat(constrained.orgUnitNumbers()).isEmpty();
    verifyNoInteractions(principalService);
  }

  @Test
  void readOnlyPermitDetailAccessIsGlobal() {
    Authentication readOnly =
        new TestingAuthenticationToken("readonly", "n/a", "LEXIS_READ_ONLY");
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.findByPermitNumber(1L))
        .thenReturn(Optional.of(permit(1L, "00012345", 76L)));
    when(permitService.findByPermitNumber(2L))
        .thenReturn(Optional.of(permit(2L, "00012345", 12L)));
    when(permitService.findByPermitNumber(3L))
        .thenReturn(Optional.of(permit(3L, "00012345", null)));
    when(permitService.findByPermitNumber(4L)).thenReturn(Optional.empty());

    assertThat(service.canAccessPermit(readOnly, 1L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 2L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 3L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 4L)).isFalse();
  }

  @Test
  void readOnlyOfferDetailAccessIsGlobal() {
    Authentication readOnly =
        new TestingAuthenticationToken("readonly", "n/a", "LEXIS_READ_ONLY");
    when(offerServiceProvider.getIfAvailable()).thenReturn(offerService);
    when(offerService.findByOfferNumber(1L)).thenReturn(Optional.of(offer(1L, 101L, "00012345")));
    when(offerService.findByOfferNumber(2L)).thenReturn(Optional.of(offer(2L, 102L, "00012345")));
    when(offerService.findByOfferNumber(3L)).thenReturn(Optional.of(offer(3L, 103L, "00012345")));
    when(offerService.findByOfferNumber(4L)).thenReturn(Optional.empty());

    assertThat(service.canAccessOffer(readOnly, 1L)).isTrue();
    assertThat(service.canAccessOffer(readOnly, 2L)).isTrue();
    assertThat(service.canAccessOffer(readOnly, 3L)).isTrue();
    assertThat(service.canAccessOffer(readOnly, 4L)).isFalse();
  }

  @Test
  void forestClientSuffixScopeStillAuthorizesMatchingPermitAndOfferClients() {
    Authentication submitter = submitter("00012345");
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(offerServiceProvider.getIfAvailable()).thenReturn(offerService);
    when(permitService.findByPermitNumber(1L))
        .thenReturn(Optional.of(permit(1L, "00012345", 12L)));
    when(offerService.findByOfferNumber(2L))
        .thenReturn(Optional.of(offer(2L, 102L, "00012345")));

    assertThat(service.canAccessPermit(submitter, 1L)).isTrue();
    assertThat(service.canAccessOffer(submitter, 2L)).isTrue();
  }

  @Test
  void administratorAuthorityDominatesConcurrentSubmitterClientScope() {
    Authentication administrator =
        new TestingAuthenticationToken(
            "admin",
            "n/a",
            "LEXIS_PROVINCIAL_SUBMITTER_00012345",
            "lexis_admin");
    PermitDetailDto otherClientPermit = permit(1L, "00099999", 12L);
    PurchaseOfferDetailDto otherClientOffer = offer(2L, 102L, "00099999");

    assertThat(service.scopedForestClientNumber(administrator)).isNull();
    assertThat(service.hasClientScope(administrator)).isFalse();
    assertThat(service.canCreateForClient(administrator, "00099999", null)).isTrue();
    assertThat(service.canAccessPermit(administrator, otherClientPermit)).isTrue();
    assertThat(service.canAccessOffer(administrator, otherClientOffer)).isTrue();
  }

  @Test
  void scopedSubmitterCanAccessPermitAsOwnerWhenPermitHasDifferentAgent() {
    PermitDetailDto permit = permit(1L, "00012345", "00099999", 12L);

    assertThat(service.canAccessPermit(submitter("00012345"), permit)).isTrue();
  }

  @Test
  void scopedSubmitterCanAccessPermitThroughAnyAuthoritativeLinkedApplication() {
    Authentication submitter = submitter("00012345");
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(permitService.findLinkedApplicationNumbers(1L)).thenReturn(List.of(101L, 102L));
    when(applicationService.findByApplicationNumber(101L))
        .thenReturn(Optional.of(application(101L, "00099999", null, 76L)));
    when(applicationService.findByApplicationNumber(102L))
        .thenReturn(Optional.of(application(102L, "00088888", "00012345", 76L)));

    assertThat(service.canAccessPermit(submitter, permit)).isTrue();

    verify(permitService).findLinkedApplicationNumbers(1L);
  }

  @Test
  void scopedSubmitterCanAccessPermitThroughLinkedApplicationOwner() {
    Authentication submitter = submitter("00012345");
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(permitService.findLinkedApplicationNumbers(1L)).thenReturn(List.of(101L));
    when(applicationService.findByApplicationNumber(101L))
        .thenReturn(Optional.of(application(101L, "00012345", "00077777", 76L)));

    assertThat(service.canAccessPermit(submitter, permit)).isTrue();
  }

  @Test
  void scopedPermitAccessShouldIgnoreNonAuthoritativeDetailApplicationNumber() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(permitService.findLinkedApplicationNumbers(1L)).thenReturn(List.of());

    assertThat(service.canAccessPermit(submitter("00012345"), permit)).isFalse();
  }

  @Test
  void scopedPermitAccessShouldRejectMatchingFederalLinkedApplication() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(permitService.findLinkedApplicationNumbers(1L)).thenReturn(List.of(101L));
    when(applicationService.findByApplicationNumber(101L))
        .thenReturn(Optional.of(application(101L, "00012345", null, 76L, "F")));

    assertThat(service.canAccessPermit(submitter("00012345"), permit)).isFalse();
  }

  @Test
  void scopedPermitAccessShouldPropagateAuthoritativeLinkLookupFailure() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(permitService.findLinkedApplicationNumbers(1L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () -> service.canAccessPermit(submitter("00012345"), permit))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void applicationApproverCanReviewApplicationsWithoutOrganizationUnitClaims() {
    Authentication approver =
        new TestingAuthenticationToken(
            "approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));

    assertThat(service.canReviewApplication(approver, 1L)).isTrue();
    verifyNoInteractions(principalService);
  }

  @Test
  void federalReadOnlyDetailAccessIsGlobal() {
    Authentication readOnly =
        new TestingAuthenticationToken("readonly", "n/a", "LEXIS_READ_ONLY");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L, "F")));
    when(applicationService.findByApplicationNumber(2L))
        .thenReturn(Optional.of(application(2L, "00012345", null, 12L, "F")));

    assertThat(service.canAccessFederalApplication(readOnly, 1L)).isTrue();
    assertThat(service.canAccessFederalApplication(readOnly, 2L)).isTrue();
  }

  @Test
  void federalApplicationApproversAndAdministratorsRetainGlobalDetailAccess() {
    Authentication approver =
        new TestingAuthenticationToken(
            "approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication administrator =
        new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN");

    assertThat(service.canAccessFederalApplication(approver, 999L)).isTrue();
    assertThat(service.canAccessFederalApplication(administrator, 999L)).isTrue();
  }

  @Test
  void genericFederalAccessIsGlobalForAuthorizedStaffRoles() {
    Authentication readOnly =
        new TestingAuthenticationToken("readonly", "n/a", "LEXIS_READ_ONLY");
    Authentication approver =
        new TestingAuthenticationToken("approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication administrator =
        new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN");
    LexisApplicationDetailDto authorizedFederal =
        application(1L, "00012345", null, 76L, "F");
    LexisApplicationDetailDto otherFederal =
        application(2L, "00012345", null, 12L, "F");

    assertThat(service.canAccessApplication(readOnly, authorizedFederal)).isTrue();
    assertThat(service.canAccessApplication(readOnly, otherFederal)).isTrue();
    assertThat(service.canAccessApplication(approver, otherFederal)).isTrue();
    assertThat(service.canAccessApplication(administrator, otherFederal)).isTrue();
  }

  @Test
  void unknownApplicationJurisdictionFailsClosedForNonAdministrators() {
    LexisApplicationDetailDto unknown =
        application(1L, "00012345", null, 76L, null);
    Authentication approver =
        new TestingAuthenticationToken("approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication administrator =
        new TestingAuthenticationToken("admin", "n/a", "LEXIS_ADMIN");

    assertThat(service.canAccessApplication(submitter("00012345"), unknown)).isFalse();
    assertThat(service.canAccessApplication(approver, unknown)).isFalse();
    assertThat(service.canAccessApplication(administrator, unknown)).isTrue();
  }

  private Authentication submitter(String clientNumber) {
    return new TestingAuthenticationToken(
        "industry", "n/a", "LEXIS_PROVINCIAL_SUBMITTER_" + clientNumber);
  }

  private LexisApplicationDetailDto application(
      long applicationNumber, String owner, String agent, Long orgUnit) {
    return application(applicationNumber, owner, agent, orgUnit, "P");
  }

  private LexisApplicationDetailDto application(
      long applicationNumber, String owner, String agent, Long orgUnit, String jurisdiction) {
    return new LexisApplicationDetailDto(
        applicationNumber,
        null,
        "NEW",
        "New",
        owner,
        agent,
        orgUnit,
        "Region",
        "LOG",
        null,
        null,
        null,
        null,
        null,
        null,
        1,
        1,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(),
        List.of(),
        List.of(),
        jurisdiction);
  }

  private PermitDetailDto permit(
      Long permitNumber, String ownerClientNumber, Long orgUnitNumber) {
    return permit(permitNumber, ownerClientNumber, null, orgUnitNumber);
  }

  private PermitDetailDto permit(
      Long permitNumber,
      String ownerClientNumber,
      String agentClientNumber,
      Long orgUnitNumber) {
    return new PermitDetailDto(
        permitNumber,
        101L,
        "PKG-1",
        "EX-1",
        "ACT",
        "Active",
        agentClientNumber,
        null,
        ownerClientNumber,
        "01",
        null,
        "US",
        "TR",
        null,
        "BC",
        null,
        null,
        null,
        null,
        null,
        1.0,
        1L,
        null,
        null,
        null,
        null,
        null,
        orgUnitNumber,
        "Region");
  }

  private PurchaseOfferDetailDto offer(
      Long offerNumber, Long applicationNumber, String offeringClientNumber) {
    return new PurchaseOfferDetailDto(
        offerNumber,
        applicationNumber,
        "PKG-1",
        null,
        null,
        null,
        null,
        1.0,
        null,
        null,
        null,
        "N",
        "Y",
        "N",
        null,
        null,
        "P",
        null,
        offeringClientNumber,
        null,
        null,
        null,
        null,
        1.0,
        "Region");
  }

  private ExemptionDetailDto blanketOic() {
    return new ExemptionDetailDto(
        "B-1",
        "B",
        "Blanket OIC",
        "APP",
        "Approved",
        null,
        null,
        null,
        null,
        null,
        null,
        100,
        10,
        90,
        null,
        true,
        List.of(),
        List.of());
  }
}

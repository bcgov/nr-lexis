package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
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
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<ExemptionService> exemptionServiceProvider;
  @Mock private ObjectProvider<PermitService> permitServiceProvider;
  @Mock private ObjectProvider<PurchaseOfferService> offerServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
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
            applicationDetailsServiceProvider,
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
  void preloadedApplicationContextShouldAuthorizeWithoutApplicationRepositoryLookup() {
    Authentication authentication = submitter("00012345");
    ApplicationAccessContextDto owned =
        new ApplicationAccessContextDto(1L, "P", 76L, "00012345", "00099999");
    ApplicationAccessContextDto unrelated =
        new ApplicationAccessContextDto(2L, "P", 76L, "00088888", "00099999");

    assertThat(service.canAccessApplication(authentication, owned)).isTrue();
    assertThat(service.canAccessApplication(authentication, unrelated)).isFalse();
    verifyNoInteractions(applicationServiceProvider);
  }

  @Test
  void accessibleApplicationAllowsClientLookupForEitherRecordedPartyOnly() {
    Authentication authentication = submitter("00001074");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00002176", "00001074", 76L)));

    assertThat(
            service.canAccessApplicationClientLookup(authentication, 1L, "00002176"))
        .isTrue();
    assertThat(
            service.canAccessApplicationClientLookup(authentication, 1L, "00001074"))
        .isTrue();
    assertThat(
            service.canAccessApplicationClientLookup(authentication, 1L, "00099999"))
        .isFalse();
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
  void scopedSubmitterAttachmentWritesRequireDirectApplicationClientOwnership() {
    Authentication authentication = submitter("00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));
    when(applicationService.findByApplicationNumber(2L))
        .thenReturn(Optional.of(application(2L, "00099999", null, 76L)));
    when(applicationService.findByApplicationNumber(3L))
        .thenReturn(Optional.of(application(3L, "00012345", null, 76L, "F")));

    assertThatCode(() -> service.requireApplicationAttachmentMutation(authentication, 1L))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> service.requireApplicationAttachmentMutation(authentication, 2L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
    assertThatThrownBy(() -> service.requireApplicationAttachmentMutation(authentication, 3L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
  }

  @Test
  void scopedSubmitterCannotPersistApplicationAttachmentAfterPermitCompletion() {
    Authentication authentication = submitter("00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));
    when(applicationDetailsService.getApplicationEditContext(1L))
        .thenReturn(Optional.of(applicationEditContext(1L, true)));

    assertThatThrownBy(
            () -> service.requireApplicationAttachmentPersistence(authentication, 1L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
    assertThatCode(() -> service.requireApplicationAttachmentMutation(authentication, 1L))
        .doesNotThrowAnyException();
  }

  @Test
  void scopedSubmitterCanPersistApplicationAttachmentBeforePermitCompletion() {
    Authentication authentication = submitter("00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));
    when(applicationDetailsService.getApplicationEditContext(1L))
        .thenReturn(Optional.of(applicationEditContext(1L, false)));

    assertThatCode(
            () -> service.requireApplicationAttachmentPersistence(authentication, 1L))
        .doesNotThrowAnyException();
  }

  @Test
  void scopedSubmitterApplicationAttachmentPersistenceFailsClosedWithoutEditContext() {
    Authentication authentication = submitter("00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));
    when(applicationDetailsService.getApplicationEditContext(1L)).thenReturn(Optional.empty());

    assertThatThrownBy(
            () -> service.requireApplicationAttachmentPersistence(authentication, 1L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
  }

  @Test
  void scopedSubmitterExemptionWritesFollowLegacyLinkedApplicationOwnershipAndDenyBlanketOic() {
    Authentication authentication = submitter("00012345");
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(exemptionService.findByExemptionNumber("E-1"))
        .thenReturn(Optional.of(exemption("E-1", "00012345", null, false)));
    when(exemptionService.findByExemptionNumber("E-2"))
        .thenReturn(Optional.of(exemption("E-2", "00099999", null, false)));
    when(exemptionService.findByExemptionNumber("E-3"))
        .thenReturn(Optional.of(exemption("E-3", "00099999", null, false)));
    when(exemptionService.findByExemptionNumber("E-4"))
        .thenReturn(Optional.of(exemption("E-4", "00099999", null, false)));
    when(exemptionService.findByExemptionNumber("B-1"))
        .thenReturn(Optional.of(exemption("B-1", "00012345", null, true)));
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-2", "00012345"))
        .thenReturn(false);
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-3", "00012345"))
        .thenReturn(true);
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-4", "00012345"))
        .thenReturn(false);

    assertThatCode(() -> service.requireExemptionAttachmentMutation(authentication, "E-1"))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> service.requireExemptionAttachmentMutation(authentication, "E-2"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
    assertThatCode(() -> service.requireExemptionAttachmentMutation(authentication, "E-3"))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> service.requireExemptionAttachmentMutation(authentication, "E-4"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
    assertThatThrownBy(() -> service.requireExemptionAttachmentMutation(authentication, "B-1"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
  }

  @Test
  void scopedSubmitterCanAccessExemptionThroughAnyAuthoritativeLinkedApplication() {
    Authentication authentication = submitter("00012345");
    ExemptionDetailDto detail = exemption("E-3", "00099999", null, false);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-3", "00012345"))
        .thenReturn(true);

    assertThat(service.canAccessExemption(authentication, detail)).isTrue();
  }

  @Test
  void exemptionNumberAccessShouldUseLightweightProjectionAndSingleClientPredicate() {
    Authentication authentication = submitter("00012345");
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(exemptionService.findAccessByExemptionNumber("E-3"))
        .thenReturn(
            Optional.of(
                new ExemptionAccessDto("E-3", "M", "ACT", false)));
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-3", "00012345"))
        .thenReturn(true);

    assertThat(service.canAccessExemption(authentication, " E-3 ")).isTrue();

    verify(exemptionService).findAccessByExemptionNumber("E-3");
    verify(exemptionService)
        .hasLinkedProvincialApplicationForClient("E-3", "00012345");
    verify(exemptionService, never()).findByExemptionNumber("E-3");
  }

  @Test
  void blanketOicNumberAccessShouldNotLoadApplications() {
    Authentication authentication = submitter("00012345");
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(exemptionService.findAccessByExemptionNumber("BO-001"))
        .thenReturn(
            Optional.of(
                new ExemptionAccessDto("BO-001", "B", "ACT", true)));

    assertThat(service.canAccessExemption(authentication, "BO-001")).isTrue();

    verify(exemptionService, never())
        .hasLinkedProvincialApplicationForClient(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString());
    verify(exemptionService, never()).findByExemptionNumber("BO-001");
  }

  @Test
  void scopedExemptionAccessPropagatesAuthoritativeRelationshipLookupFailure() {
    Authentication authentication = submitter("00012345");
    ExemptionDetailDto detail = exemption("E-3", "00099999", null, false);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(exemptionService.hasLinkedProvincialApplicationForClient("E-3", "00012345"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> service.canAccessExemption(authentication, detail))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void scopedSubmitterPermitAttachmentWritesFollowLegacyDirectOrLinkedApplicationOwnership() {
    Authentication authentication = submitter("00012345");
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.findByPermitNumber(1L))
        .thenReturn(Optional.of(permit(1L, "00012345", "00099999", 76L)));
    when(permitService.findByPermitNumber(2L))
        .thenReturn(Optional.of(permit(2L, "00099999", "00088888", 76L)));
    when(permitService.findByPermitNumber(3L))
        .thenReturn(Optional.of(permit(3L, "00099999", "00088888", 76L)));
    when(permitService.hasLinkedProvincialApplicationForClient(2L, "00012345"))
        .thenReturn(true);
    when(permitService.hasLinkedProvincialApplicationForClient(3L, "00012345"))
        .thenReturn(false);

    assertThatCode(() -> service.requirePermitAttachmentMutation(authentication, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requirePermitAttachmentMutation(authentication, 2L))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> service.requirePermitAttachmentMutation(authentication, 3L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("attachment-write scope");
  }

  @Test
  void staffAttachmentWritersRetainGlobalAttachmentWriteScope() {
    Authentication approver =
        new TestingAuthenticationToken("approver", "n/a", "LEXIS_APPLICATION_APPROVER");
    Authentication administrator =
        new TestingAuthenticationToken("administrator", "n/a", "LEXIS_ADMIN");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00099999", null, 76L)));
    when(exemptionService.findByExemptionNumber("E-1"))
        .thenReturn(Optional.of(exemption("E-1", "00099999", null, false)));
    when(permitService.findByPermitNumber(2L))
        .thenReturn(Optional.of(permit(2L, "00099999", "00088888", 76L)));

    assertThatCode(() -> service.requireApplicationAttachmentMutation(approver, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireApplicationAttachmentPersistence(approver, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireExemptionAttachmentMutation(approver, "E-1"))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requirePermitAttachmentMutation(approver, 2L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireApplicationAttachmentMutation(administrator, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireApplicationAttachmentPersistence(administrator, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireExemptionAttachmentMutation(administrator, "E-1"))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requirePermitAttachmentMutation(administrator, 2L))
        .doesNotThrowAnyException();
  }

  @Test
  void applicationApproverAttachmentScopeDominatesConcurrentSubmitterScope() {
    Authentication mixedRole =
        new TestingAuthenticationToken(
            "approver",
            "n/a",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER_00012345");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00099999", null, 76L, "F")));
    when(exemptionService.findByExemptionNumber("E-1"))
        .thenReturn(Optional.of(exemption("E-1", "00099999", null, true)));
    when(permitService.findByPermitNumber(2L))
        .thenReturn(Optional.of(permit(2L, "00099999", null, 76L)));

    assertThatCode(() -> service.requireApplicationAttachmentMutation(mixedRole, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireApplicationAttachmentPersistence(mixedRole, 1L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireExemptionAttachmentMutation(mixedRole, "E-1"))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requirePermitAttachmentMutation(mixedRole, 2L))
        .doesNotThrowAnyException();
  }

  @Test
  void readOnlyAndExemptionApproverRolesCannotMutateAttachments() {
    Authentication readOnly =
        new TestingAuthenticationToken("read-only", "n/a", "LEXIS_READ_ONLY");
    Authentication exemptionApprover =
        new TestingAuthenticationToken(
            "exemption-approver", "n/a", "LEXIS_EXEMPTION_APPROVER");
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1L))
        .thenReturn(Optional.of(application(1L, "00012345", null, 76L)));
    when(exemptionService.findByExemptionNumber("E-1"))
        .thenReturn(Optional.of(exemption("E-1", "00012345", null, false)));
    when(permitService.findByPermitNumber(2L))
        .thenReturn(Optional.of(permit(2L, "00012345", null, 76L)));

    assertThatThrownBy(() -> service.requireApplicationAttachmentMutation(readOnly, 1L))
        .isInstanceOf(AccessDeniedException.class);
    assertThatThrownBy(
            () -> service.requireExemptionAttachmentMutation(exemptionApprover, "E-1"))
        .isInstanceOf(AccessDeniedException.class);
    assertThatThrownBy(() -> service.requirePermitAttachmentMutation(readOnly, 2L))
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
    when(permitService.findAccessByPermitNumber(1L))
        .thenReturn(Optional.of(permitAccess(1L, "00012345", 76L)));
    when(permitService.findAccessByPermitNumber(2L))
        .thenReturn(Optional.of(permitAccess(2L, "00012345", 12L)));
    when(permitService.findAccessByPermitNumber(3L))
        .thenReturn(Optional.of(permitAccess(3L, "00012345", null)));
    when(permitService.findAccessByPermitNumber(4L)).thenReturn(Optional.empty());

    assertThat(service.canAccessPermit(readOnly, 1L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 2L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 3L)).isTrue();
    assertThat(service.canAccessPermit(readOnly, 4L)).isFalse();
  }

  @Test
  void accessiblePermitAllowsClientLookupForEitherRecordedPartyOnly() {
    Authentication authentication = submitter("00001074");
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.findAccessByPermitNumber(1L))
        .thenReturn(
            Optional.of(new PermitAccessDto(1L, "00001074", "00002176", 76L)));

    assertThat(service.canAccessPermitClientLookup(authentication, 1L, "00002176"))
        .isTrue();
    assertThat(service.canAccessPermitClientLookup(authentication, 1L, "00001074"))
        .isTrue();
    assertThat(service.canAccessPermitClientLookup(authentication, 1L, "00099999"))
        .isFalse();
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
    when(permitService.findAccessByPermitNumber(1L))
        .thenReturn(Optional.of(permitAccess(1L, "00012345", 12L)));
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
  void scopedBlanketOicPermitAccessShouldUseCursorOwnerAndAgentOnly() {
    Authentication submitter = submitter("00012345");

    assertThat(
            service.canAccessExemptionPermit(
                submitter,
                permitAccess(1L, "00012345", 76L),
                true))
        .isTrue();
    assertThat(
            service.canAccessExemptionPermit(
                submitter,
                permitAccess(2L, "00099999", 76L),
                true))
        .isFalse();

    verifyNoInteractions(permitServiceProvider);
  }

  @Test
  void scopedSubmitterCanAccessPermitThroughAnyAuthoritativeLinkedApplication() {
    Authentication submitter = submitter("00012345");
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.hasLinkedProvincialApplicationForClient(1L, "00012345"))
        .thenReturn(true);

    assertThat(service.canAccessPermit(submitter, permit)).isTrue();

    verify(permitService).hasLinkedProvincialApplicationForClient(1L, "00012345");
  }

  @Test
  void scopedSubmitterCanAccessPermitThroughLinkedApplicationOwner() {
    Authentication submitter = submitter("00012345");
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.hasLinkedProvincialApplicationForClient(1L, "00012345"))
        .thenReturn(true);

    assertThat(service.canAccessPermit(submitter, permit)).isTrue();
  }

  @Test
  void scopedPermitAccessShouldIgnoreNonAuthoritativeDetailApplicationNumber() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.hasLinkedProvincialApplicationForClient(1L, "00012345"))
        .thenReturn(false);

    assertThat(service.canAccessPermit(submitter("00012345"), permit)).isFalse();
  }

  @Test
  void scopedPermitAccessShouldRejectMatchingFederalLinkedApplication() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.hasLinkedProvincialApplicationForClient(1L, "00012345"))
        .thenReturn(false);

    assertThat(service.canAccessPermit(submitter("00012345"), permit)).isFalse();
  }

  @Test
  void scopedPermitAccessShouldPropagateAuthoritativeLinkLookupFailure() {
    PermitDetailDto permit = permit(1L, "00099999", "00088888", 12L);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(permitService.hasLinkedProvincialApplicationForClient(1L, "00012345"))
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

  private ApplicationDetailsRpcService.ApplicationEditContext applicationEditContext(
      Long applicationNumber, boolean hasCompletePermit) {
    return new ApplicationDetailsRpcService.ApplicationEditContext(
        applicationNumber,
        "NEW",
        "P",
        "H",
        1L,
        null,
        false,
        false,
        hasCompletePermit,
        null,
        false);
  }

  private PermitDetailDto permit(
      Long permitNumber, String ownerClientNumber, Long orgUnitNumber) {
    return permit(permitNumber, ownerClientNumber, null, orgUnitNumber);
  }

  private PermitAccessDto permitAccess(
      Long permitNumber, String ownerClientNumber, Long orgUnitNumber) {
    return new PermitAccessDto(permitNumber, null, ownerClientNumber, orgUnitNumber);
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

  private ExemptionDetailDto exemption(
      String exemptionNumber, String owner, String agent, boolean blanketOic) {
    return new ExemptionDetailDto(
        exemptionNumber,
        blanketOic ? "B" : "M",
        blanketOic ? "Blanket OIC" : "Ministerial",
        "ACT",
        "Active",
        owner,
        agent,
        null,
        null,
        null,
        null,
        100,
        10,
        90,
        null,
        blanketOic,
        List.of(),
        List.of());
  }
}

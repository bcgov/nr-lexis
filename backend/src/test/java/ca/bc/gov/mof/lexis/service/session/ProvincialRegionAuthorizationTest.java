package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.security.LexisRequestActions;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** A staff role with no region is province-wide; granted for regions, it reaches only those. */
@ExtendWith(MockitoExtension.class)
class ProvincialRegionAuthorizationTest {

  private static final long CARIBOO = 1903L;
  private static final long KOOTENAY_BOUNDARY = 1904L;
  private static final long SKEENA = 1908L;
  private static final long LEGACY_SOUTHERN_INTERIOR = 1834L;
  private static final String APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String APPROVER_CARIBOO = "LEXIS_APPLICATION_APPROVER_REGION_REGION-CARIBOO";
  private static final String APPROVER_KOOTENAY =
      "LEXIS_APPLICATION_APPROVER_REGION_REGION-KOOTENAY_BOUNDARY";
  private static final String READ_ONLY = "LEXIS_READ_ONLY";
  private static final String READ_ONLY_SKEENA = "LEXIS_READ_ONLY_REGION_REGION-SKEENA";
  private static final String EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String EXEMPTION_APPROVER_CARIBOO =
      "LEXIS_EXEMPTION_APPROVER_REGION_REGION-CARIBOO";
  private static final String EXEMPTION_APPROVER_SKEENA =
      "LEXIS_EXEMPTION_APPROVER_REGION_REGION-SKEENA";

  @Mock private ObjectProvider<LexisApplicationService> applicationServiceProvider;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<ExemptionService> exemptionServiceProvider;
  @Mock private ObjectProvider<PermitService> permitServiceProvider;
  @Mock private ObjectProvider<PurchaseOfferService> offerServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private PermitService permitService;
  @Mock private ExemptionService exemptionService;

  private final LexisSessionService sessionService =
      new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final LexisAuthorizationService authorizationService =
      configuredAuthorizationService(sessionService);
  private ProvincialAuthorizationService service;

  /** The deployed role-to-action configuration, so surfaces are tested against real actions. */
  static LexisAuthorizationService configuredAuthorizationService(
      LexisSessionService sessionService) {
    YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("application.yml"));
    LexisAuthorizationProperties properties =
        new Binder(new MapConfigurationPropertySource(yaml.getObject()))
            .bind("lexis.authz", LexisAuthorizationProperties.class)
            .get();
    return new LexisAuthorizationService(
        properties, new LexisFeatureProperties(), sessionService);
  }

  @BeforeEach
  void setUp() {
    lenient().when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    lenient().when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    lenient().when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    service =
        new ProvincialAuthorizationService(
            sessionService,
            authorizationService,
            applicationServiceProvider,
            applicationDetailsServiceProvider,
            exemptionServiceProvider,
            permitServiceProvider,
            offerServiceProvider);
  }

  @AfterEach
  void clearRequest() {
    RequestContextHolder.resetRequestAttributes();
  }

  @Test
  void roleWithoutRegionIsProvinceWideAndRegionalRoleReachesOnlyItsRegions() {
    OrgUnitConstraint provinceWide =
        service.constrainOrgUnits(staff(APPROVER), List.of(), OrgUnitSurface.APPLICATION_SEARCH);
    assertThat(provinceWide.restricted()).isFalse();

    Authentication oneRegion = staff(APPROVER_CARIBOO);
    assertThat(
            service.constrainOrgUnits(oneRegion, List.of(), OrgUnitSurface.APPLICATION_SEARCH)
                .orgUnitNumbers())
        .containsExactly(CARIBOO);
    assertThat(
            service.constrainOrgUnits(
                    oneRegion, List.of(CARIBOO, SKEENA), OrgUnitSurface.APPLICATION_SEARCH)
                .orgUnitNumbers())
        .containsExactly(CARIBOO);
    assertThat(
            service.constrainOrgUnits(oneRegion, List.of(SKEENA), OrgUnitSurface.APPLICATION_SEARCH)
                .denied())
        .isTrue();

    Authentication manyRegions = staff(APPROVER_CARIBOO, APPROVER_KOOTENAY);
    assertThat(
            service.constrainOrgUnits(manyRegions, List.of(), OrgUnitSurface.APPLICATION_REVIEW)
                .orgUnitNumbers())
        .containsExactly(CARIBOO, KOOTENAY_BOUNDARY);
  }

  @Test
  void regionalGrantActivatesItsRoleForRoutesAndWelcome() {
    List<String> authorities = sessionService.parseGrantedAuthorities(List.of(APPROVER_CARIBOO));

    assertThat(authorizationService.hasKnownRole(authorities)).isTrue();
    assertThat(authorizationService.canPerformAction(authorities, "createApplication")).isTrue();
    assertThat(sessionService.resolveWelcomeRoute("IDIR\\staff", authorities).roles())
        .containsExactly(APPROVER);
  }

  @Test
  void capabilityRegionsMatchThePerActionRegionResolver() {
    for (List<String> authorities :
        List.of(
            List.of(APPROVER_CARIBOO),
            List.of(APPROVER_CARIBOO, APPROVER_KOOTENAY),
            List.of(READ_ONLY, APPROVER_CARIBOO),
            List.of(APPROVER, READ_ONLY_SKEENA),
            List.of(EXEMPTION_APPROVER_CARIBOO, READ_ONLY_SKEENA),
            List.of("LEXIS_ADMIN", READ_ONLY_SKEENA))) {
      List<String> granted =
          authorizationService.resolveGrantedActions(
              sessionService.parseGrantedAuthorities(authorities));
      Map<String, List<Long>> expected = new java.util.LinkedHashMap<>();
      for (String action : granted) {
        OrgUnitConstraint regions =
            authorizationService.resolveStaffRegionConstraint(authorities, action);
        if (regions.restricted()) {
          expected.put(action, regions.orgUnitNumbers());
        }
      }
      assertThat(authorizationService.resolveActionRegions(authorities, granted))
          .as("%s", authorities)
          .containsExactlyEntriesOf(expected);
    }
  }

  @Test
  void recordsOutsideTheGrantedRegionsOrWithoutARegionAreDenied() {
    Authentication approver = staff(APPROVER_CARIBOO);

    assertThat(service.canAccessApplication(approver, provincial(CARIBOO))).isTrue();
    assertThat(service.canAccessApplication(approver, provincial(SKEENA))).isFalse();
    assertThat(service.canAccessApplication(approver, provincial(null))).isFalse();
    // Records still tagged with a pre-2010 forest region are outside every FAM region.
    assertThat(service.canAccessApplication(approver, provincial(LEGACY_SOUTHERN_INTERIOR)))
        .isFalse();
    assertThat(service.canAccessApplication(staff(APPROVER), provincial(null))).isTrue();
  }

  @Test
  void provinceWideReadWithRegionalApprovalWritesOnlyInsideTheApprovalRegion() {
    Authentication mixed = staff(READ_ONLY, APPROVER_CARIBOO);
    when(permitService.findAccessByPermitNumber(10L))
        .thenReturn(Optional.of(new PermitAccessDto(10L, null, null, SKEENA)));
    when(permitService.findAccessByPermitNumber(11L))
        .thenReturn(Optional.of(new PermitAccessDto(11L, null, null, CARIBOO)));

    requestAuthorizedFor("/permitDetails");
    assertThat(service.canAccessPermit(mixed, 10L)).isTrue();

    requestAuthorizedFor("savePermit");
    assertThat(service.canAccessPermit(mixed, 10L)).isFalse();
    assertThat(service.canAccessPermit(mixed, 11L)).isTrue();
  }

  @Test
  void newOrReregionedPermitsMustLandInAGrantedRegion() {
    assertThatThrownBy(
            () ->
                service.requireOrgUnits(
                    staff(APPROVER_CARIBOO), List.of(SKEENA), OrgUnitSurface.PERMIT_WRITE))
        .isInstanceOf(AccessDeniedException.class);
    assertThatCode(
            () ->
                service.requireOrgUnits(
                    staff(APPROVER_CARIBOO), List.of(CARIBOO), OrgUnitSurface.PERMIT_WRITE))
        .doesNotThrowAnyException();
    // Province-wide Read Only cannot make a Cariboo approver's permit writes reach Skeena.
    assertThatThrownBy(
            () ->
                service.requireOrgUnits(
                    staff(READ_ONLY, APPROVER_CARIBOO), List.of(SKEENA), OrgUnitSurface.PERMIT_WRITE))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void regionalExemptionApprovalNeedsEveryRegionTheExemptionCovers() {
    when(exemptionService.findOrgUnitNumbers("EX-1")).thenReturn(List.of(CARIBOO, SKEENA));
    when(exemptionService.findOrgUnitNumbers("EX-2")).thenReturn(List.of(CARIBOO));

    assertThatThrownBy(() -> service.requireExemptionWrite(staff(EXEMPTION_APPROVER_CARIBOO), "EX-1"))
        .isInstanceOf(AccessDeniedException.class);
    assertThatCode(() -> service.requireExemptionWrite(staff(EXEMPTION_APPROVER_CARIBOO), "EX-2"))
        .doesNotThrowAnyException();
    assertThatCode(
            () ->
                service.requireExemptionWrite(
                    staff(EXEMPTION_APPROVER_CARIBOO, EXEMPTION_APPROVER_SKEENA), "EX-1"))
        .doesNotThrowAnyException();
    // Regional Read Only can read the exemption but holds no exemption write action anywhere.
    assertThatThrownBy(() -> service.requireExemptionWrite(staff(READ_ONLY_SKEENA), "EX-2"))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void exemptionLinkDocumentAndEmailRoutesAlsoNeedEveryRegion() {
    when(exemptionService.findOrgUnitNumbers("EX-1")).thenReturn(List.of(CARIBOO, SKEENA));
    when(exemptionService.findOrgUnitNumbers("EX-2")).thenReturn(List.of(CARIBOO));

    // Link/unlink record saveExemption and document removal records /fileExemptionUpload.
    for (String action : List.of("saveExemption", "/fileExemptionUpload")) {
      requestAuthorizedFor(action);
      assertThatThrownBy(() -> service.requireExemptionWrite(staff(APPROVER_CARIBOO), "EX-1"))
          .isInstanceOf(AccessDeniedException.class);
      assertThatCode(() -> service.requireExemptionWrite(staff(APPROVER_CARIBOO), "EX-2"))
          .doesNotThrowAnyException();
    }
    // Approval emails record approveExemption.
    requestAuthorizedFor("approveExemption");
    assertThatThrownBy(
            () -> service.requireExemptionWrite(staff(EXEMPTION_APPROVER_CARIBOO), "EX-1"))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void linkingStaysInTheApproverRegionsDespiteProvinceWideExemptionApproval() {
    Authentication mixed = staff(EXEMPTION_APPROVER, APPROVER_CARIBOO);
    when(exemptionService.findOrgUnitNumbers("EX-1")).thenReturn(List.of(CARIBOO));
    when(exemptionService.findOrgUnitNumbers("EX-2")).thenReturn(List.of(CARIBOO, SKEENA));
    when(applicationService.findAccessByApplicationNumber(20L))
        .thenReturn(Optional.of(new ApplicationAccessContextDto(20L, "P", SKEENA, null, null)));
    when(applicationService.findAccessByApplicationNumber(21L))
        .thenReturn(Optional.of(new ApplicationAccessContextDto(21L, "P", CARIBOO, null, null)));

    // saveExemption is province-wide through the Exemption Approver, but linking is the
    // Application Approver's, which this user holds only in Cariboo.
    assertThatCode(() -> service.requireExemptionApplicationLink(mixed, "EX-1", 21L))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> service.requireExemptionApplicationLink(mixed, "EX-1", 20L))
        .isInstanceOf(AccessDeniedException.class);
    assertThatThrownBy(() -> service.requireExemptionApplicationLink(mixed, "EX-2", 21L))
        .isInstanceOf(AccessDeniedException.class);
    assertThatCode(() -> service.requireExemptionApplicationLink(staff(APPROVER), "EX-2", 20L))
        .doesNotThrowAnyException();
  }

  @Test
  void blanketOicVisibilityFollowsTheApproverAndReadOnlyRegions() {
    when(exemptionService.findAccessByExemptionNumber("B1"))
        .thenReturn(Optional.of(new ExemptionAccessDto("B1", "B", "ACT", true)));
    when(exemptionService.findAccessByExemptionNumber("B2"))
        .thenReturn(Optional.of(new ExemptionAccessDto("B2", "B", "ACT", true)));
    when(exemptionService.findOrgUnitNumbers("B1")).thenReturn(List.of(KOOTENAY_BOUNDARY));
    when(exemptionService.findOrgUnitNumbers("B2")).thenReturn(List.of(CARIBOO));
    requestAuthorizedFor("/exemptionDetails");

    Authentication mixed = staff(EXEMPTION_APPROVER, APPROVER_CARIBOO);
    assertThat(service.canAccessExemption(staff(EXEMPTION_APPROVER), "B1")).isFalse();
    assertThat(service.canAccessExemption(mixed, "B1")).isFalse();
    assertThat(service.canAccessExemption(mixed, "B2")).isTrue();
    assertThat(service.canAccessExemption(staff(READ_ONLY, EXEMPTION_APPROVER_CARIBOO), "B1"))
        .isTrue();

    // Search: Ministerial exemptions everywhere, the other types only in Cariboo.
    assertThat(service.resolveBlanketOicRegions(mixed).orgUnitNumbers()).containsExactly(CARIBOO);
    assertThat(service.resolveBlanketOicRegions(staff(EXEMPTION_APPROVER)).denied()).isTrue();
    assertThat(service.resolveBlanketOicRegions(staff(READ_ONLY)).restricted()).isFalse();

    assertThatThrownBy(() -> service.requireBlanketOicRegions(mixed, List.of(KOOTENAY_BOUNDARY)))
        .isInstanceOf(AccessDeniedException.class);
    assertThatCode(() -> service.requireBlanketOicRegions(mixed, List.of(CARIBOO)))
        .doesNotThrowAnyException();
  }

  @Test
  void provinceWideExemptionApprovalNeedsNoRegionLookup() {
    assertThatCode(() -> service.requireExemptionWrite(staff(EXEMPTION_APPROVER), "EX-1"))
        .doesNotThrowAnyException();
    verifyNoInteractions(exemptionService);
  }

  @Test
  void federalApplicationAccessFollowsTheApproversRegions() {
    LexisApplicationDetailDto skeena = federal(SKEENA);
    LexisApplicationDetailDto cariboo = federal(CARIBOO);
    when(applicationService.findByApplicationNumber(20L)).thenReturn(Optional.of(skeena));
    when(applicationService.findByApplicationNumber(21L)).thenReturn(Optional.of(cariboo));

    assertThat(service.canAccessFederalApplication(staff(APPROVER_CARIBOO), 20L)).isFalse();
    assertThat(service.canAccessFederalApplication(staff(APPROVER_CARIBOO), 21L)).isTrue();
  }

  @Test
  void federalRecordsOutsideTheManageRegionAreReadOnly() {
    Authentication mixed = staff(READ_ONLY, APPROVER_CARIBOO);

    assertThat(service.canWriteRecord(mixed, SKEENA, OrgUnitSurface.FEDERAL_APPLICATION_WRITE))
        .isFalse();
    assertThat(service.canWriteRecord(mixed, CARIBOO, OrgUnitSurface.FEDERAL_APPLICATION_WRITE))
        .isTrue();
    assertThat(service.canWriteRecord(staff(APPROVER), SKEENA, OrgUnitSurface.FEDERAL_APPLICATION_WRITE))
        .isTrue();
  }

  @Test
  void provinceWideFederalApprovalNeedsNoRecordLookup() {
    assertThat(service.canAccessFederalApplication(staff(APPROVER), 20L)).isTrue();
    verifyNoInteractions(applicationService);
  }

  @Test
  void staffAttachmentWritesStayInsideTheGrantedRegions() {
    LexisApplicationDetailDto skeena = provincialDetail(SKEENA);
    LexisApplicationDetailDto cariboo = provincialDetail(CARIBOO);
    when(applicationService.findByApplicationNumber(30L)).thenReturn(Optional.of(skeena));
    when(applicationService.findByApplicationNumber(31L)).thenReturn(Optional.of(cariboo));

    assertThatThrownBy(
            () -> service.requireApplicationAttachmentMutation(staff(APPROVER_CARIBOO), 30L))
        .isInstanceOf(AccessDeniedException.class);
    assertThatCode(() -> service.requireApplicationAttachmentMutation(staff(APPROVER_CARIBOO), 31L))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireApplicationAttachmentMutation(staff(APPROVER), 30L))
        .doesNotThrowAnyException();
  }

  @Test
  void regionalReportsMustNameOnlyGrantedRegions() {
    Authentication readOnly = staff(READ_ONLY_SKEENA);

    assertThatCode(() -> service.requireReportRegions(readOnly, Map.of("region", "1908")))
        .doesNotThrowAnyException();
    assertThatCode(() -> service.requireReportRegions(readOnly, Map.of("region", "[1908]")))
        .doesNotThrowAnyException();
    for (Map<String, String> outside :
        List.of(
            Map.of("region", "1903"),
            Map.of("region", "1908,1903"),
            Map.of("region", "0"),
            Map.of("orgUnitNumber", "1903"),
            Map.of("region", "ALL"),
            Map.<String, String>of())) {
      assertThatThrownBy(() -> service.requireReportRegions(readOnly, outside))
          .isInstanceOf(AccessDeniedException.class);
    }
    assertThatCode(() -> service.requireReportRegions(staff(READ_ONLY), Map.of()))
        .doesNotThrowAnyException();
  }

  @Test
  void submittersAndProvinceWideStaffAreUnaffected() {
    Authentication submitter =
        staff("LEXIS_PROVINCIAL_SUBMITTER", "LEXIS_PROVINCIAL_SUBMITTER_00012345");
    for (OrgUnitSurface surface : OrgUnitSurface.values()) {
      assertThat(service.constrainOrgUnits(submitter, List.of(SKEENA), surface).restricted())
          .isFalse();
      assertThat(service.constrainOrgUnits(staff(READ_ONLY), List.of(SKEENA), surface).restricted())
          .isFalse();
    }
  }

  private static Authentication staff(String... authorities) {
    return new TestingAuthenticationToken("staff", "n/a", authorities);
  }

  private static ApplicationAccessContextDto provincial(Long orgUnitNumber) {
    return new ApplicationAccessContextDto(1L, "P", orgUnitNumber, null, null);
  }

  private static LexisApplicationDetailDto provincialDetail(Long orgUnitNumber) {
    return ProvincialAuthorizationServiceTest.application(1L, null, null, orgUnitNumber, "P");
  }

  private static LexisApplicationDetailDto federal(Long orgUnitNumber) {
    return ProvincialAuthorizationServiceTest.application(1L, null, null, orgUnitNumber, "F");
  }

  private static void requestAuthorizedFor(String action) {
    MockHttpServletRequest request = new MockHttpServletRequest();
    LexisRequestActions.record(request, List.of(action));
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
  }
}

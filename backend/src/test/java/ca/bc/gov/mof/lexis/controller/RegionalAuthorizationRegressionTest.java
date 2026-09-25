package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.security.LexisRequestActions;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionActivationEligibilityValidator;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.exemption.OracleExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.report.LexisJasperReportDefinition;
import ca.bc.gov.mof.lexis.service.report.LexisJasperReportParameterProvider;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Exercises the controller boundaries with the deployed role configuration and real region checks. */
@ExtendWith(MockitoExtension.class)
class RegionalAuthorizationRegressionTest {

  private static final String APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String EXEMPTION_APPROVER = "LEXIS_EXEMPTION_APPROVER";
  private static final String APPLICATION_CARIBOO = APPLICATION_APPROVER + "_REGION_REGION-CARIBOO";
  private static final String EXEMPTION_CARIBOO = EXEMPTION_APPROVER + "_REGION_REGION-CARIBOO";
  private static final String EXEMPTION_SKEENA = EXEMPTION_APPROVER + "_REGION_REGION-SKEENA";

  @Mock private ExemptionService exemptions;
  @Mock private ExemptionDetailsRpcService exemptionRpc;
  @Mock private LexisReportService reports;
  @Mock private ApplicationDetailsRpcService applicationRpc;

  private LexisReportController reportController;
  private ExemptionDetailsRpcController exemptionController;
  private ApplicationDetailsRpcController applicationController;

  @BeforeEach
  void setUp() {
    var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("application.yml"));
    var properties = new Binder(new MapConfigurationPropertySource(yaml.getObject()))
        .bind("lexis.authz", LexisAuthorizationProperties.class).get();
    var session = new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
    var authorization = new LexisAuthorizationService(properties, new LexisFeatureProperties(), session);
    var beans = new StaticListableBeanFactory();
    beans.addBean("exemptions", exemptions);
    beans.addBean("exemptionRpc", exemptionRpc);
    beans.addBean("reports", reports);
    var regional = new ProvincialAuthorizationService(
        session, authorization,
        beans.getBeanProvider(LexisApplicationService.class),
        beans.getBeanProvider(ApplicationDetailsRpcService.class),
        beans.getBeanProvider(ExemptionService.class),
        beans.getBeanProvider(PermitService.class),
        beans.getBeanProvider(PurchaseOfferService.class));
    var principal = new LexisPrincipalService();
    reportController = new LexisReportController(
        beans.getBeanProvider(LexisReportService.class), regional, principal);
    exemptionController = new ExemptionDetailsRpcController(
        beans.getBeanProvider(ExemptionDetailsRpcService.class),
        beans.getBeanProvider(ApplicationDetailsRpcService.class),
        beans.getBeanProvider(ClientLookupService.class), session, authorization, principal,
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex()));
    exemptionController.setProvincialAuthorizationService(regional);
    var applicationBeans = new StaticListableBeanFactory();
    applicationBeans.addBean("applicationRpc", applicationRpc);
    applicationController = new ApplicationDetailsRpcController(
        applicationBeans.getBeanProvider(ApplicationDetailsRpcService.class),
        applicationBeans.getBeanProvider(ClientLookupService.class),
        applicationBeans.getBeanProvider(ApplicationReviewService.class),
        session, authorization, new ApplicationEditLockService(), regional, null, null,
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex()));
    applicationController.setLexisPrincipalService(principal);
  }

  @AfterEach
  void clearRequest() {
    RequestContextHolder.resetRequestAttributes();
    SecurityContextHolder.clearContext();
  }

  @ParameterizedTest
  @MethodSource("reportRegionAliases")
  void regionalReportMustApplyTheAuthorizedAliasToItsGeneratedFilter(Map<String, String> parameters) {
    requestAuthorizedFor("/offerReport", staff("LEXIS_READ_ONLY_REGION_REGION-CARIBOO"));
    when(reports.generateReport(eq("offerReport"), any())).thenReturn(Optional.empty());

    assertThat(reportController.offerReport(new LexisReportRequestDto(parameters, "PDF")).getStatusCode())
        .isEqualTo(HttpStatus.NO_CONTENT);

    var request = ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reports).generateReport(eq("offerReport"), request.capture());
    // Jasper consumes region; the CSV query uses the same key. Checking only that the guard
    // accepts orgUnitNumber would miss generation silently dropping the authorized filter.
    assertThat(request.getValue().parameters()).containsEntry("region", "1903");
    assertThat(new LexisJasperReportParameterProvider().buildParameters(
        LexisJasperReportDefinition.OFFER_REPORT, request.getValue()))
        .containsEntry("P_ORG_UNIT", "1903");
  }

  static Stream<Map<String, String>> reportRegionAliases() {
    return Stream.of(
        Map.of("orgUnitNumber", "1903"),
        Map.of("region", " ", "orgUnitNumber", "1903"),
        Map.of("region", "1903"),
        Map.of("region", "1903", "orgUnitNumber", " "));
  }

  @ParameterizedTest
  @MethodSource("unauthorizedReportRegions")
  void regionalReportRejectsMissingOrConflictingUnauthorizedRegions(Map<String, String> parameters) {
    requestAuthorizedFor("/offerReport", staff("LEXIS_READ_ONLY_REGION_REGION-CARIBOO"));

    assertThat(reportController.offerReport(new LexisReportRequestDto(parameters, "CSV")).getStatusCode())
        .isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(reports);
  }

  static Stream<Map<String, String>> unauthorizedReportRegions() {
    return Stream.of(Map.of(), Map.of("orgUnitNumber", "1908"),
        Map.of("region", "1903", "orgUnitNumber", "1908"),
        Map.of("region", "1908", "orgUnitNumber", "1903"));
  }

  @Test
  void provinceWideReportsCanStillOmitRegions() {
    requestAuthorizedFor("/offerReport", staff("LEXIS_READ_ONLY"));
    when(reports.generateReport(eq("offerReport"), any())).thenReturn(Optional.empty());

    assertThat(reportController.offerReport(new LexisReportRequestDto(Map.of(), "PDF")).getStatusCode())
        .isEqualTo(HttpStatus.NO_CONTENT);
  }

  @ParameterizedTest
  @MethodSource("approvalGrants")
  void saveMustPassApprovalPermissionForEveryRecordRegion(
      List<String> grants, List<Long> recordRegions, boolean approvalAllowed) {
    var authentication = staff(grants.toArray(String[]::new));
    requestAuthorizedFor("saveExemption", authentication);
    when(exemptions.findAccessByExemptionNumber("EX-1"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-1", "M", "NEW", false)));
    // Province-wide grants deliberately skip region lookups.
    lenient().when(exemptions.findAccessOrgUnitNumbers("EX-1")).thenReturn(recordRegions);
    when(exemptionRpc.updateExemption(any(), anyString(), anyBoolean()))
        .thenReturn(new ExemptionDetailsRpcService.CreateExemptionResult(
            true, "Saved", "EX-1", false, List.of(), List.of()));
    var parameters = new LinkedMultiValueMap<String, String>();
    parameters.add("exemptionNumber", "EX-1");
    parameters.add("exemptionTypeCode", "M");
    parameters.add("exemptionStatusCode", "ACT");

    assertThat(exemptionController.updateExemptionLegacy(parameters, authentication).getStatusCode())
        .isEqualTo(HttpStatus.OK);

    // This flag is the activation validator's approval boundary, even on a saveExemption route.
    verify(exemptionRpc).updateExemption(any(), eq("IDIR\\regional.test"), eq(approvalAllowed));
  }

  static Stream<Arguments> approvalGrants() {
    return Stream.of(
        Arguments.of(List.of(APPLICATION_CARIBOO, EXEMPTION_SKEENA), List.of(1903L), false),
        Arguments.of(List.of(APPLICATION_APPROVER, EXEMPTION_SKEENA), List.of(1903L), false),
        Arguments.of(List.of(APPLICATION_CARIBOO, EXEMPTION_CARIBOO), List.of(1903L), true),
        Arguments.of(List.of(APPLICATION_APPROVER, EXEMPTION_CARIBOO), List.of(1903L, 1908L), false),
        Arguments.of(List.of(APPLICATION_APPROVER, EXEMPTION_CARIBOO, EXEMPTION_SKEENA),
            List.of(1903L, 1908L), true),
        Arguments.of(List.of(APPLICATION_CARIBOO, EXEMPTION_APPROVER), List.of(1903L, 1908L), true),
        Arguments.of(List.of(APPLICATION_APPROVER, EXEMPTION_CARIBOO), List.of(), false));
  }

  @ParameterizedTest
  @ValueSource(strings = {"CARIBOO", "SKEENA"})
  void ministerialActivationThroughSavePersistsOnlyInsideTheApprovalRegion(String approvalRegion) {
    var authentication = staff(APPLICATION_CARIBOO, EXEMPTION_APPROVER + "_REGION_REGION-" + approvalRegion);
    requestAuthorizedFor("saveExemption", authentication);
    when(exemptions.findAccessByExemptionNumber("EX-1"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-1", "M", "NEW", false)));
    when(exemptions.findAccessOrgUnitNumbers("EX-1")).thenReturn(List.of(1903L));

    var repository = mock(ExemptionDetailsRpcRepository.class);
    var today = LexisBusinessTime.today();
    when(repository.findExemptionRecord("EX-1"))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionRecord(
            "EX-1", 100.0d, today, today.plusDays(30), "Conditions", "M", "NEW",
            "IDIR\\creator", null, null, null)));
    when(repository.isExemptionTypeCodeValidRequired("M")).thenReturn(true);
    when(repository.isExemptionStatusCodeValidRequired("ACT")).thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-1"))
        .thenReturn(List.of(new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            1L, 100.0d, 100.0d, "00012345", "P", "S")));
    var application = new ExemptionDetailsRpcRepository.ApplicationLinkRecord(
        1L, null, today, 30L, today, 100.0d, null, null, "IDIR\\creator", null,
        null, null, null, "00012345", "00", "EX-1", null, "EXE", null, 1903L,
        "S", "P", "O", null, null, null, null);
    when(repository.findApplicationLinkRecord(1L)).thenReturn(Optional.of(application));
    boolean approvalAllowed = "CARIBOO".equals(approvalRegion);
    if (approvalAllowed) {
      when(repository.updateExemption(any())).thenReturn(true);
    }
    var persistence = new OracleExemptionDetailsRpcService(repository, null, null,
        new ExemptionActivationEligibilityValidator(repository));
    when(exemptionRpc.updateExemption(any(), anyString(), anyBoolean()))
        .thenAnswer(invocation -> persistence.updateExemption(
            invocation.getArgument(0), invocation.getArgument(1), invocation.getArgument(2)));
    var parameters = new LinkedMultiValueMap<String, String>();
    parameters.add("exemptionNumber", "EX-1");
    parameters.add("exemptionStatusCode", "ACT");

    var response = exemptionController.updateExemptionLegacy(parameters, authentication);

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo(approvalAllowed);
    if (approvalAllowed) {
      assertThat(response.getBody().errors()).isEmpty();
      verify(repository).updateExemption(any());
    } else {
      assertThat(response.getBody().errors())
          .containsExactly("Insufficient privileges to set this Exemption as Active.");
      verify(repository, never()).updateExemption(any());
    }
  }

  @ParameterizedTest
  @MethodSource("exemptionRegionsForNewApplication")
  void creatingAnApplicationUnderAnExemptionNeedsEveryExemptionRegion(
      List<Long> exemptionRegions, boolean allowed) {
    var authentication = staff(APPLICATION_CARIBOO);
    requestAuthorizedFor("createApplication", authentication);
    when(exemptions.findAccessByExemptionNumber("EX-1"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-1", "M", "NEW", false)));
    when(exemptions.findAccessOrgUnitNumbers("EX-1")).thenReturn(exemptionRegions);
    var parameters = new LinkedMultiValueMap<String, String>();
    parameters.add("exemptionNumber", "EX-1");
    parameters.add("region", "1903");

    if (allowed) {
      when(applicationRpc.addApplication(any(), anyString()))
          .thenReturn(new ApplicationDetailsRpcService.CreateApplicationResult(
              true, "Saved", 1L, List.of(), List.of()));
      assertThat(applicationController.addApplicationLegacy(parameters, authentication)
          .getStatusCode()).isEqualTo(HttpStatus.OK);
    } else {
      // Creating links the application, so it needs every exemption region, as linking does.
      assertThatThrownBy(() -> applicationController.addApplicationLegacy(parameters, authentication))
          .isInstanceOf(AccessDeniedException.class);
      verify(applicationRpc, never()).addApplication(any(), anyString());
    }
  }

  static Stream<Arguments> exemptionRegionsForNewApplication() {
    return Stream.of(
        Arguments.of(List.of(1903L), true),
        Arguments.of(List.of(1903L, 1908L), false));
  }

  @Test
  void regionalApproverOpensAnExemptionWhoseOnlyRegionIsALinkedApplication() {
    exemptionController.setExemptionService(exemptions);
    when(exemptions.findAccessByExemptionNumber("test-exemption"))
        .thenReturn(Optional.of(new ExemptionAccessDto("test-exemption", "M", "NEW", false)));
    // No stored OIC region rows: the region is that of the linked application.
    when(exemptions.findAccessOrgUnitNumbers("test-exemption")).thenReturn(List.of(1903L));
    when(exemptionRpc.getEditContext("test-exemption"))
        .thenReturn(new ExemptionDetailsRpcService.ExemptionEditContext(false, null, List.of()));
    var cariboo = staff(APPLICATION_CARIBOO);
    requestAuthorizedFor("/exemptionDetails", cariboo);

    var response = exemptionController.getRegionContext("test-exemption", cariboo);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody().regionNumbers()).isEmpty();
    assertThat(response.getBody().accessRegionNumbers()).containsExactly(1903L);

    var skeena = staff(EXEMPTION_SKEENA);
    requestAuthorizedFor("/exemptionDetails", skeena);
    assertThatThrownBy(() -> exemptionController.getRegionContext("test-exemption", skeena))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void regionalUsersSeeTheExemptionPermitsInTheirRegions() {
    var authentication = staff("LEXIS_READ_ONLY_REGION_REGION-CARIBOO");
    requestAuthorizedFor("/exemptionDetails", authentication);
    when(exemptions.findAccessByExemptionNumber("EX-1"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-1", "M", "NEW", false)));
    when(exemptions.findAccessOrgUnitNumbers("EX-1")).thenReturn(List.of(1903L, 1908L));
    when(exemptionRpc.getPermits(eq("EX-1"), any()))
        .thenAnswer(invocation -> {
          Predicate<ExemptionDetailsRpcService.PermitAccessContext> access =
              invocation.getArgument(1);
          return List.of(permitItem(7001L, 1903L, access), permitItem(7002L, 1908L, access));
        });

    assertThat(exemptionController.getPermits("EX-1", authentication).getBody())
        .extracting(ExemptionDetailsRpcController.PermitItemDto::permitNumber)
        .containsExactly(7001L);
  }

  private static ExemptionDetailsRpcService.PermitItem permitItem(
      long permitNumber,
      Long region,
      Predicate<ExemptionDetailsRpcService.PermitAccessContext> access) {
    return new ExemptionDetailsRpcService.PermitItem(
        permitNumber, "1.0", "Active", "", access.test(
            new ExemptionDetailsRpcService.PermitAccessContext(
                permitNumber, "", "", false, region)));
  }

  private static Authentication staff(String... authorities) {
    return new TestingAuthenticationToken("IDIR\\regional.test", "n/a", authorities);
  }

  private static void requestAuthorizedFor(String action, Authentication authentication) {
    var request = new MockHttpServletRequest();
    LexisRequestActions.record(request, List.of(action));
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    SecurityContextHolder.getContext().setAuthentication(authentication);
  }
}

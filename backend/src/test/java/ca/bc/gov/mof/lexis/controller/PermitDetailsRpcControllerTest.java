package ca.bc.gov.mof.lexis.controller;

import static java.util.concurrent.TimeUnit.MILLISECONDS;
import static java.util.concurrent.TimeUnit.SECONDS;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | PermitDetailsRpcController")
class PermitDetailsRpcControllerTest {

  @Mock private ObjectProvider<PermitDetailsRpcService> serviceProvider;
  @Mock private PermitDetailsRpcService service;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private PermitService permitService;
  @Mock private HttpServletRequest request;
  @Mock private HttpSession session;

  private PermitDetailsRpcController controller;
  private PermitOperationMutex operationMutex;

  @BeforeEach
  void setup() {
    when(sessionService.getConfiguredIndustryRoles())
        .thenReturn(Set.of("LEXIS_PROVINCIAL_SUBMITTER"));
    operationMutex = new PermitOperationMutex();
    controller =
        new PermitDetailsRpcController(
            serviceProvider,
            sessionService,
            authorizationService,
            operationMutex,
            new ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator(
                operationMutex));
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    controller.setPermitService(permitService);
    lenient()
        .when(permitService.findByPermitNumber(org.mockito.ArgumentMatchers.any()))
        .thenReturn(Optional.of(permitDetail("ACT")));
    lenient()
        .when(provincialAuthorizationService.canCreateForClient(any(), any(), any()))
        .thenReturn(true);
    lenient()
        .when(service.getExemptionNumberForPermitMutation(any()))
        .thenReturn("EX-700");
    lenient()
        .when(service.getApplicationNumbersForExemptionMutation(any()))
        .thenReturn(List.of());
    lenient()
        .when(editLockService.snapshotExemption(any(), any(), eq(false)))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    lenient()
        .when(editLockService.acquireExemption(any(), any(), any(), eq(false)))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
  }

  @Test
  void permitSummaryShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitSummaryRpcResponseDto> response =
        controller.getPermitSummary(7000123L, null, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void requestEmailShouldAllowProvincialSubmitterWithoutSavePermitGrant() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "bceid\\submitter",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(service.sendRequestPermitEmail(7000123L, null, "bceid\\submitter"))
        .thenReturn(
            new PermitDetailsRpcService.PermitEmailResult(
                true, "queued", "2026-07-10"));

    ResponseEntity<PermitDetailsRpcService.PermitEmailResult> response =
        controller.sendRequestPermitEmail(7000123L, null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().permitRequestDate()).isEqualTo("2026-07-10");
    verify(service).sendRequestPermitEmail(7000123L, null, "bceid\\submitter");
  }

  @Test
  void requestEmailShouldRejectMinistryUsers() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\approver",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER")));
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));

    ResponseEntity<PermitDetailsRpcService.PermitEmailResult> response =
        controller.sendRequestPermitEmail(7000123L, null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void requestEmailShouldFailWhenPermitIsLockedByAnotherEditor() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "bceid\\submitter",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(editLockService.acquirePermit(
            7000123L, "bceid\\submitter", "bceid\\submitter", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This permit is currently locked.", null));
    controller.setApplicationEditLockService(editLockService);

    assertThatThrownBy(
            () -> controller.sendRequestPermitEmail(7000123L, null, authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This permit is currently locked.");
    verifyNoInteractions(service);
  }

  @Test
  void permitSummaryShouldForwardRequestAndResolveIndustryUserFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitSummaryRpcResponseDto dto =
        new PermitSummaryRpcResponseDto("10.0", 12L, "$10.00", List.of(), "$10.00", "");
    when(service.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", false)).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));

    ResponseEntity<PermitSummaryRpcResponseDto> response =
        controller.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", false);
  }

  @Test
  void totalFeesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitTotalFeesRpcResponseDto dto = new PermitTotalFeesRpcResponseDto("$12.00");
    when(service.getTotalFeesForPermit(7000123L, "US", "2026-01-15")).thenReturn(dto);

    ResponseEntity<PermitTotalFeesRpcResponseDto> response =
        controller.getTotalFeesForPermit(7000123L, "US", "2026-01-15");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getTotalFeesForPermit(7000123L, "US", "2026-01-15");
  }

  @Test
  void scaleFeesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitScaleFeesRpcResponseDto dto = new PermitScaleFeesRpcResponseDto("$7.60", List.of(), "Standing");
    when(service.getScaleFeesForPackage("PKG-903", 7000123L, true)).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_READ_ONLY")));
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_READ_ONLY"));

    ResponseEntity<PermitScaleFeesRpcResponseDto> response =
        controller.getScaleFeesForPackage("PKG-903", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getScaleFeesForPackage("PKG-903", 7000123L, true);
  }

  @Test
  void scalesForPackageShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitScalesForPackageRpcResponseDto dto =
        new PermitScalesForPackageRpcResponseDto(
            List.of(
                new PermitScaleItemRpcResponseDto(
                    "TM1", 11L, "Hemlock", "Grade J", "7.6", "7000123", "101", "W", "RCO")));
    when(service.getScalesForPackage("PKG-903")).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    ResponseEntity<PermitScalesForPackageRpcResponseDto> response =
        controller.getScalesForPackage("PKG-903", 7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getScalesForPackage("PKG-903");
  }

  @Test
  void permitDataAfterScaleUpdateShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitDataAfterScaleUpdateRpcResponseDto dto =
        new PermitDataAfterScaleUpdateRpcResponseDto("12.4", 7L, "$11.11", 80.0d);
    when(service.getPermitDataAfterScaleUpdate(7000123L)).thenReturn(dto);

    ResponseEntity<PermitDataAfterScaleUpdateRpcResponseDto> response =
        controller.getPermitDataAfterScaleUpdate(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitDataAfterScaleUpdate(7000123L);
  }

  @Test
  void packageVolumeSumShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageVolumeSumRpcResponseDto dto = new PermitPackageVolumeSumRpcResponseDto("12.4");
    when(service.getPackageVolumeSum(7000123L, "PKG-903")).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    ResponseEntity<PermitPackageVolumeSumRpcResponseDto> response =
        controller.getPackageVolumeSum(7000123L, "PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageVolumeSum(7000123L, "PKG-903");
  }

  @Test
  void packageDerivedEndpointsShouldRejectPackagesFromAnotherPermit() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(service.packageBelongsToPermit("OTHER-PKG", 7000123L)).thenReturn(false);

    assertThatThrownBy(
            () ->
                controller.getPermitSummary(
                    7000123L, "US", "2026-01-15", "OTHER-PKG", authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    assertThatThrownBy(
            () ->
                controller.getScaleFeesForPackage(
                    "OTHER-PKG", 7000123L, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);
    assertThatThrownBy(
            () -> controller.getPackageVolumeSum(7000123L, "OTHER-PKG"))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);

    verify(service, never())
        .getPermitSummary(7000123L, "US", "2026-01-15", "OTHER-PKG", false);
    verify(service, never()).getScaleFeesForPackage("OTHER-PKG", 7000123L, false);
    verify(service, never()).getPackageVolumeSum(7000123L, "OTHER-PKG");
  }

  @Test
  void packageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageListRpcResponseDto dto =
        new PermitPackageListRpcResponseDto(List.of("PKG-100", "PKG-101"));
    when(service.getPackageList(7000123L)).thenReturn(dto);

    ResponseEntity<PermitPackageListRpcResponseDto> response =
        controller.getPackageList(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageList(7000123L);
  }

  @Test
  void oicPackageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageListRpcResponseDto dto =
        new PermitPackageListRpcResponseDto(List.of("PKG-OIC-1", "PKG-OIC-2"));
    when(service.getOicPackageList(7000123L)).thenReturn(dto);

    ResponseEntity<PermitPackageListRpcResponseDto> response =
        controller.getOicPackageList(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getOicPackageList(7000123L);
  }

  @Test
  void permitHasApplicationsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitHasApplicationsRpcResponseDto dto = new PermitHasApplicationsRpcResponseDto(true);
    when(service.getPermitHasApplications(7000123L)).thenReturn(dto);

    ResponseEntity<PermitHasApplicationsRpcResponseDto> response =
        controller.getPermitHasApplications(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitHasApplications(7000123L);
  }

  @Test
  void packageInfoShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageInfoRpcResponseDto dto =
        new PermitPackageInfoRpcResponseDto("Coast", "HE/UT", "Standing", "10.3", "5.5", "30.0", "Unmanufactured");
    when(service.getPackageInfo("PKG-903")).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    ResponseEntity<PermitPackageInfoRpcResponseDto> response =
        controller.getPackageInfo("PKG-903", 7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageInfo("PKG-903");
  }

  @Test
  void packageDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageDetailsRpcResponseDto dto =
        new PermitPackageDetailsRpcResponseDto(
            true,
            "PKG-903",
            "10.3",
            8.9d,
            "5.5",
            "30.0",
            "ACT",
            "Reviewed",
            "Active",
            "N",
            "Standing");
    when(service.getPackageDetails("PKG-903")).thenReturn(dto);
    when(service.packageBelongsToPermit("PKG-903", 7000123L)).thenReturn(true);

    ResponseEntity<PermitPackageDetailsRpcResponseDto> response =
        controller.getPackageDetails("PKG-903", 7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageDetails("PKG-903");
  }

  @Test
  void checkPermitNumberShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitNumberAvailabilityRpcResponseDto dto = new PermitNumberAvailabilityRpcResponseDto(true);
    when(service.checkPermitNumber(7000123L)).thenReturn(dto);

    ResponseEntity<PermitNumberAvailabilityRpcResponseDto> response =
        controller.checkPermitNumber(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).checkPermitNumber(7000123L);
  }

  @Test
  void applicationListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(true);
    PermitApplicationListRpcResponseDto dto =
        new PermitApplicationListRpcResponseDto(List.of("1000456", "1000457"));
    when(service.getApplicationList(eq(7000123L), any())).thenReturn(dto);

    ResponseEntity<PermitApplicationListRpcResponseDto> response =
        controller.getApplicationList(7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    @SuppressWarnings("unchecked")
    org.mockito.ArgumentCaptor<Predicate<Long>> accessCaptor =
        org.mockito.ArgumentCaptor.forClass(Predicate.class);
    verify(service).getApplicationList(eq(7000123L), accessCaptor.capture());
    when(provincialAuthorizationService.canAccessApplication(authentication, 1000456L))
        .thenReturn(true);
    assertThat(accessCaptor.getValue().test(1000456L)).isTrue();
  }

  @Test
  void childApplicationPredicateShouldFailWithoutApplicationDetailCapability() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\exemption-approver", "n/a");
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(false);
    when(service.getApplicationList(eq(7000123L), any()))
        .thenReturn(new PermitApplicationListRpcResponseDto(List.of()));

    controller.getApplicationList(7000123L, authentication);

    @SuppressWarnings("unchecked")
    org.mockito.ArgumentCaptor<Predicate<Long>> accessCaptor =
        org.mockito.ArgumentCaptor.forClass(Predicate.class);
    verify(service).getApplicationList(eq(7000123L), accessCaptor.capture());
    assertThat(accessCaptor.getValue().test(1000456L)).isFalse();
    verify(provincialAuthorizationService, never())
        .canAccessApplication(authentication, 1000456L);
  }

  @Test
  void availableApplicationListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    PermitAvailableApplicationListRpcResponseDto dto =
        new PermitAvailableApplicationListRpcResponseDto(List.of("1000456"), null);
    when(service.getAvailableApplicationList(eq("EX-700"), eq("1000458"), any()))
        .thenReturn(dto);

    ResponseEntity<PermitAvailableApplicationListRpcResponseDto> response =
        controller.getAvailableApplicationList("EX-700", "1000458", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getAvailableApplicationList(eq("EX-700"), eq("1000458"), any());
  }

  @Test
  void availablePackageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    PermitAvailablePackageListRpcResponseDto dto =
        new PermitAvailablePackageListRpcResponseDto(List.of("PKG-900"), null);
    when(service.getAvailablePackageList(eq("EX-700"), eq("PKG-901"), any()))
        .thenReturn(dto);

    ResponseEntity<PermitAvailablePackageListRpcResponseDto> response =
        controller.getAvailablePackageList("EX-700", "PKG-901", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getAvailablePackageList(eq("EX-700"), eq("PKG-901"), any());
  }

  @Test
  void availableApplicationListShouldPropagateOracleFailure() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle packages unavailable");
    when(service.getAvailableApplicationList(eq("EX-700"), eq(""), any()))
        .thenThrow(failure);

    assertThatThrownBy(
            () ->
                controller.getAvailableApplicationList(
                    "EX-700", "", authentication))
        .isSameAs(failure);
  }

  @Test
  void availablePackageListShouldPreserveLegitimatelyEmptyResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    PermitAvailablePackageListRpcResponseDto dto =
        new PermitAvailablePackageListRpcResponseDto(
            List.of(), "No applications are currently available.");
    when(service.getAvailablePackageList(eq("EX-700"), eq(""), any())).thenReturn(dto);

    ResponseEntity<PermitAvailablePackageListRpcResponseDto> response =
        controller.getAvailablePackageList("EX-700", "", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
  }

  @Test
  void approvedExemptionVolumeShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitApprovedExemptionVolumeRpcResponseDto dto =
        new PermitApprovedExemptionVolumeRpcResponseDto(100.5d);
    when(service.getApprovedExemptionVolume("EX-700")).thenReturn(dto);

    ResponseEntity<PermitApprovedExemptionVolumeRpcResponseDto> response =
        controller.getApprovedExemptionVolume("EX-700");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getApprovedExemptionVolume("EX-700");
  }

  @Test
  void exemptionVolumeRemainingShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitExemptionVolumeRemainingRpcResponseDto dto =
        new PermitExemptionVolumeRemainingRpcResponseDto(55.25d);
    when(service.getExemptionVolumeRemaining("EX-700")).thenReturn(dto);

    ResponseEntity<PermitExemptionVolumeRemainingRpcResponseDto> response =
        controller.getExemptionVolumeRemaining("EX-700");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getExemptionVolumeRemaining("EX-700");
  }

  @Test
  void countryListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitCountryListRpcResponseDto dto =
        new PermitCountryListRpcResponseDto(
            List.of(new PermitCountryItemRpcResponseDto("Canada", "CA")));
    when(service.getCountryList()).thenReturn(dto);

    ResponseEntity<PermitCountryListRpcResponseDto> response = controller.getCountryList();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getCountryList();
  }

  @Test
  void invoicesForPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitInvoiceListRpcResponseDto dto =
        new PermitInvoiceListRpcResponseDto(List.of("INV-100", "INV-101"));
    when(service.getInvoicesForPermit(7000123L)).thenReturn(dto);

    ResponseEntity<PermitInvoiceListRpcResponseDto> response =
        controller.getInvoicesForPermit(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getInvoicesForPermit(7000123L);
  }

  @Test
  void invoiceDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitInvoiceDetailsRpcResponseDto dto =
        new PermitInvoiceDetailsRpcResponseDto(true, "1.25", "$50.00", "$125.00");
    when(service.getInvoiceDetails(7000123L, "INV-101")).thenReturn(dto);

    ResponseEntity<PermitInvoiceDetailsRpcResponseDto> response =
        controller.getInvoiceDetails(7000123L, "INV-101");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getInvoiceDetails(7000123L, "INV-101");
  }

  @Test
  void gbmsInvoiceHistoryShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitGbmsInvoiceHistoryItemRpcResponseDto> dto =
        List.of(
            new PermitGbmsInvoiceHistoryItemRpcResponseDto(
                "GBMS-1", "", "", "125.00", "03/01/2026", "03/01/2026", "03/02/2026"));
    when(service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true)).thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_READ_ONLY")));
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_READ_ONLY"));

    ResponseEntity<List<PermitGbmsInvoiceHistoryItemRpcResponseDto>> response =
        controller.getGbmsInvoiceHistory("RCPT-1", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getGbmsInvoiceHistory("RCPT-1", 7000123L, true);
  }

  @Test
  void addInvoiceShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "The sales invoice was saved successfully.", List.of(), List.of(), 7000123L);
    when(service.addInvoice(
            7000123L,
            "INV-100",
            new java.math.BigDecimal("100.00"),
            new java.math.BigDecimal("1.25"),
            new java.math.BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(dto);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addInvoice(
            7000123L, "INV-100", "100.00", "1.25", "12.00", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .addInvoice(
            7000123L,
            "INV-100",
            new java.math.BigDecimal("100.00"),
            new java.math.BigDecimal("1.25"),
            new java.math.BigDecimal("12.00"),
            "idir\\jsmith");
  }

  @Test
  void permitUpdateShouldSerializeAConcurrentInvoiceMutationForTheSamePermit()
      throws Exception {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "permitStatus", new String[] {"ACT"}));
    when(service.getApplicationNumbersForPermitMutation(7000123L)).thenReturn(List.of());

    CountDownLatch updateEntered = new CountDownLatch(1);
    CountDownLatch releaseUpdate = new CountDownLatch(1);
    CountDownLatch invoiceAttempted = new CountDownLatch(1);
    CountDownLatch invoiceEntered = new CountDownLatch(1);
    PermitMutationRpcResponseDto updateResult =
        new PermitMutationRpcResponseDto(
            true,
            "updated",
            List.of(),
            List.of(),
            7000123L,
            "ACT",
            null,
            false,
            false,
            null);
    PermitPersistenceRpcResponseDto invoiceResult =
        new PermitPersistenceRpcResponseDto(
            true, "invoiced", List.of(), List.of(), 7000123L);
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenAnswer(
            ignored -> {
              updateEntered.countDown();
              if (!releaseUpdate.await(2, SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release permit update.");
              }
              return updateResult;
            });
    when(service.addInvoice(
            7000123L,
            "INV-100",
            new java.math.BigDecimal("100.00"),
            new java.math.BigDecimal("1.25"),
            new java.math.BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenAnswer(
            ignored -> {
              invoiceEntered.countDown();
              return invoiceResult;
            });
    TestingAuthenticationToken authentication = authorizedSavePermit();
    ExecutorService executor = Executors.newFixedThreadPool(2);

    try {
      Future<ResponseEntity<PermitMutationRpcResponseDto>> update =
          executor.submit(() -> controller.updatePermit(request, authentication));
      assertThat(updateEntered.await(2, SECONDS)).isTrue();

      Future<ResponseEntity<PermitPersistenceRpcResponseDto>> invoice =
          executor.submit(
              () -> {
                invoiceAttempted.countDown();
                return controller.addInvoice(
                    7000123L,
                    "INV-100",
                    "100.00",
                    "1.25",
                    "12.00",
                    authentication);
              });
      assertThat(invoiceAttempted.await(2, SECONDS)).isTrue();
      assertThat(invoiceEntered.await(150, MILLISECONDS)).isFalse();

      releaseUpdate.countDown();
      assertThat(update.get(2, SECONDS).getBody()).isEqualTo(updateResult);
      assertThat(invoice.get(2, SECONDS).getBody()).isEqualTo(invoiceResult);
      assertThat(invoiceEntered.getCount()).isZero();
    } finally {
      releaseUpdate.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void waitingPermitMutationShouldReauthorizeInsideTheCriticalSection()
      throws Exception {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    TestingAuthenticationToken authentication = authorizedSavePermit();
    CountDownLatch holderEntered = new CountDownLatch(1);
    CountDownLatch releaseHolder = new CountDownLatch(1);
    CountDownLatch initialAuthorizationPassed = new CountDownLatch(1);
    java.util.concurrent.atomic.AtomicInteger authorizationChecks =
        new java.util.concurrent.atomic.AtomicInteger();
    doAnswer(
            ignored -> {
              if (authorizationChecks.incrementAndGet() == 1) {
                initialAuthorizationPassed.countDown();
                return null;
              }
              throw new org.springframework.security.access.AccessDeniedException(
                  "Permit ownership changed while waiting.");
            })
        .when(provincialAuthorizationService)
        .requirePermit(authentication, 7000123L);
    ExecutorService executor = Executors.newFixedThreadPool(2);

    try {
      Future<String> holder =
          executor.submit(
              () ->
                  operationMutex.execute(
                      7000123L,
                      () -> {
                        holderEntered.countDown();
                        try {
                          if (!releaseHolder.await(2, SECONDS)) {
                            throw new IllegalStateException(
                                "Timed out waiting to release permit lock.");
                          }
                        } catch (InterruptedException exception) {
                          Thread.currentThread().interrupt();
                          throw new IllegalStateException(exception);
                        }
                        return "released";
                      }));
      assertThat(holderEntered.await(2, SECONDS)).isTrue();

      Future<ResponseEntity<PermitPersistenceRpcResponseDto>> waitingMutation =
          executor.submit(
              () ->
                  controller.addInvoice(
                      7000123L,
                      "INV-100",
                      "100.00",
                      "1.25",
                      "12.00",
                      authentication));
      assertThat(initialAuthorizationPassed.await(2, SECONDS)).isTrue();
      assertThat(authorizationChecks).hasValue(1);

      releaseHolder.countDown();
      assertThat(holder.get(2, SECONDS)).isEqualTo("released");
      assertThatThrownBy(() -> waitingMutation.get(2, SECONDS))
          .hasCauseInstanceOf(
              org.springframework.security.access.AccessDeniedException.class);
      verify(service, never()).addInvoice(any(), any(), any(), any(), any(), any());
    } finally {
      releaseHolder.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void addPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.ofEntries(
                Map.entry("permitNumber", new String[] {"7000123"}),
                Map.entry("permitStatus", new String[] {"ACT"}),
                Map.entry("permitSubmitDate", new String[] {"2026-05-27"}),
                Map.entry("permitIssueDate", new String[] {"2026-05-27"}),
                Map.entry("permitExpiryDate", new String[] {"2026-06-27"}),
                Map.entry("exemptionNumber", new String[] {"EX-700"}),
                Map.entry("region", new String[] {"1835"}),
                Map.entry("permitTotalVolume", new String[] {"100.0"}),
                Map.entry("permitTotalPieces", new String[] {"25"}),
                Map.entry("destinationCompanyName", new String[] {"Acme Lumber"}),
                Map.entry("destinationCountry", new String[] {"US"}),
                Map.entry("transportType", new String[] {"TRUCK"}),
                Map.entry("transportName", new String[] {"Hauler 1"}),
                Map.entry("estimatedShippingDate", new String[] {"2026-06-01"}),
                Map.entry("portOfExport", new String[] {"OT"}),
                Map.entry("otherPortOfExport", new String[] {"Blaine"}),
                Map.entry("ownerClientNumber", new String[] {"00070001"}),
                Map.entry("ownerClientLocation", new String[] {"01"})));

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was saved successfully.",
            List.of(),
            List.of(),
            7000123L,
            "ACT",
            null,
            false,
            false,
            null);
    when(service.addPermit(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    org.mockito.ArgumentCaptor<PermitMutationRequestDto> requestCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRequestDto.class);
    verify(service)
        .addPermit(
            requestCaptor.capture(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().permitNumber()).isEqualTo("7000123");
    assertThat(requestCaptor.getValue().permitStatus()).isEqualTo("ACT");
    assertThat(requestCaptor.getValue().permitSubmitDate()).isEqualTo("2026-05-27");
    assertThat(requestCaptor.getValue().permitIssueDate()).isEqualTo("2026-05-27");
    assertThat(requestCaptor.getValue().permitExpiryDate()).isEqualTo("2026-06-27");
    assertThat(requestCaptor.getValue().exemptionNumber()).isEqualTo("EX-700");
    assertThat(requestCaptor.getValue().orgUnitNumber()).isEqualTo("1835");
    assertThat(requestCaptor.getValue().permitTotalVolume()).isEqualTo("100.0");
    assertThat(requestCaptor.getValue().permitNumberOfPieces()).isEqualTo("25");
    assertThat(requestCaptor.getValue().destinationCompanyName()).isEqualTo("Acme Lumber");
    assertThat(requestCaptor.getValue().destinationCountry()).isEqualTo("US");
    assertThat(requestCaptor.getValue().transportType()).isEqualTo("TRUCK");
    assertThat(requestCaptor.getValue().transportName()).isEqualTo("Hauler 1");
    assertThat(requestCaptor.getValue().estimatedShippingDate()).isEqualTo("2026-06-01");
    assertThat(requestCaptor.getValue().portOfExport()).isEqualTo("OT");
    assertThat(requestCaptor.getValue().otherPortOfExport()).isEqualTo("Blaine");
    assertThat(requestCaptor.getValue().ownerClientNumber()).isEqualTo("00070001");
    assertThat(requestCaptor.getValue().ownerClientLocation()).isEqualTo("01");
    verify(provincialAuthorizationService, times(2))
        .requireExemption(authentication, "EX-700");
  }

  @Test
  void addPermitShouldRejectAnExemptionOutsideTheAuthenticatedScope() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(Map.of("exemptionNumber", new String[] {"EX-OTHER"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireExemption(authentication, "EX-OTHER");

    assertThatThrownBy(() -> controller.addPermit(request, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);

    verify(service, never()).addPermit(any(), any());
  }

  @Test
  void addPermitShouldReleaseAnExemptionLockAcquiredOnlyForTheMutation() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(Map.of("exemptionNumber", new String[] {"EX-700"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(editLockService.snapshotExemption("EX-700", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquireExemption(
            "EX-700", "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.addPermit(any(PermitMutationRequestDto.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    controller.setApplicationEditLockService(editLockService);

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(editLockService).releaseExemption("EX-700", "idir\\jsmith");
  }

  @Test
  void addPermitShouldPreserveAPreExistingSameUserExemptionLock() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(Map.of("exemptionNumber", new String[] {"EX-700"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(editLockService.snapshotExemption("EX-700", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.acquireExemption(
            "EX-700", "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(service.addPermit(any(PermitMutationRequestDto.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    controller.setApplicationEditLockService(editLockService);

    controller.addPermit(request, authentication);

    verify(editLockService, never()).releaseExemption(any(), any());
  }

  @Test
  void addPermitShouldSerializeExemptionApplicationsAndAuthorizeRequestedOicApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "exemptionNumber", new String[] {"EX-700"},
                "oicApplicationNumber", new String[] {"1000999"}));
    when(service.getApplicationNumbersForExemptionMutation("EX-700"))
        .thenReturn(List.of(1000456L));
    when(service.addPermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    controller.setApplicationEditLockService(editLockService);
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService, never())
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService, times(2))
        .requireApplication(authentication, 1000999L);
    verify(editLockService)
        .acquireExemption("EX-700", "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).releaseExemption("EX-700", "idir\\jsmith");
  }

  @Test
  void addPermitShouldFailClosedForMalformedRequestedOicApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "exemptionNumber", new String[] {"EX-700"},
                "oicApplicationNumber", new String[] {"invalid"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();

    assertThatThrownBy(() -> controller.addPermit(request, authentication))
        .isInstanceOf(org.springframework.dao.DataRetrievalFailureException.class)
        .hasMessageContaining("requested OIC application relationship is invalid");

    verify(service, never()).addPermit(any(), any());
  }

  @Test
  void updatePermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "permitStatus", new String[] {"PPD"},
                "permitReceiptNo", new String[] {""},
                "permitRemarks", new String[] {""},
                "otherPortOfExport", new String[] {""},
                "agentClientNumber", new String[] {""}));

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was updated successfully.",
            List.of(),
            List.of(),
            7000123L,
            "PPD",
            "RCP-100",
            false,
            false,
            null);
    when(service.updatePermit(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);
    when(service.getApplicationNumbersForPermitMutation(7000123L))
        .thenReturn(List.of(1000456L));
    allowApplicationMutationLocks(1000456L);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    org.mockito.ArgumentCaptor<PermitMutationRequestDto> requestCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRequestDto.class);
    verify(service)
        .updatePermit(
            requestCaptor.capture(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().permitNumber()).isEqualTo("7000123");
    assertThat(requestCaptor.getValue().permitStatus()).isEqualTo("PPD");
    assertThat(requestCaptor.getValue().permitReceiptNo()).isEmpty();
    assertThat(requestCaptor.getValue().permitRemarks()).isEmpty();
    assertThat(requestCaptor.getValue().otherPortOfExport()).isEmpty();
    assertThat(requestCaptor.getValue().agentClientNumber()).isEmpty();
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(editLockService).acquire(1000456L, "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).release(1000456L, "idir\\jsmith");
  }

  @Test
  void updatePermitShouldForwardExplicitNumericOrgUnitNumber() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "orgUnitNo", new String[] {"1908"}));
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    allowApplicationMutationLocks();
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    org.mockito.ArgumentCaptor<PermitMutationRequestDto> requestCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRequestDto.class);
    verify(service).updatePermit(requestCaptor.capture(), eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().orgUnitNumber()).isEqualTo("1908");
  }

  @Test
  void updatePermitShouldLockTheAuthoritativeExemptionWhenRequestOmitsIt() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(Map.of("permitNumber", new String[] {"7000123"}));
    when(service.getExemptionNumberForPermitMutation(7000123L))
        .thenReturn("EX-CURRENT");
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    allowApplicationMutationLocks();
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService)
        .requireExemption(authentication, "EX-CURRENT");
    verify(editLockService)
        .acquireExemption("EX-CURRENT", "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).releaseExemption("EX-CURRENT", "idir\\jsmith");
  }

  @Test
  void updatePermitShouldLockCurrentAndRequestedParentsAndApplicationRelationships() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "exemptionNumber", new String[] {"EX-TARGET"},
                "oicApplicationNumber", new String[] {"1000999"}));
    when(service.getExemptionNumberForPermitMutation(7000123L))
        .thenReturn("EX-CURRENT");
    when(service.getApplicationNumbersForPermitMutation(7000123L))
        .thenReturn(List.of(1000456L));
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    allowApplicationMutationLocks(1000456L, 1000999L);
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(editLockService)
        .acquireExemption("EX-CURRENT", "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService)
        .acquireExemption("EX-TARGET", "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).releaseExemption("EX-CURRENT", "idir\\jsmith");
    verify(editLockService).releaseExemption("EX-TARGET", "idir\\jsmith");
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000999L);
  }

  @Test
  void updatePermitShouldRequirePermitReviewAuthorityForFeeOverrides() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "overrideInd", new String[] {"true"},
                "overrideFee", new String[] {"25.00"},
                "overrideComment", new String[] {"Reviewed"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(authorizationService)
        .canPerformAction(List.of("LEXIS_APPLICATION_APPROVER"), "/permitsReview");
    verify(service, never()).updatePermit(any(), any());
  }

  @Test
  void updatePermitShouldForwardAuthorizedFeeOverrideFieldsToTheServiceBoundary() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "permitStatus", new String[] {"PPD"},
                "overrideInd", new String[] {"true"},
                "overrideFee", new String[] {"25.00"},
                "overrideComment", new String[] {"Reviewed calculation"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "/permitsReview"))
        .thenReturn(true);
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                false,
                "",
                List.of("Fee overrides cannot be changed after permit invoicing."),
                List.of(),
                7000123L,
                null,
                null,
                false,
                false,
                null));

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    org.mockito.ArgumentCaptor<PermitMutationRequestDto> requestCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRequestDto.class);
    verify(service).updatePermit(requestCaptor.capture(), eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().permitStatus()).isEqualTo("PPD");
    assertThat(requestCaptor.getValue().overrideInd()).isEqualTo("true");
    assertThat(requestCaptor.getValue().overrideFee()).isEqualTo("25.00");
    assertThat(requestCaptor.getValue().overrideComment()).isEqualTo("Reviewed calculation");
  }

  @Test
  void updatePermitShouldRejectExpiredCanonicalPermitBeforeLocksOrRpcMutation() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "permitStatus", new String[] {"ACT"},
                "permitRemarks", new String[] {"forged resurrection"}));
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("EXP")));
    TestingAuthenticationToken authentication = authorizedSavePermit();

    assertThatThrownBy(() -> controller.updatePermit(request, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Expired permits are read-only.");

    verifyNoInteractions(editLockService);
    verify(service, never()).getApplicationNumbersForPermitMutation(any());
    verify(service, never()).updatePermit(any(), any());
  }

  @Test
  void updatePermitShouldLockTheRequestedHiddenOicApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "oicApplicationNumber", new String[] {"1000999"}));
    when(service.getApplicationNumbersForPermitMutation(7000123L))
        .thenReturn(List.of(1000456L));
    when(service.updatePermit(any(PermitMutationRequestDto.class), eq("idir\\jsmith")))
        .thenReturn(
            new PermitMutationRpcResponseDto(
                true, "saved", List.of(), List.of(), 7000123L, "ACT", null,
                false, false, null));
    allowApplicationMutationLocks(1000456L);
    allowApplicationMutationLocks(1000999L);
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000999L);
    verify(editLockService).acquire(1000456L, "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).acquire(1000999L, "idir\\jsmith", "idir\\jsmith", false);
    verify(editLockService).release(1000456L, "idir\\jsmith");
    verify(editLockService).release(1000999L, "idir\\jsmith");
  }

  @Test
  void updatePermitShouldAuthorizeARequestedReplacementExemption() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "exemptionNumber", new String[] {"EX-OTHER"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireExemption(authentication, "EX-OTHER");

    assertThatThrownBy(() -> controller.updatePermit(request, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class);

    verify(service, never()).updatePermit(any(), any());
  }

  @Test
  void updatePermitShouldReleaseReplacementExemptionLockWhenPermitLockConflicts() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "exemptionNumber", new String[] {"EX-OTHER"}));
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(editLockService.snapshotExemption("EX-OTHER", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquireExemption(
            "EX-OTHER", "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    when(editLockService.acquirePermit(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This permit is currently locked.", null));
    controller.setApplicationEditLockService(editLockService);

    assertThatThrownBy(() -> controller.updatePermit(request, authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This permit is currently locked.");

    verify(editLockService).releaseExemption("EX-700", "idir\\jsmith");
    verify(editLockService).releaseExemption("EX-OTHER", "idir\\jsmith");
    verify(service, never()).updatePermit(any(), any());
  }

  @Test
  void updateShippingShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "estimatedShippingDate", new String[] {"2026-06-10"}));

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was saved successfully.",
            List.of(),
            List.of(),
            7000123L,
            "ACT",
            null,
            false,
            false,
            null);
    when(service.updateShipping(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updateShipping(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    org.mockito.ArgumentCaptor<PermitMutationRequestDto> requestCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRequestDto.class);
    verify(service)
        .updateShipping(
            requestCaptor.capture(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().permitNumber()).isEqualTo("7000123");
    assertThat(requestCaptor.getValue().estimatedShippingDate()).isEqualTo("2026-06-10");
  }

  @Test
  void updateShippingShouldRejectExpiredCanonicalPermitBeforeRpcMutation() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameterMap())
        .thenReturn(
            Map.of(
                "permitNumber", new String[] {"7000123"},
                "estimatedShippingDate", new String[] {"2026-06-10"}));
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("EXP")));
    TestingAuthenticationToken authentication = authorizedSavePermit();

    assertThatThrownBy(() -> controller.updateShipping(request, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Expired permits are read-only.");

    verifyNoInteractions(editLockService);
    verify(service, never()).updateShipping(any(), any());
  }

  @Test
  void updateScaleAttachmentShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "Scale detail was added to the permit.", List.of(), List.of(), 7000123L);
    when(service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith")).thenReturn(dto);
    when(service.getApplicationNumberForScaleMutation("101"))
        .thenReturn(Optional.of(1000456L));
    allowApplicationMutationLocks(1000456L);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.updateScaleAttachment("101", null, 7000123L, "true", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");
    verify(provincialAuthorizationService, times(2))
        .requireApplication(authentication, 1000456L);
    verify(editLockService).release(1000456L, "idir\\jsmith");
  }

  @Test
  void addApplicationsToPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "Application scale rows were added to the permit.", List.of(), List.of(), 7000123L);
    when(service.addApplicationsToPermit(7000123L, "1000456,1000457", "idir\\jsmith"))
        .thenReturn(dto);
    allowApplicationMutationLocks(1000456L, 1000457L);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addApplicationsToPermit(7000123L, "1000456,1000457", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).addApplicationsToPermit(7000123L, "1000456,1000457", "idir\\jsmith");
    verify(provincialAuthorizationService, times(2))
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService, times(2))
        .requireApplication(authentication, 1000457L);
    verify(editLockService).release(1000456L, "idir\\jsmith");
    verify(editLockService).release(1000457L, "idir\\jsmith");
  }

  @Test
  void removeApplicationFromPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "Application scale rows were removed from the permit.", List.of(), List.of(), 7000123L);
    when(service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith")).thenReturn(dto);
    allowApplicationMutationLocks(1000456L);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.removeApplicationFromPermit(7000123L, 1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");
    verify(provincialAuthorizationService, times(2))
        .requireApplication(authentication, 1000456L);
    verify(editLockService).release(1000456L, "idir\\jsmith");
  }

  @Test
  void addBlanketOicScaleShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "Blanket OIC scale detail was added.", List.of(), List.of(), 7000123L);
    when(service.addBlanketOicScale(
            7000123L, "PKG-903", "TM1", "12.5", 7L, "HE", "A", "idir\\jsmith"))
        .thenReturn(dto);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addBlanketOicScale(
            7000123L, "PKG-903", "TM1", "12.5", 7L, "HE", "A", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .addBlanketOicScale(
            7000123L, "PKG-903", "TM1", "12.5", 7L, "HE", "A", "idir\\jsmith");
  }

  @Test
  void deleteBlanketOicScaleShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "Blanket OIC scale detail was removed.", List.of(), List.of(), 7000123L);
    when(service.deleteBlanketOicScale("101", 7000123L, "idir\\jsmith")).thenReturn(dto);

    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.deleteBlanketOicScale("101", null, 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).deleteBlanketOicScale("101", 7000123L, "idir\\jsmith");
  }

  @Test
  void conversionRateShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitConversionRateRpcResponseDto dto = new PermitConversionRateRpcResponseDto(true, "1.23");
    when(service.getConversionRate()).thenReturn(dto);

    ResponseEntity<PermitConversionRateRpcResponseDto> response =
        controller.getConversionRate();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getConversionRate();
  }

  @Test
  void fileTypesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitFileTypeRpcResponseDto> dto = List.of(new PermitFileTypeRpcResponseDto("INV", "Invoice"));
    when(service.getFileTypes()).thenReturn(dto);

    ResponseEntity<List<PermitFileTypeRpcResponseDto>> response = controller.getFileTypes();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getFileTypes();
  }

  @Test
  void documentDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitDocumentItemRpcResponseDto> dto =
        List.of(
            new PermitDocumentItemRpcResponseDto(
                "file.pdf",
                "",
                "Invoice",
                "INV",
                77L,
                "invoice",
                null,
                7000123L,
                true));
    when(service.getDocumentDetails(7000123L)).thenReturn(dto);

    ResponseEntity<List<PermitDocumentItemRpcResponseDto>> response =
        controller.getDocumentDetails("7000123");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getDocumentDetails(7000123L);
  }

  @Test
  void documentDetailsShouldHideApplicationDocumentsWithoutApplicationDetailAuthority() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\exemption-approver",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER")));
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(7000123L))
        .thenReturn(
            List.of(
                new PermitDocumentItemRpcResponseDto(
                    "application.pdf",
                    "",
                    "Application",
                    "INS",
                    77L,
                    "application",
                    1000456L,
                    null,
                    false)));
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<List<PermitDocumentItemRpcResponseDto>> response =
          controller.getDocumentDetails("7000123");

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
        new TestingAuthenticationToken(
            "idir\\exemption-approver",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER")));
    List<String> roles = List.of("LEXIS_EXEMPTION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(false);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(77L, "application");
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("77", "application.pdf", "7000123"))
          .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied permit.");
      verify(service, never()).streamDocument(77L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamDocumentShouldRejectApplicationDocumentWithoutApplicationObjectAccess() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\application-approver",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER")));
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(true);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(77L, "application");
    doThrow(new org.springframework.security.access.AccessDeniedException("denied"))
        .when(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      assertThatThrownBy(
              () -> controller.streamDocument("77", "application.pdf", "7000123"))
          .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
          .hasMessage(
              "Document does not belong to an accessible source for the supplied permit.");
      verify(service, never()).streamDocument(77L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void streamInvoiceDocumentShouldReturnAttachmentPayload() throws Exception {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\application-approver",
            "n/a",
            List.of(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER")));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(77L, "invoice");
    when(service.streamDocument(77L))
        .thenReturn(Optional.of(output -> output.write("invoice-content".getBytes())));
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(authentication);
    try {
      ResponseEntity<StreamingResponseBody> response =
          controller.streamDocument("77", "../unsafe/invoice.pdf", "7000123");

      assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
      assertThat(response.getHeaders().getContentDisposition().isAttachment()).isTrue();
      assertThat(response.getHeaders().getContentDisposition().getFilename())
          .isEqualTo("invoice.pdf");
      assertThat(response.getBody()).isNotNull();
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      response.getBody().writeTo(output);
      assertThat(output.toByteArray()).containsExactly("invoice-content".getBytes());
      verify(provincialAuthorizationService).requirePermit(authentication, 7000123L);
      verify(service).streamDocument(77L);
    } finally {
      org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
  }

  @Test
  void removePermitDocumentShouldReturnSuccessFlag() {
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("ACT")));
    when(service.removePermitDocument(33L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removePermitDocument(33L);
  }

  @Test
  void removePermitDocumentShouldRejectInvoiceSource() {
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "invoice");

    assertThatThrownBy(
            () -> controller.removePermitDocument("33", 7000123L, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Document is not a permit attachment for the supplied permit.");
    verify(service, never()).removePermitDocument(33L);
  }

  @Test
  void removeApplicationDocumentShouldRejectReadOnlyAggregateChild() {
    TestingAuthenticationToken authentication = authorizedSavePermit();

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeApplicationDocument("44", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(response.getBody()).isNull();
    verifyNoInteractions(service);
  }

  @Test
  void removeInvoiceDocumentShouldReturnSuccessFlag() {
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(55L, "invoice");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("ACT")));
    when(service.removeInvoiceDocument(55L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeInvoiceDocument("55", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeInvoiceDocument(55L);
  }

  @Test
  void removePermitDocumentShouldFailClosedWhenRpcServiceIsUnavailable() {
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    verifyNoInteractions(service);
  }

  @Test
  void removePermitDocumentShouldPreserveThePermitEditLock() {
    TestingAuthenticationToken authentication = authorizedSavePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(editLockService.acquirePermit(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "This permit is currently locked.", null));
    controller.setApplicationEditLockService(editLockService);

    assertThatThrownBy(
            () -> controller.removePermitDocument("33", 7000123L, authentication))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessage("This permit is currently locked.");
    verify(permitService).findByPermitNumber(7000123L);
    verify(service, never()).removePermitDocument(33L);
  }

  @Test
  void updateShippingShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updateShipping(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void updateScaleAttachmentShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.updateScaleAttachment("101", null, 7000123L, "true", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void addApplicationsToPermitShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addApplicationsToPermit(7000123L, "1000456", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void removeApplicationFromPermitShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.removeApplicationFromPermit(7000123L, 1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void addBlanketOicScaleShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addBlanketOicScale(
            7000123L, "PKG-903", "TM1", "12.5", 7L, "HE", "A", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void deleteBlanketOicScaleShouldRejectWithoutSavePermitAction() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.deleteBlanketOicScale("101", null, 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void removePermitDocumentShouldRejectReadOnlyUser() {
    TestingAuthenticationToken authentication = unauthorizedSavePermit();

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void removePermitDocumentShouldAllowAdminOutsideActiveExceptExpired() {
    TestingAuthenticationToken authentication =
        authenticationWithRoles("idir\\admin", List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("COM")));
    when(service.removePermitDocument(33L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service).removePermitDocument(33L);
  }

  @Test
  void removePermitDocumentShouldAllowScopedSubmitterForActivePermit() {
    TestingAuthenticationToken authentication =
        authenticationWithRoles(
            "bceid\\submitter",
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00077881"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("ACT")));
    when(service.removePermitDocument(33L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(service).removePermitDocument(33L);
  }

  @Test
  void removePermitDocumentShouldRejectAdminForExpiredPermit() {
    TestingAuthenticationToken authentication =
        authenticationWithRoles("idir\\admin", List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("EXP")));

    assertThatThrownBy(
            () -> controller.removePermitDocument("33", 7000123L, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Expired permits are read-only.");
    verify(service, never()).removePermitDocument(33L);
  }

  @Test
  void removeInvoiceDocumentShouldRejectAdminOutsideActiveStatus() {
    TestingAuthenticationToken authentication =
        authenticationWithRoles("idir\\admin", List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(55L, "invoice");
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitDetail("COM")));

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeInvoiceDocument("55", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(service, never()).removeInvoiceDocument(55L);
  }

  @Test
  void removePermitDocumentShouldFailClosedWhenCanonicalPermitIsUnavailable() {
    TestingAuthenticationToken authentication =
        authenticationWithRoles("idir\\admin", List.of("LEXIS_ADMIN"));
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    stubPermitDocument(33L, "permit");
    when(permitService.findByPermitNumber(7000123L)).thenReturn(Optional.empty());

    assertThatThrownBy(
            () -> controller.removePermitDocument("33", 7000123L, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessage("Permit status is unavailable for mutation.");
    verify(service, never()).removePermitDocument(33L);
  }

  @Test
  void checkFormChangesShouldReturnLegacyNoOpPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().permitChanged()).isFalse();
  }

  @Test
  void checkFormChangesShouldReturnServicePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.hasFormChanges(any(PermitMutationRequestDto.class))).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().permitChanged()).isTrue();
    verify(service).hasFormChanges(any(PermitMutationRequestDto.class));
  }

  @Test
  void releaseLockShouldReturnLegacyOkPayloadAndClearSessionLock() {
    when(request.getSession(false)).thenReturn(session);

    ResponseEntity<PermitDetailsRpcController.ReleaseLockResponseDto> response =
        controller.releaseLock(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().release()).isEqualTo("ok");
    verify(session).removeAttribute("PERMIT_LOCK");
  }

  private void allowApplicationMutationLocks(Long... applicationNumbers) {
    controller.setApplicationEditLockService(editLockService);
    lenient()
        .when(editLockService.acquirePermit(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    for (Long applicationNumber : applicationNumbers) {
      when(editLockService.snapshot(applicationNumber, "idir\\jsmith", false))
          .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
      when(editLockService.acquire(
              applicationNumber, "idir\\jsmith", "idir\\jsmith", false))
          .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    }
  }

  private void stubPermitDocument(long documentId, String source) {
    Long sourceApplicationNumber = "application".equals(source) ? 1000456L : null;
    Long sourcePermitNumber = sourceApplicationNumber == null ? 7000123L : null;
    when(service.findDocumentForPermit(documentId, 7000123L))
        .thenReturn(
            Optional.of(
                new PermitDocumentItemRpcResponseDto(
                    "file.pdf",
                    "",
                    source,
                    switch (source) {
                      case "application" -> "INS";
                      case "invoice" -> "INV";
                      default -> "PMT";
                    },
                    documentId,
                    source,
                    sourceApplicationNumber,
                    sourcePermitNumber,
                    !"application".equals(source))));
  }

  private TestingAuthenticationToken authorizedSavePermit() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER")));
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    lenient().when(authorizationService.canPerformAction(roles, "savePermit")).thenReturn(true);
    lenient()
        .when(authorizationService.canPerformAction(roles, "/applicationDetails"))
        .thenReturn(true);
    return authentication;
  }

  private TestingAuthenticationToken unauthorizedSavePermit() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\readonly", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_READ_ONLY")));
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    lenient().when(authorizationService.canPerformAction(roles, "savePermit")).thenReturn(false);
    return authentication;
  }

  private TestingAuthenticationToken authenticationWithRoles(
      String principal, List<String> roles) {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            principal,
            "n/a",
            roles.stream().map(SimpleGrantedAuthority::new).toList());
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    return authentication;
  }

  private PermitDetailDto permitDetail(String status) {
    return new PermitDetailDto(
        7000123L,
        1000456L,
        "PKG-1",
        "EX-205",
        status,
        status,
        "00077881",
        "01",
        "00077881",
        "01",
        "Destination",
        "US",
        "TRK",
        "Truck",
        "VAN",
        null,
        null,
        null,
        null,
        null,
        100d,
        10L,
        "R-1",
        null,
        null,
        null,
        null,
        null);
  }
}

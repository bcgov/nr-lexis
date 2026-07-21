package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService.ApplicationEditPolicy;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
class LexisApplicationControllerUnitTest {

  @Mock private LexisApplicationService service;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private Authentication authentication;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ApplicationEditPolicyService applicationEditPolicyService;

  @InjectMocks private LexisApplicationController controller;

  @BeforeEach
  void setUpAuthorization() {
    lenient().when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    lenient()
        .when(applicationEditPolicyService.resolve(any(), any(), any()))
        .thenReturn(new ApplicationEditPolicy(true, true, true, true, true, false, false, false));
    lenient()
        .when(
            provincialAuthorizationService.constrainOrgUnits(
                nullable(Authentication.class), any(), any()))
        .thenAnswer(
            invocation ->
                new ProvincialAuthorizationService.OrgUnitConstraint(
                    false, invocation.getArgument(1)));
  }

  @Test
  void searchShouldOverrideClientFiltersWhenUserHasScopedForestClient() {
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(new LexisApplicationSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        "00099999",
        "00088888",
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.agentClientNumber()).isEqualTo("00077881");
    assertThat(criteria.broadClientMatch()).isTrue();
  }

  @Test
  void searchShouldNotClientFilterAdministratorWithConcurrentSubmitterScope() {
    LexisApplicationController mixedRoleController =
        new LexisApplicationController(
            service,
            editLockService,
            new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER"),
            authorizationService,
            provincialAuthorizationService,
            applicationDetailsServiceProvider,
            applicationEditPolicyService);
    Authentication mixedRoleAdministrator =
        new TestingAuthenticationToken(
            "idir\\admin",
            "n/a",
            "LEXIS_PROVINCIAL_SUBMITTER_00077881",
            "LEXIS_ADMIN");
    when(service.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(new LexisApplicationSearchResponseDto(List.of(), 0, 0, 25));

    mixedRoleController.search(
        null,
        null,
        null,
        null,
        null,
        "00099999",
        "00088888",
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        null,
        mixedRoleAdministrator);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isEqualTo("00099999");
    assertThat(criteria.agentClientNumber()).isEqualTo("00088888");
    assertThat(criteria.broadClientMatch()).isFalse();
  }

  @Test
  void searchShouldIncludeActiveEditLocks() {
    when(authentication.getName()).thenReturn("idir\\reviewer");
    when(service.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(
            new LexisApplicationSearchResponseDto(
                List.of(searchResult(1000456L), searchResult(1000789L)), 2, 0, 25));
    when(editLockService.snapshot(1000456L, "idir\\reviewer", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This application is currently locked for editing by another user.",
                null));
    when(editLockService.snapshot(1000789L, "idir\\reviewer", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));

    ResponseEntity<LexisApplicationSearchResponseDto> response =
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
            null,
            null,
            List.of(),
            null,
            0,
            25,
            null,
            authentication);

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().results())
        .extracting(LexisApplicationSearchResultDto::locked)
        .containsExactly(true, false);
  }

  @Test
  void searchShouldApplyExportScheduleFilter() {
    when(service.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(new LexisApplicationSearchResponseDto(List.of(), 0, 0, 25));

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
        null,
        "31916",
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    assertThat(criteriaCaptor.getValue().exportScheduleId()).isEqualTo(31916L);
  }

  @Test
  void detailShouldReturnNotFoundWhenScopedUserDoesNotOwnApplication() {
    when(service.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));

    ResponseEntity<LexisApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldRedactRemarksWithoutApplicationRemarksAction() {
    LexisApplicationDetailDto detail = applicationDetailWithRemark();
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(detail));
    when(provincialAuthorizationService.canAccessApplication(authentication, detail)).thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationsReview")).thenReturn(false);
    when(authorizationService.canPerformAction(roles, "/applicationRemarks")).thenReturn(false);
    when(authentication.getName()).thenReturn("idir\\readonly");
    when(editLockService.acquire(1000456L, "idir\\readonly", "idir\\readonly", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));

    ResponseEntity<LexisApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().remarks()).isEmpty();
    assertThat(response.getBody().author()).isEqualTo("idir\\application-author");
  }

  @Test
  void detailShouldIncludeRemarksWithApplicationRemarksAction() {
    LexisApplicationDetailDto detail = applicationDetailWithRemark();
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(detail));
    when(provincialAuthorizationService.canAccessApplication(authentication, detail)).thenReturn(true);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "/applicationsReview")).thenReturn(false);
    when(authorizationService.canPerformAction(roles, "/applicationRemarks")).thenReturn(true);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(editLockService.acquire(1000456L, "idir\\approver", "idir\\approver", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));

    ResponseEntity<LexisApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().remarks()).hasSize(1);
    assertThat(response.getBody().remarks().get(0).remark()).isEqualTo("Restricted remark");
  }

  private static LexisApplicationDetailDto applicationDetail(
      String ownerClientNumber, String agentClientNumber) {
    return applicationDetail(ownerClientNumber, agentClientNumber, List.of());
  }

  private static LexisApplicationDetailDto applicationDetailWithRemark() {
    return applicationDetail(
        "00099999",
        "00088888",
        List.of(
            new LexisApplicationDetailDto.LexisRemarkDto(
                1L, "Review", "Restricted remark", "idir\\reviewer", LocalDate.of(2026, 3, 3))));
  }

  private static LexisApplicationDetailDto applicationDetail(
      String ownerClientNumber,
      String agentClientNumber,
      List<LexisApplicationDetailDto.LexisRemarkDto> remarks) {
    return new LexisApplicationDetailDto(
        1000456L,
        null,
        "NEW",
        "New",
        ownerClientNumber,
        agentClientNumber,
        12L,
        "R2",
        "H",
        "S",
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 2),
        null,
        180L,
        90.0,
        0.5,
        true,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(),
        remarks,
        List.of(),
        "idir\\application-author");
  }

  private static LexisApplicationSearchResultDto searchResult(long applicationNumber) {
    return new LexisApplicationSearchResultDto(
        applicationNumber,
        "New",
        "",
        "00077881",
        "",
        LocalDate.of(2026, 3, 2),
        "R2",
        95.0,
        true,
        false);
  }
}

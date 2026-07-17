package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.lenient;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.OracleAggregateRowLockService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationReviewController")
class ApplicationReviewControllerTest {

  @Mock private ObjectProvider<ApplicationReviewService> serviceProvider;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ApplicationReviewService service;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;

  private ApplicationReviewController controller;

  @BeforeEach
  void setUpAuthorization() {
    PermitOperationMutex operationMutex = new PermitOperationMutex();
    controller =
        new ApplicationReviewController(
            serviceProvider,
            applicationDetailsServiceProvider,
            provincialAuthorizationService,
            new ApplicationPermitOperationCoordinator(operationMutex));
    lenient().when(applicationDetailsServiceProvider.getIfAvailable())
        .thenReturn(applicationDetailsService);
    lenient().when(applicationDetailsService.getPermitNumbersForApplicationMutation(any()))
        .thenReturn(List.of());
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
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationReviewSearchOptionsDto dto =
        new ApplicationReviewSearchOptionsDto(
            List.of(new CodeNameDto("LOG", "Logs")),
            List.of(new CodeNameDto("12", "Coast")),
            List.of(new CodeNameDto("APR", "Approved")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<ApplicationReviewSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewSearchResponseDto> response =
        controller.search(null, null, null, null, null, null, null, null, 0, 25, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationReviewSearchResponseDto dto =
        new ApplicationReviewSearchResponseDto(
            List.of(
                new ApplicationReviewSearchResultDto(
                    1000456L,
                    80.3,
                    "Hemlock / Lumber",
                    LocalDate.of(2026, 2, 26),
                    "Pending",
                    "R2",
                    true)),
            1,
            0,
            25);
    when(service.search(any(ApplicationReviewSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<ApplicationReviewSearchResponseDto> response =
        controller.search(
            " 1000456 ",
            " LOG ",
            "2026-02-20",
            "03/10/2026",
            "2026-02-26",
            null,
            List.of(12L),
            "applicationNumber DESC",
            0,
            25,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<ApplicationReviewSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ApplicationReviewSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    ApplicationReviewSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicationNumber()).isEqualTo(" 1000456 ");
    assertThat(criteria.productTypeCode()).isEqualTo(" LOG ");
    assertThat(criteria.receivedFromDate()).isEqualTo(LocalDate.of(2026, 2, 20));
    assertThat(criteria.receivedToDate()).isEqualTo(LocalDate.of(2026, 3, 10));
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 26));
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("applicationNumber DESC");
  }

  @Test
  void approveShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.approve(1000456L, new MockHttpServletRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void approveShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true, true, "APP", null, null, null, null, null, "Application approved.");
    when(service.approve(1000456L, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.approve(1000456L, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).approve(1000456L, "idir\\jsmith");
  }

  @Test
  void approveShouldRejectAConflictingApplicationEditLock() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationEditLockService editLockService = mock(ApplicationEditLockService.class);
    controller.setApplicationEditLockService(editLockService);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    when(editLockService.snapshot(1000456L, "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "Application is locked by another user.", null));
    when(editLockService.acquire(1000456L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true, false, null, "Application is locked by another user.", null));

    assertThatThrownBy(() -> controller.approve(1000456L, request))
        .isInstanceOf(EditLockConflictException.class)
        .hasMessageContaining("another user");
    verify(service, never()).approve(any(), any());
  }

  @Test
  void approveShouldReleaseALockAcquiredOnlyForTheMutation() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationEditLockService editLockService = mock(ApplicationEditLockService.class);
    controller.setApplicationEditLockService(editLockService);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    when(editLockService.snapshot(1000456L, "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    when(editLockService.acquire(1000456L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true, true, "APP", null, null, null, null, null, "Application approved.");
    when(service.approve(1000456L, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.approve(1000456L, request);

    assertThat(response.getBody()).isEqualTo(dto);
    verify(editLockService).release(1000456L, "idir\\jsmith");
  }

  @Test
  void updateStatusShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    ApplicationReviewStatusUpdateRequestDto body =
        new ApplicationReviewStatusUpdateRequestDto("REJ", "Missing docs", "client@gov.bc.ca");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true,
            true,
            "REJ",
            "client@gov.bc.ca",
            "Missing docs",
            99L,
            "idir\\jsmith",
            null,
            "Application status updated.");
    when(service.updateStatus(1000456L, body, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.updateStatus(1000456L, body, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).updateStatus(1000456L, body, "idir\\jsmith");
  }

  @Test
  void updateStatusShouldReturnExpiredRemarkValidationFromService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    ApplicationReviewStatusUpdateRequestDto body =
        new ApplicationReviewStatusUpdateRequestDto("EXP", "  ", null);
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            false,
            false,
            "EXP",
            null,
            null,
            null,
            null,
            null,
            "Remark is required when rejecting, withdrawing, or expiring an application.");
    when(service.updateStatus(1000456L, body, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.updateStatus(1000456L, body, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    assertThat(response.getBody().valid()).isFalse();
    assertThat(response.getBody().updated()).isFalse();
    verify(service).updateStatus(1000456L, body, "idir\\jsmith");
  }

  @Test
  void sendStatusEmailShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    ApplicationReviewController emailController = controllerWithOracleLocks(rowLocks);
    ApplicationReviewStatusEmailRequestDto body =
        new ApplicationReviewStatusEmailRequestDto("REJ", "client@gov.bc.ca", "Missing docs");
    ApplicationReviewStatusEmailResultDto dto =
        new ApplicationReviewStatusEmailResultDto(true, "Status email sent.");
    when(service.sendStatusEmail(1000456L, body)).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusEmailResultDto> response =
        emailController.sendStatusEmail(1000456L, body);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).sendStatusEmail(1000456L, body);
    verify(provincialAuthorizationService).requireApplicationReview(null, 1000456L);
    verifyNoInteractions(rowLocks);
  }

  @Test
  void approveLegacyShouldReturnLegacyPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "1000456");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true, true, "APP", null, null, null, null, null, "Application approved.");
    when(service.approve(1000456L, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<Map<String, Object>> response = controller.approveLegacy(parameters, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsEntry("hasLock", true)
        .containsEntry("valid", true)
        .containsEntry("message", "Application approved.")
        .containsEntry("errors", List.of())
        .containsEntry("warnings", List.of());
    verify(service).approve(1000456L, "idir\\jsmith");
  }

  @Test
  void approveLegacyShouldReturnLegacyValidationPayloadForInvalidApplicationNumber() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "not-a-number");

    ResponseEntity<Map<String, Object>> response =
        controller.approveLegacy(parameters, new MockHttpServletRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsEntry("hasLock", false)
        .containsEntry("valid", false)
        .containsEntry("errors", List.of("Application number must be a positive value."));
    verifyNoInteractions(service);
  }

  @Test
  void disapproveLegacyShouldMapLegacyAliasesAndFallbackClientEmail() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "1000456");
    parameters.add("applicationReviewStatus", "REJ");
    parameters.add("remarkBody", "Missing documents");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true,
            true,
            "REJ",
            null,
            "Missing documents",
            99L,
            "idir\\jsmith",
            null,
            "Application status updated.");
    ArgumentCaptor<ApplicationReviewStatusUpdateRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusUpdateRequestDto.class);
    when(service.updateStatus(any(), any(), any())).thenReturn(dto);

    ResponseEntity<Map<String, Object>> response = controller.disapproveLegacy(parameters, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsEntry("hasLock", true)
        .containsEntry("valid", true)
        .containsEntry("clientEmail", "none")
        .containsEntry("remark", "Missing documents");
    verify(service).updateStatus(any(), requestCaptor.capture(), any());
    assertThat(requestCaptor.getValue())
        .isEqualTo(new ApplicationReviewStatusUpdateRequestDto("REJ", "Missing documents", null));
  }

  @Test
  void disapproveLegacyShouldReturnExpiredRemarkValidationPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "1000456");
    parameters.add("appStatus", "EXP");
    parameters.add("remark", "  ");
    String message =
        "Remark is required when rejecting, withdrawing, or expiring an application.";
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            false, false, "EXP", null, null, null, null, null, message);
    ArgumentCaptor<ApplicationReviewStatusUpdateRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusUpdateRequestDto.class);
    when(service.updateStatus(any(), any(), any())).thenReturn(dto);

    ResponseEntity<Map<String, Object>> response =
        controller.disapproveLegacy(parameters, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsEntry("hasLock", false)
        .containsEntry("valid", false)
        .containsEntry("statusCode", "EXP")
        .containsEntry("errors", List.of(message));
    verify(service).updateStatus(any(), requestCaptor.capture(), any());
    assertThat(requestCaptor.getValue())
        .isEqualTo(new ApplicationReviewStatusUpdateRequestDto("EXP", null, null));
  }

  @Test
  void sendStatusEmailLegacyShouldReturnLegacyStringSuccessPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    ApplicationReviewController emailController = controllerWithOracleLocks(rowLocks);
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "1000456");
    parameters.add("appStatus", "WDN");
    parameters.add("clientEmailAddress", "client@gov.bc.ca");
    parameters.add("remark", "Withdrawn");
    ApplicationReviewStatusEmailResultDto dto =
        new ApplicationReviewStatusEmailResultDto(true, "The email notification sent successfully.");
    ArgumentCaptor<ApplicationReviewStatusEmailRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusEmailRequestDto.class);
    when(service.sendStatusEmail(any(), any())).thenReturn(dto);

    ResponseEntity<Map<String, Object>> response =
        emailController.sendStatusEmailLegacy(parameters);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .containsEntry("success", "true")
        .containsEntry("message", "The email notification sent successfully.");
    verify(service).sendStatusEmail(any(), requestCaptor.capture());
    assertThat(requestCaptor.getValue())
        .isEqualTo(new ApplicationReviewStatusEmailRequestDto("WDN", "client@gov.bc.ca", "Withdrawn"));
    verify(provincialAuthorizationService).requireApplicationReview(null, 1000456L);
    verifyNoInteractions(rowLocks);
  }

  private ApplicationReviewController controllerWithOracleLocks(
      OracleAggregateRowLockService rowLocks) {
    @SuppressWarnings("unchecked")
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex(rowLockProvider));
    return new ApplicationReviewController(
        serviceProvider,
        applicationDetailsServiceProvider,
        provincialAuthorizationService,
        coordinator);
  }
}

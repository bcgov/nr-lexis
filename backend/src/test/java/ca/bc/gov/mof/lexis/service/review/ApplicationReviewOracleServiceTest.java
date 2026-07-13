package ca.bc.gov.mof.lexis.service.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository.ApplicationStatusTransitionRow;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository.AuthoritativeApplicantStatusContext;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository.ReviewRemarkRow;
import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService.FederalMutationResult;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService.FederalStatusMutationRequest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationReviewOracleService")
class ApplicationReviewOracleServiceTest {

  @Mock private ApplicationReviewRepository repository;
  @Mock private ApplicationReviewStatusEmailSender emailSender;
  @Mock private ApplicationApprovalEligibilityService approvalEligibilityService;
  @Mock private AuthoritativeClientEmailResolver clientEmailResolver;
  @Mock private FederalApplicationService federalApplicationService;
  @InjectMocks private ApplicationReviewOracleService service;

  @BeforeEach
  void defaultToProvincialJurisdiction() {
    lenient()
        .when(repository.findAuthoritativeJurisdictionCode(anyLong()))
        .thenReturn(Optional.of("P"));
  }

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadProductTypeOptions()).thenReturn(List.of(new CodeNameDto("LOG", "Logs")));
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));
    when(repository.loadReviewStatusOptions()).thenReturn(List.of(new CodeNameDto("APR", "Approved")));

    ApplicationReviewSearchOptionsDto response = service.searchOptions();

    assertThat(response.productTypes()).hasSize(1);
    assertThat(response.regions()).hasSize(1);
    assertThat(response.reviewStatuses()).hasSize(1);
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    ApplicationReviewSearchCriteria criteria =
        new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 1, 2);
    List<ApplicationReviewSearchResultDto> rows =
        List.of(
            row(10003L, LocalDate.of(2026, 3, 3)),
            row(10004L, LocalDate.of(2026, 3, 4)));
    when(repository.search(any(ApplicationReviewSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    ApplicationReviewSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(10003L, 10004L);
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    ApplicationReviewSearchCriteria criteria =
        new ApplicationReviewSearchCriteria(
            " 1000456 ",
            " LOG ",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 3, 10),
            LocalDate.of(2026, 2, 26),
            LocalDate.of(2026, 3, 12),
            Arrays.asList(12L, null, 12L, -1L, 0L),
            " applicationNumber DESC ",
            -2,
            0);
    when(repository.search(any(ApplicationReviewSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<ApplicationReviewSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ApplicationReviewSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    ApplicationReviewSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.applicationNumber()).isEqualTo("1000456");
    assertThat(normalized.productTypeCode()).isEqualTo("LOG");
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("applicationNumber DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void approveShouldShortCircuitWhenApplicationNumberInvalid() {
    ApplicationReviewStatusUpdateResultDto result = service.approve(0L, "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void approveShouldPassThroughRepositoryWhenInputValid() {
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(new ApplicationApprovalEligibilityService.Eligibility(true, List.of()));
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(new ApplicationStatusTransitionRow(true, true, true, "NEW", null));

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, "idir\\jsmith");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    assertThat(result.statusCode()).isEqualTo("APP");
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "idir\\jsmith", List.of("NEW", "PND"));
  }

  @Test
  void approveShouldDelegateFederalApplicationsToFederalPolicy() {
    when(repository.findAuthoritativeJurisdictionCode(1000456L))
        .thenReturn(Optional.of(" f "));
    when(federalApplicationService.updateStatus(
            1000456L, new FederalStatusMutationRequest("APP", null), "reviewer"))
        .thenReturn(
            new FederalMutationResult(
                true, "Federal application status updated.", null, List.of()));

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, "reviewer");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    assertThat(result.statusCode()).isEqualTo("APP");
    assertThat(result.message()).isEqualTo("Federal application status updated.");
    verify(federalApplicationService)
        .updateStatus(1000456L, new FederalStatusMutationRequest("APP", null), "reviewer");
    verifyNoInteractions(approvalEligibilityService);
    verify(repository, org.mockito.Mockito.never())
        .updateStatusWithRemarkFromAllowedSources(any(), any(), any(), any(), any());
  }

  @Test
  void approveShouldFailClosedWhenJurisdictionCannotBeVerified() {
    when(repository.findAuthoritativeJurisdictionCode(1000456L)).thenReturn(Optional.empty());

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, "reviewer");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.message()).isEqualTo("Application jurisdiction could not be verified.");
    verifyNoInteractions(approvalEligibilityService, federalApplicationService);
  }

  @Test
  void approveShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(new ApplicationApprovalEligibilityService.Eligibility(true, List.of()));
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "system", List.of("NEW", "PND")))
        .thenReturn(new ApplicationStatusTransitionRow(true, true, true, "PND", null));

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, null);

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "system", List.of("NEW", "PND"));
  }

  @Test
  void approveShouldFailClosedWhenApplicationIsNotEligible() {
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(
            new ApplicationApprovalEligibilityService.Eligibility(
                false, List.of("Applications linked to a permit cannot be approved.")));

    ApplicationReviewStatusUpdateResultDto result =
        service.approve(1000456L, "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.message()).contains("linked to a permit");
    verify(repository, org.mockito.Mockito.never())
        .updateStatusWithRemarkFromAllowedSources(any(), any(), any(), any(), any());
  }

  @Test
  void approveShouldRejectAnAuthoritativeTerminalStateAfterEligibilityCheck() {
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(new ApplicationApprovalEligibilityService.Eligibility(true, List.of()));
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(ApplicationStatusTransitionRow.notAllowed("APP"));

    ApplicationReviewStatusUpdateResultDto result =
        service.approve(1000456L, "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.message()).contains("only occur from NEW or PND").contains("APP");
  }

  @Test
  void approveShouldFailClearlyWhenApplicationDisappearsAfterEligibilityCheck() {
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(new ApplicationApprovalEligibilityService.Eligibility(true, List.of()));
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "APP", null, "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(ApplicationStatusTransitionRow.notFound());

    ApplicationReviewStatusUpdateResultDto result =
        service.approve(1000456L, "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.message()).isEqualTo("Application was not found.");
  }

  @Test
  void updateStatusShouldRejectApprovalBypass() {
    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto("APP", null, null),
            "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.message()).contains("use the approval action");
    verify(repository, org.mockito.Mockito.never())
        .updateStatusWithRemarkFromAllowedSources(any(), any(), any(), any(), any());
  }

  @Test
  void updateStatusShouldShortCircuitWhenStatusMissing() {
    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto(" ", "Missing docs", "client@gov.bc.ca"),
            "idir\\jsmith");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void updateStatusShouldRequireRemarkForRejectedWithdrawnOrExpiredStatuses() {
    ApplicationReviewStatusUpdateResultDto rejectedResult =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto("REJ", " ", "client@gov.bc.ca"),
            "idir\\jsmith");
    ApplicationReviewStatusUpdateResultDto withdrawnResult =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto("WDN", null, "client@gov.bc.ca"),
            "idir\\jsmith");
    ApplicationReviewStatusUpdateResultDto expiredResult =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto("EXP", "\t", "client@gov.bc.ca"),
            "idir\\jsmith");

    assertThat(rejectedResult.valid()).isFalse();
    assertThat(rejectedResult.updated()).isFalse();
    assertThat(rejectedResult.message())
        .isEqualTo("Remark is required when rejecting, withdrawing, or expiring an application.");
    assertThat(withdrawnResult.valid()).isFalse();
    assertThat(withdrawnResult.updated()).isFalse();
    assertThat(withdrawnResult.message())
        .isEqualTo("Remark is required when rejecting, withdrawing, or expiring an application.");
    assertThat(expiredResult.valid()).isFalse();
    assertThat(expiredResult.updated()).isFalse();
    assertThat(expiredResult.message())
        .isEqualTo("Remark is required when rejecting, withdrawing, or expiring an application.");
    verifyNoInteractions(repository);
  }

  @Test
  void updateStatusShouldNormalizeValuesBeforeRepositoryCall() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto(" REJ ", " Missing docs ", " client@gov.bc.ca ");
    Instant remarkDate = Instant.parse("2026-01-05T10:15:00Z");
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(
            new ApplicationStatusTransitionRow(
                true,
                true,
                true,
                "NEW",
                new ReviewRemarkRow(99L, "Missing docs", "idir\\jsmith", remarkDate)));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(1000456L, request, " idir\\jsmith ");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    assertThat(result.statusCode()).isEqualTo("REJ");
    assertThat(result.clientEmail()).isEqualTo("client@gov.bc.ca");
    assertThat(result.remark()).isEqualTo("Missing docs");
    assertThat(result.remarkId()).isEqualTo(99L);
    assertThat(result.remarkUser()).isEqualTo("idir\\jsmith");
    assertThat(result.remarkDate()).isEqualTo(remarkDate);
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "idir\\jsmith", List.of("NEW", "PND"));
  }

  @Test
  void updateStatusShouldDelegateFederalApplicationsToFederalPolicy() {
    when(repository.findAuthoritativeJurisdictionCode(1000456L))
        .thenReturn(Optional.of("F"));
    when(federalApplicationService.updateStatus(
            1000456L,
            new FederalStatusMutationRequest("REJ", "Missing docs"),
            "reviewer"))
        .thenReturn(
            new FederalMutationResult(
                false,
                null,
                null,
                List.of("Federal applications can only be rejected or withdrawn from APP.")));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto(
                "REJ", "Missing docs", "client@gov.bc.ca"),
            "reviewer");

    assertThat(result.valid()).isFalse();
    assertThat(result.updated()).isFalse();
    assertThat(result.statusCode()).isEqualTo("REJ");
    assertThat(result.clientEmail()).isEqualTo("client@gov.bc.ca");
    assertThat(result.remark()).isEqualTo("Missing docs");
    assertThat(result.message())
        .isEqualTo("Federal applications can only be rejected or withdrawn from APP.");
    verify(repository, org.mockito.Mockito.never())
        .updateStatusWithRemarkFromAllowedSources(any(), any(), any(), any(), any());
  }

  @Test
  void updateStatusShouldFailWhenRequestedRemarkDoesNotPersist() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto("REJ", "Missing docs", "client@gov.bc.ca");
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(new ApplicationStatusTransitionRow(true, true, true, "PND", null));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(1000456L, request, "idir\\jsmith");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isFalse();
    assertThat(result.statusCode()).isEqualTo("REJ");
    assertThat(result.clientEmail()).isEqualTo("client@gov.bc.ca");
    assertThat(result.remark()).isEqualTo("Missing docs");
    assertThat(result.message()).isEqualTo("Application status remark did not persist.");
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "idir\\jsmith", List.of("NEW", "PND"));
  }

  @Test
  void updateStatusShouldPersistExpiredStatusWithRequiredRemark() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto(
            " EXP ", " Expired after manual review ", "client@gov.bc.ca");
    Instant remarkDate = Instant.parse("2026-01-06T10:15:00Z");
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L,
            "EXP",
            "Expired after manual review",
            "idir\\jsmith",
            List.of("NEW", "PND")))
        .thenReturn(
            new ApplicationStatusTransitionRow(
                true,
                true,
                true,
                "NEW",
                new ReviewRemarkRow(
                    100L, "Expired after manual review", "idir\\jsmith", remarkDate)));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(1000456L, request, "idir\\jsmith");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    assertThat(result.statusCode()).isEqualTo("EXP");
    assertThat(result.clientEmail()).isEqualTo("client@gov.bc.ca");
    assertThat(result.remark()).isEqualTo("Expired after manual review");
    assertThat(result.remarkId()).isEqualTo(100L);
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L,
            "EXP",
            "Expired after manual review",
            "idir\\jsmith",
            List.of("NEW", "PND"));
  }

  @Test
  void updateStatusShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto(" REJ ", " Missing docs ", " client@gov.bc.ca ");
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "system", List.of("NEW", "PND")))
        .thenReturn(
            new ApplicationStatusTransitionRow(
                true,
                true,
                true,
                "PND",
                new ReviewRemarkRow(99L, "Missing docs", "system", Instant.now())));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(1000456L, request, null);

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    verify(repository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "system", List.of("NEW", "PND"));
  }

  @Test
  void updateStatusShouldRejectForgedTransitionFromAuthoritativeTerminalStatus() {
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing docs", "idir\\jsmith", List.of("NEW", "PND")))
        .thenReturn(ApplicationStatusTransitionRow.notAllowed("APP"));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto(
                "REJ", "Missing docs", "client@gov.bc.ca"),
            "idir\\jsmith");

    assertThat(result.updated()).isFalse();
    assertThat(result.valid()).isFalse();
    assertThat(result.message()).contains("only change from NEW or PND").contains("APP");
  }

  @Test
  void updateStatusShouldFailClearlyWhenAuthoritativeApplicationIsMissing() {
    when(repository.updateStatusWithRemarkFromAllowedSources(
            1000456L,
            "EXP",
            "Expired after manual review",
            "idir\\jsmith",
            List.of("NEW", "PND")))
        .thenReturn(ApplicationStatusTransitionRow.notFound());

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(
            1000456L,
            new ApplicationReviewStatusUpdateRequestDto(
                "EXP", "Expired after manual review", "client@gov.bc.ca"),
            "idir\\jsmith");

    assertThat(result.updated()).isFalse();
    assertThat(result.valid()).isFalse();
    assertThat(result.message()).isEqualTo("Application was not found.");
  }

  @Test
  void sendStatusEmailShouldShortCircuitWhenInputInvalid() {
    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(0L, new ApplicationReviewStatusEmailRequestDto("REJ", " ", "Missing docs"));

    assertThat(result.success()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void sendStatusEmailShouldIgnoreRequestedRecipientAndUseAuthoritativeApplicant() {
    ApplicationReviewStatusEmailRequestDto request =
        new ApplicationReviewStatusEmailRequestDto(
            " REJ ", " attacker@example.test ", " Missing docs ");
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(java.util.Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(
            Optional.of(
                new ReviewRemarkRow(
                    77L, 1000456L, "Missing docs", "idir\\reviewer", Instant.EPOCH)));
    when(repository.sendStatusEmail(1000456L, "REJ", "owner@example.test", "Missing docs"))
        .thenReturn(true);

    ApplicationReviewStatusEmailResultDto result = service.sendStatusEmail(1000456L, request);

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Application status email queued.");
    verify(repository).sendStatusEmail(1000456L, "REJ", "owner@example.test", "Missing docs");
    verify(emailSender).sendStatusEmail(1000456L, "REJ", "owner@example.test", "Missing docs");
  }

  @Test
  void sendStatusEmailShouldNotSendWhenRepositoryCannotStageRequest() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(java.util.Optional.of("client@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(
            Optional.of(
                new ReviewRemarkRow(
                    77L, 1000456L, "Missing docs", "idir\\reviewer", Instant.EPOCH)));
    when(repository.sendStatusEmail(1000456L, "REJ", "client@example.test", "Missing docs"))
        .thenReturn(false);

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("Application status email could not be prepared.");
    verify(repository).sendStatusEmail(1000456L, "REJ", "client@example.test", "Missing docs");
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldRejectARequestedStateThatDoesNotMatchOracle() {
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(
            java.util.Optional.of(
                new AuthoritativeApplicantStatusContext("APP", "00077881", "00")));

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("no longer matches");
    verifyNoInteractions(clientEmailResolver, emailSender);
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
  }

  @Test
  void sendStatusEmailShouldRecheckStateImmediatelyBeforeSending() {
    AuthoritativeApplicantStatusContext rejected =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    AuthoritativeApplicantStatusContext changed =
        new AuthoritativeApplicantStatusContext("APP", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.of(rejected), java.util.Optional.of(changed));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(java.util.Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(
            Optional.of(
                new ReviewRemarkRow(
                    77L, 1000456L, "Missing docs", "idir\\reviewer", Instant.EPOCH)));

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("changed before the email");
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldRejectAlteredRemarkAndNeverUseCallerContent() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(
            Optional.of(
                new ReviewRemarkRow(
                    77L, 1000456L, "Persisted rejection reason", "idir\\reviewer", Instant.EPOCH)));

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Altered later text"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("no longer matches");
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldFailClosedWhenNoAuthoritativeRemarkExists() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L)).thenReturn(Optional.empty());

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("remark could not be verified");
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldPreserveWithdrawnFlowWithPersistedRemark() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("WDN", "00077881", "00");
    ReviewRemarkRow persisted =
        new ReviewRemarkRow(
            88L, 1000456L, "Withdrawn by applicant", "idir\\reviewer", Instant.EPOCH);
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(Optional.of(persisted));
    when(repository.sendStatusEmail(
            1000456L, "WDN", "owner@example.test", "Withdrawn by applicant"))
        .thenReturn(true);

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "WDN", "ignored@example.test", " Withdrawn by applicant "));

    assertThat(result.success()).isTrue();
    verify(repository)
        .sendStatusEmail(
            1000456L, "WDN", "owner@example.test", "Withdrawn by applicant");
    verify(emailSender)
        .sendStatusEmail(
            1000456L, "WDN", "owner@example.test", "Withdrawn by applicant");
  }

  @Test
  void sendStatusEmailShouldPropagateAuthoritativeRemarkLookupOutageWithoutStaging() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("remark lookup unavailable");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L)).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.sendStatusEmail(
                    1000456L,
                    new ApplicationReviewStatusEmailRequestDto(
                        "REJ", "attacker@example.test", "Missing docs")))
        .isSameAs(failure);

    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldRejectWhenAuthoritativeRemarkChangesBeforeStaging() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    ReviewRemarkRow original =
        new ReviewRemarkRow(
            77L, 1000456L, "Missing docs", "idir\\reviewer", Instant.EPOCH);
    ReviewRemarkRow changed =
        new ReviewRemarkRow(
            78L, 1000456L, "Later persisted note", "idir\\reviewer", Instant.EPOCH.plusSeconds(1));
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findLatestAuthoritativeRemark(1000456L))
        .thenReturn(Optional.of(original), Optional.of(changed));

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("remark changed");
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldFailWithoutACompleteApplicantReference() {
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.empty());

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "REJ", "attacker@example.test", "Missing docs"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("could not be verified");
    verifyNoInteractions(clientEmailResolver);
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldFailWhenTheAuthoritativeEmailIsMissingOrInvalid() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("WDN", "00077881", "00");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00")).thenReturn(java.util.Optional.empty());

    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(
            1000456L,
            new ApplicationReviewStatusEmailRequestDto(
                "WDN", "attacker@example.test", "Withdrawn"));

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("No valid email address");
    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldPropagateAuthoritativeLookupOutagesWithoutStaging() {
    AuthoritativeApplicantStatusContext applicant =
        new AuthoritativeApplicantStatusContext("REJ", "00077881", "00");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(repository.findAuthoritativeApplicantStatusContext(1000456L))
        .thenReturn(java.util.Optional.of(applicant));
    when(clientEmailResolver.resolve("00077881", "00")).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.sendStatusEmail(
                    1000456L,
                    new ApplicationReviewStatusEmailRequestDto(
                        "REJ", "attacker@example.test", "Missing docs")))
        .isSameAs(failure);

    verify(repository, org.mockito.Mockito.never()).sendStatusEmail(any(), any(), any(), any());
    verifyNoInteractions(emailSender);
  }

  @Test
  void sendStatusEmailShouldRejectUnsupportedStatusesBeforeRepository() {
    ApplicationReviewStatusEmailRequestDto request =
        new ApplicationReviewStatusEmailRequestDto("EXP", "client@gov.bc.ca", null);

    ApplicationReviewStatusEmailResultDto result = service.sendStatusEmail(1000456L, request);

    assertThat(result.success()).isFalse();
    assertThat(result.message()).isEqualTo("Status email is only supported for rejected or withdrawn applications.");
    verifyNoInteractions(repository);
  }

  private ApplicationReviewSearchResultDto row(Long applicationNumber, LocalDate listingDate) {
    return new ApplicationReviewSearchResultDto(
        applicationNumber,
        80.3,
        "Hemlock / Lumber",
        listingDate,
        "Pending",
        "R2",
        true);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

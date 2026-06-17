package ca.bc.gov.mof.lexis.service.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository.ApplicationStatusUpdateRow;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository.ReviewRemarkRow;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationReviewOracleService")
class ApplicationReviewOracleServiceTest {

  @Mock private ApplicationReviewRepository repository;
  @InjectMocks private ApplicationReviewOracleService service;

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
    when(repository.approve(1000456L, "idir\\jsmith")).thenReturn(true);

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, "idir\\jsmith");

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    assertThat(result.statusCode()).isEqualTo("APP");
    verify(repository).approve(1000456L, "idir\\jsmith");
  }

  @Test
  void approveShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    when(repository.approve(1000456L, "system")).thenReturn(true);

    ApplicationReviewStatusUpdateResultDto result = service.approve(1000456L, null);

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    verify(repository).approve(1000456L, "system");
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
  void updateStatusShouldRequireRemarkForRejectedOrWithdrawnStatuses() {
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

    assertThat(rejectedResult.valid()).isFalse();
    assertThat(rejectedResult.updated()).isFalse();
    assertThat(rejectedResult.message())
        .isEqualTo("Remark is required when rejecting or withdrawing an application.");
    assertThat(withdrawnResult.valid()).isFalse();
    assertThat(withdrawnResult.updated()).isFalse();
    assertThat(withdrawnResult.message())
        .isEqualTo("Remark is required when rejecting or withdrawing an application.");
    verifyNoInteractions(repository);
  }

  @Test
  void updateStatusShouldNormalizeValuesBeforeRepositoryCall() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto(" REJ ", " Missing docs ", " client@gov.bc.ca ");
    Instant remarkDate = Instant.parse("2026-01-05T10:15:00Z");
    when(repository.updateStatusWithRemark(1000456L, "REJ", "Missing docs", "idir\\jsmith"))
        .thenReturn(
            new ApplicationStatusUpdateRow(
                true, new ReviewRemarkRow(99L, "Missing docs", "idir\\jsmith", remarkDate)));

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
    verify(repository).updateStatusWithRemark(1000456L, "REJ", "Missing docs", "idir\\jsmith");
  }

  @Test
  void updateStatusShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    ApplicationReviewStatusUpdateRequestDto request =
        new ApplicationReviewStatusUpdateRequestDto(" REJ ", " Missing docs ", " client@gov.bc.ca ");
    when(repository.updateStatusWithRemark(1000456L, "REJ", "Missing docs", "system"))
        .thenReturn(new ApplicationStatusUpdateRow(true, null));

    ApplicationReviewStatusUpdateResultDto result =
        service.updateStatus(1000456L, request, null);

    assertThat(result.valid()).isTrue();
    assertThat(result.updated()).isTrue();
    verify(repository).updateStatusWithRemark(1000456L, "REJ", "Missing docs", "system");
  }

  @Test
  void sendStatusEmailShouldShortCircuitWhenInputInvalid() {
    ApplicationReviewStatusEmailResultDto result =
        service.sendStatusEmail(1000456L, new ApplicationReviewStatusEmailRequestDto("REJ", " ", "Missing docs"));

    assertThat(result.success()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void sendStatusEmailShouldPassThroughRepositoryWhenInputValid() {
    ApplicationReviewStatusEmailRequestDto request =
        new ApplicationReviewStatusEmailRequestDto(" REJ ", " client@gov.bc.ca ", " Missing docs ");
    when(repository.sendStatusEmail(1000456L, "REJ", "client@gov.bc.ca", "Missing docs"))
        .thenReturn(true);

    ApplicationReviewStatusEmailResultDto result = service.sendStatusEmail(1000456L, request);

    assertThat(result.success()).isTrue();
    verify(repository).sendStatusEmail(1000456L, "REJ", "client@gov.bc.ca", "Missing docs");
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

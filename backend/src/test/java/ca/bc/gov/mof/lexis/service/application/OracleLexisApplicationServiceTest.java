package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.LexisApplicationRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository.CurrentScheduleRow;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleLexisApplicationService")
class OracleLexisApplicationServiceTest {

  @Mock private LexisApplicationRepository repository;
  @Mock private LexisReportScheduleRepository scheduleRepository;
  private OracleLexisApplicationService service;

  @BeforeEach
  void setUp() {
    service = new OracleLexisApplicationService(repository, scheduleRepository);
  }

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadExemptionTypeOptions()).thenReturn(List.of(new CodeNameDto("ALL", "All")));
    when(repository.loadExemptionReasonOptions()).thenReturn(List.of(new CodeNameDto("U", "Unadvertised")));
    when(repository.loadApplicationStatusOptions()).thenReturn(List.of(new CodeNameDto("APP", "Approved")));
    when(repository.loadProductTypeOptions()).thenReturn(List.of(new CodeNameDto("S", "Standing")));
    when(repository.loadGrowthTypeOptions()).thenReturn(List.of(new CodeNameDto("O", "Old Growth")));
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));
    when(scheduleRepository.findCurrentSchedulesRequired())
        .thenReturn(
            List.of(
                new CurrentScheduleRow(null, LocalDate.of(2026, 7, 4)),
                new CurrentScheduleRow(990L, null),
                new CurrentScheduleRow(987L, LocalDate.of(2026, 7, 29)),
                new CurrentScheduleRow(988L, LocalDate.of(2026, 8, 5))));
    when(scheduleRepository.findNextSchedulesRequired())
        .thenReturn(
            List.of(
                new CurrentScheduleRow(988L, LocalDate.of(2026, 8, 5)),
                new CurrentScheduleRow(989L, LocalDate.of(2026, 8, 12))));

    LexisApplicationSearchOptionsDto response = service.searchOptions();

    assertThat(response.exemptionTypes()).hasSize(1);
    assertThat(response.exemptionReasons()).hasSize(1);
    assertThat(response.applicationStatuses()).hasSize(1);
    assertThat(response.productTypes()).hasSize(1);
    assertThat(response.growthTypes()).hasSize(1);
    assertThat(response.regions()).hasSize(1);
    assertThat(response.currentSchedules())
        .containsExactly(
            new CodeNameDto("987", "2026-07-29"),
            new CodeNameDto("988", "2026-08-05"),
            new CodeNameDto("", "Blank"));
    assertThat(response.nextSchedules())
        .containsExactly(
            new CodeNameDto("988", "2026-08-05"),
            new CodeNameDto("989", "2026-08-12"),
            new CodeNameDto("", "Blank"));
  }

  @Test
  void searchShouldQueryRepositoryWhenRegionNotSelected() {
    LexisApplicationSearchCriteria criteria =
        new LexisApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 25);
    when(repository.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(page(List.of(row(1001L, LocalDate.of(2026, 2, 1))), 1));

    LexisApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(1001L);
    verify(repository).search(any(LexisApplicationSearchCriteria.class));
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    LexisApplicationSearchCriteria criteria =
        new LexisApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<LexisApplicationSearchResultDto> rows =
        List.of(
            row(1003L, LocalDate.of(2026, 2, 3)),
            row(1004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    LexisApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(1003L, 1004L);
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    LexisApplicationSearchCriteria criteria =
        new LexisApplicationSearchCriteria(
            " 1000456 ",
            " PKG-903 ",
            " EX-205 ",
            " ALL ",
            " APP ",
            " 00077881 ",
            " 00055667 ",
            " S ",
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 3, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            31916L,
            Arrays.asList(12L, null, 12L, -1L, 0L),
            false,
            " listingDate DESC ",
            -2,
            0);
    when(repository.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.applicationNumber()).isEqualTo("1000456");
    assertThat(normalized.packageNumber()).isEqualTo("PKG-903");
    assertThat(normalized.exemptionNumber()).isEqualTo("EX-205");
    assertThat(normalized.exemptionType()).isEqualTo("ALL");
    assertThat(normalized.applicationStatus()).isEqualTo("APP");
    assertThat(normalized.ownerClientNumber()).isEqualTo("00077881");
    assertThat(normalized.agentClientNumber()).isEqualTo("00055667");
    assertThat(normalized.productTypeCode()).isEqualTo("S");
    assertThat(normalized.exportScheduleId()).isEqualTo(31916L);
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("listingDate DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void detailShouldPassThroughRepository() {
    LexisApplicationDetailDto detail =
        new LexisApplicationDetailDto(
            1000456L,
            "EX-205",
            "APP",
            "Approved",
            "00077881",
            "00055667",
            12L,
            "R2",
            "S",
            "ER02",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 21),
            LocalDate.of(2026, 2, 26),
            null,
            120L,
            95.0,
            1.6,
            true,
            false,
            false,
            false,
            false,
            null,
            null,
            List.of(),
            List.of(),
            List.of());
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(detail));

    Optional<LexisApplicationDetailDto> response = service.findByApplicationNumber(1000456L);

    assertThat(response).contains(detail);
    verify(repository).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnEmptyForInvalidApplicationNumber() {
    assertThat(service.findByApplicationNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void detailShouldPropagateRepositoryFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findByApplicationNumber(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findByApplicationNumber(1000456L)).isSameAs(failure);
  }

  @Test
  void packageLookupShouldReturnEmptyWhenPackageNumberBlank() {
    assertThat(service.findPackageByPackageNumber("  ")).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void packageLookupShouldPassThroughRepositoryWhenPackageNumberValid() {
    LexisPackageLookupDto dto = new LexisPackageLookupDto("PKG-903", 1000456L, 95.0d, "S");
    when(repository.findPackageByPackageNumber("PKG-903")).thenReturn(Optional.of(dto));

    Optional<LexisPackageLookupDto> result = service.findPackageByPackageNumber(" PKG-903 ");

    assertThat(result).contains(dto);
    verify(repository).findPackageByPackageNumber("PKG-903");
  }

  @Test
  void verifyClientsShouldPassThroughRepositoryWhenInputIsValid() {
    when(repository.verifyApplicationClients(List.of(1000456L, 1000999L))).thenReturn(true);

    boolean result =
        service.verifyApplicationClients(
            Arrays.asList(1000456L, null, 0L, -1L, 1000999L, 1000456L));

    assertThat(result).isTrue();
    verify(repository).verifyApplicationClients(List.of(1000456L, 1000999L));
  }

  @Test
  void verifyClientsShouldShortCircuitWhenInputIsInvalid() {
    assertThat(service.verifyApplicationClients(null)).isFalse();
    assertThat(service.verifyApplicationClients(Arrays.asList(null, 0L, -1L))).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void hasValidOfferShouldPassThroughRepositoryWhenInputIsValid() {
    when(repository.hasValidOffer(List.of(1000456L, 1000999L))).thenReturn(true);

    boolean result =
        service.hasValidOffer(Arrays.asList(1000456L, null, 0L, -1L, 1000999L, 1000456L));

    assertThat(result).isTrue();
    verify(repository).hasValidOffer(List.of(1000456L, 1000999L));
  }

  @Test
  void hasValidOfferShouldShortCircuitWhenInputIsInvalid() {
    assertThat(service.hasValidOffer(null)).isFalse();
    assertThat(service.hasValidOffer(Arrays.asList(null, 0L, -1L))).isFalse();
    verifyNoInteractions(repository);
  }

  private LexisApplicationSearchResultDto row(long application, LocalDate listingDate) {
    return new LexisApplicationSearchResultDto(
        application,
        "Approved",
        "",
        "00077881",
        "",
        listingDate,
        "R2",
        95.0,
        false,
        false);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

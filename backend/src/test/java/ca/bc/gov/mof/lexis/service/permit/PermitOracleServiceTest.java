package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSummaryEnrichmentDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | PermitOracleService")
class PermitOracleServiceTest {

  @Mock private PermitRepository repository;
  @Mock private PermitRpcRepository permitRpcRepository;
  @InjectMocks private PermitOracleService service;

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadPermitStatusOptions()).thenReturn(List.of(new CodeNameDto("ISS", "Issued")));
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));

    PermitSearchOptionsDto response = service.searchOptions();

    assertThat(response.permitStatuses()).hasSize(1);
    assertThat(response.regions()).hasSize(1);
  }

  @Test
  void summaryEnrichmentShouldDelegateToRepository() {
    List<Long> permitNumbers = List.of(90001L, 90002L);
    Map<Long, PermitSummaryEnrichmentDto> expected =
        Map.of(90001L, new PermitSummaryEnrichmentDto("EX-1", 2L, "RCPT-1"));
    when(repository.findSummaryEnrichmentByPermitNumbers(permitNumbers)).thenReturn(expected);

    assertThat(service.findSummaryEnrichmentByPermitNumbers(permitNumbers)).isEqualTo(expected);

    verify(repository).findSummaryEnrichmentByPermitNumbers(permitNumbers);
  }

  @Test
  void searchShouldQueryRepositoryWhenRegionNotSelected() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(), null, 0, 25);
    when(repository.search(any(PermitSearchCriteria.class)))
        .thenReturn(page(List.of(row(90001L, LocalDate.of(2026, 2, 1))), 1));

    PermitSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(90001L);
    verify(repository).search(any(PermitSearchCriteria.class));
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<PermitSearchResultDto> rows =
        List.of(
            row(90003L, LocalDate.of(2026, 2, 3)),
            row(90004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(PermitSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    PermitSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(90003L, 90004L);
  }

  @Test
  void searchShouldPassKnownTotalToRepository() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(12L), null, 2, 30);
    when(repository.search(any(PermitSearchCriteria.class), eq(91)))
        .thenReturn(page(List.of(row(90005L, LocalDate.of(2026, 2, 5))), 91));

    PermitSearchResponseDto response = service.search(criteria, 91);

    assertThat(response.total()).isEqualTo(91);
    assertThat(response.page()).isEqualTo(2);
    assertThat(response.size()).isEqualTo(30);
    verify(repository).search(any(PermitSearchCriteria.class), eq(91));
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            " 1000456 ",
            " pkg-903 ",
            " 9000123 ",
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 3, 31),
            " ISS ",
            " SI-99881 ",
            " 00055667 ",
            " 00077881 ",
            " 00012345 ",
            false,
            Arrays.asList(12L, null, 12L, -1L, 0L),
            " permitNumber DESC ",
            -2,
            0);
    when(repository.search(any(PermitSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    PermitSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.applicationNumber()).isEqualTo("1000456");
    assertThat(normalized.packageNumber()).isEqualTo("pkg-903");
    assertThat(normalized.permitNumber()).isEqualTo("9000123");
    assertThat(normalized.permitStatus()).isEqualTo("ISS");
    assertThat(normalized.invoiceNumber()).isEqualTo("SI-99881");
    assertThat(normalized.applicantClientNumber()).isEqualTo("00055667");
    assertThat(normalized.ownerClientNumber()).isEqualTo("00077881");
    assertThat(normalized.accessClientNumber()).isEqualTo("00012345");
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("permitNumber DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void countShouldPreserveNormalizedScopedAccessCriterion() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            " 00012345 ",
            false,
            List.of(),
            null,
            0,
            1);
    when(repository.count(any(PermitSearchCriteria.class))).thenReturn(5);

    int result = service.count(criteria);

    assertThat(result).isEqualTo(5);
    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(repository).count(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().applicantClientNumber()).isNull();
    assertThat(criteriaCaptor.getValue().ownerClientNumber()).isNull();
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00012345");
  }

  @Test
  void detailShouldPassThroughRepository() {
    PermitDetailDto dto =
        new PermitDetailDto(
            9000123L,
            1000456L,
            "PKG-903",
            "EX-205",
            "ISS",
            "Issued",
            "00055667",
            "01",
            "00077881",
            "03",
            "Example Dest Co",
            "US",
            "SEA",
            "MV Example",
            "VAN",
            null,
            LocalDate.of(2026, 3, 10),
            LocalDate.of(2026, 4, 10),
            LocalDate.of(2026, 3, 2),
            LocalDate.of(2026, 3, 15),
            80.0,
            1450L,
            "RC-12345",
            "FED-1122",
            "SI-99881",
            "Permit remarks",
            null,
            "R2");
    when(repository.findByPermitNumber(9000123L)).thenReturn(Optional.of(dto));

    Optional<PermitDetailDto> result = service.findByPermitNumber(9000123L);

    assertThat(result).contains(dto);
    verify(repository).findByPermitNumber(9000123L);
  }

  @Test
  void permitAccessShouldUseNarrowRepositoryLookup() {
    PermitAccessDto access =
        new PermitAccessDto(9000123L, "00055667", "00077881", 1904L);
    when(repository.findAccessByPermitNumber(9000123L)).thenReturn(Optional.of(access));

    Optional<PermitAccessDto> result = service.findAccessByPermitNumber(9000123L);

    assertThat(result).contains(access);
    verify(repository).findAccessByPermitNumber(9000123L);
  }

  @Test
  void permitAccessShouldReturnEmptyForInvalidPermitNumber() {
    assertThat(service.findAccessByPermitNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void detailShouldReturnEmptyForInvalidPermitNumber() {
    assertThat(service.findByPermitNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void detailShouldPropagateRepositoryFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findByPermitNumber(9000123L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findByPermitNumber(9000123L)).isSameAs(failure);
  }

  @Test
  void linkedApplicationsShouldUseRequiredPackagesByPermitLookup() {
    when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(9000123L))
        .thenReturn(List.of(1000456L, 1000457L));

    List<Long> result = service.findLinkedApplicationNumbers(9000123L);

    assertThat(result).containsExactly(1000456L, 1000457L);
    verify(permitRpcRepository).findApplicationNumbersByPermitNumberRequired(9000123L);
  }

  @Test
  void linkedClientAccessShouldUseSingleRepositoryPredicate() {
    when(
            permitRpcRepository.hasLinkedProvincialApplicationForClient(
                9000123L, "00012345"))
        .thenReturn(true);

    assertThat(
            service.hasLinkedProvincialApplicationForClient(
                9000123L, "00012345"))
        .isTrue();

    verify(permitRpcRepository)
        .hasLinkedProvincialApplicationForClient(9000123L, "00012345");
  }

  @Test
  void linkedApplicationLookupShouldPropagateOracleFailure() {
    when(permitRpcRepository.findApplicationNumbersByPermitNumberRequired(9000123L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> service.findLinkedApplicationNumbers(9000123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private PermitSearchResultDto row(Long permitNumber, LocalDate issueDate) {
    return new PermitSearchResultDto(
        permitNumber,
        "Issued",
        "00055667",
        "00077881",
        80.0,
        issueDate,
        "R2");
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

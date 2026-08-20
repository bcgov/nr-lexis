package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import java.time.LocalDate;
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

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ExemptionOracleService")
class ExemptionOracleServiceTest {

  @Mock private ExemptionRepository repository;

  @InjectMocks private ExemptionOracleService service;

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadExemptionTypeOptions()).thenReturn(List.of(new CodeNameDto("M", "Ministerial")));
    when(repository.loadExemptionStatusOptions()).thenReturn(List.of(new CodeNameDto("N", "New")));
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));

    ExemptionSearchOptionsDto response = service.searchOptions();

    assertThat(response.exemptionTypes()).hasSize(1);
    assertThat(response.exemptionStatuses()).hasSize(1);
    assertThat(response.regions()).hasSize(1);
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, List.of(11L), 1, 2);

    List<ExemptionSearchResultDto> rows =
        List.of(
            row("EX-003", LocalDate.of(2026, 1, 3)),
            row("EX-004", LocalDate.of(2026, 1, 4)));

    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    ExemptionSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(ExemptionSearchResultDto::exemptionNumber)
        .containsExactly("EX-003", "EX-004");
    verify(repository).search(any(ExemptionSearchCriteria.class));
  }

  @Test
  void detailShouldPassThroughRepository() {
    ExemptionDetailDto dto =
        new ExemptionDetailDto(
            "EX-205",
            "M",
            "Ministerial",
            "N",
            "New",
            "00077881",
            "00055667",
            1000456L,
            "In Review",
            LocalDate.of(2026, 3, 12),
            LocalDate.of(2027, 3, 12),
            95.0,
            12.0,
            83.0,
            "Pending final confirmation",
            false,
            List.of("P-88009"),
            List.of());

    when(repository.findByExemptionNumber("EX-205")).thenReturn(Optional.of(dto));

    Optional<ExemptionDetailDto> result = service.findByExemptionNumber("EX-205");

    assertThat(result).contains(dto);
    verify(repository).findByExemptionNumber("EX-205");
  }

  @Test
  void summaryLookupsShouldPassThroughRepository() {
    Map<String, ExemptionSummaryLookupDto> expected =
        Map.of(
            "EX-205",
            new ExemptionSummaryLookupDto("EX-205", "Ministerial", "Approved"));
    when(repository.findSummaryLookups(List.of("EX-205"))).thenReturn(expected);

    assertThat(service.findSummaryLookups(List.of("EX-205"))).isEqualTo(expected);

    verify(repository).findSummaryLookups(List.of("EX-205"));
  }

  @Test
  void detailShouldResolveLegacyCursorTypeCodeWithAuthoritativeDescription() {
    ExemptionDetailDto dto =
        new ExemptionDetailDto(
            "26-8758",
            "M",
            null,
            "ACT",
            "Active",
            "00077881",
            "00055667",
            1000456L,
            "Approved",
            LocalDate.of(2026, 3, 12),
            LocalDate.of(2027, 3, 12),
            95.0,
            12.0,
            83.0,
            "Pending final confirmation",
            false,
            List.of("9020934"),
            List.of(),
            "IDIR\\EDITOR");

    when(repository.findByExemptionNumber("26-8758")).thenReturn(Optional.of(dto));
    when(repository.loadExemptionTypeOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("B", "Blanket OIC"),
                new CodeNameDto("M", "Ministerial")));

    Optional<ExemptionDetailDto> result = service.findByExemptionNumber("26-8758");

    assertThat(result)
        .get()
        .extracting(ExemptionDetailDto::exemptionTypeDescription)
        .isEqualTo("Ministerial");
    assertThat(result).get().extracting(ExemptionDetailDto::author).isEqualTo("IDIR\\EDITOR");
    verify(repository).loadExemptionTypeOptions();
  }

  @Test
  void accessLookupShouldPassThroughRepository() {
    ExemptionAccessDto access =
        new ExemptionAccessDto("BO-001", "B", "ACT", true);
    when(repository.findAccessByExemptionNumber("BO-001"))
        .thenReturn(Optional.of(access));

    assertThat(service.findAccessByExemptionNumber("BO-001")).contains(access);
    verify(repository).findAccessByExemptionNumber("BO-001");
  }

  @Test
  void linkedClientAccessShouldPassThroughRepository() {
    when(
            repository.hasLinkedProvincialApplicationForClient(
                "EX-205", "00012345"))
        .thenReturn(true);

    assertThat(
            service.hasLinkedProvincialApplicationForClient(
                "EX-205", "00012345"))
        .isTrue();
    verify(repository)
        .hasLinkedProvincialApplicationForClient("EX-205", "00012345");
  }

  @Test
  void detailShouldPropagateRepositoryFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findByExemptionNumber("EX-205")).thenThrow(failure);

    assertThatThrownBy(() -> service.findByExemptionNumber("EX-205")).isSameAs(failure);
  }

  @Test
  void searchShouldQueryRepositoryWhenRegionNotSelected() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, List.of(), 0, 25);
    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(List.of(row("EX-001", LocalDate.of(2026, 1, 1))), 1));

    ExemptionSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).extracting(ExemptionSearchResultDto::exemptionNumber)
        .containsExactly("EX-001");
    verify(repository).search(any(ExemptionSearchCriteria.class));
  }

  @Test
  void searchShouldPreserveBlanketOicExclusionDuringNormalization() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
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
            List.of(76L),
            false,
            true,
            0,
            25);
    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().excludeBlanketOic()).isTrue();
  }

  @Test
  void searchShouldDefaultToMinisterialWhenSearchingByApplicantOrOwner() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            " 00055667 ",
            null,
            null,
            null,
            null,
            null,
            List.of(12L),
            0,
            25);

    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    ExemptionSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.exemptionType()).isEqualTo("M");
    assertThat(normalized.applicantClientNumber()).isEqualTo("00055667");
  }

  @Test
  void broadClientScopeShouldPreserveAllNonOicExemptionTypes() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            " 00055667 ",
            null,
            null,
            null,
            null,
            null,
            List.of(),
            false,
            false,
            true,
            null,
            0,
            25);
    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    ExemptionSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.exemptionType()).isNull();
    assertThat(normalized.broadClientMatch()).isTrue();
  }

  @Test
  void searchShouldNotOverrideExplicitExemptionType() {
    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            "O",
            null,
            null,
            "00077881",
            null,
            null,
            null,
            null,
            List.of(12L),
            0,
            25);

    when(repository.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    ExemptionSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.exemptionType()).isEqualTo("O");
  }

  private ExemptionSearchResultDto row(String exemptionNumber, LocalDate approvalDate) {
    return new ExemptionSearchResultDto(
        exemptionNumber,
        "Ministerial",
        "New",
        "00054321",
        "00012345",
        1000123L,
        approvalDate,
        LocalDate.of(2026, 1, 10),
        LocalDate.of(2027, 1, 10),
        "R1",
        50.0,
        42.0,
        false);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

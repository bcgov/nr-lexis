package ca.bc.gov.mof.lexis.service.reserve;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | IndianReservePermitOracleService")
class IndianReservePermitOracleServiceTest {

  @Mock private IndianReservePermitRepository repository;
  @InjectMocks private IndianReservePermitOracleService service;

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadApplicationStatusOptions()).thenReturn(List.of(new CodeNameDto("APR", "Approved")));
    when(repository.loadExemptionTypeOptions()).thenReturn(List.of(new CodeNameDto("O", "Order in Council")));

    IndianReservePermitSearchOptionsDto response = service.searchOptions();

    assertThat(response.applicationStatuses()).hasSize(1);
    assertThat(response.exemptionTypes()).hasSize(1);
  }

  @Test
  void searchShouldReturnPagedSliceFromRepository() {
    IndianReservePermitSearchCriteria criteria =
        new IndianReservePermitSearchCriteria(null, null, null, null, null, null, 1, 2);
    List<IndianReservePermitSearchResultDto> rows =
        List.of(
            row("IR-10001", LocalDate.of(2026, 3, 1)),
            row("IR-10002", LocalDate.of(2026, 3, 2)),
            row("IR-10003", LocalDate.of(2026, 3, 3)),
            row("IR-10004", LocalDate.of(2026, 3, 4)));
    when(repository.search(any(IndianReservePermitSearchCriteria.class))).thenReturn(rows);

    IndianReservePermitSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(IndianReservePermitSearchResultDto::permitNumber)
        .containsExactly("IR-10003", "IR-10004");
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    IndianReservePermitSearchCriteria criteria =
        new IndianReservePermitSearchCriteria(
            " IR-123 ",
            " PKG-904 ",
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 3, 31),
            LocalDate.of(2026, 3, 10),
            LocalDate.of(2026, 3, 20),
            -2,
            0);
    when(repository.search(any(IndianReservePermitSearchCriteria.class))).thenReturn(List.of());

    service.search(criteria);

    ArgumentCaptor<IndianReservePermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(IndianReservePermitSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    IndianReservePermitSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.permitNumber()).isEqualTo("IR-123");
    assertThat(normalized.packageNumber()).isEqualTo("PKG-904");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void detailShouldPassThroughRepository() {
    IndianReservePermitDetailDto dto =
        new IndianReservePermitDetailDto(
            "IR-123",
            "00077881",
            "00",
            12L,
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 3, 2),
            LocalDate.of(2026, 3, 15),
            "US",
            "SEA",
            "MV Reserve",
            "VAN",
            null,
            List.of("PKG-904"));
    when(repository.findByPermitNumber("IR-123")).thenReturn(Optional.of(dto));

    Optional<IndianReservePermitDetailDto> result = service.findByPermitNumber("IR-123");

    assertThat(result).contains(dto);
    verify(repository).findByPermitNumber("IR-123");
  }

  @Test
  void detailShouldReturnEmptyForBlankPermitNumber() {
    assertThat(service.findByPermitNumber("   ")).isEmpty();
    verifyNoInteractions(repository);
  }

  private IndianReservePermitSearchResultDto row(String permitNumber, LocalDate issueDate) {
    return new IndianReservePermitSearchResultDto(
        permitNumber,
        "00077881",
        issueDate,
        issueDate.plusDays(10));
  }
}

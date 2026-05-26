package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRepository;
import java.time.LocalDate;
import java.util.Arrays;
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
@DisplayName("Unit Test | PermitOracleService")
class PermitOracleServiceTest {

  @Mock private PermitRepository repository;
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
  void searchShouldReturnEmptyWhenRegionNotSelected() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(), null, 0, 25);

    PermitSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isZero();
    assertThat(response.results()).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void searchShouldReturnPagedSliceFromRepository() {
    PermitSearchCriteria criteria =
        new PermitSearchCriteria(
            null, null, null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<PermitSearchResultDto> rows =
        List.of(
            row(90001L, LocalDate.of(2026, 2, 1)),
            row(90002L, LocalDate.of(2026, 2, 2)),
            row(90003L, LocalDate.of(2026, 2, 3)),
            row(90004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(PermitSearchCriteria.class))).thenReturn(rows);

    PermitSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(PermitSearchResultDto::permitNumber)
        .containsExactly(90003L, 90004L);
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
            Arrays.asList(12L, null, 12L, -1L, 0L),
            " permitNumber DESC ",
            -2,
            0);
    when(repository.search(any(PermitSearchCriteria.class))).thenReturn(List.of());

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
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("permitNumber DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
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
            "00077881",
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
            "R2");
    when(repository.findByPermitNumber(9000123L)).thenReturn(Optional.of(dto));

    Optional<PermitDetailDto> result = service.findByPermitNumber(9000123L);

    assertThat(result).contains(dto);
    verify(repository).findByPermitNumber(9000123L);
  }

  @Test
  void detailShouldReturnEmptyForInvalidPermitNumber() {
    assertThat(service.findByPermitNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
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
}

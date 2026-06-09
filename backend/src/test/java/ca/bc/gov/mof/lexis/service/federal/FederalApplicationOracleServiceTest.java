package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
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
@DisplayName("Unit Test | FederalApplicationOracleService")
class FederalApplicationOracleServiceTest {

  @Mock private FederalApplicationRepository repository;
  @InjectMocks private FederalApplicationOracleService service;

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadApplicationStatusOptions()).thenReturn(List.of(new CodeNameDto("APR", "Approved")));
    when(repository.loadFederalExemptionTypeOptions()).thenReturn(List.of(new CodeNameDto("F", "Federal")));

    FederalApplicationSearchOptionsDto response = service.searchOptions();

    assertThat(response.applicationStatuses()).hasSize(1);
    assertThat(response.exemptionTypes()).hasSize(1);
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 1, 2);
    List<FederalApplicationSearchResultDto> rows =
        List.of(
            row(10003L, "FED-10003"),
            row(10004L, "FED-10004"));
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    FederalApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(FederalApplicationSearchResultDto::applicationNumber)
        .containsExactly(10003L, 10004L);
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            " FED-1000456 ",
            " PKG-901 ",
            " EX-300 ",
            " APR ",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 3, 10),
            LocalDate.of(2026, 2, 26),
            LocalDate.of(2026, 3, 12),
            " 00077881 ",
            " 00055667 ",
            -3,
            0);
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<FederalApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    FederalApplicationSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.federalApplicationNumber()).isEqualTo("FED-1000456");
    assertThat(normalized.packageNumber()).isEqualTo("PKG-901");
    assertThat(normalized.exemptionNumber()).isEqualTo("EX-300");
    assertThat(normalized.applicationStatus()).isEqualTo("APR");
    assertThat(normalized.ownerClientNumber()).isEqualTo("00077881");
    assertThat(normalized.agentClientNumber()).isEqualTo("00055667");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void detailShouldPassThroughRepository() {
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            "00055667",
            "00",
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of("PKG-901"),
            List.of("Reviewed"),
            List.of("OF-800"),
            null);
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));

    Optional<FederalApplicationDetailDto> result = service.findByApplicationNumber(1000456L);

    assertThat(result).contains(dto);
    verify(repository).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnEmptyForInvalidApplicationNumber() {
    assertThat(service.findByApplicationNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void permitShouldPassThroughRepository() {
    FederalApplicationPermitDto dto =
        new FederalApplicationPermitDto(
            99123L,
            LocalDate.of(2026, 3, 12),
            "US",
            "SEA",
            "MV Federal",
            LocalDate.of(2026, 3, 15),
            "VAN",
            null);
    when(repository.findPermitByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));

    Optional<FederalApplicationPermitDto> result = service.findPermitByApplicationNumber(1000456L);

    assertThat(result).contains(dto);
    verify(repository).findPermitByApplicationNumber(1000456L);
  }

  @Test
  void verifyClientsShouldPassThroughRepositoryWhenInputIsValid() {
    when(repository.verifyApplicationClients(List.of(1000456L, 1000999L))).thenReturn(true);

    boolean result = service.verifyApplicationClients(List.of(1000456L, 1000999L));

    assertThat(result).isTrue();
    verify(repository).verifyApplicationClients(List.of(1000456L, 1000999L));
  }

  @Test
  void verifyClientsShouldShortCircuitWhenInputIsInvalid() {
    boolean result = service.verifyApplicationClients(Arrays.asList(null, 0L, -1L));

    assertThat(result).isFalse();
    verifyNoInteractions(repository);
  }

  private FederalApplicationSearchResultDto row(Long applicationNumber, String federalApplicationNumber) {
    return new FederalApplicationSearchResultDto(
        applicationNumber,
        federalApplicationNumber,
        "Approved",
        "00077881",
        "Federal reason",
        "Federal",
        "EX-300",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 26),
        true);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

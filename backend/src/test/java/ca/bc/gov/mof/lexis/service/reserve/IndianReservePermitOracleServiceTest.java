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
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository.ReservePermitInsertRecord;
import ca.bc.gov.mof.lexis.repository.reserve.IndianReservePermitRepository.ReservePermitInsertRow;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

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
  void searchShouldReturnRepositoryPage() {
    IndianReservePermitSearchCriteria criteria =
        new IndianReservePermitSearchCriteria(null, null, null, null, null, null, 1, 2);
    List<IndianReservePermitSearchResultDto> rows =
        List.of(
            row("IR-10003", LocalDate.of(2026, 3, 3)),
            row("IR-10004", LocalDate.of(2026, 3, 4)));
    when(repository.search(any(IndianReservePermitSearchCriteria.class)))
        .thenReturn(page(rows, 4));

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
    when(repository.search(any(IndianReservePermitSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

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

  @Test
  void addPermitShouldPersistReservePermitRow() {
    when(repository.insertReservePermit(any(ReservePermitInsertRecord.class), org.mockito.Mockito.eq("idir\\jsmith")))
        .thenReturn(Optional.of(new ReservePermitInsertRow("900")));

    PermitMutationRpcResponseDto response =
        service.addPermit(
            new IndianReservePermitService.CreatePermitRequest(
                "111",
                "PKG-1",
                "00012345",
                "00",
                "1833",
                "2026-04-04",
                "2026-04-05",
                "2026-04-06",
                "CA",
                "TRK",
                "Truck",
                "VAN",
                "Other port",
                "Ready"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.permitNumber()).isEqualTo(900L);

    ArgumentCaptor<ReservePermitInsertRecord> rowCaptor =
        ArgumentCaptor.forClass(ReservePermitInsertRecord.class);
    verify(repository).insertReservePermit(rowCaptor.capture(), org.mockito.Mockito.eq("idir\\jsmith"));
    ReservePermitInsertRecord row = rowCaptor.getValue();
    assertThat(row.permitNumber()).isEqualTo("111");
    assertThat(row.applicationDate()).isEqualTo(LocalDate.of(2026, 4, 4));
    assertThat(row.permitIssueDate()).isEqualTo(LocalDate.of(2026, 4, 5));
    assertThat(row.estimatedShippingDate()).isEqualTo(LocalDate.of(2026, 4, 6));
    assertThat(row.clientNumber()).isEqualTo("00012345");
    assertThat(row.clientLocation()).isEqualTo("00");
    assertThat(row.regionNumber()).isEqualTo(1833L);
    assertThat(row.transportTypeCode()).isEqualTo("TRK");
    assertThat(row.transportName()).isEqualTo("Truck");
    assertThat(row.portOfExport()).isEqualTo("VAN");
    assertThat(row.otherPortOfExport()).isEqualTo("Other port");
    assertThat(row.destinationCountry()).isEqualTo("CA");
  }

  @Test
  void addPermitShouldRejectInvalidDateBeforeRepositoryCall() {
    PermitMutationRpcResponseDto response =
        service.addPermit(
            new IndianReservePermitService.CreatePermitRequest(
                "111",
                "PKG-1",
                "00012345",
                "00",
                "1833",
                "bad-date",
                "2026-04-05",
                "2026-04-06",
                "CA",
                "TRK",
                "Truck",
                "VAN",
                "",
                "Ready"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("A valid application date is required.");
    verify(repository, org.mockito.Mockito.never()).insertReservePermit(any(), any());
  }

  @Test
  void addPermitShouldRejectMissingRegionBeforeRepositoryCall() {
    PermitMutationRpcResponseDto response =
        service.addPermit(
            new IndianReservePermitService.CreatePermitRequest(
                "111",
                "PKG-1",
                "00012345",
                "00",
                "",
                "2026-04-04",
                "2026-04-05",
                "2026-04-06",
                "CA",
                "TRK",
                "Truck",
                "VAN",
                "",
                "Ready"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("A valid region is required.");
    verify(repository, org.mockito.Mockito.never()).insertReservePermit(any(), any());
  }

  private IndianReservePermitSearchResultDto row(String permitNumber, LocalDate issueDate) {
    return new IndianReservePermitSearchResultDto(
        permitNumber,
        "00077881",
        issueDate,
        issueDate.plusDays(10));
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

package ca.bc.gov.mof.lexis.service.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
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
@DisplayName("Unit Test | PurchaseOfferOracleService")
class PurchaseOfferOracleServiceTest {

  @Mock private PurchaseOfferRepository repository;
  @InjectMocks private PurchaseOfferOracleService service;

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));

    PurchaseOfferSearchOptionsDto response = service.searchOptions();

    assertThat(response.regions()).hasSize(1);
  }

  @Test
  void searchShouldReturnEmptyWhenRegionNotSelected() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(), null, 0, 25);

    PurchaseOfferSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isZero();
    assertThat(response.results()).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void searchShouldReturnPagedSliceFromRepository() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<PurchaseOfferSearchResultDto> rows =
        List.of(
            row(81001L, LocalDate.of(2026, 2, 1)),
            row(81002L, LocalDate.of(2026, 2, 2)),
            row(81003L, LocalDate.of(2026, 2, 3)),
            row(81004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(PurchaseOfferSearchCriteria.class))).thenReturn(rows);

    PurchaseOfferSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(81003L, 81004L);
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            " 1000456 ",
            " pkg-903 ",
            null,
            null,
            null,
            null,
            " 00077881 ",
            Arrays.asList(12L, null, 12L, -1L, 0L),
            " offerNumber DESC ",
            -3,
            0);
    when(repository.search(any(PurchaseOfferSearchCriteria.class))).thenReturn(List.of());

    service.search(criteria);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    PurchaseOfferSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.applicationNumber()).isEqualTo("1000456");
    assertThat(normalized.packageNumber()).isEqualTo("pkg-903");
    assertThat(normalized.clientNumber()).isEqualTo("00077881");
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("offerNumber DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void detailShouldPassThroughRepository() {
    PurchaseOfferDetailDto dto =
        new PurchaseOfferDetailDto(
            81009L,
            1000456L,
            "PKG-903",
            "Example Lumber",
            "Alex Example",
            12500.25,
            LocalDate.of(2026, 3, 2),
            null,
            LocalDate.of(2026, 3, 18),
            "N",
            "Y",
            "N",
            "Initial offer",
            null,
            "P",
            "Mill details",
            "00077881",
            "Port Moody",
            "Condition notes",
            LocalDate.of(2026, 2, 26),
            LocalDate.of(2026, 3, 19),
            90.0,
            "R2");
    when(repository.findByOfferNumber(81009L)).thenReturn(Optional.of(dto));

    Optional<PurchaseOfferDetailDto> result = service.findByOfferNumber(81009L);

    assertThat(result).contains(dto);
    verify(repository).findByOfferNumber(81009L);
  }

  @Test
  void detailShouldReturnEmptyForInvalidOfferNumber() {
    assertThat(service.findByOfferNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  private PurchaseOfferSearchResultDto row(Long offerNumber, LocalDate listingDate) {
    return new PurchaseOfferSearchResultDto(
        offerNumber,
        1000456L,
        "PKG-903",
        listingDate,
        "R2",
        LocalDate.of(2026, 3, 15));
  }
}

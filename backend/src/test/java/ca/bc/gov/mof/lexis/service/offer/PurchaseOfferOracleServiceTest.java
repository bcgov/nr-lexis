package ca.bc.gov.mof.lexis.service.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
import java.time.Instant;
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
  void searchShouldQueryRepositoryWhenRegionNotSelected() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(), null, 0, 25);
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(List.of(row(81001L, LocalDate.of(2026, 2, 1))), 1));

    PurchaseOfferSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(81001L);
    verify(repository).search(any(PurchaseOfferSearchCriteria.class));
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<PurchaseOfferSearchResultDto> rows =
        List.of(
            row(81003L, LocalDate.of(2026, 2, 3)),
            row(81004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(rows, 4));

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
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

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
            null,
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

  @Test
  void addOfferShouldReturnValidationErrorsBeforeOracleInsert() {
    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                null, null, null, null, null, 0.0d, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "A valid application number is required.",
            "A valid company name is required.",
            "A valid contact name is required.",
            "The purchase offer amount must be greater than 0",
            "A valid purchase offer date is required.",
            "A valid pickup location is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addOfferShouldInsertWhenRequestIsValid() {
    when(repository.applicationExists(1000456L)).thenReturn(true);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                "No Packages",
                " Example Lumber ",
                " Alex Example ",
                12500.25d,
                LocalDate.of(2026, 3, 2),
                null,
                LocalDate.of(2026, 3, 18),
                null,
                null,
                " Initial offer ",
                null,
                null,
                null,
                null,
                " 00077881 ",
                " Port Moody ",
                " Condition notes ",
                99.99d),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The purchase offer was saved successfully.");
    assertThat(response.applicationNumber()).isEqualTo(1000456L);
    assertThat(response.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(response.sendEmail()).isTrue();
    assertThat(response.update()).isFalse();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferInsertRecord.class);
    verify(repository).insertOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferInsertRecord record = recordCaptor.getValue();
    assertThat(record.packageNumber()).isNull();
    assertThat(record.companyName()).isEqualTo("Example Lumber");
    assertThat(record.contactName()).isEqualTo("Alex Example");
    assertThat(record.fairOfferIndicator()).isEqualTo("N");
    assertThat(record.validOfferIndicator()).isEqualTo("Y");
    assertThat(record.approvalIndicator()).isEqualTo("N");
    assertThat(record.exportJurisdictionCode()).isEqualTo("P");
    assertThat(record.manufacturingFacilityInfo()).isEqualTo(" ");
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.applicationNumber()).isEqualTo(1000456L);
    assertThat(record.offerVolume()).isEqualTo(99.9d);
  }

  @Test
  void addOfferShouldRejectMissingApplicationBeforeOracleInsert() {
    when(repository.applicationExists(2L)).thenReturn(false);

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(2L, null), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Application 2 does not exist.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldRejectUnknownPackageBeforeOracleInsert() {
    when(repository.applicationExists(1000456L)).thenReturn(true);
    when(repository.findPackageApplicationNumber("PKG-404")).thenReturn(Optional.empty());

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-404"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Package PKG-404 does not exist.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldRejectPackageForDifferentApplicationBeforeOracleInsert() {
    when(repository.applicationExists(1000456L)).thenReturn(true);
    when(repository.findPackageApplicationNumber("PKG-903")).thenReturn(Optional.of(1000457L));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-903"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Package PKG-903 does not belong to application 1000456.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldDefaultEntryUserWhenPrincipalIsMissing() {
    when(repository.applicationExists(1000456L)).thenReturn(true);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                "No Packages",
                "Example Lumber",
                "Alex Example",
                12500.25d,
                LocalDate.of(2026, 3, 2),
                null,
                LocalDate.of(2026, 3, 18),
                null,
                null,
                "Initial offer",
                null,
                null,
                null,
                null,
                "00077881",
                "Port Moody",
                "Condition notes",
                99.99d),
            null);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferInsertRecord.class);
    verify(repository).insertOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("system");
  }

  @Test
  void updateOfferShouldRejectMissingOfferNumberBeforeOracleLookup() {
    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.update()).isTrue();
    assertThat(response.errors()).containsExactly("A valid purchase offer number is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void updateOfferShouldPreserveExistingValuesAndCallOracleUpdate() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Alex Example",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                13000.0d,
                LocalDate.of(2026, 3, 3),
                LocalDate.of(2026, 3, 19),
                null,
                null,
                null,
                null,
                null,
                "Withdrawn by buyer",
                null,
                null,
                null,
                " Campbell River ",
                null,
                99.99d),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.update()).isTrue();
    assertThat(response.sendEmail()).isTrue();
    assertThat(response.exportPurchaseOfferNumber()).isEqualTo(81001L);

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferUpdateRecord record = recordCaptor.getValue();
    assertThat(record.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(record.companyName()).isEqualTo("Example Lumber");
    assertThat(record.contactName()).isEqualTo("Alex Example");
    assertThat(record.purchaseOfferAmount()).isEqualTo(13000.0d);
    assertThat(record.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 3));
    assertThat(record.offerWithdrawalDate()).isEqualTo(LocalDate.of(2026, 3, 19));
    assertThat(record.fairOfferIndicator()).isEqualTo("Y");
    assertThat(record.validOfferIndicator()).isEqualTo("Y");
    assertThat(record.approvalIndicator()).isEqualTo("Y");
    assertThat(record.exportJurisdictionCode()).isEqualTo("P");
    assertThat(record.manufacturingFacilityInfo()).isEqualTo("Existing mill");
    assertThat(record.pickupLocation()).isEqualTo("Campbell River");
    assertThat(record.offerCondition()).isEqualTo("Existing condition");
    assertThat(record.entryUserId()).isEqualTo("creator");
    assertThat(record.entryTimestamp()).isEqualTo(entryTimestamp);
    assertThat(record.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.offerVolume()).isEqualTo(99.9d);
  }

  @Test
  void updateOfferShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Alex Example",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                13000.0d,
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
                "Campbell River",
                null,
                99.99d),
            null);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("creator");
    assertThat(recordCaptor.getValue().updateUserId()).isEqualTo("system");
  }

  @Test
  void updateOfferShouldDefaultMissingManufacturingFacilityBeforeOracleUpdate() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Alex Example",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    null,
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
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
                null,
                null,
                "   ",
                null,
                null,
                null,
                null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().manufacturingFacilityInfo()).isEqualTo(" ");
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

  private PurchaseOfferService.CreateOfferRequest validCreateRequest(
      Long applicationNumber, String packageNumber) {
    return new PurchaseOfferService.CreateOfferRequest(
        applicationNumber,
        null,
        packageNumber,
        "Example Lumber",
        "Alex Example",
        12500.25d,
        LocalDate.of(2026, 3, 2),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "00077881",
        "Port Moody",
        null,
        null);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }
}

package ca.bc.gov.mof.lexis.service.summary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
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
@DisplayName("Unit Test | OracleLexisSummaryService")
class OracleLexisSummaryServiceTest {

  @Mock private LexisApplicationService applicationService;
  @Mock private PurchaseOfferService offerService;
  @Mock private ExemptionService exemptionService;
  @Mock private PermitService permitService;

  @InjectMocks private OracleLexisSummaryService service;

  @Test
  void applicationsShouldReturnEmptyWhenClientScopeMissing() {
    SummaryApplicationsResponseDto response = service.applications(" ", 1, 15, null);

    assertThat(response.results()).isEmpty();
    assertThat(response.total()).isZero();
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(15);
  }

  @Test
  void applicationsShouldBuildScopedCriteriaAndMapLegacyFields() {
    when(applicationService.searchOptions())
        .thenReturn(
            new LexisApplicationSearchOptionsDto(
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(new CodeNameDto("12", "Coast"), new CodeNameDto("24", "Skeena")),
                List.of()));

    when(applicationService.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(
            new LexisApplicationSearchResponseDto(
                List.of(
                    new LexisApplicationSearchResultDto(
                        1000456L,
                        "In Review",
                        "00055667",
                        "00077881",
                        "EX-205",
                        LocalDate.of(2026, 2, 26),
                        "R2",
                        95.0,
                        false,
                        false)),
                1,
                0,
                10));

    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                new LexisApplicationDetailDto(
                    1000456L,
                    "EX-205",
                    "REV",
                    "In Review",
                    "00077881",
                    "00055667",
                    12L,
                    "Coast",
                    "LUM",
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
                    List.of(new LexisApplicationDetailDto.LexisPackageDto("PKG-903", 95.0, 28)),
                    List.of(),
                    List.of())));

    SummaryApplicationsResponseDto response = service.applications("00077881", 0, 10, null);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(applicationService).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.agentClientNumber()).isEqualTo("00077881");
    assertThat(criteria.regionNumbers()).containsExactly(12L, 24L);
    assertThat(criteria.sortField()).isEqualTo("applicationNumber DESC");

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).application()).isEqualTo(1000456L);
    assertThat(response.results().get(0).reason()).isEqualTo("ER02");
    assertThat(response.results().get(0).exemptionType()).isEqualTo("LUM");
    assertThat(response.results().get(0).packageNumberAry()).containsExactly("PKG-903");
  }

  @Test
  void offersShouldBuildScopedCriteria() {
    when(offerService.searchOptions())
        .thenReturn(new PurchaseOfferSearchOptionsDto(List.of(new CodeNameDto("12", "Coast"))));

    when(offerService.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(
            new PurchaseOfferSearchResponseDto(
                List.of(
                    new PurchaseOfferSearchResultDto(
                        81009L,
                        1000456L,
                        "PKG-903",
                        LocalDate.of(2026, 2, 26),
                        "R2",
                        null)),
                1,
                0,
                10));

    SummaryOffersResponseDto response = service.offers("00077881", 0, 10, null);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(offerService).search(criteriaCaptor.capture());

    PurchaseOfferSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.clientNumber()).isEqualTo("00077881");
    assertThat(criteria.offeringClientNumber()).isNull();
    assertThat(criteria.excludeWithdrawn()).isTrue();
    assertThat(criteria.restrictToProvincialOrNullJurisdiction()).isTrue();
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("offerNumber DESC");

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).offerNumber()).isEqualTo(81009L);
  }

  @Test
  void exemptionsShouldBuildScopedCriteriaAndMapLegacyFields() {
    when(exemptionService.searchOptions())
        .thenReturn(
            new ExemptionSearchOptionsDto(
                List.of(),
                List.of(),
                List.of(new CodeNameDto("12", "Coast"), new CodeNameDto("24", "Skeena"))));

    when(exemptionService.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(
            new ExemptionSearchResponseDto(
                List.of(
                    new ExemptionSearchResultDto(
                        "EX-205",
                        "M",
                        "APP",
                        "00077881",
                        1000456L,
                        LocalDate.of(2026, 2, 27),
                        LocalDate.of(2026, 2, 26),
                        "R2",
                        95.0,
                        false)),
                1,
                0,
                10));

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(
            Optional.of(
                new ExemptionDetailDto(
                    "EX-205",
                    "M",
                    "Ministerial",
                    "APP",
                    "Approved",
                    "00077881",
                    "00055667",
                    1000456L,
                    "REV",
                    LocalDate.of(2026, 2, 27),
                    LocalDate.of(2026, 5, 27),
                    95.0,
                    40.0,
                    55.0,
                    "",
                    false,
                    List.of("7000123"),
                    List.of())));

    SummaryExemptionsResponseDto response = service.exemptions("00077881", 0, 10, null);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(exemptionService).search(criteriaCaptor.capture());

    ExemptionSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicantClientNumber()).isEqualTo("00077881");
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.regionNumbers()).containsExactly(12L, 24L);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).exemption()).isEqualTo("EX-205");
    assertThat(response.results().get(0).exemptionType()).isEqualTo("Ministerial");
    assertThat(response.results().get(0).balanceRemaining()).isEqualTo(55.0);
  }

  @Test
  void permitsShouldBuildScopedCriteriaAndMapLegacyFields() {
    when(permitService.searchOptions())
        .thenReturn(
            new PermitSearchOptionsDto(
                List.of(),
                List.of(new CodeNameDto("12", "Coast"), new CodeNameDto("24", "Skeena"))));

    when(permitService.search(any(PermitSearchCriteria.class)))
        .thenReturn(
            new PermitSearchResponseDto(
                List.of(
                    new PermitSearchResultDto(
                        7000123L,
                        "Issued",
                        "00077881",
                        "00055667",
                        95.0,
                        LocalDate.of(2026, 3, 15),
                        "R2")),
                1,
                0,
                10));

    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitDetailDto(
                    7000123L,
                    1000456L,
                    "PKG-903",
                    "EX-205",
                    "ISS",
                    "Issued",
                    "00055667",
                    "01",
                    "00077881",
                    "03",
                    "Sample Buyer",
                    "US",
                    "VSL",
                    "Pacific Carrier",
                    "VAN",
                    null,
                    LocalDate.of(2026, 3, 15),
                    LocalDate.of(2026, 6, 15),
                    LocalDate.of(2026, 3, 10),
                    LocalDate.of(2026, 3, 20),
                    95.0,
                    28,
                    "RCT-991",
                    "FED-123",
                    "INV-456",
                    "",
                    null,
                    "R2")));

    SummaryPermitsResponseDto response = service.permits("00077881", 0, 10, null);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(permitService).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isEqualTo("00077881");
    assertThat(criteria.applicantClientNumber()).isNull();
    assertThat(criteria.requireScalePermit()).isTrue();
    assertThat(criteria.regionNumbers()).containsExactly(12L, 24L);
    assertThat(criteria.sortField()).isEqualTo("permitNumber DESC");
    assertThat(criteria.page()).isZero();
    assertThat(criteria.size()).isEqualTo(10);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).permit()).isEqualTo(7000123L);
    assertThat(response.results().get(0).exemption()).isEqualTo("EX-205");
    assertThat(response.results().get(0).totalPieces()).isEqualTo(28L);
  }

  @Test
  void feesShouldBuildScopedCriteriaAndMapFeeRows() {
    when(permitService.searchOptions())
        .thenReturn(
            new PermitSearchOptionsDto(
                List.of(),
                List.of(new CodeNameDto("12", "Coast"), new CodeNameDto("24", "Skeena"))));

    when(permitService.search(any(PermitSearchCriteria.class)))
        .thenReturn(
            new PermitSearchResponseDto(
                List.of(
                    new PermitSearchResultDto(
                        7000123L,
                        "Issued",
                        "00077881",
                        "00055667",
                        95.0,
                        LocalDate.of(2026, 3, 15),
                        "R2")),
                1,
                0,
                10));

    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitDetailDto(
                    7000123L,
                    1000456L,
                    "PKG-903",
                    "EX-205",
                    "ISS",
                    "Issued",
                    "00055667",
                    "01",
                    "00077881",
                    "03",
                    "Sample Buyer",
                    "US",
                    "VSL",
                    "Pacific Carrier",
                    "VAN",
                    null,
                    LocalDate.of(2026, 3, 15),
                    LocalDate.of(2026, 6, 15),
                    LocalDate.of(2026, 3, 10),
                    LocalDate.of(2026, 3, 20),
                    95.0,
                    28,
                    "RCT-991",
                    "FED-123",
                    "INV-456",
                    "",
                    null,
                    "R2")));

    SummaryFeesResponseDto response = service.fees("00077881", 0, 10, null);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(permitService).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isEqualTo("00077881");
    assertThat(criteria.applicantClientNumber()).isNull();
    assertThat(criteria.requireScalePermit()).isFalse();
    assertThat(criteria.sortField()).isEqualTo("permitNumber DESC");
    assertThat(criteria.page()).isZero();
    assertThat(criteria.size()).isEqualTo(10);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).permit()).isEqualTo(7000123L);
    assertThat(response.results().get(0).fees()).isEqualTo(95.0);
    assertThat(response.results().get(0).receipt()).isEqualTo("RCT-991");
  }

  @Test
  void offersPlacedShouldUseOfferingClientScopeAndExcludeWithdrawn() {
    when(offerService.searchOptions())
        .thenReturn(new PurchaseOfferSearchOptionsDto(List.of(new CodeNameDto("12", "Coast"))));

    when(offerService.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(
            new PurchaseOfferSearchResponseDto(
                List.of(
                    new PurchaseOfferSearchResultDto(
                        81003L,
                        1000403L,
                        "PKG-903",
                        LocalDate.of(2026, 2, 22),
                        "R2",
                        null)),
                1,
                1,
                1));

    SummaryOffersResponseDto response = service.offersPlaced("00077881", 1, 1, null);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(offerService).search(criteriaCaptor.capture());

    PurchaseOfferSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.clientNumber()).isNull();
    assertThat(criteria.offeringClientNumber()).isEqualTo("00077881");
    assertThat(criteria.excludeWithdrawn()).isTrue();
    assertThat(criteria.restrictToProvincialOrNullJurisdiction()).isFalse();
    assertThat(criteria.page()).isEqualTo(1);
    assertThat(criteria.size()).isEqualTo(1);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).offerNumber()).isEqualTo(81003L);
  }
}

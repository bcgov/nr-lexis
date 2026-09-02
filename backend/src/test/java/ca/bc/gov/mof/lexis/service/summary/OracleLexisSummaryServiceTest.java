package ca.bc.gov.mof.lexis.service.summary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSummaryEnrichmentDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSummaryEnrichmentDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
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
  @Mock private PermitDetailsRpcService permitDetailsRpcService;

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
                        false,
                        "Ministerial")),
                1,
                0,
                10));

    when(applicationService.findSummaryEnrichmentByApplicationNumbers(List.of(1000456L)))
        .thenReturn(
            Map.of(
                1000456L,
                new LexisApplicationSummaryEnrichmentDto(
                    1000456L,
                    "ER02",
                    LocalDate.of(2026, 2, 21),
                    List.of("PKG-903"))));
    SummaryApplicationsResponseDto response = service.applications("00077881", 0, 10, null);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(applicationService).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.agentClientNumber()).isEqualTo("00077881");
    assertThat(criteria.broadClientMatch()).isTrue();
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.sortField()).isEqualTo("applicationNumber DESC");

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).application()).isEqualTo(1000456L);
    assertThat(response.results().get(0).reason()).isEqualTo("ER02");
    assertThat(response.results().get(0).exemptionType()).isEqualTo("Ministerial");
    assertThat(response.results().get(0).packageNumberAry()).containsExactly("PKG-903");
    verify(applicationService, never()).findByApplicationNumber(anyLong());
    verifyNoInteractions(exemptionService);
  }

  @Test
  void offersShouldBuildScopedCriteria() {
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
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.sortField()).isEqualTo("offerNumber DESC");

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).offerNumber()).isEqualTo(81009L);
  }

  @Test
  void exemptionsShouldBuildScopedCriteriaAndMapLegacyFields() {
    when(exemptionService.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(
            new ExemptionSearchResponseDto(
                List.of(
                    new ExemptionSearchResultDto(
                        "EX-205",
                        "M",
                        "APP",
                        "00055667",
                        "00077881",
                        1000456L,
                        LocalDate.of(2026, 2, 27),
                        LocalDate.of(2026, 2, 26),
                        LocalDate.of(2027, 2, 27),
                        "R2",
                        95.0,
                        83.0,
                        false)),
                1,
                0,
                10));

    when(exemptionService.findSummaryLookups(List.of("EX-205")))
        .thenReturn(
            Map.of(
                "EX-205",
                new ExemptionSummaryLookupDto("EX-205", "Ministerial", "Approved")));

    SummaryExemptionsResponseDto response = service.exemptions("00077881", 0, 10, null);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(exemptionService).search(criteriaCaptor.capture());

    ExemptionSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicantClientNumber()).isEqualTo("00077881");
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.includeBlanketOic()).isTrue();
    assertThat(criteria.excludeBlanketOic()).isFalse();
    assertThat(criteria.broadClientMatch()).isTrue();
    assertThat(criteria.sortField()).isEqualTo("exemptionNumber DESC");

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).exemption()).isEqualTo("EX-205");
    assertThat(response.results().get(0).exemptionType()).isEqualTo("Ministerial");
    assertThat(response.results().get(0).balanceRemaining()).isEqualTo(83.0);
    assertThat(response.results().get(0).ownerClientNumber()).isEqualTo("00077881");
    assertThat(response.results().get(0).agentClientNumber()).isEqualTo("00055667");
    verify(exemptionService, never()).findByExemptionNumber(any());
  }

  @Test
  void exemptionsShouldPreserveSearchClientRulesForOicTypes() {
    ExemptionSearchResultDto ordinaryOic =
        new ExemptionSearchResultDto(
            "O-205",
            "O",
            "ACT",
            "",
            "",
            null,
            LocalDate.of(2026, 2, 27),
            null,
            LocalDate.of(2027, 2, 27),
            "",
            95.0,
            83.0,
            false);
    ExemptionSearchResultDto blanketOic =
        new ExemptionSearchResultDto(
            "B-205",
            "B",
            "ACT",
            "",
            "",
            null,
            LocalDate.of(2026, 2, 27),
            null,
            LocalDate.of(2027, 2, 27),
            "",
            95.0,
            83.0,
            false);
    when(exemptionService.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(
            new ExemptionSearchResponseDto(
                List.of(ordinaryOic, blanketOic), 2, 0, 10));
    when(exemptionService.findSummaryLookups(List.of("O-205", "B-205")))
        .thenReturn(
            Map.of(
                "O-205",
                new ExemptionSummaryLookupDto("O-205", "OIC", "Active"),
                "B-205",
                new ExemptionSummaryLookupDto("B-205", "Blanket OIC", "Active")));

    SummaryExemptionsResponseDto response =
        service.exemptions("00077881", 0, 10, null);

    assertThat(response.results())
        .extracting(
            item -> item.exemption(),
            item -> item.exemptionType(),
            item -> item.ownerClientNumber(),
            item -> item.agentClientNumber())
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("O-205", "OIC", "", ""),
            org.assertj.core.groups.Tuple.tuple("B-205", "Blanket OIC", "", ""));
    verify(exemptionService, never()).findByExemptionNumber(any());
  }

  @Test
  void permitsShouldBuildScopedCriteriaAndMapLegacyFields() {
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

    when(permitService.findSummaryEnrichmentByPermitNumbers(List.of(7000123L)))
        .thenReturn(
            Map.of(
                7000123L,
                new PermitSummaryEnrichmentDto("EX-205", 28, "RCT-991")));
    SummaryPermitsResponseDto response = service.permits("00077881", 0, 10, null);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(permitService).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.applicantClientNumber()).isNull();
    assertThat(criteria.accessClientNumber()).isEqualTo("00077881");
    assertThat(criteria.requireScalePermit()).isFalse();
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.sortField()).isEqualTo("permitNumber DESC");
    assertThat(criteria.page()).isZero();
    assertThat(criteria.size()).isEqualTo(10);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).permit()).isEqualTo(7000123L);
    assertThat(response.results().get(0).exemption()).isEqualTo("EX-205");
    assertThat(response.results().get(0).totalPieces()).isEqualTo(28L);
    verify(permitService, never()).findByPermitNumber(any());
  }

  @Test
  void feesShouldBuildScopedCriteriaAndMapFeeRows() {
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

    when(permitService.findSummaryEnrichmentByPermitNumbers(List.of(7000123L)))
        .thenReturn(
            Map.of(
                7000123L,
                new PermitSummaryEnrichmentDto("EX-205", 28, "RCT-991")));
    when(permitDetailsRpcService.getTotalFeesForPermit(7000123L, null, null))
        .thenReturn(new PermitTotalFeesRpcResponseDto("$1,234.50"));

    SummaryFeesResponseDto response = service.fees("00077881", 0, 10, null);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(permitService).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.applicantClientNumber()).isNull();
    assertThat(criteria.accessClientNumber()).isEqualTo("00077881");
    assertThat(criteria.requireScalePermit()).isFalse();
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.sortField()).isEqualTo("permitNumber DESC");
    assertThat(criteria.page()).isZero();
    assertThat(criteria.size()).isEqualTo(10);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).permit()).isEqualTo(7000123L);
    assertThat(response.results().get(0).fees()).isEqualTo(1234.5);
    assertThat(response.results().get(0).receipt()).isEqualTo("RCT-991");
    verify(permitService, never()).findByPermitNumber(any());
  }

  @Test
  void offersPlacedShouldUseOfferingClientScopeAndExcludeWithdrawn() {
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
    assertThat(criteria.regionNumbers()).isEmpty();
    assertThat(criteria.page()).isEqualTo(1);
    assertThat(criteria.size()).isEqualTo(1);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().get(0).offerNumber()).isEqualTo(81003L);
  }
}

package ca.bc.gov.mof.lexis.service.summary;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSummaryEnrichmentDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSummaryLookupDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSummaryEnrichmentDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeeItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOfferItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisSummaryService implements LexisSummaryService {

  private static final int DEFAULT_PAGE = 0;
  private static final int DEFAULT_SIZE = 10;
  private static final int MAX_SIZE = 200;
  private static final String APPLICATION_SORT_DEFAULT = "applicationNumber DESC";
  private static final String OFFER_SORT_DEFAULT = "offerNumber DESC";
  private static final String EXEMPTION_SORT_DEFAULT = "exemptionNumber DESC";
  private static final String PERMIT_SORT_DEFAULT = "permitNumber DESC";
  private static final String FEE_SORT_DEFAULT = "permitNumber DESC";
  // Legacy summary panels are client-scoped and do not inherit search-form region selections.
  private static final List<Long> NO_REGION_FILTER = List.of();

  private final LexisApplicationService applicationService;
  private final PurchaseOfferService offerService;
  private final ExemptionService exemptionService;
  private final PermitService permitService;
  private final PermitDetailsRpcService permitDetailsRpcService;

  public OracleLexisSummaryService(
      LexisApplicationService applicationService,
      PurchaseOfferService offerService,
      ExemptionService exemptionService,
      PermitService permitService,
      PermitDetailsRpcService permitDetailsRpcService) {
    this.applicationService = applicationService;
    this.offerService = offerService;
    this.exemptionService = exemptionService;
    this.permitService = permitService;
    this.permitDetailsRpcService = permitDetailsRpcService;
  }

  @Override
  public SummaryApplicationsResponseDto applications(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryApplicationsResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

    LexisApplicationSearchCriteria criteria =
        new LexisApplicationSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            normalizedClientNumber,
            null,
            null,
            null,
            null,
            null,
            NO_REGION_FILTER,
            true,
            firstPresent(sortField, APPLICATION_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = applicationService.search(criteria);
    Map<Long, LexisApplicationSummaryEnrichmentDto> enrichmentByApplication =
        applicationService.findSummaryEnrichmentByApplicationNumbers(
            response.results().stream()
                .map(LexisApplicationSearchResultDto::application)
                .toList());
    List<SummaryApplicationItemDto> results =
        response.results().stream()
            .map(
                result ->
                    toSummaryApplication(
                        result, enrichmentByApplication.get(result.application())))
            .toList();

    return new SummaryApplicationsResponseDto(results, response.total(), response.page(), response.size());
  }

  @Override
  public SummaryOffersResponseDto offers(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryOffersResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            normalizedClientNumber,
            null,
            true,
            true,
            NO_REGION_FILTER,
            firstPresent(sortField, OFFER_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = offerService.search(criteria);
    List<SummaryOfferItemDto> results = response.results().stream().map(this::toSummaryOffer).toList();

    return new SummaryOffersResponseDto(results, response.total(), response.page(), response.size());
  }

  @Override
  public SummaryExemptionsResponseDto exemptions(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryExemptionsResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

    ExemptionSearchCriteria criteria =
        new ExemptionSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            normalizedClientNumber,
            null,
            null,
            null,
            null,
            null,
            NO_REGION_FILTER,
            // Legacy summary includes client-linked OICs plus standing/global Blanket OICs.
            true,
            false,
            true,
            firstPresent(sortField, EXEMPTION_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = exemptionService.search(criteria);
    Map<String, ExemptionSummaryLookupDto> lookupByExemption =
        exemptionService.findSummaryLookups(
            response.results().stream()
                .map(ExemptionSearchResultDto::exemptionNumber)
                .toList());
    List<SummaryExemptionItemDto> results =
        response.results().stream()
            .map(
                result ->
                    toSummaryExemption(
                        result, lookupByExemption.get(result.exemptionNumber())))
            .toList();

    return new SummaryExemptionsResponseDto(results, response.total(), response.page(), response.size());
  }

  @Override
  public SummaryPermitsResponseDto permits(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryPermitsResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

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
            normalizedClientNumber,
            // Legacy Summary includes every client-accessible permit; its Permit Search applies
            // the separate scale-link requirement.
            false,
            NO_REGION_FILTER,
            firstPresent(sortField, PERMIT_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = permitService.search(criteria);
    Map<Long, PermitSummaryEnrichmentDto> enrichmentByPermit =
        permitService.findSummaryEnrichmentByPermitNumbers(
            response.results().stream().map(PermitSearchResultDto::permitNumber).toList());
    List<SummaryPermitItemDto> results =
        response.results().stream()
            .map(
                result ->
                    toSummaryPermit(
                        result, enrichmentByPermit.get(result.permitNumber())))
            .toList();

    return new SummaryPermitsResponseDto(results, response.total(), response.page(), response.size());
  }

  @Override
  public SummaryFeesResponseDto fees(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryFeesResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

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
            normalizedClientNumber,
            false,
            NO_REGION_FILTER,
            firstPresent(sortField, FEE_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = permitService.search(criteria);
    Map<Long, PermitSummaryEnrichmentDto> enrichmentByPermit =
        permitService.findSummaryEnrichmentByPermitNumbers(
            response.results().stream().map(PermitSearchResultDto::permitNumber).toList());
    List<SummaryFeeItemDto> results =
        response.results().stream()
            .map(
                result ->
                    toSummaryFee(
                        result, enrichmentByPermit.get(result.permitNumber())))
            .toList();

    return new SummaryFeesResponseDto(results, response.total(), response.page(), response.size());
  }

  @Override
  public SummaryOffersResponseDto offersPlaced(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField) {
    int normalizedPage = normalizePage(page);
    int normalizedSize = normalizeSize(size);
    String normalizedClientNumber = trimToNull(clientNumber);

    if (normalizedClientNumber == null) {
      return new SummaryOffersResponseDto(List.of(), 0, normalizedPage, normalizedSize);
    }

    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            normalizedClientNumber,
            true,
            false,
            NO_REGION_FILTER,
            firstPresent(sortField, OFFER_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = offerService.search(criteria);
    List<SummaryOfferItemDto> results =
        response.results().stream().map(this::toSummaryOffer).toList();

    return new SummaryOffersResponseDto(results, response.total(), response.page(), response.size());
  }

  private SummaryApplicationItemDto toSummaryApplication(
      LexisApplicationSearchResultDto result,
      LexisApplicationSummaryEnrichmentDto enrichment) {
    String exemptionNumber = trimToNull(result.exemptionNumber());
    String exemptionType = trimToNull(result.exemptionTypeDescription());
    return new SummaryApplicationItemDto(
        result.application(),
        result.status(),
        enrichment == null ? null : enrichment.reason(),
        exemptionType,
        exemptionNumber,
        enrichment == null ? null : enrichment.receivedDate(),
        result.listingDate(),
        enrichment == null ? List.of() : enrichment.packageNumbers());
  }

  private SummaryOfferItemDto toSummaryOffer(PurchaseOfferSearchResultDto result) {
    return new SummaryOfferItemDto(
        result.offerNumber(),
        result.applicationNumber(),
        result.packageNumber(),
        result.listingDate());
  }

  private SummaryExemptionItemDto toSummaryExemption(
      ExemptionSearchResultDto result,
      ExemptionSummaryLookupDto lookup) {
    // Legacy summary maps the search row directly. Retain the canonical search clients and load
    // only the two code descriptions that are not exposed by the modern search DTO.
    return new SummaryExemptionItemDto(
        result.exemptionNumber(),
        lookup == null || trimToNull(lookup.exemptionTypeDescription()) == null
            ? result.exemptionType()
            : lookup.exemptionTypeDescription(),
        result.ownerClientNumber(),
        result.applicantClientNumber(),
        lookup == null || trimToNull(lookup.exemptionStatusDescription()) == null
            ? result.status()
            : lookup.exemptionStatusDescription(),
        result.approvedVolume(),
        result.balanceRemaining(),
        result.approvalDate(),
        result.expiryDate());
  }

  private SummaryPermitItemDto toSummaryPermit(
      PermitSearchResultDto result,
      PermitSummaryEnrichmentDto enrichment) {
    return new SummaryPermitItemDto(
        result.permitNumber(),
        result.statusDescription(),
        result.ownerClientNumber(),
        result.applicantClientNumber(),
        enrichment == null ? null : enrichment.exemptionNumber(),
        enrichment == null ? 0L : enrichment.numberOfPieces(),
        result.totalVolume(),
        enrichment == null ? null : enrichment.receiptNumber(),
        result.issueDate());
  }

  private SummaryFeeItemDto toSummaryFee(
      PermitSearchResultDto result,
      PermitSummaryEnrichmentDto enrichment) {
    Long permitNumber = result.permitNumber();
    Double fees =
        Optional.ofNullable(
                permitDetailsRpcService.getTotalFeesForPermit(permitNumber, null, null))
            .map(PermitTotalFeesRpcResponseDto::totalFees)
            .map(this::parseCurrency)
            .orElse(null);
    return new SummaryFeeItemDto(
        permitNumber,
        result.statusDescription(),
        result.totalVolume(),
        fees,
        enrichment == null ? null : enrichment.receiptNumber());
  }

  private Double parseCurrency(String value) {
    String normalized = trimToNull(value);
    if (normalized == null || "$".equals(normalized)) {
      return null;
    }

    try {
      return new BigDecimal(normalized.replace("$", "").replace(",", "").trim()).doubleValue();
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private int normalizePage(Integer page) {
    if (page == null) {
      return DEFAULT_PAGE;
    }
    return Math.max(0, page);
  }

  private int normalizeSize(Integer size) {
    if (size == null) {
      return DEFAULT_SIZE;
    }
    return Math.min(MAX_SIZE, Math.max(1, size));
  }

  private String firstPresent(String first, String fallback) {
    String normalized = trimToNull(first);
    if (normalized != null) {
      return normalized;
    }
    return fallback;
  }

}

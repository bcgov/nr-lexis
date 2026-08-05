package ca.bc.gov.mof.lexis.service.summary;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
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
    List<SummaryApplicationItemDto> results =
        response.results().stream().map(this::toSummaryApplication).toList();

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
            false,
            false,
            true,
            firstPresent(sortField, EXEMPTION_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = exemptionService.search(criteria);
    List<SummaryExemptionItemDto> results =
        response.results().stream().map(this::toSummaryExemption).toList();

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
            true,
            NO_REGION_FILTER,
            firstPresent(sortField, PERMIT_SORT_DEFAULT),
            normalizedPage,
            normalizedSize);

    var response = permitService.search(criteria);
    List<SummaryPermitItemDto> results =
        response.results().stream().map(this::toSummaryPermit).toList();

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
    List<SummaryFeeItemDto> results = response.results().stream().map(this::toSummaryFee).toList();

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

  private SummaryApplicationItemDto toSummaryApplication(LexisApplicationSearchResultDto result) {
    Optional<LexisApplicationDetailDto> detail =
        applicationService.findByApplicationNumber(result.application());

    String reason = detail.map(LexisApplicationDetailDto::exemptionReasonCode).orElse(null);
    String exemptionNumber = trimToNull(result.exemptionNumber());
    String exemptionType = trimToNull(result.exemptionTypeDescription());
    List<String> packageNumbers =
        detail
            .map(LexisApplicationDetailDto::packages)
            .stream()
            .flatMap(List::stream)
            .map(LexisApplicationDetailDto.LexisPackageDto::packageNumber)
            .filter(value -> value != null && !value.isBlank())
            .toList();
    return new SummaryApplicationItemDto(
        result.application(),
        result.status(),
        reason,
        exemptionType,
        exemptionNumber,
        detail.map(LexisApplicationDetailDto::receivedDate).orElse(null),
        result.listingDate(),
        packageNumbers);
  }

  private SummaryOfferItemDto toSummaryOffer(PurchaseOfferSearchResultDto result) {
    return new SummaryOfferItemDto(
        result.offerNumber(),
        result.applicationNumber(),
        result.packageNumber(),
        result.listingDate());
  }

  private SummaryExemptionItemDto toSummaryExemption(ExemptionSearchResultDto result) {
    Optional<ExemptionDetailDto> detail =
        exemptionService.findByExemptionNumber(result.exemptionNumber());

    return new SummaryExemptionItemDto(
        result.exemptionNumber(),
        detail.map(ExemptionDetailDto::exemptionTypeDescription).orElse(result.exemptionType()),
        detail.map(ExemptionDetailDto::ownerClientNumber).orElse(result.ownerClientNumber()),
        detail.map(ExemptionDetailDto::agentClientNumber).orElse(result.applicantClientNumber()),
        detail.map(ExemptionDetailDto::exemptionStatusDescription).orElse(result.status()),
        detail.map(ExemptionDetailDto::approvedVolume).orElse(result.approvedVolume()),
        result.balanceRemaining(),
        detail.map(ExemptionDetailDto::approvalDate).orElse(result.approvalDate()),
        detail.map(ExemptionDetailDto::expiryDate).orElse(result.expiryDate()));
  }

  private SummaryPermitItemDto toSummaryPermit(PermitSearchResultDto result) {
    Optional<PermitDetailDto> detail = permitService.findByPermitNumber(result.permitNumber());

    return new SummaryPermitItemDto(
        detail.map(PermitDetailDto::permitNumber).orElse(result.permitNumber()),
        detail.map(PermitDetailDto::permitStatusDescription).orElse(result.statusDescription()),
        detail.map(PermitDetailDto::ownerClientNumber).orElse(result.ownerClientNumber()),
        detail.map(PermitDetailDto::applicantClientNumber).orElse(result.applicantClientNumber()),
        detail.map(PermitDetailDto::exemptionNumber).orElse(null),
        detail.map(PermitDetailDto::numberOfPieces).orElse(0L),
        detail.map(PermitDetailDto::permitVolume).orElse(result.totalVolume()),
        detail.map(PermitDetailDto::receiptNumber).orElse(null),
        detail.map(PermitDetailDto::issueDate).orElse(result.issueDate()));
  }

  private SummaryFeeItemDto toSummaryFee(PermitSearchResultDto result) {
    Optional<PermitDetailDto> detail = permitService.findByPermitNumber(result.permitNumber());

    double volume = detail.map(PermitDetailDto::permitVolume).orElse(result.totalVolume());
    Long permitNumber = detail.map(PermitDetailDto::permitNumber).orElse(result.permitNumber());
    Double fees =
        Optional.ofNullable(
                permitDetailsRpcService.getTotalFeesForPermit(permitNumber, null, null))
            .map(PermitTotalFeesRpcResponseDto::totalFees)
            .map(this::parseCurrency)
            .orElse(null);
    return new SummaryFeeItemDto(
        permitNumber,
        detail.map(PermitDetailDto::permitStatusDescription).orElse(result.statusDescription()),
        volume,
        fees,
        detail.map(PermitDetailDto::receiptNumber).orElse(null));
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

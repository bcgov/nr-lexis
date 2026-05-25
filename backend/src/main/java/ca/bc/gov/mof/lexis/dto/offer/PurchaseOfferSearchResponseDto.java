package ca.bc.gov.mof.lexis.dto.offer;

import java.util.List;

public record PurchaseOfferSearchResponseDto(
    List<PurchaseOfferSearchResultDto> results, int total, int page, int size) {}

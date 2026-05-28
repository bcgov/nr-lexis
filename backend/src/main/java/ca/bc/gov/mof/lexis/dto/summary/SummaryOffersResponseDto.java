package ca.bc.gov.mof.lexis.dto.summary;

import java.util.List;

public record SummaryOffersResponseDto(
    List<SummaryOfferItemDto> results,
    int total,
    int page,
    int size) {}

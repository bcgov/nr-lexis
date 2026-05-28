package ca.bc.gov.mof.lexis.dto.reserve;

import java.util.List;

public record IndianReservePermitSearchResponseDto(
    List<IndianReservePermitSearchResultDto> results,
    int total,
    int page,
    int size) {}

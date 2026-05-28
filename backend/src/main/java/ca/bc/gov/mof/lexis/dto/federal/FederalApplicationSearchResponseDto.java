package ca.bc.gov.mof.lexis.dto.federal;

import java.util.List;

public record FederalApplicationSearchResponseDto(
    List<FederalApplicationSearchResultDto> results,
    int total,
    int page,
    int size) {}

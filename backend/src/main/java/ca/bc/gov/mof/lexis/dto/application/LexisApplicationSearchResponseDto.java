package ca.bc.gov.mof.lexis.dto.application;

import java.util.List;

public record LexisApplicationSearchResponseDto(
    List<LexisApplicationSearchResultDto> results,
    int total,
    int page,
    int size) {}

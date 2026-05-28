package ca.bc.gov.mof.lexis.dto.permit;

import java.util.List;

public record PermitSearchResponseDto(
    List<PermitSearchResultDto> results, int total, int page, int size) {}

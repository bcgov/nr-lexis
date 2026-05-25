package ca.bc.gov.mof.lexis.dto.exemption;

import java.util.List;

public record ExemptionSearchResponseDto(
    List<ExemptionSearchResultDto> results, int total, int page, int size) {}

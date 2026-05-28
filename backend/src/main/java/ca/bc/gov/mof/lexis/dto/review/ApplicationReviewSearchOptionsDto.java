package ca.bc.gov.mof.lexis.dto.review;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record ApplicationReviewSearchOptionsDto(
    List<CodeNameDto> productTypes,
    List<CodeNameDto> regions,
    List<CodeNameDto> reviewStatuses) {}

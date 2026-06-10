package ca.bc.gov.mof.lexis.dto.application;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record LexisApplicationSearchOptionsDto(
    List<CodeNameDto> exemptionTypes,
    List<CodeNameDto> exemptionReasons,
    List<CodeNameDto> applicationStatuses,
    List<CodeNameDto> productTypes,
    List<CodeNameDto> regions) {}

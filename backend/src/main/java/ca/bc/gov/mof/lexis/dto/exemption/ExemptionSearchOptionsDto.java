package ca.bc.gov.mof.lexis.dto.exemption;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record ExemptionSearchOptionsDto(
    List<CodeNameDto> exemptionTypes, List<CodeNameDto> exemptionStatuses, List<CodeNameDto> regions) {}

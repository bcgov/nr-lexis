package ca.bc.gov.mof.lexis.dto.federal;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record FederalApplicationSearchOptionsDto(
    List<CodeNameDto> applicationStatuses,
    List<CodeNameDto> exemptionTypes) {}

package ca.bc.gov.mof.lexis.dto.reserve;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record IndianReservePermitSearchOptionsDto(
    List<CodeNameDto> applicationStatuses,
    List<CodeNameDto> exemptionTypes) {}

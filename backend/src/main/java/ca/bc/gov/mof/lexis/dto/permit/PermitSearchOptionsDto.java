package ca.bc.gov.mof.lexis.dto.permit;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record PermitSearchOptionsDto(
    List<CodeNameDto> permitStatuses,
    List<CodeNameDto> regions) {}

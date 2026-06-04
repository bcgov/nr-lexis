package ca.bc.gov.mof.lexis.dto.report;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record LexisReportOptionsDto(
    List<CodeNameDto> currentSchedules,
    String defaultRegion,
    List<CodeNameDto> regions,
    List<CodeNameDto> reportJurisdictions,
    List<CodeNameDto> biweeklyJurisdictions,
    List<CodeNameDto> teacJurisdictions,
    List<CodeNameDto> exemptionTypes,
    List<CodeNameDto> tenureExemptionTypes,
    List<CodeNameDto> exemptionReasons,
    List<CodeNameDto> exemptionStatuses,
    List<CodeNameDto> growthTypes,
    List<CodeNameDto> permitStatuses,
    List<CodeNameDto> destinationCountries,
    List<CodeNameDto> allDestinationCountries,
    List<CodeNameDto> portsOfExport) {}

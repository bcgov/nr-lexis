package ca.bc.gov.mof.lexis.dto.report;

import java.util.Map;

public record LexisReportRequestDto(Map<String, String> parameters, String format) {}


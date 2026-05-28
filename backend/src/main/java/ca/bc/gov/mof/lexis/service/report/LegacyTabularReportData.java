package ca.bc.gov.mof.lexis.service.report;

import java.util.List;

public record LegacyTabularReportData(
    List<String> columnHeaders,
    List<List<String>> rows) {}

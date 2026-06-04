package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class LexisJasperReportParameterProvider {

  private static final String DEFAULT_FROM_DATE = "0001-01-01";
  private static final String DEFAULT_TO_DATE = "9999-12-31";

  public Map<String, Object> buildParameters(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request) {
    Map<String, String> parameters =
        request == null || request.parameters() == null ? Map.of() : request.parameters();

    return switch (definition) {
      case BIWEEKLY_LISTING -> biweeklyListing(parameters);
      case OFFER_REPORT -> offerReport(parameters);
      case SPECIES_GRADE_REPORT -> speciesGradeReport(parameters);
      case EXEMPTION_REPORT -> exemptionReport(parameters);
      case APPLICATION_REPORT -> applicationReport(parameters);
      case APPROVED_EXEMPTION_REPORT -> approvedExemptionReport(parameters);
      case PERMIT_REPORT -> permitReport(parameters);
      case PERMIT_LEDGER_REPORT -> permitLedgerReport(parameters);
      case FEE_REPORT -> feeReport(parameters);
      case TRANSPORT_REPORT -> transportReport(parameters);
      case TEAC_REPORT -> teacReport(parameters);
      case TENURE_REPORT -> tenureReport(parameters);
    };
  }

  private Map<String, Object> biweeklyListing(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_ORG_UNIT", csvValueOrEmpty(parameters, "region", "orgUnitNumber"));
    reportParameters.put("P_JURISDICTION", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    reportParameters.put("P_FROM_DATE", defaultDate(first(parameters, "fromDate"), DEFAULT_FROM_DATE));
    reportParameters.put("P_TO_DATE", defaultDate(first(parameters, "toDate"), DEFAULT_TO_DATE));
    return reportParameters;
  }

  private Map<String, Object> offerReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_APPLICATION_DATE_FROM", defaultDate(first(parameters, "fromDate"), DEFAULT_FROM_DATE));
    reportParameters.put("P_APPLICATION_DATE_TO", defaultDate(first(parameters, "toDate"), DEFAULT_TO_DATE));
    reportParameters.put("P_ORG_UNIT", csvValue(parameters, "region"));
    reportParameters.put("P_CLIENT_NUMBER", first(parameters, "clientNumber"));
    reportParameters.put("P_WITHDRAWN_DATE_FROM", first(parameters, "withdrawnFromDate"));
    reportParameters.put("P_WITHDRAWN_DATE_TO", first(parameters, "withdrawnToDate"));
    reportParameters.put("P_JURISDICTION", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    return reportParameters;
  }

  private Map<String, Object> speciesGradeReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_DATE_FROM", first(parameters, "fromDate"));
    reportParameters.put("P_DATE_TO", first(parameters, "toDate"));
    reportParameters.put("P_ORG_UNIT", csvValue(parameters, "region"));
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    reportParameters.put("P_EXEMPTION_TYPE", first(parameters, "exemptionType"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_GROWTH_TYPE", first(parameters, "growthType"));
    reportParameters.put("P_TIMBER_MARK", emptyIfNull(first(parameters, "timberMark")));
    reportParameters.put("P_FOREST_FILE_ID", emptyIfNull(first(parameters, "forestFileId")));
    reportParameters.put("P_PERMIT_STATUS", first(parameters, "permitStatus"));
    return reportParameters;
  }

  private Map<String, Object> exemptionReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_LISTING_FROM_DATE", first(parameters, "listingFromDate"));
    reportParameters.put("P_LISTING_TO_DATE", first(parameters, "listingToDate"));
    reportParameters.put("P_ORG_UNIT", csvValue(parameters, "region"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_EXEMPTION_TYPE", first(parameters, "exemptionType"));
    reportParameters.put("P_CLIENT", first(parameters, "clientNumber"));
    reportParameters.put("P_GROWTH_TYPE", first(parameters, "growthType"));
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    reportParameters.put("P_EXEMPTION_STATUS", first(parameters, "exemptionStatus"));
    return reportParameters;
  }

  private Map<String, Object> applicationReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_ORG_UNIT", first(parameters, "region"));
    reportParameters.put("P_JURISDICTION", first(parameters, "exportJurisdictionCode", "jurisdiction"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_RECEIVED_FROM", first(parameters, "fromDate"));
    reportParameters.put("P_RECEIVED_TO", first(parameters, "toDate"));
    reportParameters.put("P_CLIENT_NUMBER", first(parameters, "clientNumber"));
    reportParameters.put("P_GROWTH_TYPE", first(parameters, "growthType"));
    return reportParameters;
  }

  private Map<String, Object> approvedExemptionReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    return reportParameters;
  }

  private Map<String, Object> permitReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_EXPORT_PERMIT_NUMBER", asBigDecimal(first(parameters, "permitNumber")));
    reportParameters.put("P_INVOICE_NUMBER", emptyIfNull(first(parameters, "invoiceNumber")));
    return reportParameters;
  }

  private Map<String, Object> permitLedgerReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_CLIENT_NUMBER", first(parameters, "clientNumber"));
    reportParameters.put("P_ORG_UNIT_NUMBER", csvValue(parameters, "region"));
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    reportParameters.put("P_PERMIT_STATUS", first(parameters, "permitStatus"));
    reportParameters.put("P_EXEMPTION_TYPE", first(parameters, "exemptionType"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_GROWTH_TYPE", first(parameters, "growthType"));
    reportParameters.put("P_TIMBER_MARK", first(parameters, "timberMark"));
    reportParameters.put("P_DEST_COUNTRY", first(parameters, "destinationCountry"));
    return reportParameters;
  }

  private Map<String, Object> feeReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_ORG_UNIT_NUMBER", csvValue(parameters, "orgUnitNumber", "region"));
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    reportParameters.put("P_EXEMPTION_TYPE", first(parameters, "exemptionType"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_GROWTH_TYPE", first(parameters, "growthType"));
    return reportParameters;
  }

  private Map<String, Object> transportReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_FROM_DATE", defaultDate(first(parameters, "fromDate"), DEFAULT_FROM_DATE));
    reportParameters.put("P_TO_DATE", defaultDate(first(parameters, "toDate"), DEFAULT_TO_DATE));
    reportParameters.put("P_JURISDICTION", first(parameters, "jurisdiction", "exportJurisdictionCode"));
    reportParameters.put("P_ORG_UNIT_NUMBER", csvValue(parameters, "region"));
    reportParameters.put("P_DESTINATION_COUNTRY", first(parameters, "destinationCountry"));
    reportParameters.put("P_PORT_OF_EXPORT", first(parameters, "portOfExport"));
    reportParameters.put("P_STATUS", first(parameters, "status"));
    return reportParameters;
  }

  private Map<String, Object> teacReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();
    reportParameters.put("P_ORG_UNIT_NUMBER", csvValue(parameters, "region"));
    reportParameters.put("P_LISTING_DATE", first(parameters, "exportSchedule"));
    return reportParameters;
  }

  private Map<String, Object> tenureReport(Map<String, String> parameters) {
    String legacyActionMapping = normalizeLegacyAction(first(parameters, "legacyActionMapping"));
    if ("generatetenurereport".equals(legacyActionMapping)) {
      return tenureTypeAnalysisReport(parameters);
    }
    if ("generatemarkreport".equals(legacyActionMapping)) {
      return tenureMarkAnalysisReport(parameters);
    }
    if ("generatefilereport".equals(legacyActionMapping)) {
      return tenureFileAnalysisReport(parameters);
    }
    return tenurePermitAnalysisReport(parameters);
  }

  private Map<String, Object> tenurePermitAnalysisReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();

    String clientNumber = first(parameters, "clientNumber");
    String clientType = first(parameters, "clientType");
    if (isBlank(clientNumber)) {
      clientType = "";
    }

    reportParameters.put("P_ORG_UNIT_NUMBER", csvValue(parameters, "region"));
    reportParameters.put("P_EXEMPTION_REASON", first(parameters, "exemptionReason"));
    reportParameters.put("P_EXEMPTION_TYPE", first(parameters, "exemptionType"));
    reportParameters.put("P_EXEMPTION_NUMBER", first(parameters, "exemptionNumber"));
    reportParameters.put("P_CLIENT_NUMBER", clientNumber);
    reportParameters.put("P_CLIENT_TYPE", clientType);
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_TENURE_TYPE_1", "");
    reportParameters.put("P_TENURE_TYPE_2", "");
    reportParameters.put("P_TENURE_TYPE_3", "");
    reportParameters.put("P_TENURE_TYPE_4", "");
    reportParameters.put("P_TENURE_TYPE_5", "");
    reportParameters.put("P_TENURE_TYPE_6", "");
    reportParameters.put("P_TIMBER_MARK_1", "");
    reportParameters.put("P_TIMBER_MARK_2", "");
    reportParameters.put("P_TIMBER_MARK_3", "");
    reportParameters.put("P_TIMBER_MARK_4", "");
    reportParameters.put("P_TIMBER_MARK_5", "");
    reportParameters.put("P_TIMBER_MARK_6", "");
    reportParameters.put("P_FOREST_FILE_ID", first(parameters, "forestFileId"));

    return reportParameters;
  }

  private Map<String, Object> tenureTypeAnalysisReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();

    reportParameters.put("P_ORG_UNIT_NUMBER", "-1");
    reportParameters.put("P_EXEMPTION_REASON", "");
    reportParameters.put("P_EXEMPTION_TYPE", "");
    reportParameters.put("P_EXEMPTION_NUMBER", "");
    reportParameters.put("P_CLIENT_NUMBER", "");
    reportParameters.put("P_CLIENT_TYPE", "");
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_TENURE_TYPE_1", emptyIfNull(first(parameters, "tenureType1")));
    reportParameters.put("P_TENURE_TYPE_2", emptyIfNull(first(parameters, "tenureType2")));
    reportParameters.put("P_TENURE_TYPE_3", emptyIfNull(first(parameters, "tenureType3")));
    reportParameters.put("P_TENURE_TYPE_4", emptyIfNull(first(parameters, "tenureType4")));
    reportParameters.put("P_TENURE_TYPE_5", emptyIfNull(first(parameters, "tenureType5")));
    reportParameters.put("P_TENURE_TYPE_6", emptyIfNull(first(parameters, "tenureType6")));
    reportParameters.put("P_TIMBER_MARK_1", "");
    reportParameters.put("P_TIMBER_MARK_2", "");
    reportParameters.put("P_TIMBER_MARK_3", "");
    reportParameters.put("P_TIMBER_MARK_4", "");
    reportParameters.put("P_TIMBER_MARK_5", "");
    reportParameters.put("P_TIMBER_MARK_6", "");
    reportParameters.put("P_FOREST_FILE_ID", "");

    return reportParameters;
  }

  private Map<String, Object> tenureMarkAnalysisReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();

    reportParameters.put("P_ORG_UNIT_NUMBER", "-1");
    reportParameters.put("P_EXEMPTION_REASON", "");
    reportParameters.put("P_EXEMPTION_TYPE", "");
    reportParameters.put("P_EXEMPTION_NUMBER", "");
    reportParameters.put("P_CLIENT_NUMBER", "");
    reportParameters.put("P_CLIENT_TYPE", "");
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_TENURE_TYPE_1", "");
    reportParameters.put("P_TENURE_TYPE_2", "");
    reportParameters.put("P_TENURE_TYPE_3", "");
    reportParameters.put("P_TENURE_TYPE_4", "");
    reportParameters.put("P_TENURE_TYPE_5", "");
    reportParameters.put("P_TENURE_TYPE_6", "");
    reportParameters.put("P_TIMBER_MARK_1", emptyIfNull(first(parameters, "timberMark1")));
    reportParameters.put("P_TIMBER_MARK_2", emptyIfNull(first(parameters, "timberMark2")));
    reportParameters.put("P_TIMBER_MARK_3", emptyIfNull(first(parameters, "timberMark3")));
    reportParameters.put("P_TIMBER_MARK_4", emptyIfNull(first(parameters, "timberMark4")));
    reportParameters.put("P_TIMBER_MARK_5", emptyIfNull(first(parameters, "timberMark5")));
    reportParameters.put("P_TIMBER_MARK_6", emptyIfNull(first(parameters, "timberMark6")));
    reportParameters.put("P_FOREST_FILE_ID", "");

    return reportParameters;
  }

  private Map<String, Object> tenureFileAnalysisReport(Map<String, String> parameters) {
    Map<String, Object> reportParameters = new HashMap<>();

    reportParameters.put("P_ORG_UNIT_NUMBER", "-1");
    reportParameters.put("P_EXEMPTION_REASON", "");
    reportParameters.put("P_EXEMPTION_TYPE", "");
    reportParameters.put("P_EXEMPTION_NUMBER", "");
    reportParameters.put("P_CLIENT_NUMBER", "");
    reportParameters.put("P_CLIENT_TYPE", "");
    reportParameters.put("P_FROM_DATE", first(parameters, "fromDate"));
    reportParameters.put("P_TO_DATE", first(parameters, "toDate"));
    reportParameters.put("P_TENURE_TYPE_1", "");
    reportParameters.put("P_TENURE_TYPE_2", "");
    reportParameters.put("P_TENURE_TYPE_3", "");
    reportParameters.put("P_TENURE_TYPE_4", "");
    reportParameters.put("P_TENURE_TYPE_5", "");
    reportParameters.put("P_TENURE_TYPE_6", "");
    reportParameters.put("P_TIMBER_MARK_1", "");
    reportParameters.put("P_TIMBER_MARK_2", "");
    reportParameters.put("P_TIMBER_MARK_3", "");
    reportParameters.put("P_TIMBER_MARK_4", "");
    reportParameters.put("P_TIMBER_MARK_5", "");
    reportParameters.put("P_TIMBER_MARK_6", "");
    reportParameters.put("P_FOREST_FILE_ID", first(parameters, "forestFileId"));

    return reportParameters;
  }

  private String normalizeLegacyAction(String actionMapping) {
    if (actionMapping == null) {
      return null;
    }
    String normalized = actionMapping.trim();
    return normalized.isEmpty() ? null : normalized.toLowerCase(Locale.ROOT);
  }

  private String first(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      if (parameters.containsKey(key)) {
        return parameters.get(key);
      }
    }
    return null;
  }

  private String csvValue(Map<String, String> parameters, String... keys) {
    for (String key : keys) {
      String value = first(parameters, key);
      if (value != null) {
        return normalizeCsv(value);
      }
    }
    return null;
  }

  private String csvValueOrEmpty(Map<String, String> parameters, String... keys) {
    String value = csvValue(parameters, keys);
    return value == null ? "" : value;
  }

  private String normalizeCsv(String value) {
    if (value == null) {
      return null;
    }

    String normalized = value.trim();
    if (normalized.startsWith("[") && normalized.endsWith("]")) {
      normalized = normalized.substring(1, normalized.length() - 1);
    }

    String[] parts = normalized.split(",");
    StringBuilder builder = new StringBuilder();
    for (String part : parts) {
      String trimmed = part == null ? "" : part.trim();
      if (trimmed.isEmpty()) {
        continue;
      }
      if (builder.length() > 0) {
        builder.append(',');
      }
      builder.append(trimmed);
    }
    return builder.length() == 0 ? "" : builder.toString();
  }

  private String defaultDate(String value, String fallback) {
    return isBlank(value) ? fallback : value;
  }

  private String emptyIfNull(String value) {
    return Objects.requireNonNullElse(value, "");
  }

  private boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }

  private BigDecimal asBigDecimal(String value) {
    if (isBlank(value)) {
      return null;
    }
    return new BigDecimal(value.trim());
  }
}

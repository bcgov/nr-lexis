package ca.bc.gov.mof.lexis.service.report;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

public enum LexisJasperReportDefinition {
  BIWEEKLY_LISTING(
      "biweeklyListing", "biweeklyListing", "biweeklyListing", "LEXIS_biweekly"),
  OFFER_REPORT("offerReport", "offerReport", "offerReport", "LEXIS_OFFERS_LEDGER"),
  SPECIES_GRADE_REPORT("speciesGradeReport", "speciesGradeReport", "speciesGradeReport", null),
  EXEMPTION_REPORT("exemptionReport", "exemptionReport", "exemptionLedger", "LEXIS_EXEMPTION_LEDGER"),
  APPLICATION_REPORT("applicationReport", "applicationReport", "applicationLedger", "LEXIS_application_ledger"),
  APPROVED_EXEMPTION_REPORT(
      "approvedExemptionReport", "approvedExemptionReport", null),
  PERMIT_REPORT("permitReport", "permitReport", "LEXIS_PERMIT"),
  PERMIT_LEDGER_REPORT(
      "permitLedgerReport", "permitLedgerReport", "permitLedger", "LEXIS_PERMIT_LEDGER"),
  FEE_REPORT("feeReport", "feeReport", "feeReport", "EXPORT_FEE_SUMMARY"),
  TRANSPORT_REPORT("transportReport", "transportReport", "transportReport", "LEXIS_TRANSPORT_LEDGER"),
  TEAC_REPORT("teacReport", "teacReport", "TeacReport", null),
  TENURE_REPORT("tenureReport", "tenureReport", "tenureAnalysis", "LEXIS_TENURE_ANALYSIS");

  private final String action;
  private final String outputName;
  private final String legacyCsvOutputName;
  private final String templateName;

  LexisJasperReportDefinition(String action, String outputName, String templateName) {
    this(action, outputName, null, templateName);
  }

  LexisJasperReportDefinition(
      String action, String outputName, String legacyCsvOutputName, String templateName) {
    this.action = action;
    this.outputName = outputName;
    this.legacyCsvOutputName = legacyCsvOutputName;
    this.templateName = templateName;
  }

  public String action() {
    return action;
  }

  public String templateName() {
    return templateName;
  }

  public boolean supportsJasperTemplate() {
    return templateName != null;
  }

  public String resolveFilename(LexisReportFormat format) {
    if (format == LexisReportFormat.CSV && legacyCsvOutputName != null) {
      return legacyCsvOutputName + LocalDate.now() + "." + format.extension();
    }
    return outputName + "." + format.extension();
  }

  public static Optional<LexisJasperReportDefinition> fromAction(String action) {
    return Optional.ofNullable(action)
        .flatMap(
            raw ->
                Arrays.stream(values())
                    .filter(definition -> definition.action.equalsIgnoreCase(raw.trim()))
                    .findFirst());
  }
}

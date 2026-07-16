package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.util.Arrays;
import java.util.Optional;

public enum LexisJasperReportDefinition {
  BIWEEKLY_LISTING(
      "biweeklyListing", "advertising-list", "biweeklyListing", "LEXIS_biweekly"),
  OFFER_REPORT("offerReport", "offer-report", "offerReport", "LEXIS_OFFERS_LEDGER"),
  SPECIES_GRADE_REPORT(
      "speciesGradeReport", "species-and-grade-report", "speciesGradeReport", null),
  EXEMPTION_REPORT(
      "exemptionReport", "exemption-report", "exemptionLedger", "LEXIS_EXEMPTION_LEDGER"),
  APPLICATION_REPORT(
      "applicationReport",
      "application-report",
      "applicationLedger",
      "LEXIS_application_ledger"),
  APPROVED_EXEMPTION_REPORT(
      "approvedExemptionReport", "approved-exemption", null),
  PERMIT_REPORT("permitReport", "permit", "LEXIS_PERMIT"),
  PERMIT_LEDGER_REPORT(
      "permitLedgerReport", "permit-ledger-report", "permitLedger", "LEXIS_PERMIT_LEDGER"),
  FEE_REPORT("feeReport", "fee-report", "feeReport", "EXPORT_FEE_SUMMARY"),
  TRANSPORT_REPORT(
      "transportReport", "transport-report", "transportReport", "LEXIS_TRANSPORT_LEDGER"),
  TEAC_REPORT("teacReport", "teac-package-report", "TeacReport", null),
  TENURE_REPORT(
      "tenureReport", "tenure-analysis-report", "tenureAnalysis", "LEXIS_TENURE_ANALYSIS");

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
      return legacyCsvOutputName + LexisBusinessTime.today() + "." + format.extension();
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

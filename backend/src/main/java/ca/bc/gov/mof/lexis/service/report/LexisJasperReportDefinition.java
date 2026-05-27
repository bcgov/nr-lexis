package ca.bc.gov.mof.lexis.service.report;

import java.util.Arrays;
import java.util.Optional;

public enum LexisJasperReportDefinition {
  BIWEEKLY_LISTING("biweeklyListing", "biweeklyListing", "LEXIS_biweekly"),
  OFFER_REPORT("offerReport", "offerReport", "LEXIS_OFFERS_LEDGER"),
  SPECIES_GRADE_REPORT("speciesGradeReport", "speciesGradeReport", null),
  EXEMPTION_REPORT("exemptionReport", "exemptionReport", "LEXIS_EXEMPTION_LEDGER"),
  APPLICATION_REPORT("applicationReport", "applicationReport", "LEXIS_application_ledger"),
  APPROVED_EXEMPTION_REPORT("approvedExemptionReport", "approvedExemptionReport", null),
  PERMIT_REPORT("permitReport", "permitReport", "LEXIS_PERMIT"),
  PERMIT_LEDGER_REPORT("permitLedgerReport", "permitLedgerReport", "LEXIS_PERMIT_LEDGER"),
  FEE_REPORT("feeReport", "feeReport", "EXPORT_FEE_SUMMARY"),
  TRANSPORT_REPORT("transportReport", "transportReport", "LEXIS_TRANSPORT_LEDGER"),
  TEAC_REPORT("teacReport", "teacReport", null),
  TENURE_REPORT("tenureReport", "tenureReport", "LEXIS_TENURE_ANALYSIS");

  private final String action;
  private final String outputName;
  private final String templateName;

  LexisJasperReportDefinition(String action, String outputName, String templateName) {
    this.action = action;
    this.outputName = outputName;
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

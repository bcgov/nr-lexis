package ca.bc.gov.mof.lexis.service.permit;

import java.math.BigDecimal;
import java.util.List;

/**
 * Port for the permit-invoice aggregate transition that legacy LEXIS performed when a permit was
 * completed, moved to payment pending, cancelled, or reactivated.
 *
 * Implementations are selected by configuration. Permit status changes that require invoice
 * work fail closed when no implementation is available, and invoice creation also fails closed
 * when the implementation does not support the permit's destination. Cancelling or reactivating
 * an invoiced permit follows the GBMS link recorded on its active invoice instead of the
 * destination.
 */
public interface PermitInvoiceOrchestrationService {

  /** Whether this implementation can create an invoice for the given destination country. */
  default boolean supportsCountry(String countryCode) {
    return false;
  }

  TransitionResult orchestrate(Transition transition, String userId);

  record Transition(
      Long permitNumber,
      String previousStatusCode,
      String targetStatusCode,
      String countryCode,
      String exemptionNumber,
      Long orgUnitNumber,
      String clientNumber,
      String clientLocationCode,
      String receiptNumber,
      InternalInvoiceSnapshot internalInvoice,
      GbmsInvoiceSnapshot gbmsInvoice) {

    public Transition(
        Long permitNumber,
        String previousStatusCode,
        String targetStatusCode,
        String countryCode,
        String exemptionNumber,
        Long orgUnitNumber,
        String clientNumber,
        String clientLocationCode,
        String receiptNumber,
        InternalInvoiceSnapshot internalInvoice) {
      this(
          permitNumber,
          previousStatusCode,
          targetStatusCode,
          countryCode,
          exemptionNumber,
          orgUnitNumber,
          clientNumber,
          clientLocationCode,
          receiptNumber,
          internalInvoice,
          null);
    }
  }

  record InternalInvoiceSnapshot(
      BigDecimal invoiceTotal,
      String billingClientNumber,
      String billingClientLocationCode,
      BigDecimal exemptionOverrideRate,
      BigDecimal permitOverrideAmount,
      Long originOrgNumber,
      Long adminOrgNumber,
      String ackMaskAcode,
      List<InternalInvoiceDetail> details) {

    public InternalInvoiceSnapshot {
      details = details == null ? List.of() : List.copyOf(details);
    }
  }

  record InternalInvoiceDetail(
      String timberMark,
      String speciesCode,
      String gradeCode,
      BigDecimal volume,
      BigDecimal amount,
      BigDecimal amvRate,
      BigDecimal feePolicyAdmin,
      BigDecimal feePercentage) {}

  record GbmsInvoiceSnapshot(
      BigDecimal invoiceTotal,
      String ownerClientNumber,
      String ownerClientLocationCode,
      Long originOrgNumber,
      Long adminOrgNumber,
      String ackMaskAcode,
      String notationText,
      List<GbmsInvoiceLine> lines) {

    public GbmsInvoiceSnapshot {
      lines = lines == null ? List.of() : List.copyOf(lines);
    }
  }

  record GbmsInvoiceLine(BigDecimal amount, String description) {}

  record TransitionResult(boolean success, String message) {
    public static TransitionResult succeeded() {
      return new TransitionResult(true, null);
    }

    public static TransitionResult failed(String message) {
      return new TransitionResult(false, message);
    }
  }
}

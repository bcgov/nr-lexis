package ca.bc.gov.mof.lexis.service.permit;

import java.math.BigDecimal;
import java.util.List;

/**
 * Port for the permit-invoice aggregate transition that legacy LEXIS performed when a permit was
 * completed, moved to payment pending, cancelled, or reactivated.
 *
 * <p>Implementations are selected by configuration. Permit status changes that require invoice
 * work fail closed when no implementation is available for the requested destination.
 */
public interface PermitInvoiceOrchestrationService {

  /** Allows callers to fail before aggregate mutation when a configured mode cannot handle it. */
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
      InternalInvoiceSnapshot internalInvoice) {}

  /** Immutable values calculated from the validated target permit before invoice persistence. */
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

  /** One scale-level internal permit-invoice detail. */
  record InternalInvoiceDetail(
      String timberMark,
      String speciesCode,
      String gradeCode,
      BigDecimal volume,
      BigDecimal amount,
      BigDecimal amvRate,
      BigDecimal feePolicyAdmin,
      BigDecimal feePercentage) {}

  record TransitionResult(boolean success, String message) {
    public static TransitionResult succeeded() {
      return new TransitionResult(true, null);
    }

    public static TransitionResult failed(String message) {
      return new TransitionResult(false, message);
    }
  }
}

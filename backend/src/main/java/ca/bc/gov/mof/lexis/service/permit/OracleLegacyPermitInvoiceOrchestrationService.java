package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.OracleAuditUserId.encode;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceLine;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import java.math.BigDecimal;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

/** Legacy-compatible Canadian and non-Canadian permit invoice orchestration. */
@Service
@Profile("oracle")
@ConditionalOnProperty(
    name = "lexis.permit-invoice.mode",
    havingValue = "legacy-best-effort",
    matchIfMissing = true)
public class OracleLegacyPermitInvoiceOrchestrationService
    implements PermitInvoiceOrchestrationService {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(OracleLegacyPermitInvoiceOrchestrationService.class);
  private static final String CANADA = "CA";
  private static final String ACTIVE = "ACT";
  private static final String CANCELLED = "CAN";
  private static final String COMPLETE = "COM";
  private static final String PAYMENT_PENDING = "PPD";
  private static final String GBMS_PARTIALLY_PROCESSED_MESSAGE =
      "The permit invoice was only partly processed in GBMS, so the permit was not changed."
          + " Contact the LEXIS administrator before trying again.";
  private static final String PREFLIGHT_MESSAGE =
      "The permit invoice could not be prepared, so the permit was not changed. Check the permit's"
          + " submit date, destination country, scales, owner and region, then try again. If it"
          + " still fails, contact the LEXIS administrator.";

  private final OracleInternalPermitInvoiceService internalInvoices;
  private final OracleGbmsPermitInvoiceService gbmsInvoices;
  private final OracleGbmsInvoiceHistoryService gbmsHistory;

  public OracleLegacyPermitInvoiceOrchestrationService(
      PermitInvoiceRepository invoiceRepository,
      PermitRpcRepository permitRepository,
      OracleGbmsPermitInvoiceService gbmsInvoices) {
    this.internalInvoices = new OracleInternalPermitInvoiceService(invoiceRepository);
    this.gbmsInvoices = gbmsInvoices;
    this.gbmsHistory = new OracleGbmsInvoiceHistoryService(permitRepository);
  }

  @Override
  public boolean supportsCountry(String countryCode) {
    return trimToNull(countryCode) != null;
  }

  @Override
  @Transactional(propagation = Propagation.MANDATORY)
  public TransitionResult orchestrate(Transition transition, String userId) {
    if (transition == null
        || transition.permitNumber() == null
        || transition.permitNumber() < 1
        || trimToNull(userId) == null) {
      return TransitionResult.failed("A valid permit transition and user are required.");
    }

    boolean entering =
        isOneOf(transition.previousStatusCode(), ACTIVE, CANCELLED)
            && isOneOf(transition.targetStatusCode(), COMPLETE, PAYMENT_PENDING);
    boolean leaving =
        isOneOf(transition.previousStatusCode(), COMPLETE, PAYMENT_PENDING)
            && isOneOf(transition.targetStatusCode(), ACTIVE, CANCELLED);
    if (!entering && !leaving) {
      return TransitionResult.failed("The permit transition does not require invoice processing.");
    }
    if (entering && !supportsCountry(transition.countryCode())) {
      return TransitionResult.failed("A valid permit transition and user are required.");
    }

    String stage = "preflight";
    String gbmsInvoiceNumber = null;
    boolean gbmsWriteStarted = false;
    try {
      String oracleUserId = encode(userId);
      if (leaving) {
        // Cancels every active internal and GBMS invoice of the permit, whatever its country.
        List<PermitInvoiceRow> activeInvoices =
            internalInvoices.activeRows(internalInvoices.findHistory(transition.permitNumber()));
        List<GbmsInvoiceHistoryRow> activeGbmsInvoices =
            gbmsHistory.activeRows(gbmsHistory.findRequiredWithoutReceipt(transition));

        stage = "internal_cancel";
        internalInvoices.cancel(transition.permitNumber(), activeInvoices, oracleUserId);

        for (GbmsInvoiceHistoryRow source : activeGbmsInvoices) {
          stage = "gbms_cancel";
          gbmsWriteStarted = true;
          gbmsInvoiceNumber = trimToNull(source.invoiceNumber());
          gbmsInvoices.cancelInvoice(gbmsInvoiceNumber, oracleUserId);
          requireCancelledHistory(transition, source);
        }
        if (!activeGbmsInvoices.isEmpty()
            && !gbmsHistory
                .activeRows(gbmsHistory.findRequiredWithoutReceipt(transition))
                .isEmpty()) {
          throw new DataRetrievalFailureException(
              "A GBMS invoice remained active after cancellation.");
        }
        return TransitionResult.succeeded();
      }

      if (CANADA.equalsIgnoreCase(trimToNull(transition.countryCode()))) {
        List<PermitInvoiceRow> internalHistory = internalInvoices.prepareCreate(transition, false);
        gbmsHistory.validateActiveAlignment(
            internalHistory, gbmsHistory.findRequiredWithoutReceipt(transition));
        internalInvoices.create(transition, oracleUserId, null, false);
        return TransitionResult.succeeded();
      }

      List<PermitInvoiceRow> internalHistory = internalInvoices.prepareCreate(transition, true);
      GbmsInvoiceSnapshot snapshot = validateGbmsSnapshot(transition);
      List<GbmsInvoiceHistoryRow> history = gbmsHistory.findRequiredWithoutReceipt(transition);
      gbmsHistory.validateActiveAlignment(internalHistory, history);
      GbmsInvoiceHistoryRow replacement = replacementCandidate(history);

      stage = "gbms_create";
      gbmsWriteStarted = true;
      gbmsInvoiceNumber =
          gbmsInvoices.createInvoice(transition.permitNumber(), snapshot, oracleUserId);
      requireCreatedHistory(transition, gbmsInvoiceNumber);

      stage = "internal_create";
      internalInvoices.create(transition, oracleUserId, gbmsInvoiceNumber, true);

      if (replacement != null) {
        stage = "gbms_replacement";
        gbmsInvoices.replaceInvoice(
            gbmsInvoiceNumber, replacement.invoiceNumber(), oracleUserId);
        requireReplacementHistory(transition, replacement.invoiceNumber(), gbmsInvoiceNumber);
      }
      return TransitionResult.succeeded();
    } catch (RuntimeException ex) {
      markRollbackOnly();
      LOGGER.warn(
          "event=lexis_permit_invoice operation=legacy_best_effort outcome=failed permitFingerprint={} stage={} gbmsWriteStarted={} gbmsInvoiceFingerprint={} failureType={}",
          fingerprint(Long.toString(transition.permitNumber())),
          controlSafe(stage),
          gbmsWriteStarted,
          gbmsInvoiceNumber == null ? "none" : fingerprint(gbmsInvoiceNumber),
          exceptionType(ex));
      if (gbmsWriteStarted) {
        return TransitionResult.failed(GBMS_PARTIALLY_PROCESSED_MESSAGE);
      }
      return TransitionResult.failed(
          ex instanceof OracleInternalPermitInvoiceService.InvoiceBlockedException
              ? ex.getMessage()
              : PREFLIGHT_MESSAGE);
    }
  }

  private GbmsInvoiceSnapshot validateGbmsSnapshot(Transition transition) {
    GbmsInvoiceSnapshot snapshot = transition.gbmsInvoice();
    InternalInvoiceSnapshot internal = transition.internalInvoice();
    if (snapshot == null
        || snapshot.invoiceTotal() == null
        || snapshot.invoiceTotal().compareTo(BigDecimal.ZERO) < 0
        || trimToNull(snapshot.ownerClientNumber()) == null
        || trimToNull(snapshot.ownerClientLocationCode()) == null
        || snapshot.originOrgNumber() == null
        || snapshot.originOrgNumber() < 1
        || snapshot.adminOrgNumber() == null
        || snapshot.adminOrgNumber() < 1
        || trimToNull(snapshot.ackMaskAcode()) == null
        || trimToNull(snapshot.notationText()) == null
        || snapshot.notationText().length() > 62
        || snapshot.lines().isEmpty()
        || internal == null
        || !sameDecimal(snapshot.invoiceTotal(), internal.invoiceTotal())
        || !sameText(snapshot.ownerClientNumber(), internal.billingClientNumber())
        || !sameText(
            snapshot.ownerClientLocationCode(), internal.billingClientLocationCode())
        || !java.util.Objects.equals(snapshot.originOrgNumber(), internal.originOrgNumber())
        || !java.util.Objects.equals(snapshot.adminOrgNumber(), internal.adminOrgNumber())
        || !sameText(snapshot.ackMaskAcode(), internal.ackMaskAcode())) {
      throw new DataRetrievalFailureException("The GBMS invoice snapshot is invalid.");
    }

    BigDecimal lineTotal = BigDecimal.ZERO;
    for (GbmsInvoiceLine line : snapshot.lines()) {
      if (line == null
          || line.amount() == null
          || line.amount().compareTo(BigDecimal.ZERO) < 0
          || trimToNull(line.description()) == null
          || line.description().length() > 38) {
        throw new DataRetrievalFailureException("The GBMS invoice contains an invalid detail.");
      }
      lineTotal = lineTotal.add(line.amount());
    }
    if (!sameDecimal(snapshot.invoiceTotal(), lineTotal)) {
      throw new DataRetrievalFailureException(
          "The GBMS invoice total does not match its details.");
    }
    return snapshot;
  }

  private GbmsInvoiceHistoryRow replacementCandidate(List<GbmsInvoiceHistoryRow> gbmsHistory) {
    return gbmsHistory.stream()
        .filter(row -> BigDecimal.valueOf(row.invoiceAmount()).compareTo(BigDecimal.ZERO) > 0)
        .filter(row -> trimToNull(row.replacedByInvoice()) == null)
        .findFirst()
        .orElse(null);
  }

  private void requireCreatedHistory(Transition transition, String invoiceNumber) {
    boolean found =
        gbmsHistory.findRequiredWithoutReceipt(transition).stream()
            .anyMatch(
                row ->
                    invoiceNumber.equalsIgnoreCase(trimToNull(row.invoiceNumber()))
                        && trimToNull(row.cancelledByInvoice()) == null
                        && trimToNull(row.replacedByInvoice()) == null
                        && BigDecimal.valueOf(row.invoiceAmount())
                                .compareTo(transition.gbmsInvoice().invoiceTotal())
                            == 0);
    if (!found) {
      throw new DataRetrievalFailureException(
          "The new GBMS invoice was not returned by invoice history.");
    }
  }

  private void requireReplacementHistory(
      Transition transition, String originalInvoice, String replacementInvoice) {
    boolean found =
        gbmsHistory.findRequiredWithoutReceipt(transition).stream()
            .anyMatch(
                row ->
                    originalInvoice.equalsIgnoreCase(trimToNull(row.invoiceNumber()))
                        && replacementInvoice.equalsIgnoreCase(
                            trimToNull(row.replacedByInvoice())));
    if (!found) {
      throw new DataRetrievalFailureException(
          "The GBMS replacement relationship was not returned by invoice history.");
    }
  }

  private void requireCancelledHistory(
      Transition transition, GbmsInvoiceHistoryRow source) {
    List<GbmsInvoiceHistoryRow> history = gbmsHistory.findRequiredWithoutReceipt(transition);
    List<GbmsInvoiceHistoryRow> originals =
        history.stream()
            .filter(
                row ->
                    source.invoiceNumber().equalsIgnoreCase(
                        trimToNull(row.invoiceNumber())))
            .toList();
    if (source.printedDate() == null) {
      if (!originals.isEmpty()) {
        throw new DataRetrievalFailureException(
            "The unprinted GBMS invoice remained after cancellation.");
      }
      return;
    }
    if (originals.size() != 1) {
      throw new DataRetrievalFailureException(
          "The printed GBMS invoice was unavailable after cancellation.");
    }
    String cancellationInvoice = trimToNull(originals.get(0).cancelledByInvoice());
    boolean cancellationFound =
        cancellationInvoice != null
            && history.stream()
                .anyMatch(
                    row ->
                        cancellationInvoice.equalsIgnoreCase(
                                trimToNull(row.invoiceNumber()))
                            && BigDecimal.valueOf(row.invoiceAmount())
                                    .compareTo(
                                        BigDecimal.valueOf(source.invoiceAmount())
                                            .abs()
                                            .negate())
                                == 0);
    if (!cancellationFound) {
      throw new DataRetrievalFailureException(
          "The printed GBMS cancellation invoice was unavailable.");
    }
  }

  private boolean isOneOf(String value, String first, String second) {
    String normalized = trimToNull(value);
    return first.equalsIgnoreCase(normalized) || second.equalsIgnoreCase(normalized);
  }

  private boolean sameText(String expected, String actual) {
    return java.util.Objects.equals(trimToNull(expected), trimToNull(actual));
  }

  private boolean sameDecimal(BigDecimal expected, BigDecimal actual) {
    return expected != null && actual != null && expected.compareTo(actual) == 0;
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {}
  }
}

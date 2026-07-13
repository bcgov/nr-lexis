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
import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
        || !supportsCountry(transition.countryCode())
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

    String stage = "preflight";
    String gbmsInvoiceNumber = null;
    boolean gbmsWriteStarted = false;
    try {
      String oracleUserId = encode(userId);
      if (CANADA.equalsIgnoreCase(trimToNull(transition.countryCode()))) {
        List<PermitInvoiceRow> internalHistory =
            entering
                ? internalInvoices.prepareCreate(transition, false)
                : internalInvoices.findHistory(transition.permitNumber());
        gbmsHistory.validateActiveAlignment(
            internalHistory, gbmsHistory.findRequired(transition));
        if (entering) {
          internalInvoices.create(transition, oracleUserId, null, false);
        } else {
          PermitInvoiceRow active =
              internalInvoices.requireSingleActive(internalHistory, false);
          internalInvoices.cancel(transition.permitNumber(), active, oracleUserId);
        }
        return TransitionResult.succeeded();
      }

      if (entering) {
        List<PermitInvoiceRow> internalHistory = internalInvoices.prepareCreate(transition, true);
        GbmsInvoiceSnapshot snapshot = validateGbmsSnapshot(transition);
        List<GbmsInvoiceHistoryRow> history = gbmsHistory.findRequired(transition);
        gbmsHistory.validateActiveAlignment(internalHistory, history);
        GbmsInvoiceHistoryRow replacement = replacementCandidate(internalHistory, history);

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
      } else {
        List<PermitInvoiceRow> internalHistory =
            internalInvoices.findHistory(transition.permitNumber());
        PermitInvoiceRow active =
            internalInvoices.requireSingleActive(internalHistory, true);
        gbmsInvoiceNumber = active.gbmsInvoiceNumber();
        List<GbmsInvoiceHistoryRow> history = gbmsHistory.findRequired(transition);
        gbmsHistory.validateActiveAlignment(internalHistory, history);
        GbmsInvoiceHistoryRow source = requireCancellableHistory(history, active);

        stage = "internal_cancel";
        internalInvoices.cancel(transition.permitNumber(), active, oracleUserId);

        stage = "gbms_cancel";
        gbmsWriteStarted = true;
        gbmsInvoices.cancelInvoice(gbmsInvoiceNumber, oracleUserId);
        requireCancelledHistory(transition, source);
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
      return TransitionResult.failed(
          gbmsWriteStarted
              ? "Permit invoicing failed after GBMS processing began; reconcile before retry."
              : "Permit invoice preflight failed.");
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

  private GbmsInvoiceHistoryRow replacementCandidate(
      List<PermitInvoiceRow> internalHistory, List<GbmsInvoiceHistoryRow> gbmsHistory) {
    Set<String> linkedInvoices = new HashSet<>();
    for (PermitInvoiceRow row : internalHistory) {
      String invoiceNumber = trimToNull(row.gbmsInvoiceNumber());
      if (invoiceNumber != null) {
        linkedInvoices.add(invoiceNumber.toUpperCase(java.util.Locale.ROOT));
      }
    }
    List<GbmsInvoiceHistoryRow> candidates =
        gbmsHistory.stream()
            .filter(row -> BigDecimal.valueOf(row.invoiceAmount()).compareTo(BigDecimal.ZERO) > 0)
            .filter(row -> trimToNull(row.replacedByInvoice()) == null)
            .filter(
                row ->
                    linkedInvoices.contains(
                        trimToNull(row.invoiceNumber()).toUpperCase(java.util.Locale.ROOT)))
            .toList();
    if (candidates.size() > 1) {
      throw new DataRetrievalFailureException(
          "More than one prior GBMS invoice is eligible for replacement.");
    }
    return candidates.isEmpty() ? null : candidates.get(0);
  }

  private void requireCreatedHistory(Transition transition, String invoiceNumber) {
    boolean found =
        gbmsHistory.findRequired(transition).stream()
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
        gbmsHistory.findRequired(transition).stream()
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

  private GbmsInvoiceHistoryRow requireCancellableHistory(
      List<GbmsInvoiceHistoryRow> history, PermitInvoiceRow active) {
    List<GbmsInvoiceHistoryRow> activeMatches =
        history.stream()
            .filter(
                row ->
                    active.gbmsInvoiceNumber().equalsIgnoreCase(
                        trimToNull(row.invoiceNumber())))
            .filter(row -> trimToNull(row.cancelledByInvoice()) == null)
            .toList();
    if (activeMatches.size() != 1) {
      throw new DataRetrievalFailureException(
          "Exactly one active GBMS invoice is required for cancellation.");
    }
    GbmsInvoiceHistoryRow source = activeMatches.get(0);
    if (trimToNull(source.replacedByInvoice()) != null
        || BigDecimal.valueOf(source.invoiceAmount()).compareTo(active.invoiceTotal()) != 0) {
      throw new DataRetrievalFailureException(
          "The active GBMS invoice does not match the internal permit invoice.");
    }
    return source;
  }

  private void requireCancelledHistory(
      Transition transition, GbmsInvoiceHistoryRow source) {
    List<GbmsInvoiceHistoryRow> history = gbmsHistory.findRequired(transition);
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

  private static String normalizedInvoiceNumber(String invoiceNumber) {
    String normalized = trimToNull(invoiceNumber);
    return normalized == null ? null : normalized.toUpperCase(java.util.Locale.ROOT);
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

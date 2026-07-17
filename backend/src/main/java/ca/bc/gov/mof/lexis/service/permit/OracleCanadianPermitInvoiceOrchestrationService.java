package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.OracleAuditUserId.encode;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

/** Processes Canadian permit invoicing and rejects non-Canadian transitions. */
@Service
@Profile("oracle")
@ConditionalOnProperty(
    name = "lexis.permit-invoice.mode",
    havingValue = "canadian-internal")
public class OracleCanadianPermitInvoiceOrchestrationService
    implements PermitInvoiceOrchestrationService {

  private static final Logger LOGGER =
      LoggerFactory.getLogger(OracleCanadianPermitInvoiceOrchestrationService.class);
  private static final String CANADA = "CA";
  private static final String ACTIVE = "ACT";
  private static final String CANCELLED = "CAN";
  private static final String COMPLETE = "COM";
  private static final String PAYMENT_PENDING = "PPD";
  private final OracleInternalPermitInvoiceService internalInvoices;
  private final OracleGbmsInvoiceHistoryService gbmsHistory;

  public OracleCanadianPermitInvoiceOrchestrationService(
      PermitInvoiceRepository repository, PermitRpcRepository permitRepository) {
    this.internalInvoices = new OracleInternalPermitInvoiceService(repository);
    this.gbmsHistory = new OracleGbmsInvoiceHistoryService(permitRepository);
  }

  @Override
  public boolean supportsCountry(String countryCode) {
    return CANADA.equalsIgnoreCase(trimToNull(countryCode));
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
    if (!supportsCountry(transition.countryCode())) {
      return TransitionResult.failed(
          "Canadian internal invoicing cannot process a non-Canadian permit.");
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

    try {
      String oracleUserId = encode(userId);
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
    } catch (RuntimeException ex) {
      markRollbackOnly();
      LOGGER.warn(
          "event=lexis_permit_invoice operation=canadian_internal outcome=failed permitFingerprint={} fromStatus={} toStatus={} failureType={}",
          fingerprint(Long.toString(transition.permitNumber())),
          controlSafe(transition.previousStatusCode()),
          controlSafe(transition.targetStatusCode()),
          exceptionType(ex));
      return TransitionResult.failed("Canadian internal permit invoicing failed.");
    }
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {}
  }

  private boolean isOneOf(String value, String first, String second) {
    String normalized = trimToNull(value);
    return first.equalsIgnoreCase(normalized) || second.equalsIgnoreCase(normalized);
  }
}

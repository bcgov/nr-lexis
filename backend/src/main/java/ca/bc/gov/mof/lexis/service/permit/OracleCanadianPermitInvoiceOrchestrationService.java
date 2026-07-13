package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.OracleAuditUserId.encode;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceUpdate;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceDetail;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

/**
 * Legacy-compatible internal permit invoicing for Canadian destinations.
 *
 * <p>This implementation deliberately has no GBMS dependency. It is disabled by default and must
 * not be enabled until the deployed Oracle procedures have passed rollback acceptance testing.
 */
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
  private final PermitInvoiceRepository repository;

  public OracleCanadianPermitInvoiceOrchestrationService(
      PermitInvoiceRepository repository) {
    this.repository = repository;
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
    if (!CANADA.equalsIgnoreCase(trimToNull(transition.countryCode()))) {
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
      String oracleUserId = oracleAuditUser(userId);
      if (entering) {
        createInternalInvoice(transition, oracleUserId);
      } else {
        cancelInternalInvoice(transition.permitNumber(), oracleUserId);
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
    } catch (NoTransactionException ignored) {
      // Direct unit calls do not have the mandatory Spring transaction proxy.
    }
  }

  private void createInternalInvoice(Transition transition, String userId) {
    InternalInvoiceSnapshot snapshot = validateSnapshot(transition.internalInvoice());
    List<PermitInvoiceRow> existing =
        validateInvoiceRows(
            transition.permitNumber(),
            repository.findByPermitDetailNumberRequired(transition.permitNumber()));
    rejectGbmsLinkedHistory(existing);
    if (!activeRows(existing).isEmpty()) {
      throw new DataRetrievalFailureException(
          "An active permit invoice already exists for the permit.");
    }

    PermitInvoiceRow inserted =
        repository.insertPermitInvoiceRequired(
            new PermitInvoiceInsert(
                transition.permitNumber(),
                null,
                snapshot.invoiceTotal(),
                snapshot.billingClientNumber(),
                snapshot.billingClientLocationCode(),
                snapshot.exemptionOverrideRate(),
                snapshot.permitOverrideAmount(),
                snapshot.originOrgNumber(),
                snapshot.adminOrgNumber(),
                snapshot.ackMaskAcode(),
                userId));
    validateInsertedHeader(transition.permitNumber(), snapshot, inserted, userId);

    List<PermitInvoiceDetailRow> finalRows = List.of();
    for (InternalInvoiceDetail detail : snapshot.details()) {
      finalRows =
          repository.insertPermitInvoiceDetailRequired(
              new PermitInvoiceDetailInsert(
                  inserted.permitInvoiceNumber(),
                  detail.timberMark(),
                  detail.speciesCode(),
                  detail.gradeCode(),
                  detail.volume(),
                  detail.amount(),
                  detail.amvRate(),
                  detail.feePolicyAdmin(),
                  detail.feePercentage(),
                  userId));
    }
    validateInsertedDetails(inserted.permitInvoiceNumber(), snapshot.details(), finalRows);
  }

  private InternalInvoiceSnapshot validateSnapshot(InternalInvoiceSnapshot snapshot) {
    if (snapshot == null
        || snapshot.invoiceTotal() == null
        || snapshot.invoiceTotal().compareTo(BigDecimal.ZERO) < 0
        || trimToNull(snapshot.billingClientNumber()) == null
        || trimToNull(snapshot.billingClientLocationCode()) == null
        || snapshot.exemptionOverrideRate() == null
        || snapshot.exemptionOverrideRate().compareTo(BigDecimal.ZERO) < 0
        || snapshot.permitOverrideAmount() == null
        || snapshot.permitOverrideAmount().compareTo(BigDecimal.ZERO) < 0
        || snapshot.originOrgNumber() == null
        || snapshot.originOrgNumber() < 1
        || snapshot.adminOrgNumber() == null
        || snapshot.adminOrgNumber() < 1
        || trimToNull(snapshot.ackMaskAcode()) != null
        || snapshot.details().isEmpty()) {
      throw new DataRetrievalFailureException(
          "The Canadian internal permit invoice snapshot is invalid.");
    }
    BigDecimal detailTotal = BigDecimal.ZERO;
    for (InternalInvoiceDetail detail : snapshot.details()) {
      if (detail == null
          || trimToNull(detail.timberMark()) == null
          || trimToNull(detail.speciesCode()) == null
          || trimToNull(detail.gradeCode()) == null
          || detail.volume() == null
          || detail.volume().compareTo(BigDecimal.ZERO) <= 0
          || detail.amount() == null
          || detail.amount().compareTo(BigDecimal.ZERO) < 0
          || detail.amvRate() == null
          || detail.amvRate().compareTo(BigDecimal.ZERO) < 0
          || detail.feePolicyAdmin() == null
          || detail.feePolicyAdmin().compareTo(BigDecimal.ZERO) < 0
          || detail.feePercentage() == null
          || detail.feePercentage().compareTo(BigDecimal.ZERO) < 0) {
        throw new DataRetrievalFailureException(
            "The Canadian internal permit invoice contains an invalid detail.");
      }
      detailTotal = detailTotal.add(detail.amount());
    }
    if (snapshot.invoiceTotal().compareTo(BigDecimal.ZERO) != 0
        && snapshot.invoiceTotal().compareTo(detailTotal) != 0) {
      throw new DataRetrievalFailureException(
          "The Canadian internal permit invoice total does not match its details.");
    }
    return snapshot;
  }

  private void cancelInternalInvoice(Long permitNumber, String userId) {
    List<PermitInvoiceRow> before =
        validateInvoiceRows(
            permitNumber, repository.findByPermitDetailNumberRequired(permitNumber));
    rejectGbmsLinkedHistory(before);
    List<PermitInvoiceRow> active = activeRows(before);
    if (active.size() != 1) {
      throw new DataRetrievalFailureException(
          "Exactly one active permit invoice is required for cancellation.");
    }
    PermitInvoiceRow invoice = active.get(0);
    repository.updatePermitInvoiceRequired(
        new PermitInvoiceUpdate(invoice.permitInvoiceNumber(), null, userId));

    List<PermitInvoiceRow> after =
        validateInvoiceRows(
            permitNumber, repository.findByPermitDetailNumberRequired(permitNumber));
    if (!activeRows(after).isEmpty()) {
      throw new DataRetrievalFailureException(
          "The permit invoice remained active after cancellation.");
    }
    PermitInvoiceRow cancelled =
        after.stream()
            .filter(row -> invoice.permitInvoiceNumber().equals(row.permitInvoiceNumber()))
            .findFirst()
            .orElseThrow(
                () ->
                    new DataRetrievalFailureException(
                        "The cancelled permit invoice was not returned by Oracle."));
    if (cancelled.cancelTimestamp() == null
        || !userId.equalsIgnoreCase(trimToNull(cancelled.cancelUserId()))) {
      throw new DataRetrievalFailureException(
          "The permit invoice cancellation audit did not match the submitted user.");
    }
  }

  private List<PermitInvoiceRow> validateInvoiceRows(
      Long permitNumber, List<PermitInvoiceRow> rows) {
    if (rows == null) {
      throw new DataRetrievalFailureException("Oracle returned no permit invoice result.");
    }
    for (PermitInvoiceRow row : rows) {
      if (row == null
          || row.permitInvoiceNumber() == null
          || row.permitInvoiceNumber() < 1
          || !permitNumber.equals(row.permitDetailNumber())) {
        throw new DataRetrievalFailureException(
            "Oracle returned an invalid permit invoice row.");
      }
      boolean hasCancelTimestamp = row.cancelTimestamp() != null;
      boolean hasCancelUser = trimToNull(row.cancelUserId()) != null;
      if (hasCancelTimestamp != hasCancelUser) {
        throw new DataRetrievalFailureException(
            "Oracle returned an inconsistent permit invoice cancellation state.");
      }
    }
    return List.copyOf(rows);
  }

  private List<PermitInvoiceRow> activeRows(List<PermitInvoiceRow> rows) {
    return rows.stream()
        .filter(row -> row.cancelTimestamp() == null && trimToNull(row.cancelUserId()) == null)
        .toList();
  }

  private void rejectGbmsLinkedHistory(List<PermitInvoiceRow> rows) {
    if (rows.stream().anyMatch(row -> trimToNull(row.gbmsInvoiceNumber()) != null)) {
      throw new DataRetrievalFailureException(
          "Canadian internal invoicing cannot process GBMS-linked invoice history.");
    }
  }

  private void validateInsertedHeader(
      Long permitNumber,
      InternalInvoiceSnapshot expected,
      PermitInvoiceRow actual,
      String userId) {
    if (actual == null
        || actual.permitInvoiceNumber() == null
        || actual.permitInvoiceNumber() < 1
        || !permitNumber.equals(actual.permitDetailNumber())
        || trimToNull(actual.gbmsInvoiceNumber()) != null
        || !sameDecimal(expected.invoiceTotal(), actual.invoiceTotal())
        || !sameText(expected.billingClientNumber(), actual.clientNumber())
        || !sameText(expected.billingClientLocationCode(), actual.clientLocationCode())
        || !sameDecimal(expected.exemptionOverrideRate(), actual.exemptionOverrideRate())
        || !sameDecimal(expected.permitOverrideAmount(), actual.permitOverrideAmount())
        || !java.util.Objects.equals(expected.originOrgNumber(), actual.originOrgNumber())
        || !java.util.Objects.equals(expected.adminOrgNumber(), actual.adminOrgNumber())
        || !sameText(expected.ackMaskAcode(), actual.ackMaskAcode())
        || actual.submitTimestamp() == null
        || !sameText(userId, actual.submitUserId())
        || actual.cancelTimestamp() != null
        || trimToNull(actual.cancelUserId()) != null) {
      throw new DataRetrievalFailureException(
          "Oracle returned a permit invoice header that did not match the submitted values.");
    }
  }

  private void validateInsertedDetails(
      Long permitInvoiceNumber,
      List<InternalInvoiceDetail> expected,
      List<PermitInvoiceDetailRow> actual) {
    if (actual == null || actual.size() != expected.size()) {
      throw new DataRetrievalFailureException(
          "Oracle returned an unexpected number of permit invoice details.");
    }

    Map<DetailKey, Integer> expectedCounts = new HashMap<>();
    for (InternalInvoiceDetail detail : expected) {
      expectedCounts.merge(DetailKey.from(detail), 1, Integer::sum);
    }
    Map<DetailKey, Integer> actualCounts = new HashMap<>();
    for (PermitInvoiceDetailRow row : actual) {
      if (row == null
          || row.permitInvoiceDetailNumber() == null
          || row.permitInvoiceDetailNumber() < 1
          || !permitInvoiceNumber.equals(row.permitInvoiceNumber())) {
        throw new DataRetrievalFailureException(
            "Oracle returned an invalid permit invoice detail row.");
      }
      actualCounts.merge(DetailKey.from(row), 1, Integer::sum);
    }
    if (!expectedCounts.equals(actualCounts)) {
      throw new DataRetrievalFailureException(
          "Oracle permit invoice details did not match the submitted values.");
    }
  }

  private boolean isOneOf(String value, String first, String second) {
    String normalized = trimToNull(value);
    return first.equalsIgnoreCase(normalized) || second.equalsIgnoreCase(normalized);
  }

  private String oracleAuditUser(String userId) {
    return encode(userId);
  }

  private boolean sameText(String expected, String actual) {
    return java.util.Objects.equals(trimToNull(expected), trimToNull(actual));
  }

  private boolean sameDecimal(BigDecimal expected, BigDecimal actual) {
    return expected == null ? actual == null : actual != null && expected.compareTo(actual) == 0;
  }

  private record DetailKey(
      String timberMark,
      String speciesCode,
      String gradeCode,
      String volume,
      String amount,
      String amvRate,
      String feePolicyAdmin,
      String feePercentage) {

    private static DetailKey from(InternalInvoiceDetail detail) {
      return new DetailKey(
          normalizedText(detail.timberMark()),
          normalizedText(detail.speciesCode()),
          normalizedText(detail.gradeCode()),
          normalizedDecimal(detail.volume()),
          normalizedDecimal(detail.amount()),
          normalizedDecimal(detail.amvRate()),
          normalizedDecimal(detail.feePolicyAdmin()),
          normalizedDecimal(detail.feePercentage()));
    }

    private static DetailKey from(PermitInvoiceDetailRow row) {
      return new DetailKey(
          normalizedText(row.timberMark()),
          normalizedText(row.speciesCode()),
          normalizedText(row.gradeCode()),
          normalizedDecimal(row.volume()),
          normalizedDecimal(row.amount()),
          normalizedDecimal(row.amvRate()),
          normalizedDecimal(row.feePolicyAdmin()),
          normalizedDecimal(row.feePercentage()));
    }

    private static String normalizedText(String value) {
      return trimToNull(value);
    }

    private static String normalizedDecimal(BigDecimal value) {
      return value == null ? null : value.stripTrailingZeros().toPlainString();
    }
  }
}

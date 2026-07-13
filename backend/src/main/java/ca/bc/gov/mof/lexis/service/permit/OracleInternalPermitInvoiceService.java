package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceUpdate;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceDetail;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.Transition;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DataRetrievalFailureException;

/** Shared LEXIS-internal invoice persistence for Canadian and GBMS-backed permits. */
final class OracleInternalPermitInvoiceService {

  private final PermitInvoiceRepository repository;

  OracleInternalPermitInvoiceService(PermitInvoiceRepository repository) {
    this.repository = repository;
  }

  List<PermitInvoiceRow> prepareCreate(Transition transition, boolean gbmsRequired) {
    validateSnapshot(transition.internalInvoice(), gbmsRequired);
    List<PermitInvoiceRow> existing = findInvoices(transition.permitNumber());
    if (!activeRows(existing).isEmpty()) {
      throw new DataRetrievalFailureException(
          "An active permit invoice already exists for the permit.");
    }
    return existing;
  }

  PermitInvoiceRow create(
      Transition transition, String userId, String gbmsInvoiceNumber, boolean gbmsRequired) {
    InternalInvoiceSnapshot snapshot = validateSnapshot(transition.internalInvoice(), gbmsRequired);
    prepareCreate(transition, gbmsRequired);
    if (gbmsRequired != (trimToNull(gbmsInvoiceNumber) != null)) {
      throw new DataRetrievalFailureException(
          "The internal permit invoice GBMS relationship is invalid.");
    }

    PermitInvoiceRow inserted =
        repository.insertPermitInvoiceRequired(
            new PermitInvoiceInsert(
                transition.permitNumber(),
                gbmsInvoiceNumber,
                snapshot.invoiceTotal(),
                snapshot.billingClientNumber(),
                snapshot.billingClientLocationCode(),
                snapshot.exemptionOverrideRate(),
                snapshot.permitOverrideAmount(),
                snapshot.originOrgNumber(),
                snapshot.adminOrgNumber(),
                snapshot.ackMaskAcode(),
                userId));
    validateInsertedHeader(
        transition.permitNumber(), snapshot, inserted, gbmsInvoiceNumber, userId);

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
    return inserted;
  }

  PermitInvoiceRow requireSingleActive(Long permitNumber, boolean gbmsRequired) {
    return requireSingleActive(findInvoices(permitNumber), gbmsRequired);
  }

  List<PermitInvoiceRow> findHistory(Long permitNumber) {
    return findInvoices(permitNumber);
  }

  PermitInvoiceRow requireSingleActive(
      List<PermitInvoiceRow> rows, boolean gbmsRequired) {
    List<PermitInvoiceRow> active = activeRows(rows);
    if (active.size() != 1) {
      throw new DataRetrievalFailureException(
          "Exactly one active permit invoice is required for cancellation.");
    }
    PermitInvoiceRow invoice = active.get(0);
    if (gbmsRequired != (trimToNull(invoice.gbmsInvoiceNumber()) != null)) {
      throw new DataRetrievalFailureException(
          "The active permit invoice GBMS relationship is invalid.");
    }
    return invoice;
  }

  void cancel(Long permitNumber, PermitInvoiceRow invoice, String userId) {
    repository.updatePermitInvoiceRequired(
        new PermitInvoiceUpdate(
            invoice.permitInvoiceNumber(), invoice.gbmsInvoiceNumber(), userId));

    List<PermitInvoiceRow> after = findInvoices(permitNumber);
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

  private InternalInvoiceSnapshot validateSnapshot(
      InternalInvoiceSnapshot snapshot, boolean gbmsRequired) {
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
        || gbmsRequired != (trimToNull(snapshot.ackMaskAcode()) != null)
        || snapshot.details().isEmpty()) {
      throw new DataRetrievalFailureException("The internal permit invoice snapshot is invalid.");
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
            "The internal permit invoice contains an invalid detail.");
      }
      detailTotal = detailTotal.add(detail.amount());
    }

    if (snapshot.invoiceTotal().compareTo(BigDecimal.ZERO) != 0) {
      BigDecimal expectedTotal =
          gbmsRequired
                  && snapshot.permitOverrideAmount().compareTo(BigDecimal.ZERO) > 0
              ? snapshot.permitOverrideAmount()
              : detailTotal;
      if (snapshot.invoiceTotal().compareTo(expectedTotal) != 0) {
        throw new DataRetrievalFailureException(
            "The internal permit invoice total does not match its calculated amount.");
      }
    }
    return snapshot;
  }

  private List<PermitInvoiceRow> findInvoices(Long permitNumber) {
    List<PermitInvoiceRow> rows = repository.findByPermitDetailNumberRequired(permitNumber);
    if (rows == null) {
      throw new DataRetrievalFailureException("Oracle returned no permit invoice result.");
    }
    for (PermitInvoiceRow row : rows) {
      if (row == null
          || row.permitInvoiceNumber() == null
          || row.permitInvoiceNumber() < 1
          || !permitNumber.equals(row.permitDetailNumber())) {
        throw new DataRetrievalFailureException("Oracle returned an invalid permit invoice row.");
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

  private void validateInsertedHeader(
      Long permitNumber,
      InternalInvoiceSnapshot expected,
      PermitInvoiceRow actual,
      String gbmsInvoiceNumber,
      String userId) {
    if (actual == null
        || actual.permitInvoiceNumber() == null
        || actual.permitInvoiceNumber() < 1
        || !permitNumber.equals(actual.permitDetailNumber())
        || !sameText(gbmsInvoiceNumber, actual.gbmsInvoiceNumber())
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

package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.Transition;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataRetrievalFailureException;

/** Validates GBMS history before any permit invoice mutation. */
final class OracleGbmsInvoiceHistoryService {

  private final PermitRpcRepository repository;

  OracleGbmsInvoiceHistoryService(PermitRpcRepository repository) {
    this.repository = repository;
  }

  /** Reads the permit's history with the transition's receipt. */
  List<GbmsInvoiceHistoryRow> findRequired(Transition transition) {
    return findRequired(transition.receiptNumber(), transition.permitNumber());
  }

  /**
   * Reads the permit's history with no receipt, so the procedure never looks the receipt up as an
   * invoice number.
   */
  List<GbmsInvoiceHistoryRow> findRequiredWithoutReceipt(Transition transition) {
    return findRequired("", transition.permitNumber());
  }

  /**
   * Returns the active invoices: not negative, not cancelled, not replaced and not themselves a
   * cancellation.
   */
  List<GbmsInvoiceHistoryRow> activeRows(List<GbmsInvoiceHistoryRow> gbmsHistory) {
    Set<String> cancellationInvoices =
        gbmsHistory.stream()
            .map(GbmsInvoiceHistoryRow::cancelledByInvoice)
            .map(OracleGbmsInvoiceHistoryService::normalizedInvoiceNumber)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    return gbmsHistory.stream()
        .filter(row -> BigDecimal.valueOf(row.invoiceAmount()).compareTo(BigDecimal.ZERO) >= 0)
        .filter(row -> trimToNull(row.cancelledByInvoice()) == null)
        .filter(row -> trimToNull(row.replacedByInvoice()) == null)
        .filter(row -> !cancellationInvoices.contains(normalizedInvoiceNumber(row.invoiceNumber())))
        .toList();
  }

  void validateActiveAlignment(
      List<PermitInvoiceRow> internalHistory, List<GbmsInvoiceHistoryRow> gbmsHistory) {
    Set<String> activeLinkedInvoices = new HashSet<>();
    for (PermitInvoiceRow row : internalHistory) {
      String invoiceNumber =
          row.cancelTimestamp() == null && trimToNull(row.cancelUserId()) == null
              ? trimToNull(row.gbmsInvoiceNumber())
              : null;
      if (invoiceNumber != null) {
        activeLinkedInvoices.add(invoiceNumber.toUpperCase(Locale.ROOT));
      }
    }
    boolean hasMisalignedActiveInvoice =
        activeRows(gbmsHistory).stream()
            .map(row -> normalizedInvoiceNumber(row.invoiceNumber()))
            .anyMatch(invoiceNumber -> !activeLinkedInvoices.contains(invoiceNumber));
    if (hasMisalignedActiveInvoice) {
      throw new OracleInternalPermitInvoiceService.InvoiceBlockedException(
          "The GBMS invoices for this permit do not match its LEXIS invoices, so its status"
              + " cannot be changed. Contact the LEXIS administrator.");
    }
  }

  private List<GbmsInvoiceHistoryRow> findRequired(String receiptNumber, Long permitNumber) {
    List<GbmsInvoiceHistoryRow> rows =
        repository.findGbmsInvoiceHistoryRequired(receiptNumber, permitNumber);
    if (rows == null) {
      throw new DataRetrievalFailureException("Oracle returned no GBMS invoice history result.");
    }
    for (GbmsInvoiceHistoryRow row : rows) {
      if (row == null
          || trimToNull(row.invoiceNumber()) == null
          || !permitNumber.equals(row.permitNumber())
          || !Double.isFinite(row.invoiceAmount())) {
        throw new DataRetrievalFailureException("Oracle returned invalid GBMS invoice history.");
      }
    }
    return List.copyOf(rows);
  }

  private static String normalizedInvoiceNumber(String invoiceNumber) {
    String normalized = trimToNull(invoiceNumber);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }
}

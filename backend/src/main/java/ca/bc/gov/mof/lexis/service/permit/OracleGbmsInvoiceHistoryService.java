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

  List<GbmsInvoiceHistoryRow> findRequired(Transition transition) {
    List<GbmsInvoiceHistoryRow> rows =
        repository.findGbmsInvoiceHistoryRequired(
            transition.receiptNumber(), transition.permitNumber());
    if (rows == null) {
      throw new DataRetrievalFailureException("Oracle returned no GBMS invoice history result.");
    }
    for (GbmsInvoiceHistoryRow row : rows) {
      if (row == null
          || trimToNull(row.invoiceNumber()) == null
          || !transition.permitNumber().equals(row.permitNumber())
          || !Double.isFinite(row.invoiceAmount())) {
        throw new DataRetrievalFailureException("Oracle returned invalid GBMS invoice history.");
      }
    }
    return List.copyOf(rows);
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
    Set<String> cancellationInvoices =
        gbmsHistory.stream()
            .map(GbmsInvoiceHistoryRow::cancelledByInvoice)
            .map(OracleGbmsInvoiceHistoryService::normalizedInvoiceNumber)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    boolean hasMisalignedActiveInvoice =
        gbmsHistory.stream()
            .filter(row -> BigDecimal.valueOf(row.invoiceAmount()).compareTo(BigDecimal.ZERO) >= 0)
            .filter(row -> trimToNull(row.cancelledByInvoice()) == null)
            .filter(row -> trimToNull(row.replacedByInvoice()) == null)
            .map(row -> normalizedInvoiceNumber(row.invoiceNumber()))
            .filter(invoiceNumber -> !cancellationInvoices.contains(invoiceNumber))
            .anyMatch(invoiceNumber -> !activeLinkedInvoices.contains(invoiceNumber));
    if (hasMisalignedActiveInvoice) {
      throw new DataRetrievalFailureException(
          "GBMS and internal permit invoice history require reconciliation.");
    }
  }

  private static String normalizedInvoiceNumber(String invoiceNumber) {
    String normalized = trimToNull(invoiceNumber);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }
}

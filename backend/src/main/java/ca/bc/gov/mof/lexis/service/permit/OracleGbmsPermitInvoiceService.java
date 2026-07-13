package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsForestInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsForestInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsGeneralInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsGeneralInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsNotationInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsNotationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsReplacementRow;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceLine;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceSnapshot;
import java.math.BigDecimal;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Isolates GBMS procedure commits from the surrounding LEXIS permit transaction. */
@Service
@Profile("oracle")
@Transactional(
    propagation = Propagation.REQUIRES_NEW,
    timeoutString = "${lexis.permit-invoice.gbms-timeout-seconds:60}")
public class OracleGbmsPermitInvoiceService {

  private static final String BLANK = " ";
  private final PermitInvoiceRepository repository;

  public OracleGbmsPermitInvoiceService(PermitInvoiceRepository repository) {
    this.repository = repository;
  }

  public String createInvoice(Long permitNumber, GbmsInvoiceSnapshot snapshot, String userId) {
    GbmsForestInvoiceRow header =
        repository.insertGbmsForestInvoiceRequired(
            new GbmsForestInvoiceInsert(
                "APP",
                snapshot.invoiceTotal(),
                "MSC",
                "EPT",
                "INT",
                BLANK,
                null,
                snapshot.ownerClientNumber(),
                snapshot.ownerClientLocationCode(),
                userId));
    String invoiceNumber = trimToNull(header.invoiceNumber());
    if (invoiceNumber == null) {
      throw new DataRetrievalFailureException("GBMS returned no invoice number.");
    }

    GbmsGeneralInvoiceRow general =
        repository.insertGbmsGeneralInvoiceRequired(
            new GbmsGeneralInvoiceInsert(
                invoiceNumber,
                snapshot.originOrgNumber(),
                snapshot.adminOrgNumber(),
                null,
                permitNumber.toString(),
                userId));
    requireSameInvoice(invoiceNumber, general.invoiceNumber(), "general invoice");

    for (GbmsInvoiceLine line : snapshot.lines()) {
      GbmsInvoiceDetailRow detail =
          repository.insertGbmsInvoiceDetailRequired(
              new GbmsInvoiceDetailInsert(
                  invoiceNumber,
                  snapshot.originOrgNumber(),
                  BigDecimal.ONE,
                  "DOL",
                  line.amount(),
                  line.amount(),
                  BLANK,
                  snapshot.ackMaskAcode(),
                  userId,
                  line.description(),
                  "N",
                  "N",
                  "N"));
      requireSameInvoice(invoiceNumber, detail.invoiceNumber(), "detail");
      if (detail.lineItemNumber() == null || detail.lineItemNumber() < 1) {
        throw new DataRetrievalFailureException("GBMS returned an invalid detail number.");
      }
    }

    GbmsNotationRow notation =
        repository.insertGbmsNotationRequired(
            new GbmsNotationInsert(invoiceNumber, snapshot.notationText(), "N", userId));
    requireSameInvoice(invoiceNumber, notation.invoiceNumber(), "notation");
    if (notation.notationNumber() == null || notation.notationNumber() < 1) {
      throw new DataRetrievalFailureException("GBMS returned an invalid notation number.");
    }
    return invoiceNumber;
  }

  public void cancelInvoice(String invoiceNumber, String userId) {
    repository.cancelGbmsInvoiceRequired(invoiceNumber, userId);
  }

  public void replaceInvoice(
      String replacementInvoiceNumber, String originalInvoiceNumber, String userId) {
    GbmsReplacementRow result =
        repository.setGbmsReplacementRequired(
            replacementInvoiceNumber, originalInvoiceNumber, userId);
    requireSameInvoice(originalInvoiceNumber, result.originalInvoiceNumber(), "replacement source");
    requireSameInvoice(
        replacementInvoiceNumber, result.replacementInvoiceNumber(), "replacement target");
  }

  private void requireSameInvoice(String expected, String actual, String step) {
    if (!expected.equalsIgnoreCase(trimToNull(actual))) {
      throw new DataRetrievalFailureException(
          "GBMS returned a different invoice number for the " + step + ".");
    }
  }
}

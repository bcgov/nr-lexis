package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/** Applies canonical record-state policy before a document is persisted. */
@Service
public class DocumentUploadMutationPolicy {

  private static final String ACTIVE_STATUS = "ACT";
  private static final String EXPIRED_STATUS = "EXP";

  private final ObjectProvider<LexisApplicationService> applicationServiceProvider;
  private final ObjectProvider<ExemptionService> exemptionServiceProvider;
  private final ObjectProvider<PermitService> permitServiceProvider;

  public DocumentUploadMutationPolicy(
      ObjectProvider<LexisApplicationService> applicationServiceProvider,
      ObjectProvider<ExemptionService> exemptionServiceProvider,
      ObjectProvider<PermitService> permitServiceProvider) {
    this.applicationServiceProvider = applicationServiceProvider;
    this.exemptionServiceProvider = exemptionServiceProvider;
    this.permitServiceProvider = permitServiceProvider;
  }

  /**
   * Validates an application target before attaching a document.
   * Legacy LEXIS allows authorized users to attach documents after an application expires.
   */
  public void requireApplicationAttachmentTarget(Long applicationNumber) {
    LexisApplicationService service = applicationServiceProvider.getIfAvailable();
    requireTargetStatus(
        "Application",
        service == null || applicationNumber == null || applicationNumber < 1
            ? Optional.empty()
            : service.findByApplicationNumber(applicationNumber),
        LexisApplicationDetailDto::applicationStatusCode);
  }

  /**
   * Validates an exemption target before attaching a document.
   *
   * Legacy LEXIS allows authorized users to attach documents after an exemption expires.
   */
  public void requireExemptionAttachmentTarget(String exemptionNumber) {
    ExemptionService service = exemptionServiceProvider.getIfAvailable();
    String normalizedNumber =
        exemptionNumber == null || exemptionNumber.isBlank() ? null : exemptionNumber.trim();
    requireTargetStatus(
        "Exemption",
        service == null || normalizedNumber == null
            ? Optional.empty()
            : service.findByExemptionNumber(normalizedNumber),
        ExemptionDetailDto::exemptionStatusCode);
  }

  public void requirePermitMutable(Long permitNumber) {
    PermitService service = permitServiceProvider.getIfAvailable();
    requireMutable(
        "Permit",
        "Expired permits are read-only.",
        service == null || permitNumber == null || permitNumber < 1
            ? Optional.empty()
            : service.findByPermitNumber(permitNumber),
        PermitDetailDto::permitStatusCode);
  }

  public void requireInvoicePermitActive(Long permitNumber) {
    PermitService service = permitServiceProvider.getIfAvailable();
    Optional<PermitDetailDto> permit =
        service == null || permitNumber == null || permitNumber < 1
            ? Optional.empty()
            : service.findByPermitNumber(permitNumber);
    String status = normalizedStatus("Permit", permit, PermitDetailDto::permitStatusCode);
    if (!ACTIVE_STATUS.equals(status)) {
      throw new AccessDeniedException("Invoices can only be added to active permits.");
    }
  }

  private <T> void requireMutable(
      String recordType,
      String expiredMessage,
      Optional<T> record,
      Function<T, String> statusExtractor) {
    String status = requireTargetStatus(recordType, record, statusExtractor);
    if (EXPIRED_STATUS.equals(status)) {
      throw new AccessDeniedException(expiredMessage);
    }
  }

  private <T> String requireTargetStatus(
      String recordType, Optional<T> record, Function<T, String> statusExtractor) {
    return normalizedStatus(recordType, record, statusExtractor);
  }

  private <T> String normalizedStatus(
      String recordType, Optional<T> record, Function<T, String> statusExtractor) {
    Optional<T> canonicalRecord = record == null ? Optional.empty() : record;
    return canonicalRecord
        .map(statusExtractor)
        .map(value -> value.trim().toUpperCase(Locale.ROOT))
        .filter(value -> !value.isBlank())
        .orElseThrow(
            () ->
                new AccessDeniedException(
                    recordType + " status is unavailable for mutation."));
  }
}

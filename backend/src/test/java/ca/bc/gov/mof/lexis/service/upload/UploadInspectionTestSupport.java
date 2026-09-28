package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.function.Function;
import org.springframework.web.multipart.MultipartFile;

/** Runs an upload the way the controller does: inspect first, then persist an accepted file. */
final class UploadInspectionTestSupport {

  private UploadInspectionTestSupport() {}

  static Optional<LexisUploadResultDto> uploadApplication(
      LexisUploadService service,
      MultipartFile file,
      Long applicationNumber,
      String description,
      String entryUserId) {
    return inspectThenPersist(
        service,
        "application",
        file,
        description,
        inspection -> service.uploadApplication(inspection, applicationNumber, entryUserId));
  }

  static Optional<LexisUploadResultDto> uploadPermit(
      LexisUploadService service,
      MultipartFile file,
      Long permitNumber,
      String description,
      String entryUserId) {
    return inspectThenPersist(
        service,
        "permit",
        file,
        description,
        inspection -> service.uploadPermit(inspection, permitNumber, entryUserId));
  }

  static Optional<LexisUploadResultDto> uploadExemption(
      LexisUploadService service,
      MultipartFile file,
      String exemptionNumber,
      String description,
      String entryUserId) {
    return inspectThenPersist(
        service,
        "exemption",
        file,
        description,
        inspection -> service.uploadExemption(inspection, exemptionNumber, entryUserId));
  }

  static Optional<LexisUploadResultDto> uploadInvoice(
      LexisUploadService service,
      MultipartFile file,
      Long permitNumber,
      String salesInvoiceNumber,
      String description,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId) {
    return inspectThenPersist(
        service,
        "invoice",
        file,
        description,
        inspection ->
            service.uploadInvoice(
                inspection,
                permitNumber,
                salesInvoiceNumber,
                exportValue,
                currencyConversionRate,
                feeInLieu,
                entryUserId));
  }

  /** Mirrors the controller: inspect first, then persist only an accepted inspection. */
  private static Optional<LexisUploadResultDto> inspectThenPersist(
      LexisUploadService service,
      String uploadType,
      MultipartFile file,
      String description,
      Function<UploadInspection, Optional<LexisUploadResultDto>> persist) {
    UploadInspection inspection = service.inspectUpload(uploadType, file, description);
    return inspection.isAccepted()
        ? persist.apply(inspection)
        : Optional.of(inspection.rejection());
  }
}

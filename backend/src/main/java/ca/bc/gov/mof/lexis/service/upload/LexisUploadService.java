package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.web.multipart.MultipartFile;

public interface LexisUploadService {

  Optional<LexisUploadResultDto> validateDocument(MultipartFile file, String uploadType);

  /**
   * Validates, type-checks and virus-scans a non-empty attachment without touching its target
   * record. Call this before taking aggregate row locks, then persist only an accepted inspection.
   */
  UploadInspection inspectUpload(String uploadType, MultipartFile file, String description);

  Optional<LexisUploadResultDto> uploadApplication(
      UploadInspection inspection, Long applicationNumber, String entryUserId);

  Optional<LexisUploadResultDto> uploadPermit(
      UploadInspection inspection, Long permitNumber, String entryUserId);

  Optional<LexisUploadResultDto> uploadExemption(
      UploadInspection inspection, String exemptionNumber, String entryUserId);

  Optional<LexisUploadResultDto> uploadInvoice(
      UploadInspection inspection,
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId);
}

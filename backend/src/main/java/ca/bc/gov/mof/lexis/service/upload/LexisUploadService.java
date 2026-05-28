package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.web.multipart.MultipartFile;

public interface LexisUploadService {

  Optional<LexisUploadResultDto> uploadApplication(
      MultipartFile file, Long applicationNumber, String description, String entryUserId);

  Optional<LexisUploadResultDto> uploadPermit(
      MultipartFile file, Long permitNumber, String description, String entryUserId);

  Optional<LexisUploadResultDto> uploadExemption(
      MultipartFile file, String exemptionNumber, String description, String entryUserId);

  Optional<LexisUploadResultDto> uploadInvoice(
      MultipartFile file,
      Long permitNumber,
      String salesInvoiceNumber,
      String description,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId);
}

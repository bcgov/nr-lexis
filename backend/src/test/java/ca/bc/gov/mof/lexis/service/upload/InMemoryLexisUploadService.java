package ca.bc.gov.mof.lexis.service.upload;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.service.upload.AttachmentUploadValidator.ValidationResult;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("stub-services & !oracle")
public class InMemoryLexisUploadService implements LexisUploadService {

  private final VirusScanService virusScanService;
  private final AttachmentUploadValidator attachmentUploadValidator;

  @Autowired
  public InMemoryLexisUploadService(
      VirusScanService virusScanService, AttachmentUploadValidator attachmentUploadValidator) {
    this.virusScanService = virusScanService;
    this.attachmentUploadValidator = attachmentUploadValidator;
  }

  InMemoryLexisUploadService() {
    this(VirusScanService.NO_OP, new AttachmentUploadValidator());
  }

  @Override
  public Optional<LexisUploadResultDto> validateDocument(MultipartFile file, String uploadType) {
    Optional<LexisUploadResultDto> result = buildResult(uploadType, file, null);
    return result.map(
        payload ->
            "accepted".equalsIgnoreCase(payload.status())
                ? new LexisUploadResultDto(
                    payload.uploadType(),
                    payload.fileName(),
                    payload.fileSize(),
                    "validated",
                    validationSuccessMessage())
                : payload);
  }

  @Override
  public UploadInspection inspectUpload(
      String uploadType, MultipartFile file, String description) {
    String normalizedDescription =
        "invoice".equals(uploadType) ? trimToNull(description) : defaultDescription(description);
    LexisUploadResultDto result =
        buildResult(uploadType, file, normalizedDescription)
            .orElseThrow(
                () -> new IllegalArgumentException("A non-empty file is required."));
    return "accepted".equalsIgnoreCase(result.status())
        ? UploadInspection.accepted(uploadType, file, normalizedDescription, null)
        : UploadInspection.rejected(uploadType, file, result);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadApplication(
      UploadInspection inspection, Long applicationNumber, String entryUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return accepted("application", inspection);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadPermit(
      UploadInspection inspection, Long permitNumber, String entryUserId) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    return accepted("permit", inspection);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadExemption(
      UploadInspection inspection, String exemptionNumber, String entryUserId) {
    if (exemptionNumber == null || exemptionNumber.isBlank()) {
      return Optional.empty();
    }
    return accepted("exemption", inspection);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadInvoice(
      UploadInspection inspection,
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    if (salesInvoiceNumber == null || salesInvoiceNumber.isBlank()) {
      return Optional.empty();
    }
    return accepted("invoice", inspection);
  }

  private Optional<LexisUploadResultDto> accepted(String uploadType, UploadInspection inspection) {
    MultipartFile file = inspection.requireAcceptedFile(uploadType);
    return Optional.of(
        new LexisUploadResultDto(
            uploadType,
            resolveFileName(file),
            file.getSize(),
            "accepted",
            "Upload accepted in local profile; persistence pipeline is not enabled."));
  }

  private Optional<LexisUploadResultDto> buildResult(
      String uploadType, MultipartFile file, String description) {
    if (file == null || file.isEmpty()) {
      return Optional.empty();
    }

    String fileName = resolveFileName(file);
    ValidationResult validation = attachmentUploadValidator.validate(file, description);
    if (!validation.accepted()) {
      return Optional.of(
          new LexisUploadResultDto(
              uploadType,
              fileName,
              file.getSize(),
              "rejected",
              validation.rejectionMessage()));
    }

    try {
      virusScanService.assertClean(file);
      return Optional.of(
          new LexisUploadResultDto(
              uploadType,
              fileName,
              file.getSize(),
              "accepted",
              "Upload accepted in local profile; persistence pipeline is not enabled."));
    } catch (VirusScanException ex) {
      return Optional.of(
          new LexisUploadResultDto(uploadType, fileName, file.getSize(), "rejected", ex.userMessage()));
    }
  }

  private String resolveFileName(MultipartFile file) {
    String fileName = file.getOriginalFilename();
    return fileName == null || fileName.isBlank() ? "uploaded-file" : fileName;
  }

  private String defaultDescription(String description) {
    String normalizedDescription = trimToNull(description);
    return normalizedDescription == null ? "" : normalizedDescription;
  }

  private String validationSuccessMessage() {
    return virusScanService.isEnabled()
        ? "File passed validation and virus scanning."
        : "File passed validation.";
  }
}

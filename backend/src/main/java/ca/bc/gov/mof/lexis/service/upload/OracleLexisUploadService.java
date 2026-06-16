package ca.bc.gov.mof.lexis.service.upload;

import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("oracle")
public class OracleLexisUploadService implements LexisUploadService {

  private static final String ATTACHMENT_TYPE_APPLICATION = "INS";
  private static final String ATTACHMENT_TYPE_PERMIT = "PMT";
  private static final String ATTACHMENT_TYPE_EXEMPTION = "EXE";
  private static final String ATTACHMENT_TYPE_INVOICE = "INV";

  private final UploadRepository uploadRepository;

  public OracleLexisUploadService(UploadRepository uploadRepository) {
    this.uploadRepository = uploadRepository;
  }

  @Override
  public Optional<LexisUploadResultDto> uploadApplication(
      MultipartFile file, Long applicationNumber, String description, String entryUserId) {
    if (!validFile(file) || applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    String fileTypeCode = fileExtension(file);
    if (fileTypeCode == null) {
      return Optional.empty();
    }
    Optional<LexisUploadResultDto> fileTypeRejection = rejectUnsupportedFileType("application", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }

    boolean persisted =
        uploadRepository.insertApplicationFile(
            applicationNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_APPLICATION,
            fileTypeCode,
            defaultSystemUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("application", file, "Application upload persisted."))
        : Optional.of(
            rejected(
                "application",
                file,
                "Could not attach file to application "
                    + applicationNumber
                    + ". Confirm the application exists before uploading."));
  }

  @Override
  public Optional<LexisUploadResultDto> uploadPermit(
      MultipartFile file, Long permitNumber, String description, String entryUserId) {
    if (!validFile(file) || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    String fileTypeCode = fileExtension(file);
    if (fileTypeCode == null) {
      return Optional.empty();
    }
    Optional<LexisUploadResultDto> fileTypeRejection = rejectUnsupportedFileType("permit", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }

    boolean persisted =
        uploadRepository.insertPermitFile(
            permitNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_PERMIT,
            fileTypeCode,
            defaultSystemUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("permit", file, "Permit upload persisted."))
        : Optional.of(
            rejected(
                "permit",
                file,
                "Could not attach file to permit "
                    + permitNumber
                    + ". Confirm the permit exists before uploading."));
  }

  @Override
  public Optional<LexisUploadResultDto> uploadExemption(
      MultipartFile file, String exemptionNumber, String description, String entryUserId) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (!validFile(file) || normalizedExemptionNumber == null) {
      return Optional.empty();
    }
    String fileTypeCode = fileExtension(file);
    if (fileTypeCode == null) {
      return Optional.empty();
    }
    Optional<LexisUploadResultDto> fileTypeRejection = rejectUnsupportedFileType("exemption", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }

    boolean persisted =
        uploadRepository.insertExemptionFile(
            normalizedExemptionNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_EXEMPTION,
            fileTypeCode,
            defaultSystemUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("exemption", file, "Exemption upload persisted."))
        : Optional.of(
            rejected(
                "exemption",
                file,
                "Could not attach file to exemption "
                    + normalizedExemptionNumber
                    + ". Confirm the exemption exists before uploading."));
  }

  @Override
  public Optional<LexisUploadResultDto> uploadInvoice(
      MultipartFile file,
      Long permitNumber,
      String salesInvoiceNumber,
      String description,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId) {
    String normalizedSalesInvoiceNumber = trimToNull(salesInvoiceNumber);
    if (!validFile(file)
        || permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null
        || normalizedSalesInvoiceNumber.length() > 9
        || !positive(exportValue)
        || !positive(currencyConversionRate)
        || !positive(feeInLieu)) {
      return Optional.empty();
    }
    String fileTypeCode = fileExtension(file);
    if (fileTypeCode == null) {
      return Optional.empty();
    }
    Optional<LexisUploadResultDto> fileTypeRejection = rejectUnsupportedFileType("invoice", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }

    String normalizedDescription = trimToNull(description);
    if (normalizedDescription == null) {
      normalizedDescription = "Invoice " + normalizedSalesInvoiceNumber;
    }

    boolean persisted =
        uploadRepository.insertInvoiceFile(
            permitNumber,
            normalizedSalesInvoiceNumber,
            resolveFileName(file),
            normalizedDescription,
            ATTACHMENT_TYPE_INVOICE,
            fileTypeCode,
            exportValue,
            currencyConversionRate,
            feeInLieu,
            defaultSystemUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("invoice", file, "Invoice upload persisted."))
        : Optional.of(
            rejected(
                "invoice",
                file,
                "Could not attach file to invoice "
                    + normalizedSalesInvoiceNumber
                    + ". Confirm the permit and invoice exist before uploading."));
  }

  private LexisUploadResultDto success(String uploadType, MultipartFile file, String message) {
    return new LexisUploadResultDto(uploadType, resolveFileName(file), file.getSize(), "accepted", message);
  }

  private LexisUploadResultDto rejected(String uploadType, MultipartFile file, String message) {
    return new LexisUploadResultDto(uploadType, resolveFileName(file), file.getSize(), "rejected", message);
  }

  private Optional<LexisUploadResultDto> rejectUnsupportedFileType(
      String uploadType, MultipartFile file, String fileTypeCode) {
    if (uploadRepository.isFileTypeCodeValid(fileTypeCode)) {
      return Optional.empty();
    }

    return Optional.of(
        rejected(
            uploadType,
            file,
            "File type "
                + fileTypeCode
                + " is not configured in LEXIS. Use a supported file type before uploading."));
  }

  private boolean validFile(MultipartFile file) {
    return file != null && !file.isEmpty();
  }

  private boolean positive(BigDecimal value) {
    return value != null && value.compareTo(BigDecimal.ZERO) > 0;
  }

  private byte[] fileBytes(MultipartFile file) {
    try {
      return file.getBytes();
    } catch (java.io.IOException ex) {
      throw new IllegalStateException("Could not read uploaded file bytes", ex);
    }
  }

  private String resolveFileName(MultipartFile file) {
    String fileName = trimToNull(file.getOriginalFilename());
    return fileName == null ? "uploaded-file" : fileName;
  }

  private String fileExtension(MultipartFile file) {
    String fileName = resolveFileName(file);
    int extensionIndex = fileName.lastIndexOf('.');
    if (extensionIndex < 0 || extensionIndex >= fileName.length() - 1) {
      return null;
    }
    return fileName.substring(extensionIndex + 1).toUpperCase(Locale.ROOT);
  }

  private String defaultDescription(String description) {
    String normalizedDescription = trimToNull(description);
    return normalizedDescription == null ? "" : normalizedDescription;
  }

}

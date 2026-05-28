package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import java.math.BigDecimal;
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

    boolean persisted =
        uploadRepository.insertApplicationFile(
            applicationNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_APPLICATION,
            fileExtension(file),
            defaultEntryUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("application", file, "Application upload persisted."))
        : Optional.empty();
  }

  @Override
  public Optional<LexisUploadResultDto> uploadPermit(
      MultipartFile file, Long permitNumber, String description, String entryUserId) {
    if (!validFile(file) || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    boolean persisted =
        uploadRepository.insertPermitFile(
            permitNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_PERMIT,
            fileExtension(file),
            defaultEntryUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("permit", file, "Permit upload persisted."))
        : Optional.empty();
  }

  @Override
  public Optional<LexisUploadResultDto> uploadExemption(
      MultipartFile file, String exemptionNumber, String description, String entryUserId) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (!validFile(file) || normalizedExemptionNumber == null) {
      return Optional.empty();
    }

    boolean persisted =
        uploadRepository.insertExemptionFile(
            normalizedExemptionNumber,
            resolveFileName(file),
            defaultDescription(description),
            ATTACHMENT_TYPE_EXEMPTION,
            fileExtension(file),
            defaultEntryUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("exemption", file, "Exemption upload persisted."))
        : Optional.empty();
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
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    if (!validFile(file)
        || permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null) {
      return Optional.empty();
    }

    String normalizedDescription =
        trim(description) == null ? "Invoice " + normalizedSalesInvoiceNumber : description.trim();

    boolean persisted =
        uploadRepository.insertInvoiceFile(
            permitNumber,
            normalizedSalesInvoiceNumber,
            resolveFileName(file),
            normalizedDescription,
            ATTACHMENT_TYPE_INVOICE,
            fileExtension(file),
            exportValue,
            currencyConversionRate,
            feeInLieu,
            defaultEntryUser(entryUserId),
            fileBytes(file));

    return persisted
        ? Optional.of(success("invoice", file, "Invoice upload persisted."))
        : Optional.empty();
  }

  private LexisUploadResultDto success(String uploadType, MultipartFile file, String message) {
    return new LexisUploadResultDto(uploadType, resolveFileName(file), file.getSize(), "accepted", message);
  }

  private boolean validFile(MultipartFile file) {
    return file != null && !file.isEmpty();
  }

  private byte[] fileBytes(MultipartFile file) {
    try {
      return file.getBytes();
    } catch (java.io.IOException ex) {
      throw new IllegalStateException("Could not read uploaded file bytes", ex);
    }
  }

  private String resolveFileName(MultipartFile file) {
    String fileName = trim(file.getOriginalFilename());
    return fileName == null ? "uploaded-file" : fileName;
  }

  private String fileExtension(MultipartFile file) {
    String fileName = resolveFileName(file);
    int extensionIndex = fileName.lastIndexOf('.');
    if (extensionIndex < 0 || extensionIndex >= fileName.length() - 1) {
      return "";
    }
    return fileName.substring(extensionIndex + 1);
  }

  private String defaultDescription(String description) {
    return trim(description) == null ? "" : description.trim();
  }

  private String defaultEntryUser(String entryUserId) {
    String normalizedEntryUserId = trim(entryUserId);
    return normalizedEntryUserId == null ? "system" : normalizedEntryUserId;
  }

  private String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}

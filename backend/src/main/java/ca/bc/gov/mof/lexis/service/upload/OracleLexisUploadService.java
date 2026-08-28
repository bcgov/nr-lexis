package ca.bc.gov.mof.lexis.service.upload;

import static ca.bc.gov.mof.lexis.util.InvoiceStorageConstraints.isValidInvoiceAmount;
import static ca.bc.gov.mof.lexis.util.InvoiceStorageConstraints.isValidInvoiceConversionRate;
import static ca.bc.gov.mof.lexis.util.InvoiceStorageConstraints.isValidInvoiceNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.defaultSystemUser;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository.UploadFailureReason;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository.UploadPersistenceResult;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.service.upload.AttachmentUploadValidator.ValidationResult;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("oracle")
public class OracleLexisUploadService implements LexisUploadService {

  private static final String ATTACHMENT_TYPE_APPLICATION = "INS";
  private static final String ATTACHMENT_TYPE_PERMIT = "PMT";
  private static final String ATTACHMENT_TYPE_EXEMPTION = "EXE";
  private static final String ATTACHMENT_TYPE_INVOICE = "INV";
  private final UploadRepository uploadRepository;
  private final VirusScanService virusScanService;
  private final AttachmentUploadValidator attachmentUploadValidator;

  public OracleLexisUploadService(
      UploadRepository uploadRepository,
      VirusScanService virusScanService,
      AttachmentUploadValidator attachmentUploadValidator) {
    this.uploadRepository = uploadRepository;
    this.virusScanService = virusScanService;
    this.attachmentUploadValidator = attachmentUploadValidator;
  }

  @Override
  public Optional<LexisUploadResultDto> validateDocument(MultipartFile file, String uploadType) {
    String normalizedUploadType = normalizeUploadType(uploadType);
    if (!validFile(file) || normalizedUploadType == null) {
      return Optional.empty();
    }

    ValidationResult validation = attachmentUploadValidator.validate(file, null);
    if (!validation.accepted()) {
      return Optional.of(rejected(normalizedUploadType, file, validation.rejectionMessage()));
    }
    String fileTypeCode = validation.fileTypeCode();

    Optional<LexisUploadResultDto> fileTypeRejection =
        rejectUnsupportedFileType(normalizedUploadType, file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }

    Optional<LexisUploadResultDto> virusScanRejection =
        rejectFailedVirusScan(normalizedUploadType, file);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection;
    }

    return Optional.of(
        new LexisUploadResultDto(
            normalizedUploadType,
            resolveFileName(file),
            file.getSize(),
            "validated",
            validationSuccessMessage()));
  }

  @Override
  @Transactional
  public Optional<LexisUploadResultDto> uploadApplication(
      MultipartFile file, Long applicationNumber, String description, String entryUserId) {
    if (!validFile(file) || applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    String normalizedDescription = defaultDescription(description);
    ValidationResult validation = attachmentUploadValidator.validate(file, normalizedDescription);
    if (!validation.accepted()) {
      return Optional.of(rejected("application", file, validation.rejectionMessage()));
    }
    String fileTypeCode = validation.fileTypeCode();
    Optional<LexisUploadResultDto> fileTypeRejection =
        rejectUnsupportedFileType("application", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }
    Optional<LexisUploadResultDto> virusScanRejection = rejectFailedVirusScan("application", file);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection;
    }

    UploadPersistenceResult persistenceResult =
        persistFile(
            file,
            (content, contentLength) ->
                uploadRepository.insertApplicationFile(
                    applicationNumber,
                    resolveFileName(file),
                    normalizedDescription,
                    ATTACHMENT_TYPE_APPLICATION,
                    fileTypeCode,
                    defaultSystemUser(entryUserId),
                    content,
                    contentLength));

    if (!persistenceResult.persisted()) {
      markRollbackOnly();
      return Optional.of(
          rejected(
              "application",
              file,
              uploadFailureMessage(
                  "application",
                  applicationNumber.toString(),
                  persistenceResult.failureReason())));
    }
    return Optional.of(success("application", file, "Application upload persisted."));
  }

  @Override
  @Transactional
  public Optional<LexisUploadResultDto> uploadPermit(
      MultipartFile file, Long permitNumber, String description, String entryUserId) {
    if (!validFile(file) || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    String normalizedDescription = defaultDescription(description);
    ValidationResult validation = attachmentUploadValidator.validate(file, normalizedDescription);
    if (!validation.accepted()) {
      return Optional.of(rejected("permit", file, validation.rejectionMessage()));
    }
    String fileTypeCode = validation.fileTypeCode();
    Optional<LexisUploadResultDto> fileTypeRejection =
        rejectUnsupportedFileType("permit", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }
    Optional<LexisUploadResultDto> virusScanRejection = rejectFailedVirusScan("permit", file);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection;
    }

    UploadPersistenceResult persistenceResult =
        persistFile(
            file,
            (content, contentLength) ->
                uploadRepository.insertPermitFile(
                    permitNumber,
                    resolveFileName(file),
                    normalizedDescription,
                    ATTACHMENT_TYPE_PERMIT,
                    fileTypeCode,
                    defaultSystemUser(entryUserId),
                    content,
                    contentLength));

    if (!persistenceResult.persisted()) {
      markRollbackOnly();
      return Optional.of(
          rejected(
              "permit",
              file,
              uploadFailureMessage(
                  "permit", permitNumber.toString(), persistenceResult.failureReason())));
    }
    return Optional.of(success("permit", file, "Permit upload persisted."));
  }

  @Override
  @Transactional
  public Optional<LexisUploadResultDto> uploadExemption(
      MultipartFile file, String exemptionNumber, String description, String entryUserId) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (!validFile(file) || normalizedExemptionNumber == null) {
      return Optional.empty();
    }
    String normalizedDescription = defaultDescription(description);
    ValidationResult validation = attachmentUploadValidator.validate(file, normalizedDescription);
    if (!validation.accepted()) {
      return Optional.of(rejected("exemption", file, validation.rejectionMessage()));
    }
    String fileTypeCode = validation.fileTypeCode();
    Optional<LexisUploadResultDto> fileTypeRejection =
        rejectUnsupportedFileType("exemption", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }
    Optional<LexisUploadResultDto> virusScanRejection = rejectFailedVirusScan("exemption", file);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection;
    }

    UploadPersistenceResult persistenceResult =
        persistFile(
            file,
            (content, contentLength) ->
                uploadRepository.insertExemptionFile(
                    normalizedExemptionNumber,
                    resolveFileName(file),
                    normalizedDescription,
                    ATTACHMENT_TYPE_EXEMPTION,
                    fileTypeCode,
                    defaultSystemUser(entryUserId),
                    content,
                    contentLength));

    if (!persistenceResult.persisted()) {
      markRollbackOnly();
      return Optional.of(
          rejected(
              "exemption",
              file,
              uploadFailureMessage(
                  "exemption", normalizedExemptionNumber, persistenceResult.failureReason())));
    }
    return Optional.of(success("exemption", file, "Exemption upload persisted."));
  }

  @Override
  @Transactional
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
    // INTENTIONAL_LEGACY_DIVERGENCE(INVOICE_NUMBER_STORAGE_SAFETY): Reject multibyte input before
    // it reaches Oracle's VARCHAR2(9 BYTE) invoice-number columns.
    if (!validFile(file)
        || permitNumber == null
        || permitNumber < 1
        || !isValidInvoiceNumber(normalizedSalesInvoiceNumber)
        || !isValidInvoiceAmount(exportValue)
        || !isValidInvoiceConversionRate(currencyConversionRate)
        || !isValidInvoiceAmount(feeInLieu)) {
      return Optional.empty();
    }
    String requestedDescription = trimToNull(description);
    String normalizedDescription =
        requestedDescription == null
            ? "Invoice " + normalizedSalesInvoiceNumber
            : requestedDescription;
    ValidationResult validation = attachmentUploadValidator.validate(file, normalizedDescription);
    if (!validation.accepted()) {
      return Optional.of(rejected("invoice", file, validation.rejectionMessage()));
    }
    String fileTypeCode = validation.fileTypeCode();
    Optional<LexisUploadResultDto> fileTypeRejection =
        rejectUnsupportedFileType("invoice", file, fileTypeCode);
    if (fileTypeRejection.isPresent()) {
      return fileTypeRejection;
    }
    Optional<LexisUploadResultDto> virusScanRejection = rejectFailedVirusScan("invoice", file);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection;
    }

    UploadPersistenceResult persistenceResult =
        persistFile(
            file,
            (content, contentLength) ->
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
                    content,
                    contentLength));

    if (!persistenceResult.persisted()) {
      markRollbackOnly();
      return Optional.of(
          rejected(
              "invoice",
              file,
              uploadFailureMessage(
                  "invoice",
                  normalizedSalesInvoiceNumber + " for permit " + permitNumber,
                  persistenceResult.failureReason())));
    }
    return Optional.of(success("invoice", file, "Invoice upload persisted."));
  }

  private LexisUploadResultDto success(String uploadType, MultipartFile file, String message) {
    return new LexisUploadResultDto(uploadType, resolveFileName(file), file.getSize(), "accepted", message);
  }

  private LexisUploadResultDto rejected(String uploadType, MultipartFile file, String message) {
    return new LexisUploadResultDto(uploadType, resolveFileName(file), file.getSize(), "rejected", message);
  }

  private String uploadFailureMessage(
      String targetType, String targetIdentifier, UploadFailureReason failureReason) {
    String target = targetType + " " + targetIdentifier;
    if (failureReason == UploadFailureReason.PARENT_NOT_FOUND) {
      return "Could not attach file to "
          + target
          + " because the Oracle attachment parent row was not found. Refresh the details page and confirm the "
          + targetType
          + " is saved before uploading.";
    }
    return "Could not attach file to "
        + target
        + ". Confirm the "
        + targetType
        + " exists before uploading.";
  }

  private Optional<LexisUploadResultDto> rejectUnsupportedFileType(
      String uploadType, MultipartFile file, String fileTypeCode) {
    if (uploadRepository.isFileTypeCodeValidRequired(fileTypeCode)) {
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

  private Optional<LexisUploadResultDto> rejectFailedVirusScan(
      String uploadType, MultipartFile file) {
    try {
      virusScanService.assertClean(file);
      return Optional.empty();
    } catch (VirusScanException ex) {
      return Optional.of(rejected(uploadType, file, ex.userMessage()));
    }
  }

  private String validationSuccessMessage() {
    return virusScanService.isEnabled()
        ? "File passed validation and virus scanning."
        : "File passed validation.";
  }

  private boolean validFile(MultipartFile file) {
    return file != null && !file.isEmpty();
  }

  private String normalizeUploadType(String uploadType) {
    String normalized = trimToNull(uploadType);
    if (normalized == null) {
      return null;
    }
    normalized = normalized.toLowerCase(Locale.ROOT);
    return switch (normalized) {
      case "application", "permit", "exemption", "invoice" -> normalized;
      default -> null;
    };
  }

  private UploadPersistenceResult persistFile(
      MultipartFile file, FilePersistence persistence) {
    try (InputStream content = file.getInputStream()) {
      return persistence.persist(content, file.getSize());
    } catch (IOException ex) {
      throw new IllegalStateException("Could not stream uploaded file content", ex);
    }
  }

  private String resolveFileName(MultipartFile file) {
    String fileName = file == null ? null : file.getOriginalFilename();
    return fileName == null || fileName.isBlank() ? "uploaded-file" : fileName;
  }

  private String defaultDescription(String description) {
    String normalizedDescription = trimToNull(description);
    return normalizedDescription == null ? "" : normalizedDescription;
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit calls may invoke this service without a transactional proxy.
    }
  }

  @FunctionalInterface
  private interface FilePersistence {
    UploadPersistenceResult persist(InputStream content, long contentLength);
  }

}

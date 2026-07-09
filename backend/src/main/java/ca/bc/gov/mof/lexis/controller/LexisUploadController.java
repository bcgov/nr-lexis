package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionSummaryDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class LexisUploadController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisUploadController.class);
  private static final String DEFAULT_FEDERAL_FILE_NAME = "federal-submission.xml";
  private static final String REQUEST_ID_HEADER = "X-Request-ID";
  private static final String IDEMPOTENCY_KEY_HEADER = "X-Idempotency-Key";
  private static final String SOURCE_SYSTEM_HEADER = "X-Source-System";
  private static final String FEDERAL_SUBMISSION_ACTION = "uploadFederalSubmission";
  private static final int MAX_FEDERAL_HEADER_VALUE_LENGTH = 200;
  private static final int MAX_FEDERAL_USER_REFERENCE_LENGTH = 50;
  private static final int MAX_LOG_VALUE_LENGTH = 200;

  private final ObjectProvider<LexisUploadService> uploadServiceProvider;
  private final ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider;
  private final ApplicationEditLockService applicationEditLockService;
  private final ObjectProvider<MeterRegistry> meterRegistryProvider;
  private boolean requireFederalRequestId;
  private boolean requireFederalCreateUserReference;
  private boolean requireFederalCreateIdempotencyKey;
  private boolean requireFederalSourceSystem;
  private long federalSubmissionRetryAfterSeconds = 60L;

  @Autowired
  public LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider,
      ApplicationEditLockService applicationEditLockService,
      ObjectProvider<MeterRegistry> meterRegistryProvider) {
    this.uploadServiceProvider = uploadServiceProvider;
    this.applicationSubmissionImportServiceProvider = applicationSubmissionImportServiceProvider;
    this.applicationEditLockService = applicationEditLockService;
    this.meterRegistryProvider = meterRegistryProvider;
  }

  @Value("${lexis.federal-submission.require-idempotency-key:false}")
  void setRequireFederalCreateIdempotencyKey(boolean requireFederalCreateIdempotencyKey) {
    this.requireFederalCreateIdempotencyKey = requireFederalCreateIdempotencyKey;
  }

  @Value("${lexis.federal-submission.require-request-id:false}")
  void setRequireFederalRequestId(boolean requireFederalRequestId) {
    this.requireFederalRequestId = requireFederalRequestId;
  }

  @Value("${lexis.federal-submission.require-user-reference:false}")
  void setRequireFederalCreateUserReference(boolean requireFederalCreateUserReference) {
    this.requireFederalCreateUserReference = requireFederalCreateUserReference;
  }

  @Value("${lexis.federal-submission.require-source-system:false}")
  void setRequireFederalSourceSystem(boolean requireFederalSourceSystem) {
    this.requireFederalSourceSystem = requireFederalSourceSystem;
  }

  @Value("${lexis.federal-submission.retry-after-seconds:60}")
  void setFederalSubmissionRetryAfterSeconds(long federalSubmissionRetryAfterSeconds) {
    this.federalSubmissionRetryAfterSeconds = Math.max(0L, federalSubmissionRetryAfterSeconds);
  }

  LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider,
      ApplicationEditLockService applicationEditLockService) {
    this(uploadServiceProvider, applicationSubmissionImportServiceProvider, applicationEditLockService, null);
  }

  @PostMapping(
      value = {"/fileApplicationUpload", "/uploads/application", "/admin/uploads/applications"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileApplicationUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || applicationNumber == null || applicationNumber < 1) {
      return uploadBadRequest(
          "application", "Choose a file and enter a valid application number before uploading documents.");
    }
    ApplicationEditLockDto lock =
        applicationEditLockService.snapshot(applicationNumber, userId(authentication), false);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(uploadFailure("application", lock.message()));
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileApplicationUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadApplication(
            uploadFile,
            applicationNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "application",
                    "We were unable to save this application document. Confirm the application exists and try again."));
  }

  @PostMapping(
      value = {"/uploads/application/validation", "/admin/uploads/applications/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateApplicationUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || applicationNumber == null || applicationNumber < 1) {
      return uploadBadRequest(
          "application", "Choose a file and enter a valid application number before validating documents.");
    }
    return validateDocumentUpload("application", uploadFile);
  }

  @PostMapping(
      value = {"/filePermitUpload", "/uploads/permit", "/admin/uploads/permits"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> filePermitUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || permitNumber == null || permitNumber < 1) {
      return uploadBadRequest(
          "permit", "Choose a file and enter a valid permit number before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for filePermitUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadPermit(
            uploadFile,
            permitNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "permit",
                    "We were unable to save this permit document. Confirm the permit exists and try again."));
  }

  @PostMapping(
      value = {"/uploads/permit/validation", "/admin/uploads/permits/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validatePermitUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || permitNumber == null || permitNumber < 1) {
      return uploadBadRequest(
          "permit", "Choose a file and enter a valid permit number before validating documents.");
    }
    return validateDocumentUpload("permit", uploadFile);
  }

  @PostMapping(
      value = {"/fileExemptionUpload", "/uploads/exemption", "/admin/uploads/exemptions"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileExemptionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || exemptionNumber == null
        || exemptionNumber.isBlank()) {
      return uploadBadRequest(
          "exemption", "Choose a file and enter a valid exemption number before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileExemptionUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadExemption(
            uploadFile,
            exemptionNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "exemption",
                    "We were unable to save this exemption document. Confirm the exemption exists and try again."));
  }

  @PostMapping(
      value = {"/uploads/exemption/validation", "/admin/uploads/exemptions/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateExemptionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || exemptionNumber == null
        || exemptionNumber.isBlank()) {
      return uploadBadRequest(
          "exemption", "Choose a file and enter a valid exemption number before validating documents.");
    }
    return validateDocumentUpload("exemption", uploadFile);
  }

  @PostMapping(
      value = {"/fileInvoiceUpload", "/uploads/invoice", "/admin/uploads/invoices"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> fileInvoiceUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      @RequestParam(name = "fileDescription", required = false) String fileDescription,
      @RequestParam(name = "description", required = false) String descriptionAlias,
      @RequestParam(name = "invoiceExportValue", required = false) BigDecimal invoiceExportValue,
      @RequestParam(name = "exportValue", required = false) BigDecimal exportValueAlias,
      @RequestParam(name = "invoiceConversionRate", required = false)
          BigDecimal invoiceConversionRate,
      @RequestParam(name = "currencyConversionRate", required = false)
          BigDecimal conversionRateAlias,
      @RequestParam(name = "invoiceFeeInLieu", required = false) BigDecimal invoiceFeeInLieu,
      @RequestParam(name = "feeInLieu", required = false) BigDecimal feeInLieuAlias,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || permitNumber == null
        || permitNumber < 1
        || salesInvoiceNumber == null
        || salesInvoiceNumber.isBlank()) {
      return uploadBadRequest(
          "invoice", "Choose a file and enter valid permit and invoice numbers before uploading documents.");
    }

    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for fileInvoiceUpload");
      return ResponseEntity.noContent().build();
    }
    return service
        .uploadInvoice(
            uploadFile,
            permitNumber,
            salesInvoiceNumber,
            firstNonBlank(fileDescription, descriptionAlias),
            firstNonNull(invoiceExportValue, exportValueAlias),
            firstNonNull(invoiceConversionRate, conversionRateAlias),
            firstNonNull(invoiceFeeInLieu, feeInLieuAlias),
            resolveEntryUserId(authentication))
        .map(this::uploadResponse)
        .orElseGet(
            () ->
                uploadPersistenceFailure(
                    "invoice",
                    "We were unable to save this invoice document. Confirm the permit exists and try again."));
  }

  @PostMapping(
      value = {"/uploads/invoice/validation", "/admin/uploads/invoices/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateInvoiceUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || permitNumber == null
        || permitNumber < 1
        || salesInvoiceNumber == null
        || salesInvoiceNumber.isBlank()) {
      return uploadBadRequest(
          "invoice", "Choose a file and enter valid permit and invoice numbers before validating documents.");
    }
    return validateDocumentUpload("invoice", uploadFile);
  }

  @PostMapping(
      value = {
        "/application-submissions",
        "/uploads/lexis-xml",
        "/admin/uploads/lexis-xml"
      },
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> applicationSubmissionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "userReference", required = false) String userReference,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure("Choose a LEXIS application submission file before uploading."));
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "LEXIS application submission import service unavailable - returning no content for applicationSubmissionUpload");
      return ResponseEntity.noContent().build();
    }

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            uploadFile, resolveEntryUserId(authentication), userReference);
    return ResponseEntity.status(applicationSubmissionResponseStatus(result)).body(result);
  }

  @PostMapping(
      value = {
        "/application-submissions/validation",
        "/uploads/lexis-xml/validation",
        "/admin/uploads/lexis-xml/validation"
      },
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> applicationSubmissionValidation(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "userReference", required = false) String userReference,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty()) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure("Choose a LEXIS application submission file before validating."));
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "LEXIS application submission import service unavailable - returning no content for applicationSubmissionValidation");
      return ResponseEntity.noContent().build();
    }

    ApplicationSubmissionImportResultDto result =
        service.validateApplicationSubmission(uploadFile, userReference);
    return ResponseEntity.status(applicationSubmissionResponseStatus(result)).body(result);
  }

  @PostMapping(
      value = "/federal/submissions",
      consumes = {
        MediaType.APPLICATION_XML_VALUE,
        MediaType.TEXT_XML_VALUE,
        "application/soap+xml",
        MediaType.TEXT_PLAIN_VALUE
      })
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionUpload(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "originalFileName", required = false) String originalFileName,
      @RequestBody(required = false) byte[] submissionData,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    return importFederalApplicationSubmission(
        userReference,
        originalFileName,
        submissionData,
        requestId,
        idempotencyKey,
        federalSourceSystem(sourceSystemHeader, sourceSystem),
        authentication);
  }

  ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionUpload(
      String userReference,
      String originalFileName,
      byte[] submissionData,
      String requestId,
      String idempotencyKey,
      Authentication authentication) {
    return importFederalApplicationSubmission(
        userReference, originalFileName, submissionData, requestId, idempotencyKey, null, authentication);
  }

  @PostMapping(value = "/federal/submissions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionMultipartUpload(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    return importFederalApplicationSubmission(
        userReference,
        firstNonNull(file, formFile),
        requestId,
        idempotencyKey,
        federalSourceSystem(sourceSystemHeader, sourceSystem),
        authentication);
  }

  ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionMultipartUpload(
      String userReference,
      MultipartFile file,
      MultipartFile formFile,
      String requestId,
      String idempotencyKey,
      Authentication authentication) {
    return importFederalApplicationSubmission(
        userReference, firstNonNull(file, formFile), requestId, idempotencyKey, null, authentication);
  }

  @PostMapping(
      value = "/federal/submissions/validation",
      consumes = {
        MediaType.APPLICATION_XML_VALUE,
        MediaType.TEXT_XML_VALUE,
        "application/soap+xml",
        MediaType.TEXT_PLAIN_VALUE
      })
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionValidation(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "originalFileName", required = false) String originalFileName,
      @RequestBody(required = false) byte[] submissionData,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    return validateFederalApplicationSubmission(
        userReference,
        originalFileName,
        submissionData,
        requestId,
        idempotencyKey,
        federalSourceSystem(sourceSystemHeader, sourceSystem),
        authentication);
  }

  ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionValidation(
      String userReference,
      String originalFileName,
      byte[] submissionData,
      String requestId,
      String idempotencyKey,
      Authentication authentication) {
    return validateFederalApplicationSubmission(
        userReference, originalFileName, submissionData, requestId, idempotencyKey, null, authentication);
  }

  @PostMapping(value = "/federal/submissions/validation", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionMultipartValidation(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    return validateFederalApplicationSubmission(
        userReference,
        firstNonNull(file, formFile),
        requestId,
        idempotencyKey,
        federalSourceSystem(sourceSystemHeader, sourceSystem),
        authentication);
  }

  ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionMultipartValidation(
      String userReference,
      MultipartFile file,
      MultipartFile formFile,
      String requestId,
      String idempotencyKey,
      Authentication authentication) {
    return validateFederalApplicationSubmission(
        userReference, firstNonNull(file, formFile), requestId, idempotencyKey, null, authentication);
  }

  private String resolveEntryUserId(Authentication authentication) {
    String principalName = userId(authentication);
    if (principalName == null) {
      return null;
    }
    int slash = Math.max(principalName.lastIndexOf('\\'), principalName.lastIndexOf('/'));
    if (slash >= 0 && slash < principalName.length() - 1) {
      return principalName.substring(slash + 1);
    }
    return principalName;
  }

  private String userId(Authentication authentication) {
    if (authentication == null) {
      return null;
    }
    if (authentication instanceof JwtAuthenticationToken jwtAuthentication) {
      String jwtPrincipalName = jwtPrincipalName(jwtAuthentication);
      if (jwtPrincipalName != null) {
        return jwtPrincipalName;
      }
    }
    if (authentication.getName() == null) {
      return null;
    }
    String principalName = authentication.getName().trim();
    if (principalName.isEmpty()) {
      return null;
    }
    return principalName;
  }

  private String jwtPrincipalName(JwtAuthenticationToken authentication) {
    Map<String, Object> claims = authentication.getToken().getClaims();
    String userName =
        firstClaim(
            claims,
            "custom:idp_username",
            "custom:idp_user_id",
            "preferred_username",
            "cognito:username",
            "username",
            "email");
    if (userName != null) {
      String provider = firstClaim(claims, "custom:idp_name");
      return provider == null ? userName : provider.toUpperCase(Locale.ROOT) + "\\" + userName;
    }

    if (claims.get("cognito:groups") == null) {
      String clientId = firstClaim(claims, "client_id", "azp");
      if (clientId != null) {
        return clientId;
      }
    }
    return null;
  }

  private String firstClaim(Map<String, Object> claims, String... names) {
    for (String name : names) {
      Object value = claims.get(name);
      if (value instanceof String text) {
        String normalized = text.trim();
        if (!normalized.isEmpty()) {
          return normalized;
        }
      }
    }
    return null;
  }

  private ResponseEntity<LexisUploadResultDto> uploadResponse(LexisUploadResultDto result) {
    HttpStatus status =
        "accepted".equalsIgnoreCase(result.status()) || "validated".equalsIgnoreCase(result.status())
            ? HttpStatus.OK
            : HttpStatus.UNPROCESSABLE_ENTITY;
    return ResponseEntity.status(status).body(result);
  }

  private ResponseEntity<LexisUploadResultDto> validateDocumentUpload(
      String uploadType, MultipartFile uploadFile) {
    LexisUploadService service = uploadServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Upload service unavailable - returning no content for {} validation", uploadType);
      return ResponseEntity.noContent().build();
    }
    return service
        .validateDocument(uploadFile, uploadType)
        .map(this::uploadResponse)
        .orElseGet(() -> uploadBadRequest(uploadType, "Choose a valid file before validating documents."));
  }

  private ResponseEntity<LexisUploadResultDto> uploadBadRequest(
      String uploadType, String message) {
    return ResponseEntity.badRequest().body(uploadFailure(uploadType, message));
  }

  private ResponseEntity<LexisUploadResultDto> uploadPersistenceFailure(
      String uploadType, String message) {
    return ResponseEntity.unprocessableEntity().body(uploadFailure(uploadType, message));
  }

  private LexisUploadResultDto uploadFailure(String uploadType, String message) {
    return new LexisUploadResultDto(uploadType, null, 0L, "rejected", message);
  }

  private ApplicationSubmissionImportResultDto applicationSubmissionFailure(String message) {
    return applicationSubmissionFailure(message, null, 0L);
  }

  private ApplicationSubmissionImportResultDto applicationSubmissionFailure(
      String message, String fileName, long fileSize) {
    return new ApplicationSubmissionImportResultDto(
        "applicationSubmission",
        fileName,
        fileSize,
        "rejected",
        message,
        null,
        null,
        0,
        List.of(message),
        List.of());
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalInvalidRequest(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata,
      Authentication authentication,
      ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest,
      long startedAtNanos) {
    ApplicationSubmissionImportResultDto result = invalidRequest.getBody();
    if (result != null) {
      logFederalSubmissionResult(
          operation,
          requestId,
          idempotencyKey,
          payloadSha256,
          resolveEntryUserId(authentication),
          result,
          invalidRequest.getStatusCode().value(),
          startedAtNanos,
          traceMetadata);
    }
    return federalResponseWithTrace(
        invalidRequest, requestId, idempotencyKey, payloadSha256, traceMetadata);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalPreflightInvalidRequest(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata,
      Authentication authentication,
      ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest,
      long startedAtNanos) {
    ApplicationSubmissionImportResultDto result = invalidRequest.getBody();
    if (result != null) {
      logFederalSubmissionResult(
          operation,
          requestId,
          idempotencyKey,
          payloadSha256,
          resolveEntryUserId(authentication),
          result,
          invalidRequest.getStatusCode().value(),
          startedAtNanos,
          traceMetadata);
    }
    return federalResponseWithTrace(
        invalidRequest, requestId, idempotencyKey, payloadSha256, traceMetadata);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalServiceUnavailable(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata,
      Authentication authentication,
      String fileName,
      long fileSize,
      long startedAtNanos) {
    ApplicationSubmissionImportResultDto result =
        applicationSubmissionFailure(
            "Federal LEXIS submission service is unavailable. Try again later.", fileName, fileSize);
    logFederalSubmissionResult(
        operation,
        requestId,
        idempotencyKey,
        payloadSha256,
        resolveEntryUserId(authentication),
        result,
        HttpStatus.SERVICE_UNAVAILABLE.value(),
        startedAtNanos,
        traceMetadata);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .header(HttpHeaders.RETRY_AFTER, Long.toString(federalSubmissionRetryAfterSeconds))
        .body(withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalUnexpectedFailure(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata,
      String entryUserId,
      String userReference,
      String fileName,
      long fileSize,
      long startedAtNanos,
      RuntimeException failure) {
    LOGGER.warn(
        "Federal LEXIS submission processing failed operation={} requestId={} userReference={} fileName={}",
        logValue(operation),
        logValue(requestId),
        logValue(userReference),
        logValue(fileName),
        failure);
    ApplicationSubmissionImportResultDto result =
        applicationSubmissionFailure(
            "Federal LEXIS submission service is unavailable. Try again later.", fileName, fileSize);
    logFederalSubmissionResult(
        operation,
        requestId,
        idempotencyKey,
        payloadSha256,
        entryUserId,
        result,
        HttpStatus.SERVICE_UNAVAILABLE.value(),
        startedAtNanos,
        traceMetadata);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .header(HttpHeaders.RETRY_AFTER, Long.toString(federalSubmissionRetryAfterSeconds))
        .body(withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> importFederalApplicationSubmission(
      String userReference,
      String originalFileName,
      byte[] submissionData,
      String requestId,
      String idempotencyKey,
      String sourceSystem,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    String payloadSha256 = sha256Hex(submissionData);
    String payloadRootType = federalPayloadRootType(submissionData);
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(
            requestId,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (missingRequestId != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          missingRequestId,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidUserReference =
        validateFederalUserReference(
            userReference,
            requireFederalCreateUserReference,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (invalidUserReference != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidUserReference,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest =
        validateFederalXmlPayload(
            submissionData, effectiveFederalFileName(originalFileName), "Submission data is required.");
    if (invalidRequest != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidRequest,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidSourceSystem =
        validateFederalSourceSystem(
            sourceSystem,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (invalidSourceSystem != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidSourceSystem,
          startedAtNanos);
    }
    traceMetadata = federalTraceMetadata(sourceSystem, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidIdempotencyKey =
        validateFederalIdempotencyKey(
            idempotencyKey,
            requireFederalCreateIdempotencyKey,
            effectiveFederalFileName(originalFileName),
            submissionData.length);
    if (invalidIdempotencyKey != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidIdempotencyKey,
          startedAtNanos);
    }
    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Federal LEXIS submission create service unavailable requestId={} userReference={} fileName={}",
          logValue(requestId),
          logValue(userReference),
          logValue(effectiveFederalFileName(originalFileName)));
      return loggedFederalServiceUnavailable(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos);
    }

    String entryUserId = resolveEntryUserId(authentication);
    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.importDedicatedFederalApplicationSubmission(
              submissionData,
              effectiveFederalFileName(originalFileName),
              entryUserId,
              userReference);
    } catch (RuntimeException ex) {
      return loggedFederalUnexpectedFailure(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          entryUserId,
          userReference,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos,
          ex);
    }
    if (result == null) {
      return loggedFederalUnexpectedFailure(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          entryUserId,
          userReference,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos,
          new IllegalStateException("Federal LEXIS submission service returned no result."));
    }
    HttpStatus responseStatus = federalSubmissionCreateResponseStatus(result);
    logFederalSubmissionResult(
        "create-raw",
        requestId,
        idempotencyKey,
        payloadSha256,
        entryUserId,
        result,
        responseStatus.value(),
        startedAtNanos,
        traceMetadata);
    return federalCreateResponse(
        responseStatus,
        withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> importFederalApplicationSubmission(
      String userReference,
      MultipartFile submissionData,
      String requestId,
      String idempotencyKey,
      String sourceSystem,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    String payloadSha256 = sha256Hex(submissionData);
    String payloadRootType = federalPayloadRootType(submissionData);
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(
            requestId,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (missingRequestId != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          missingRequestId,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidUserReference =
        validateFederalUserReference(
            userReference,
            requireFederalCreateUserReference,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (invalidUserReference != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidUserReference,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest =
        validateFederalXmlPayload(
            submissionData, "Choose a federal LEXIS application submission file before uploading.");
    if (invalidRequest != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidRequest,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidSourceSystem =
        validateFederalSourceSystem(
            sourceSystem,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (invalidSourceSystem != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidSourceSystem,
          startedAtNanos);
    }
    traceMetadata = federalTraceMetadata(sourceSystem, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidIdempotencyKey =
        validateFederalIdempotencyKey(
            idempotencyKey,
            requireFederalCreateIdempotencyKey,
            resolveFileName(submissionData),
            submissionData.getSize());
    if (invalidIdempotencyKey != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidIdempotencyKey,
          startedAtNanos);
    }
    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Federal LEXIS submission create service unavailable requestId={} userReference={} fileName={}",
          logValue(requestId),
          logValue(userReference),
          logValue(resolveFileName(submissionData)));
      return loggedFederalServiceUnavailable(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos);
    }

    String entryUserId = resolveEntryUserId(authentication);
    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.importDedicatedFederalApplicationSubmission(
              submissionData, entryUserId, userReference);
    } catch (RuntimeException ex) {
      return loggedFederalUnexpectedFailure(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          entryUserId,
          userReference,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos,
          ex);
    }
    if (result == null) {
      return loggedFederalUnexpectedFailure(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          entryUserId,
          userReference,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos,
          new IllegalStateException("Federal LEXIS submission service returned no result."));
    }
    HttpStatus responseStatus = federalSubmissionCreateResponseStatus(result);
    logFederalSubmissionResult(
        "create-multipart",
        requestId,
        idempotencyKey,
        payloadSha256,
        entryUserId,
        result,
        responseStatus.value(),
        startedAtNanos,
        traceMetadata);
    return federalCreateResponse(
        responseStatus,
        withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalApplicationSubmission(
      String userReference,
      String originalFileName,
      byte[] submissionData,
      String requestId,
      String idempotencyKey,
      String sourceSystem,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    String payloadSha256 = sha256Hex(submissionData);
    String payloadRootType = federalPayloadRootType(submissionData);
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(
            requestId,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (missingRequestId != null) {
      return loggedFederalInvalidRequest(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          missingRequestId,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidUserReference =
        validateFederalUserReference(
            userReference,
            false,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (invalidUserReference != null) {
      return loggedFederalInvalidRequest(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidUserReference,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidIdempotencyKey =
        validateFederalIdempotencyKey(
            idempotencyKey,
            false,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (invalidIdempotencyKey != null) {
      return loggedFederalInvalidRequest(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidIdempotencyKey,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidSourceSystem =
        validateFederalSourceSystem(
            sourceSystem,
            effectiveFederalFileName(originalFileName),
            submissionData == null ? 0L : submissionData.length);
    if (invalidSourceSystem != null) {
      return loggedFederalInvalidRequest(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidSourceSystem,
          startedAtNanos);
    }
    traceMetadata = federalTraceMetadata(sourceSystem, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest =
        validateFederalXmlPayload(
            submissionData, effectiveFederalFileName(originalFileName), "Submission data is required.");
    if (invalidRequest != null) {
      return loggedFederalInvalidRequest(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidRequest,
          startedAtNanos);
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Federal LEXIS submission validation service unavailable requestId={} userReference={} fileName={}",
          logValue(requestId),
          logValue(userReference),
          logValue(effectiveFederalFileName(originalFileName)));
      return loggedFederalServiceUnavailable(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos);
    }

    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.validateDedicatedFederalApplicationSubmission(
              submissionData, effectiveFederalFileName(originalFileName), userReference);
    } catch (RuntimeException ex) {
      return loggedFederalUnexpectedFailure(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          resolveEntryUserId(authentication),
          userReference,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos,
          ex);
    }
    if (result == null) {
      return loggedFederalUnexpectedFailure(
          "validate-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          resolveEntryUserId(authentication),
          userReference,
          effectiveFederalFileName(originalFileName),
          submissionData.length,
          startedAtNanos,
          new IllegalStateException("Federal LEXIS submission service returned no result."));
    }
    HttpStatus responseStatus = applicationSubmissionResponseStatus(result);
    logFederalSubmissionResult(
        "validate-raw",
        requestId,
        idempotencyKey,
        payloadSha256,
        resolveEntryUserId(authentication),
        result,
        responseStatus.value(),
        startedAtNanos,
        traceMetadata);
    return ResponseEntity.status(responseStatus)
        .body(withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalApplicationSubmission(
      String userReference,
      MultipartFile submissionData,
      String requestId,
      String idempotencyKey,
      String sourceSystem,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    String payloadSha256 = sha256Hex(submissionData);
    String payloadRootType = federalPayloadRootType(submissionData);
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(
            requestId,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (missingRequestId != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          missingRequestId,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidUserReference =
        validateFederalUserReference(
            userReference,
            false,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (invalidUserReference != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidUserReference,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidIdempotencyKey =
        validateFederalIdempotencyKey(
            idempotencyKey,
            false,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (invalidIdempotencyKey != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidIdempotencyKey,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidSourceSystem =
        validateFederalSourceSystem(
            sourceSystem,
            resolveFileName(submissionData),
            submissionData == null ? 0L : submissionData.getSize());
    if (invalidSourceSystem != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidSourceSystem,
          startedAtNanos);
    }
    traceMetadata = federalTraceMetadata(sourceSystem, payloadRootType, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidRequest =
        validateFederalXmlPayload(
            submissionData, "Choose a federal LEXIS application submission file before validating.");
    if (invalidRequest != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidRequest,
          startedAtNanos);
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Federal LEXIS submission validation service unavailable requestId={} userReference={} fileName={}",
          logValue(requestId),
          logValue(userReference),
          logValue(resolveFileName(submissionData)));
      return loggedFederalServiceUnavailable(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos);
    }

    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.validateDedicatedFederalApplicationSubmission(submissionData, userReference);
    } catch (RuntimeException ex) {
      return loggedFederalUnexpectedFailure(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          resolveEntryUserId(authentication),
          userReference,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos,
          ex);
    }
    if (result == null) {
      return loggedFederalUnexpectedFailure(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          resolveEntryUserId(authentication),
          userReference,
          resolveFileName(submissionData),
          submissionData.getSize(),
          startedAtNanos,
          new IllegalStateException("Federal LEXIS submission service returned no result."));
    }
    HttpStatus responseStatus = applicationSubmissionResponseStatus(result);
    logFederalSubmissionResult(
        "validate-multipart",
        requestId,
        idempotencyKey,
        payloadSha256,
        resolveEntryUserId(authentication),
        result,
        responseStatus.value(),
        startedAtNanos,
        traceMetadata);
    return ResponseEntity.status(responseStatus)
        .body(withFederalResponseTrace(result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalXmlPayload(
      byte[] submissionData, String originalFileName, String missingMessage) {
    String fileName = trimToNull(originalFileName);
    long fileSize = submissionData == null ? 0L : submissionData.length;
    if (submissionData == null || submissionData.length == 0) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure(missingMessage, fileName, fileSize));
    }
    if (!startsWithXml(submissionData)) {
      return ResponseEntity.badRequest()
          .body(
              applicationSubmissionFailure(
                  "Federal submission endpoint only accepts XML payloads.", fileName, fileSize));
    }
    return null;
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalIdempotencyKey(
      String idempotencyKey, boolean required, String fileName, long fileSize) {
    String normalized = trimToNull(idempotencyKey);
    if (required && normalized == null) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Idempotency-Key header is required for federal create submissions.",
                  fileName,
                  fileSize));
    }
    if (normalized != null && normalized.length() > MAX_FEDERAL_HEADER_VALUE_LENGTH) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Idempotency-Key header must be "
                      + MAX_FEDERAL_HEADER_VALUE_LENGTH
                      + " characters or fewer.",
                  fileName,
                  fileSize));
    }
    return null;
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalSourceSystem(
      String sourceSystem, String fileName, long fileSize) {
    String normalized = trimToNull(sourceSystem);
    if (requireFederalSourceSystem && normalized == null) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Source-System header or sourceSystem parameter is required for federal submissions.",
                  fileName,
                  fileSize));
    }
    if (normalized != null && normalized.length() > MAX_FEDERAL_HEADER_VALUE_LENGTH) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Source-System header or sourceSystem parameter must be "
                      + MAX_FEDERAL_HEADER_VALUE_LENGTH
                      + " characters or fewer.",
                  fileName,
                  fileSize));
    }
    return null;
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> federalCreateResponse(
      HttpStatus responseStatus, ApplicationSubmissionImportResultDto result) {
    ResponseEntity.BodyBuilder response = ResponseEntity.status(responseStatus);
    URI location = federalApplicationLocation(responseStatus, result);
    if (location != null) {
      response.location(location);
    }
    return response.body(result);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> federalResponseWithTrace(
      ResponseEntity<ApplicationSubmissionImportResultDto> response,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata) {
    if (response == null || response.getBody() == null) {
      return response;
    }
    return ResponseEntity.status(response.getStatusCode().value())
        .headers(response.getHeaders())
        .body(
            withFederalResponseTrace(
                response.getBody(), requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ApplicationSubmissionImportResultDto withFederalResponseTrace(
      ApplicationSubmissionImportResultDto result,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata) {
    if (result == null) {
      return null;
    }
    FederalSubmissionTraceMetadata metadata =
        traceMetadata == null ? FederalSubmissionTraceMetadata.empty() : traceMetadata;
    return result.withTraceMetadata(
        trimToNull(requestId),
        trimToNull(idempotencyKey),
        trimToNull(payloadSha256),
        metadata.sourceSystem(),
        metadata.payloadRootType());
  }

  private URI federalApplicationLocation(
      HttpStatus responseStatus, ApplicationSubmissionImportResultDto result) {
    if (responseStatus != HttpStatus.CREATED || result == null) {
      return null;
    }
    Long applicationNumber = result.applicationNumber();
    if (applicationNumber == null || applicationNumber <= 0L) {
      return null;
    }
    return URI.create("/api/lexis/federal/applications/" + applicationNumber);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalRequestId(
      String requestId, String fileName, long fileSize) {
    String normalized = trimToNull(requestId);
    if (requireFederalRequestId && normalized == null) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Request-ID header is required for federal submissions.",
                  fileName,
                  fileSize));
    }
    if (normalized != null && normalized.length() > MAX_FEDERAL_HEADER_VALUE_LENGTH) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "X-Request-ID header must be "
                      + MAX_FEDERAL_HEADER_VALUE_LENGTH
                      + " characters or fewer.",
                  fileName,
                  fileSize));
    }
    return null;
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalUserReference(
      String userReference, boolean required, String fileName, long fileSize) {
    String normalized = trimToNull(userReference);
    if (required && normalized == null) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "userReference is required for federal create submissions.",
                  fileName,
                  fileSize));
    }
    if (normalized != null && normalized.length() > MAX_FEDERAL_USER_REFERENCE_LENGTH) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              applicationSubmissionFailure(
                  "userReference must be "
                      + MAX_FEDERAL_USER_REFERENCE_LENGTH
                      + " characters or fewer.",
                  fileName,
                  fileSize));
    }
    return null;
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> validateFederalXmlPayload(
      MultipartFile submissionData, String missingMessage) {
    String fileName = resolveFileName(submissionData);
    long fileSize = submissionData == null ? 0L : submissionData.getSize();
    if (submissionData == null || submissionData.isEmpty()) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure(missingMessage, fileName, fileSize));
    }
    if (!startsWithXml(submissionData)) {
      return ResponseEntity.badRequest()
          .body(
              applicationSubmissionFailure(
                  "Federal submission endpoint only accepts XML files.", fileName, fileSize));
    }
    return null;
  }

  private String effectiveFederalFileName(String originalFileName) {
    String normalized = trimToNull(originalFileName);
    return normalized == null ? DEFAULT_FEDERAL_FILE_NAME : normalized;
  }

  private HttpStatus applicationSubmissionResponseStatus(ApplicationSubmissionImportResultDto result) {
    return "accepted".equalsIgnoreCase(result.status()) || "validated".equalsIgnoreCase(result.status())
        ? HttpStatus.OK
        : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private HttpStatus federalSubmissionCreateResponseStatus(ApplicationSubmissionImportResultDto result) {
    if ("accepted".equalsIgnoreCase(result.status())) {
      return HttpStatus.CREATED;
    }
    return applicationSubmissionResponseStatus(result);
  }

  private void logFederalSubmissionResult(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      String entryUserId,
      ApplicationSubmissionImportResultDto result,
      int responseHttpStatus,
      long startedAtNanos) {
    logFederalSubmissionResult(
        operation,
        requestId,
        idempotencyKey,
        payloadSha256,
        entryUserId,
        result,
        responseHttpStatus,
        startedAtNanos,
        FederalSubmissionTraceMetadata.empty());
  }

  private void logFederalSubmissionResult(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      String entryUserId,
      ApplicationSubmissionImportResultDto result,
      int responseHttpStatus,
      long startedAtNanos,
      FederalSubmissionTraceMetadata traceMetadata) {
    FederalSubmissionTraceMetadata effectiveTraceMetadata =
        traceMetadata == null ? FederalSubmissionTraceMetadata.empty() : traceMetadata;
    ApplicationSubmissionSummaryDto summary = result.submissionSummary();
    String message =
        "Federal LEXIS submission result operation={} requestId={} idempotencyKey={} payloadSha256={} "
            + "entryUserId={} authorizedAction={} grantedAuthorities={} sourceSystem={} payloadRootType={} "
            + "userReference={} fileName={} fileSize={} status={} applicationNumber={} "
            + "packageNumber={} federalPermitNumber={} jurisdictionCode={} "
            + "federalApplicationNumber={} scaleRows={} errorCount={} warningCount={}";
    Object[] arguments = {
      logValue(operation),
      logValue(requestId),
      logValue(idempotencyKey),
      logValue(payloadSha256),
      logValue(entryUserId),
      logValue(effectiveTraceMetadata.authorizedAction()),
      logValue(effectiveTraceMetadata.grantedAuthorities()),
      logValue(effectiveTraceMetadata.sourceSystem()),
      logValue(effectiveTraceMetadata.payloadRootType()),
      logValue(result.userReference()),
      logValue(result.fileName()),
      result.fileSize(),
      logValue(result.status()),
      logValue(result.applicationNumber()),
      logValue(result.packageNumber()),
      logValue(result.federalPermitNumber()),
      summary == null ? "-" : logValue(summary.jurisdictionCode()),
      summary == null ? "-" : logValue(summary.federalApplicationNumber()),
      result.scaleRows(),
      result.errors() == null ? 0 : result.errors().size(),
      result.warnings() == null ? 0 : result.warnings().size()
    };
    if ("rejected".equalsIgnoreCase(result.status())) {
      LOGGER.warn(message, arguments);
    } else {
      LOGGER.info(message, arguments);
    }
    recordFederalSubmissionMetrics(operation, result, startedAtNanos);
  }

  private void recordFederalSubmissionMetrics(
      String operation, ApplicationSubmissionImportResultDto result, long startedAtNanos) {
    MeterRegistry meterRegistry =
        meterRegistryProvider == null ? null : meterRegistryProvider.getIfAvailable();
    if (meterRegistry == null) {
      return;
    }

    String status = metricTag(result.status());
    meterRegistry.counter("lexis_federal_submission_requests_total", "operation", operation).increment();
    meterRegistry
        .counter("lexis_federal_submission_results_total", "operation", operation, "status", status)
        .increment();
    if ("rejected".equalsIgnoreCase(result.status())) {
      meterRegistry
          .counter(
              "lexis_federal_submission_failures_total",
              "operation",
              operation,
              "failure_type",
              federalSubmissionFailureType(result))
          .increment();
    }
    if (result.fileSize() > 0) {
      meterRegistry
          .counter("lexis_federal_submission_bytes_total", "operation", operation)
          .increment(result.fileSize());
    }
    Timer.builder("lexis_federal_submission_duration_seconds")
        .tags("operation", operation, "status", status)
        .register(meterRegistry)
        .record(Math.max(0L, System.nanoTime() - startedAtNanos), TimeUnit.NANOSECONDS);
  }

  private String metricTag(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "unknown" : normalized.toLowerCase();
  }

  private String federalSubmissionFailureType(ApplicationSubmissionImportResultDto result) {
    String text = federalSubmissionFailureText(result);
    if (text.contains("request-id header is required")) {
      return "missing_request_id";
    }
    if (text.contains("userreference is required")) {
      return "missing_user_reference";
    }
    if (text.contains("idempotency-key header is required")) {
      return "missing_idempotency_key";
    }
    if (text.contains("request-id header must be")
        || text.contains("idempotency-key header must be")
        || text.contains("source-system header")
        || text.contains("userreference must be")
        || text.contains("user reference must be")) {
      return "invalid_metadata";
    }
    if (text.contains("idempotency-key has already been used")) {
      return "duplicate_or_replay";
    }
    if (text.contains("submission data is required")
        || text.contains("choose a federal lexis application submission file")) {
      return "missing_body";
    }
    if (text.contains("only accepts xml")
        || text.contains("must be an xml")
        || text.contains("zip file")
        || text.contains("geojson")) {
      return "unsupported_content";
    }
    if (text.contains("jurisdictioncode=f") || text.contains("provincial applications")) {
      return "provincial_payload";
    }
    if (text.contains("unavailable")) {
      return "dependency_unavailable";
    }
    if (text.contains("already exists") || text.contains("same timber mark/species/grade")) {
      return "duplicate_or_replay";
    }
    if (text.contains("could not be saved")
        || text.contains("unable to save")
        || text.contains("persistence")) {
      return "persistence";
    }
    if (text.contains("well-formed")
        || text.contains("doctype")
        || text.contains("xml root")
        || text.contains("schema location")
        || text.contains("xsi:")
        || text.contains("xml file must include")) {
      return "invalid_xml";
    }
    return "business_validation";
  }

  private String federalSubmissionFailureText(ApplicationSubmissionImportResultDto result) {
    StringBuilder text = new StringBuilder();
    if (result.message() != null) {
      text.append(result.message()).append(' ');
    }
    if (result.errors() != null) {
      for (String error : result.errors()) {
        if (error != null) {
          text.append(error).append(' ');
        }
      }
    }
    return text.toString().toLowerCase();
  }

  private FederalSubmissionTraceMetadata federalTraceMetadata(
      String sourceSystem, String payloadRootType, Authentication authentication) {
    return new FederalSubmissionTraceMetadata(
        FEDERAL_SUBMISSION_ACTION,
        federalGrantedAuthorities(authentication),
        trimToNull(sourceSystem),
        trimToNull(payloadRootType));
  }

  private String federalGrantedAuthorities(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return null;
    }
    String authorities =
        authentication.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .filter(value -> value != null && !value.isBlank())
            .map(String::trim)
            .sorted(Comparator.naturalOrder())
            .reduce((left, right) -> left + "," + right)
            .orElse(null);
    return trimToNull(authorities);
  }

  private String federalSourceSystem(String sourceSystemHeader, String sourceSystemParameter) {
    return firstNonBlank(sourceSystemHeader, sourceSystemParameter);
  }

  private String federalPayloadRootType(byte[] payload) {
    return FederalPayloadRootClassifier.classify(payload);
  }

  private String federalPayloadRootType(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return null;
    }
    try {
      return federalPayloadRootType(file.getBytes());
    } catch (IOException ex) {
      LOGGER.warn("Unable to inspect federal LEXIS submission payload root: {}", ex.getMessage());
      return null;
    }
  }

  private String sha256Hex(byte[] payload) {
    if (payload == null || payload.length == 0) {
      return null;
    }
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 digest algorithm is unavailable", ex);
    }
  }

  private String sha256Hex(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return null;
    }
    try {
      return sha256Hex(file.getBytes());
    } catch (IOException ex) {
      LOGGER.warn("Unable to compute federal LEXIS submission payload hash: {}", ex.getMessage());
      return null;
    }
  }

  private String resolveFileName(MultipartFile file) {
    if (file == null) {
      return null;
    }
    String originalFileName = trimToNull(file.getOriginalFilename());
    return originalFileName == null ? trimToNull(file.getName()) : originalFileName;
  }

  private Object logValue(Object value) {
    if (value == null) {
      return "-";
    }
    if (value instanceof String stringValue) {
      String normalized = trimToNull(stringValue);
      if (normalized == null) {
        return "-";
      }
      return normalized.length() <= MAX_LOG_VALUE_LENGTH
          ? normalized
          : normalized.substring(0, MAX_LOG_VALUE_LENGTH) + "...";
    }
    return value;
  }

  private String firstNonBlank(String primary, String alias) {
    if (primary != null && !primary.isBlank()) {
      return primary;
    }
    if (alias != null && !alias.isBlank()) {
      return alias;
    }
    return null;
  }

  private BigDecimal firstNonNull(BigDecimal primary, BigDecimal alias) {
    return primary != null ? primary : alias;
  }

  private MultipartFile firstNonNull(MultipartFile primary, MultipartFile alias) {
    return primary != null ? primary : alias;
  }

  private boolean startsWithXml(byte[] bytes) {
    int offset = 0;
    if (bytes.length >= 3
        && (bytes[0] & 0xFF) == 0xEF
        && (bytes[1] & 0xFF) == 0xBB
        && (bytes[2] & 0xFF) == 0xBF) {
      offset = 3;
    }
    while (offset < bytes.length) {
      byte value = bytes[offset];
      if (value == ' ' || value == '\t' || value == '\n' || value == '\r') {
        offset++;
        continue;
      }
      return value == '<';
    }
    return false;
  }

  private boolean startsWithXml(MultipartFile file) {
    try (InputStream inputStream = file.getInputStream()) {
      int first = inputStream.read();
      if (first == 0xEF) {
        int second = inputStream.read();
        int third = inputStream.read();
        if (second != 0xBB || third != 0xBF) {
          return false;
        }
        first = inputStream.read();
      }
      while (first >= 0) {
        if (first == ' ' || first == '\t' || first == '\n' || first == '\r') {
          first = inputStream.read();
          continue;
        }
        return first == '<';
      }
      return false;
    } catch (IOException ex) {
      LOGGER.warn("Unable to inspect federal LEXIS application submission file: {}", ex.getMessage());
      return false;
    }
  }

  private String trimToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private record FederalSubmissionTraceMetadata(
      String authorizedAction, String grantedAuthorities, String sourceSystem, String payloadRootType) {
    private static FederalSubmissionTraceMetadata empty() {
      return new FederalSubmissionTraceMetadata(null, null, null, null);
    }
  }
}

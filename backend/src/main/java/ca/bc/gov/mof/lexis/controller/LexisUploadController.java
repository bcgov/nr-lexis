package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.truncatedSha256;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.DocumentUploadMutationPolicy;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
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
  private static final int MAX_FEDERAL_XML_PREFIX_BYTES = 16 * 1024;

  private final ObjectProvider<LexisUploadService> uploadServiceProvider;
  private final ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider;
  private final ApplicationEditLockService applicationEditLockService;
  private final ObjectProvider<MeterRegistry> meterRegistryProvider;
  private final PermitOperationMutex permitOperationMutex;
  private FederalSubmissionIdempotencyStore federalCreateIdempotencyStore =
      new FederalSubmissionIdempotencyStore();
  private ProvincialAuthorizationService provincialAuthorizationService;
  private DocumentUploadMutationPolicy documentUploadMutationPolicy;
  private LexisPrincipalService principalService;
  private boolean requireFederalRequestId;
  private boolean requireFederalCreateUserReference;
  private boolean requireFederalCreateIdempotencyKey;
  private boolean requireFederalSourceSystem;
  private boolean federalCreateEnabled;
  private long federalSubmissionRetryAfterSeconds = 60L;

  @Autowired
  public LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider,
      ApplicationEditLockService applicationEditLockService,
      ObjectProvider<MeterRegistry> meterRegistryProvider,
      PermitOperationMutex permitOperationMutex) {
    this.uploadServiceProvider = uploadServiceProvider;
    this.applicationSubmissionImportServiceProvider = applicationSubmissionImportServiceProvider;
    this.applicationEditLockService = applicationEditLockService;
    this.meterRegistryProvider = meterRegistryProvider;
    this.permitOperationMutex = permitOperationMutex;
  }

  public LexisUploadController(
      ObjectProvider<LexisUploadService> uploadServiceProvider,
      ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider,
      ApplicationEditLockService applicationEditLockService,
      ObjectProvider<MeterRegistry> meterRegistryProvider) {
    this(
        uploadServiceProvider,
        applicationSubmissionImportServiceProvider,
        applicationEditLockService,
        meterRegistryProvider,
        new PermitOperationMutex());
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

  @Value("${lexis.federal-submission.create-enabled:false}")
  void setFederalCreateEnabled(boolean federalCreateEnabled) {
    this.federalCreateEnabled = federalCreateEnabled;
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

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @Autowired
  void setDocumentUploadMutationPolicy(
      DocumentUploadMutationPolicy documentUploadMutationPolicy) {
    this.documentUploadMutationPolicy = documentUploadMutationPolicy;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @Autowired
  void setFederalSubmissionIdempotencyStore(
      FederalSubmissionIdempotencyStore federalSubmissionIdempotencyStore) {
    this.federalCreateIdempotencyStore = federalSubmissionIdempotencyStore;
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
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireApplicationAttachmentPersistence(
          authentication, applicationNumber);
    }
    return permitOperationMutex.executeApplications(
        List.of(applicationNumber),
        () -> {
          if (provincialAuthorizationService != null) {
            provincialAuthorizationService.requireApplicationAttachmentPersistence(
                authentication, applicationNumber);
          }
          requireApplicationMutable(applicationNumber);
          ApplicationEditLockDto lock =
              applicationEditLockService.acquire(
                  applicationNumber,
                  userId(authentication),
                  userId(authentication),
                  false);
          if (lock == null || lock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                    uploadFailure(
                        "application",
                        lock == null
                            ? "The application edit lock could not be acquired."
                            : lock.message()));
          }

          LexisUploadService service = uploadServiceProvider.getIfAvailable();
          if (service == null) {
            LOGGER.warn(
                "Upload service unavailable - returning no content for fileApplicationUpload");
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
        });
  }

  @PostMapping(
      value = {"/uploads/application/validation", "/admin/uploads/applications/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateApplicationUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "applicationNumber", required = false) Long applicationNumber,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || applicationNumber == null || applicationNumber < 1) {
      return uploadBadRequest(
          "application", "Choose a file and enter a valid application number before validating documents.");
    }
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireApplicationAttachmentMutation(
          authentication, applicationNumber);
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
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermitAttachmentMutation(authentication, permitNumber);
    }
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          if (provincialAuthorizationService != null) {
            provincialAuthorizationService.requirePermitAttachmentMutation(
                authentication, permitNumber);
          }
          requirePermitMutable(permitNumber);
          ApplicationEditLockDto lock =
              applicationEditLockService.acquirePermit(
                  permitNumber, userId(authentication), userId(authentication), false);
          if (lock == null || lock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                    uploadFailure(
                        "permit",
                        lock == null
                            ? "The permit edit lock could not be acquired."
                            : lock.message()));
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
        });
  }

  @PostMapping(
      value = {"/uploads/permit/validation", "/admin/uploads/permits/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validatePermitUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null || uploadFile.isEmpty() || permitNumber == null || permitNumber < 1) {
      return uploadBadRequest(
          "permit", "Choose a file and enter a valid permit number before validating documents.");
    }
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermitAttachmentMutation(authentication, permitNumber);
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
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireExemptionAttachmentMutation(
          authentication, exemptionNumber);
    }
    return permitOperationMutex.executeExemptions(
        List.of(exemptionNumber),
        () -> {
          if (provincialAuthorizationService != null) {
            provincialAuthorizationService.requireExemptionAttachmentMutation(
                authentication, exemptionNumber);
          }
          requireExemptionMutable(exemptionNumber);
          ApplicationEditLockDto lock =
              applicationEditLockService.acquireExemption(
                  exemptionNumber, userId(authentication), userId(authentication), false);
          if (lock == null || lock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                    uploadFailure(
                        "exemption",
                        lock == null
                            ? "The exemption edit lock could not be acquired."
                            : lock.message()));
          }

          LexisUploadService service = uploadServiceProvider.getIfAvailable();
          if (service == null) {
            LOGGER.warn(
                "Upload service unavailable - returning no content for fileExemptionUpload");
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
        });
  }

  @PostMapping(
      value = {"/uploads/exemption/validation", "/admin/uploads/exemptions/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateExemptionUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    MultipartFile uploadFile = firstNonNull(file, formFile);
    if (uploadFile == null
        || uploadFile.isEmpty()
        || exemptionNumber == null
        || exemptionNumber.isBlank()) {
      return uploadBadRequest(
          "exemption", "Choose a file and enter a valid exemption number before validating documents.");
    }
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireExemptionAttachmentMutation(
          authentication, exemptionNumber);
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
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermitAttachmentMutation(authentication, permitNumber);
    }
    return permitOperationMutex.execute(
        permitNumber,
        () -> {
          if (provincialAuthorizationService != null) {
            provincialAuthorizationService.requirePermitAttachmentMutation(
                authentication, permitNumber);
          }
          requireInvoicePermitActive(permitNumber);
          ApplicationEditLockDto lock =
              applicationEditLockService.acquirePermit(
                  permitNumber, userId(authentication), userId(authentication), false);
          if (lock == null || lock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                    uploadFailure(
                        "invoice",
                        lock == null
                            ? "The permit edit lock could not be acquired."
                            : lock.message()));
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
        });
  }

  @PostMapping(
      value = {"/uploads/invoice/validation", "/admin/uploads/invoices/validation"},
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<LexisUploadResultDto> validateInvoiceUpload(
      @RequestParam(name = "file", required = false) MultipartFile file,
      @RequestParam(name = "formFile", required = false) MultipartFile formFile,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      Authentication authentication) {
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
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermitAttachmentMutation(authentication, permitNumber);
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
            uploadFile,
            resolveEntryUserId(authentication),
            userReference,
            provincialAuthorizationService == null
                ? null
                : provincialAuthorizationService.scopedForestClientNumber(authentication),
            resolveApplicationSubmissionOrgUnitConstraint(authentication));
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
        service.validateApplicationSubmission(
            uploadFile,
            userReference,
            provincialAuthorizationService == null
                ? null
                : provincialAuthorizationService.scopedForestClientNumber(authentication),
            resolveApplicationSubmissionOrgUnitConstraint(authentication));
    return ResponseEntity.status(applicationSubmissionResponseStatus(result)).body(result);
  }

  private OrgUnitConstraint resolveApplicationSubmissionOrgUnitConstraint(
      Authentication authentication) {
    if (provincialAuthorizationService == null) {
      throw new AccessDeniedException(
          "Application submission organization-unit authorization is unavailable.");
    }
    OrgUnitConstraint constraint =
        provincialAuthorizationService.resolveOrgUnitConstraint(
            authentication, OrgUnitSurface.APPLICATION_WRITE);
    if (constraint == null) {
      throw new AccessDeniedException(
          "Application submission organization-unit authorization is unavailable.");
    }
    return constraint;
  }

  @PostMapping(
      value = "/federal/submissions",
      consumes = {
        MediaType.APPLICATION_XML_VALUE,
        MediaType.TEXT_XML_VALUE,
        "application/soap+xml",
        MediaType.TEXT_PLAIN_VALUE,
        MediaType.APPLICATION_FORM_URLENCODED_VALUE
      })
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionRawUpload(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "originalFileName", required = false) String originalFileName,
      HttpServletRequest request,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    if (!federalCreateEnabled) {
      return loggedFederalCreateDisabled(
          "create-raw",
          requestId,
          idempotencyKey,
          null,
          federalTraceMetadata(
              federalSourceSystem(sourceSystemHeader, sourceSystem), null, authentication),
          authentication,
          effectiveFederalFileName(originalFileName),
          0L,
          System.nanoTime());
    }
    RawFederalSubmission submission = readRawFederalSubmission(request, originalFileName);
    if (submission.failure() != null) {
      return submission.failure();
    }
    return importFederalApplicationSubmission(
        userReference,
        originalFileName,
        submission.data(),
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
      String sourceSystemHeader,
      String sourceSystem,
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
        MediaType.TEXT_PLAIN_VALUE,
        MediaType.APPLICATION_FORM_URLENCODED_VALUE
      })
  public ResponseEntity<ApplicationSubmissionImportResultDto> federalApplicationSubmissionRawValidation(
      @RequestParam(name = "userReference", required = false) String userReference,
      @RequestParam(name = "originalFileName", required = false) String originalFileName,
      HttpServletRequest request,
      @RequestHeader(name = REQUEST_ID_HEADER, required = false) String requestId,
      @RequestHeader(name = IDEMPOTENCY_KEY_HEADER, required = false) String idempotencyKey,
      @RequestHeader(name = SOURCE_SYSTEM_HEADER, required = false) String sourceSystemHeader,
      @RequestParam(name = "sourceSystem", required = false) String sourceSystem,
      Authentication authentication) {
    RawFederalSubmission submission = readRawFederalSubmission(request, originalFileName);
    if (submission.failure() != null) {
      return submission.failure();
    }
    return validateFederalApplicationSubmission(
        userReference,
        originalFileName,
        submission.data(),
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
      String sourceSystemHeader,
      String sourceSystem,
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
    return userId(authentication);
  }

  private void requireApplicationMutable(Long applicationNumber) {
    mutationPolicy().requireApplicationMutable(applicationNumber);
  }

  private void requireExemptionMutable(String exemptionNumber) {
    mutationPolicy().requireExemptionMutable(exemptionNumber);
  }

  private void requirePermitMutable(Long permitNumber) {
    mutationPolicy().requirePermitMutable(permitNumber);
  }

  private void requireInvoicePermitActive(Long permitNumber) {
    mutationPolicy().requireInvoicePermitActive(permitNumber);
  }

  private DocumentUploadMutationPolicy mutationPolicy() {
    if (documentUploadMutationPolicy == null) {
      throw new AccessDeniedException("Document target status is unavailable for mutation.");
    }
    return documentUploadMutationPolicy;
  }

  private String userId(Authentication authentication) {
    if (authentication == null) {
      return null;
    }
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    if (authentication instanceof JwtAuthenticationToken) {
      throw new AccessDeniedException(
          "Authenticated JWT audit identity service is unavailable.");
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

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalCreateDisabled(
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
            "Federal LEXIS submission creation is disabled. Retry only after the integration has been explicitly enabled.",
            fileName,
            fileSize);
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
        .body(
            withFederalResponseTrace(
                result, requestId, idempotencyKey, payloadSha256, traceMetadata));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> loggedFederalUnexpectedFailure(
      String operation,
      String requestId,
      String idempotencyKey,
      String payloadSha256,
      FederalSubmissionTraceMetadata traceMetadata,
      String entryUserId,
      String fileName,
      long fileSize,
      long startedAtNanos,
      RuntimeException failure) {
    LOGGER.warn(
        "event=lexis_federal_submission_failure operation={} requestFingerprint={} "
            + "idempotencyFingerprint={} actorFingerprint={} failureType={}",
        controlSafe(operation),
        fingerprint(requestId),
        fingerprint(idempotencyKey),
        fingerprint(entryUserId),
        exceptionType(failure));
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
    if (!federalCreateEnabled) {
      return loggedFederalCreateDisabled(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          effectiveFederalFileName(originalFileName),
          submissionData == null ? 0L : submissionData.length,
          startedAtNanos);
    }
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
            federalCreateEnabled || requireFederalCreateIdempotencyKey,
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
    String entryUserId = resolveEntryUserId(authentication);
    FederalCreateIdempotencyStart idempotencyStart =
        beginFederalCreateIdempotency(
            entryUserId,
            idempotencyKey,
            federalIdempotencyFingerprint(
                payloadSha256,
                userReference,
                sourceSystem,
                effectiveFederalFileName(originalFileName)),
            effectiveFederalFileName(originalFileName),
            submissionData.length);
    if (idempotencyStart.immediateResponse() != null) {
      if (idempotencyStart.replay()) {
        return idempotencyStart.immediateResponse();
      }
      return loggedFederalPreflightInvalidRequest(
          "create-raw",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          idempotencyStart.immediateResponse(),
          startedAtNanos);
    }
    FederalSubmissionIdempotencyStore.Claim idempotencyClaim = idempotencyStart.claim();
    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalServiceUnavailable(
              "create-raw",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              authentication,
              effectiveFederalFileName(originalFileName),
              submissionData.length,
              startedAtNanos));
    }

    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.importDedicatedFederalApplicationSubmission(
              submissionData,
              effectiveFederalFileName(originalFileName),
              entryUserId,
              userReference);
    } catch (RuntimeException ex) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalUnexpectedFailure(
              "create-raw",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              entryUserId,
              effectiveFederalFileName(originalFileName),
              submissionData.length,
              startedAtNanos,
              ex));
    }
    if (result == null) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalUnexpectedFailure(
              "create-raw",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              entryUserId,
              effectiveFederalFileName(originalFileName),
              submissionData.length,
              startedAtNanos,
              new IllegalStateException("Federal LEXIS submission service returned no result.")));
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
    return finishFederalCreateIdempotency(
        idempotencyClaim,
        federalCreateResponse(
            responseStatus,
            withFederalResponseTrace(
                result, requestId, idempotencyKey, payloadSha256, traceMetadata)));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> importFederalApplicationSubmission(
      String userReference,
      MultipartFile submissionData,
      String requestId,
      String idempotencyKey,
      String sourceSystem,
      Authentication authentication) {
    long startedAtNanos = System.nanoTime();
    String fileName = resolveFileName(submissionData);
    long fileSize = submissionData == null ? 0L : submissionData.getSize();
    String payloadSha256 = null;
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, null, authentication);
    if (!federalCreateEnabled) {
      return loggedFederalCreateDisabled(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          fileName,
          fileSize,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(requestId, fileName, fileSize);
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
            userReference, requireFederalCreateUserReference, fileName, fileSize);
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
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidFile =
        validateFederalMultipartFilePreflight(
            submissionData,
            fileName,
            fileSize,
            "Choose a federal LEXIS application submission file before uploading.");
    if (invalidFile != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidFile,
          startedAtNanos);
    }
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidSourceSystem =
        validateFederalSourceSystem(sourceSystem, fileName, fileSize);
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
    traceMetadata = federalTraceMetadata(sourceSystem, null, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidIdempotencyKey =
        validateFederalIdempotencyKey(
            idempotencyKey,
            federalCreateEnabled || requireFederalCreateIdempotencyKey,
            fileName,
            fileSize);
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

    FederalMultipartPayloadInspection inspection =
        inspectFederalMultipartPayload(submissionData, fileName, fileSize);
    payloadSha256 = inspection.payloadSha256();
    traceMetadata =
        federalTraceMetadata(sourceSystem, inspection.payloadRootType(), authentication);
    if (inspection.failure() != null) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          inspection.failure(),
          startedAtNanos);
    }
    if (!inspection.xmlPayload()) {
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          federalMultipartXmlRequired(fileName, fileSize),
          startedAtNanos);
    }

    String entryUserId = resolveEntryUserId(authentication);
    FederalCreateIdempotencyStart idempotencyStart =
        beginFederalCreateIdempotency(
            entryUserId,
            idempotencyKey,
            federalIdempotencyFingerprint(
                payloadSha256, userReference, sourceSystem, fileName),
            fileName,
            fileSize);
    if (idempotencyStart.immediateResponse() != null) {
      if (idempotencyStart.replay()) {
        return idempotencyStart.immediateResponse();
      }
      return loggedFederalPreflightInvalidRequest(
          "create-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          idempotencyStart.immediateResponse(),
          startedAtNanos);
    }
    FederalSubmissionIdempotencyStore.Claim idempotencyClaim = idempotencyStart.claim();
    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalServiceUnavailable(
              "create-multipart",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              authentication,
              fileName,
              fileSize,
              startedAtNanos));
    }

    ApplicationSubmissionImportResultDto result;
    try {
      result =
          service.importDedicatedFederalApplicationSubmission(
              submissionData, entryUserId, userReference);
    } catch (RuntimeException ex) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalUnexpectedFailure(
              "create-multipart",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              entryUserId,
              fileName,
              fileSize,
              startedAtNanos,
              ex));
    }
    if (result == null) {
      return finishFederalCreateIdempotency(
          idempotencyClaim,
          loggedFederalUnexpectedFailure(
              "create-multipart",
              requestId,
              idempotencyKey,
              payloadSha256,
              traceMetadata,
              entryUserId,
              fileName,
              fileSize,
              startedAtNanos,
              new IllegalStateException("Federal LEXIS submission service returned no result.")));
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
    return finishFederalCreateIdempotency(
        idempotencyClaim,
        federalCreateResponse(
            responseStatus,
            withFederalResponseTrace(
                result, requestId, idempotencyKey, payloadSha256, traceMetadata)));
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
    String fileName = resolveFileName(submissionData);
    long fileSize = submissionData == null ? 0L : submissionData.getSize();
    String payloadSha256 = null;
    FederalSubmissionTraceMetadata traceMetadata =
        federalTraceMetadata(null, null, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> missingRequestId =
        validateFederalRequestId(requestId, fileName, fileSize);
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
        validateFederalUserReference(userReference, false, fileName, fileSize);
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
        validateFederalIdempotencyKey(idempotencyKey, false, fileName, fileSize);
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
        validateFederalSourceSystem(sourceSystem, fileName, fileSize);
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
    traceMetadata = federalTraceMetadata(sourceSystem, null, authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> invalidFile =
        validateFederalMultipartFilePreflight(
            submissionData,
            fileName,
            fileSize,
            "Choose a federal LEXIS application submission file before validating.");
    if (invalidFile != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          invalidFile,
          startedAtNanos);
    }

    FederalMultipartPayloadInspection inspection =
        inspectFederalMultipartPayload(submissionData, fileName, fileSize);
    payloadSha256 = inspection.payloadSha256();
    traceMetadata =
        federalTraceMetadata(sourceSystem, inspection.payloadRootType(), authentication);
    if (inspection.failure() != null) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          inspection.failure(),
          startedAtNanos);
    }
    if (!inspection.xmlPayload()) {
      return loggedFederalInvalidRequest(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          federalMultipartXmlRequired(fileName, fileSize),
          startedAtNanos);
    }

    ApplicationSubmissionImportService service =
        applicationSubmissionImportServiceProvider.getIfAvailable();
    if (service == null) {
      return loggedFederalServiceUnavailable(
          "validate-multipart",
          requestId,
          idempotencyKey,
          payloadSha256,
          traceMetadata,
          authentication,
          fileName,
          fileSize,
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
          fileName,
          fileSize,
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
          fileName,
          fileSize,
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

  private FederalCreateIdempotencyStart beginFederalCreateIdempotency(
      String caller,
      String idempotencyKey,
      String requestFingerprint,
      String fileName,
      long fileSize) {
    String normalizedIdempotencyKey = trimToNull(idempotencyKey);
    if (normalizedIdempotencyKey == null) {
      return FederalCreateIdempotencyStart.bypass();
    }
    if (trimToNull(requestFingerprint) == null) {
      return FederalCreateIdempotencyStart.immediate(
          federalIdempotencyFailure(
              HttpStatus.SERVICE_UNAVAILABLE,
              "The federal submission payload digest could not be established. Retry with the same idempotency key and payload.",
              fileName,
              fileSize,
              true));
    }

    FederalSubmissionIdempotencyStore.Decision decision =
        federalCreateIdempotencyStore.claim(caller, normalizedIdempotencyKey, requestFingerprint);
    return switch (decision.outcome()) {
      case CLAIMED -> FederalCreateIdempotencyStart.claimed(decision.claim());
      case REPLAY -> FederalCreateIdempotencyStart.replay(decision.replayResponse());
      case PAYLOAD_MISMATCH ->
          FederalCreateIdempotencyStart.immediate(
              federalIdempotencyFailure(
                  HttpStatus.CONFLICT,
                  "X-Idempotency-Key has already been used by this caller for a different payload. Use a new idempotency key for a different submission; do not retry it with this key.",
                  fileName,
                  fileSize,
                  false));
      case IN_FLIGHT ->
          FederalCreateIdempotencyStart.immediate(
              federalIdempotencyFailure(
                  HttpStatus.CONFLICT,
                  "X-Idempotency-Key has already been used for a federal submission that is still processing. Retry with the same key and identical payload after the Retry-After interval.",
                  fileName,
                  fileSize,
                  true));
      case CAPACITY_EXCEEDED ->
          FederalCreateIdempotencyStart.immediate(
              federalIdempotencyFailure(
                  HttpStatus.SERVICE_UNAVAILABLE,
                  "Federal submission idempotency capacity is temporarily unavailable. Retry later with the same key and identical payload.",
                  fileName,
                  fileSize,
                  true));
    };
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> federalIdempotencyFailure(
      HttpStatus status, String message, String fileName, long fileSize, boolean retryable) {
    ResponseEntity.BodyBuilder response = ResponseEntity.status(status);
    if (retryable) {
      response.header(
          HttpHeaders.RETRY_AFTER, Long.toString(federalSubmissionRetryAfterSeconds));
    }
    return response.body(applicationSubmissionFailure(message, fileName, fileSize));
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> finishFederalCreateIdempotency(
      FederalSubmissionIdempotencyStore.Claim claim,
      ResponseEntity<ApplicationSubmissionImportResultDto> response) {
    federalCreateIdempotencyStore.complete(claim, response);
    return response;
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

  private ResponseEntity<ApplicationSubmissionImportResultDto>
      validateFederalMultipartFilePreflight(
          MultipartFile submissionData, String fileName, long fileSize, String missingMessage) {
    if (submissionData == null || submissionData.isEmpty() || fileSize <= 0L) {
      return ResponseEntity.badRequest()
          .body(applicationSubmissionFailure(missingMessage, fileName, fileSize));
    }
    if (fileSize > ApplicationSubmissionImportService.MAX_IMPORT_BYTES) {
      return rawFederalSubmissionTooLarge(fileName, fileSize);
    }
    return null;
  }

  private FederalMultipartPayloadInspection inspectFederalMultipartPayload(
      MultipartFile submissionData, String fileName, long fileSize) {
    MessageDigest digest;
    try {
      digest = MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("SHA-256 digest algorithm is unavailable", ex);
    }

    ByteArrayOutputStream prefix =
        new ByteArrayOutputStream(MAX_FEDERAL_XML_PREFIX_BYTES);
    byte[] buffer = new byte[8192];
    long observedBytes = 0L;
    try (InputStream inputStream = submissionData.getInputStream()) {
      int bytesRead;
      while ((bytesRead = inputStream.read(buffer)) >= 0) {
        if (bytesRead == 0) {
          continue;
        }
        observedBytes += bytesRead;
        if (observedBytes > ApplicationSubmissionImportService.MAX_IMPORT_BYTES) {
          byte[] prefixBytes = prefix.toByteArray();
          return new FederalMultipartPayloadInspection(
              null,
              federalPayloadRootType(prefixBytes),
              startsWithXml(prefixBytes),
              rawFederalSubmissionTooLarge(fileName, Math.max(fileSize, observedBytes)));
        }
        digest.update(buffer, 0, bytesRead);
        int remainingPrefixBytes = MAX_FEDERAL_XML_PREFIX_BYTES - prefix.size();
        if (remainingPrefixBytes > 0) {
          prefix.write(buffer, 0, Math.min(bytesRead, remainingPrefixBytes));
        }
      }
    } catch (IOException | RuntimeException ex) {
      LOGGER.warn(
          "event=lexis_federal_submission outcome=payload_inspection_failed failureType={}",
          exceptionType(ex));
      byte[] prefixBytes = prefix.toByteArray();
      return new FederalMultipartPayloadInspection(
          null,
          federalPayloadRootType(prefixBytes),
          startsWithXml(prefixBytes),
          ResponseEntity.badRequest()
              .body(
                  applicationSubmissionFailure(
                      "Federal submission file could not be read.", fileName, fileSize)));
    }

    if (observedBytes == 0L) {
      return new FederalMultipartPayloadInspection(
          null,
          null,
          false,
          ResponseEntity.badRequest()
              .body(
                  applicationSubmissionFailure(
                      "Choose a non-empty federal LEXIS application submission file.",
                      fileName,
                      fileSize)));
    }

    byte[] prefixBytes = prefix.toByteArray();
    return new FederalMultipartPayloadInspection(
        HexFormat.of().formatHex(digest.digest()),
        federalPayloadRootType(prefixBytes),
        startsWithXml(prefixBytes),
        null);
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> federalMultipartXmlRequired(
      String fileName, long fileSize) {
    return ResponseEntity.badRequest()
        .body(
            applicationSubmissionFailure(
                "Federal submission endpoint only accepts XML files.", fileName, fileSize));
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
    String failureText = federalSubmissionFailureText(result);
    if (failureText.contains("package ") && failureText.contains(" already exists")) {
      return HttpStatus.CONFLICT;
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
    long durationMillis =
        TimeUnit.NANOSECONDS.toMillis(Math.max(0L, System.nanoTime() - startedAtNanos));
    String message =
        "event=lexis_federal_submission operation={} outcome={} httpStatus={} "
            + "requestFingerprint={} idempotencyFingerprint={} payloadFingerprint={} "
            + "actorFingerprint={} authorizedAction={} authorityCount={} fileSize={} "
            + "scaleRows={} errorCount={} warningCount={} durationMs={}";
    Object[] arguments = {
      controlSafe(operation),
      federalLogOutcome(result.status()),
      responseHttpStatus,
      fingerprint(requestId),
      fingerprint(idempotencyKey),
      truncatedSha256(payloadSha256),
      fingerprint(entryUserId),
      controlSafe(effectiveTraceMetadata.authorizedAction()),
      effectiveTraceMetadata.grantedAuthorityCount(),
      Math.max(0L, result.fileSize()),
      Math.max(0, result.scaleRows()),
      result.errors() == null ? 0 : result.errors().size(),
      result.warnings() == null ? 0 : result.warnings().size(),
      durationMillis
    };
    if ("rejected".equalsIgnoreCase(result.status())) {
      LOGGER.warn(message, arguments);
    } else {
      LOGGER.info(message, arguments);
    }
    recordFederalSubmissionMetrics(operation, result, startedAtNanos);
  }

  private String federalLogOutcome(String status) {
    if ("accepted".equalsIgnoreCase(status)) {
      return "accepted";
    }
    if ("validated".equalsIgnoreCase(status)) {
      return "validated";
    }
    if ("rejected".equalsIgnoreCase(status)) {
      return "rejected";
    }
    return "unknown";
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
        federalGrantedAuthorityCount(authentication),
        trimToNull(sourceSystem),
        trimToNull(payloadRootType));
  }

  private int federalGrantedAuthorityCount(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return 0;
    }
    return (int)
        authentication.getAuthorities().stream()
            .filter(
                authority ->
                    authority != null
                        && authority.getAuthority() != null
                        && !authority.getAuthority().isBlank())
            .count();
  }

  private String federalSourceSystem(String sourceSystemHeader, String sourceSystemParameter) {
    return firstNonBlank(sourceSystemHeader, sourceSystemParameter);
  }

  private String federalPayloadRootType(byte[] payload) {
    return FederalPayloadRootClassifier.classify(payload);
  }

  private RawFederalSubmission readRawFederalSubmission(
      HttpServletRequest request, String originalFileName) {
    String fileName = effectiveFederalFileName(originalFileName);
    if (request == null) {
      return new RawFederalSubmission(null, null);
    }

    long declaredSize = request.getContentLengthLong();
    String contentType = request.getContentType();
    if (contentType != null
        && contentType.toLowerCase(Locale.ROOT)
            .startsWith(MediaType.APPLICATION_FORM_URLENCODED_VALUE)) {
      return new RawFederalSubmission(
          null,
          ResponseEntity.badRequest()
              .body(
                  applicationSubmissionFailure(
                      "Federal submission endpoint only accepts XML payloads.",
                      fileName,
                      Math.max(0L, declaredSize))));
    }
    if (declaredSize > ApplicationSubmissionImportService.MAX_IMPORT_BYTES) {
      return new RawFederalSubmission(null, rawFederalSubmissionTooLarge(fileName, declaredSize));
    }

    try (InputStream inputStream = request.getInputStream()) {
      byte[] data =
          inputStream.readNBytes((int) ApplicationSubmissionImportService.MAX_IMPORT_BYTES + 1);
      if (data.length > ApplicationSubmissionImportService.MAX_IMPORT_BYTES) {
        return new RawFederalSubmission(
            null, rawFederalSubmissionTooLarge(fileName, data.length));
      }
      return new RawFederalSubmission(data, null);
    } catch (IOException ex) {
      LOGGER.warn(
          "event=lexis_federal_submission outcome=payload_read_failed failureType={}",
          exceptionType(ex));
      return new RawFederalSubmission(
          null,
          ResponseEntity.badRequest()
              .body(
                  applicationSubmissionFailure(
                      "Federal submission data could not be read.",
                      fileName,
                      Math.max(0L, declaredSize))));
    }
  }

  private ResponseEntity<ApplicationSubmissionImportResultDto> rawFederalSubmissionTooLarge(
      String fileName, long fileSize) {
    return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
        .body(
            applicationSubmissionFailure(
                "The LEXIS application submission file must be 20 MiB or smaller.",
                fileName,
                fileSize));
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

  private String federalIdempotencyFingerprint(
      String payloadSha256,
      String userReference,
      String sourceSystem,
      String effectiveFileName) {
    if (trimToNull(payloadSha256) == null) {
      return null;
    }
    String semanticRequest =
        payloadSha256
            + "\u0000"
            + String.valueOf(trimToNull(userReference))
            + "\u0000"
            + String.valueOf(trimToNull(sourceSystem))
            + "\u0000"
            + String.valueOf(trimToNull(effectiveFileName));
    return sha256Hex(semanticRequest.getBytes(StandardCharsets.UTF_8));
  }

  private String resolveFileName(MultipartFile file) {
    if (file == null) {
      return null;
    }
    String originalFileName = trimToNull(file.getOriginalFilename());
    return originalFileName == null ? trimToNull(file.getName()) : originalFileName;
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

  private String trimToNull(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private record FederalSubmissionTraceMetadata(
      String authorizedAction,
      int grantedAuthorityCount,
      String sourceSystem,
      String payloadRootType) {
    private static FederalSubmissionTraceMetadata empty() {
      return new FederalSubmissionTraceMetadata(null, 0, null, null);
    }
  }

  private record FederalMultipartPayloadInspection(
      String payloadSha256,
      String payloadRootType,
      boolean xmlPayload,
      ResponseEntity<ApplicationSubmissionImportResultDto> failure) {}

  private record FederalCreateIdempotencyStart(
      FederalSubmissionIdempotencyStore.Claim claim,
      ResponseEntity<ApplicationSubmissionImportResultDto> immediateResponse,
      boolean replay) {

    private static FederalCreateIdempotencyStart bypass() {
      return new FederalCreateIdempotencyStart(null, null, false);
    }

    private static FederalCreateIdempotencyStart claimed(
        FederalSubmissionIdempotencyStore.Claim claim) {
      return new FederalCreateIdempotencyStart(claim, null, false);
    }

    private static FederalCreateIdempotencyStart immediate(
        ResponseEntity<ApplicationSubmissionImportResultDto> response) {
      return new FederalCreateIdempotencyStart(null, response, false);
    }

    private static FederalCreateIdempotencyStart replay(
        ResponseEntity<ApplicationSubmissionImportResultDto> response) {
      return new FederalCreateIdempotencyStart(null, response, true);
    }
  }

  private record RawFederalSubmission(
      byte[] data, ResponseEntity<ApplicationSubmissionImportResultDto> failure) {}
}

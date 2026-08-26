package ca.bc.gov.mof.lexis.service.upload;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionSummaryDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageValidityItem;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.SubmissionImportValidationResult;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.validation.Schema;
import javax.xml.validation.SchemaFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

@Service
public class ApplicationSubmissionImportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationSubmissionImportService.class);

  private static final String ESF_NAMESPACE = "http://www.for.gov.bc.ca/schema/esf";
  private static final String LEXIS_NAMESPACE = "http://www.for.gov.bc.ca/schema/lexis";
  private static final String SOAP_11_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
  private static final String SOAP_12_NAMESPACE = "http://www.w3.org/2003/05/soap-envelope";
  private static final String XML_SCHEMA_INSTANCE_NAMESPACE = XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI;
  private static final String EXPECTED_ESF_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd";
  private static final String EXPECTED_LEXIS_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd";
  private static final String LEGACY_LEXIS_SCHEMA_RESOURCE =
      "/schemas/nexcol/mof-lexis.xsd";
  private static final String UPLOAD_TYPE = "applicationSubmission";
  private static final String ACCEPTED = "accepted";
  private static final String REJECTED = "rejected";
  private static final String VALIDATED = "validated";
  private static final String XML_EXTENSION = ".xml";
  private static final String ZIP_EXTENSION = ".zip";
  private static final String GEOJSON_EXTENSION = ".geojson";
  private static final String JSON_EXTENSION = ".json";
  private static final String GEOJSON_FEATURE_COLLECTION = "FeatureCollection";
  private static final String GEOJSON_HARVESTED_TIMBER_ENTITY = "HARVESTEDTIMBER";
  private static final int MAX_PACKAGE_NUMBER_LENGTH = 20;
  public static final long MAX_IMPORT_BYTES = 20L * 1024L * 1024L;
  private static final int MAX_ZIP_ENTRIES = 64;
  private static final int MAX_ZIP_ENTRY_NAME_LENGTH = 255;
  private static final long MAX_ZIP_COMPRESSION_RATIO = 100L;
  private static final long DEFAULT_TERM_DAYS = 180L;
  private static final String DEFAULT_PACKAGE_STATUS = "ACT";
  private static final String DEFAULT_REPROCESSED_INDICATOR = "N";
  private static final String DEFAULT_OIC_INDICATOR = "N";
  private static final String PROVINCIAL_JURISDICTION = "P";
  private static final String FEDERAL_JURISDICTION = "F";
  private static final String APPLICATION_STATUS_ACTIVE = "A";
  private static final String APPLICATION_STATUS_APPROVED = "APP";
  private static final Set<String> LEGACY_EXEMPTION_REASON_CODES = Set.of("E", "S", "U");
  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String APPLICANT_TYPE_MINISTERIAL = "M";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String PRODUCT_TYPE_HARVESTED = "H";
  private static final String PRODUCT_TYPE_STANDING = "S";
  private static final String AGE_CLASS_OLD_GROWTH = "O";
  private static final String AGE_CLASS_SECOND_GROWTH = "S";
  private static final int MAX_USER_REFERENCE_LENGTH = 50;
  private static final String DEFAULT_IMPORT_REMARK = "Created from LEXIS application submission.";
  private static final String FEDERAL_ESF_ONLY_ERROR =
      "ESF legacy LEXIS submissions must be federal. Provincial applications must be uploaded in modern LEXIS.";
  private static final String FEDERAL_ENDPOINT_ONLY_ERROR =
      "Federal submission endpoint only accepts jurisdictionCode=F. Provincial applications must use the modern provincial upload path.";
  private static final String PROVINCIAL_ENDPOINT_ONLY_ERROR =
      "Federal applications must use the dedicated federal submission endpoint.";
  private static final OrgUnitConstraint UNRESTRICTED_ORG_UNITS =
      new OrgUnitConstraint(false, List.of());
  private static final Pattern UNTERMINATED_XML_TAG_PATTERN =
      Pattern.compile("The element type \"([^\"]+)\" must be terminated by the matching end-tag \"</([^\"]+)>\"\\.");
  private static final Pattern INCOMPLETE_XML_TAG_PATTERN =
      Pattern.compile("Element type \"([^\"]+)\" must be followed by either attribute specifications, \">\" or \"/>\"\\.");
  private static final Pattern INVALID_XML_ATTRIBUTE_CHARACTER_PATTERN =
      Pattern.compile("The value of attribute \"([^\"]+)\".* must not contain the '([^']+)' character\\.");
  private static final Schema LEGACY_LEXIS_SCHEMA = loadLegacyLexisSchema();

  private static final Map<String, Long> ORG_UNIT_BY_REGION_CODE =
      Map.ofEntries(
          Map.entry("RNI", 1833L),
          Map.entry("RSI", 1834L),
          Map.entry("RCO", 1835L),
          Map.entry("RCB", 1903L),
          Map.entry("RKB", 1904L),
          Map.entry("RNO", 1905L),
          Map.entry("ROM", 1906L),
          Map.entry("RTO", 1907L),
          Map.entry("RSK", 1908L),
          Map.entry("RSC", 1909L),
          Map.entry("RWC", 1910L));

  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  private final Clock clock;
  private final ObjectMapper objectMapper;
  private final VirusScanService virusScanService;

  @Autowired
  public ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectMapper objectMapper,
      VirusScanService virusScanService,
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider) {
    this(
        applicationDetailsServiceProvider,
        LexisBusinessTime.systemClock(),
        objectMapper,
        virusScanService,
        scheduleRepositoryProvider);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider, Clock clock) {
    this(applicationDetailsServiceProvider, clock, new ObjectMapper(), VirusScanService.NO_OP, null);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      Clock clock,
      ObjectMapper objectMapper) {
    this(applicationDetailsServiceProvider, clock, objectMapper, VirusScanService.NO_OP, null);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      Clock clock,
      ObjectMapper objectMapper,
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider) {
    this(
        applicationDetailsServiceProvider,
        clock,
        objectMapper,
        VirusScanService.NO_OP,
        scheduleRepositoryProvider);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      Clock clock,
      ObjectMapper objectMapper,
      VirusScanService virusScanService) {
    this(applicationDetailsServiceProvider, clock, objectMapper, virusScanService, null);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      Clock clock,
      ObjectMapper objectMapper,
      VirusScanService virusScanService,
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider) {
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.scheduleRepositoryProvider = scheduleRepositoryProvider;
    this.clock = clock;
    this.objectMapper = objectMapper;
    this.virusScanService = virusScanService == null ? VirusScanService.NO_OP : virusScanService;
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(MultipartFile file) {
    return validateApplicationSubmission(file, null);
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(MultipartFile file, String userReference) {
    return validateApplicationSubmission(file, userReference, null);
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(
      MultipartFile file, String userReference, String expectedForestClientNumber) {
    return validateApplicationSubmission(
        file, userReference, expectedForestClientNumber, UNRESTRICTED_ORG_UNITS);
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(
      MultipartFile file,
      String userReference,
      String expectedForestClientNumber,
      OrgUnitConstraint orgUnitConstraint) {
    return validateApplicationSubmission(
        file,
        userReference,
        false,
        FEDERAL_ESF_ONLY_ERROR,
        expectedForestClientNumber,
        orgUnitConstraint);
  }

  private ApplicationSubmissionImportResultDto validateApplicationSubmission(
      MultipartFile file, String userReference, boolean federalOnly) {
    return validateApplicationSubmission(
        file,
        userReference,
        federalOnly,
        FEDERAL_ESF_ONLY_ERROR,
        null,
        UNRESTRICTED_ORG_UNITS);
  }

  private ApplicationSubmissionImportResultDto validateApplicationSubmission(
      MultipartFile file, String userReference, boolean federalOnly, String federalOnlyError) {
    return validateApplicationSubmission(
        file, userReference, federalOnly, federalOnlyError, null, UNRESTRICTED_ORG_UNITS);
  }

  private ApplicationSubmissionImportResultDto validateApplicationSubmission(
      MultipartFile file,
      String userReference,
      boolean federalOnly,
      String federalOnlyError,
      String expectedForestClientNumber,
      OrgUnitConstraint orgUnitConstraint) {
    String fileName = resolveFileName(file);
    long fileSize = file == null ? 0L : file.getSize();
    String normalizedUserReference = normalizeUserReference(userReference);
    if (fileSize > MAX_IMPORT_BYTES) {
      return rejected(
          fileName,
          fileSize,
          List.of("The LEXIS application submission file must be 20 MiB or smaller."),
          List.of(),
          null,
          normalizedUserReference);
    }
    List<String> userReferenceErrors = validateUserReference(normalizedUserReference);
    if (!userReferenceErrors.isEmpty()) {
      return rejected(fileName, fileSize, userReferenceErrors, List.of(), null, normalizedUserReference);
    }
    Optional<ApplicationSubmissionImportResultDto> virusScanRejection =
        rejectFailedVirusScan(file, fileName, fileSize, normalizedUserReference);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection.get();
    }

    ParsedUpload parsedUpload = parseUploadedLexisSubmission(file, fileName, fileSize);
    if (parsedUpload.rejection() != null) {
      return withUserReference(parsedUpload.rejection(), normalizedUserReference);
    }

    ParsedSubmission submission = parsedUpload.submission();
    List<String> warnings = buildImportWarnings(parsedUpload.uploadedSubmission(), submission);
    ApplicationSubmissionSummaryDto submissionSummary = toSubmissionSummary(submission);
    ApplicationSubmissionImportResultDto federalOnlyRejection =
        federalOnlyRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            federalOnly,
            federalOnlyError);
    if (federalOnlyRejection != null) {
      return federalOnlyRejection;
    }
    ApplicationSubmissionImportResultDto forestClientScopeRejection =
        forestClientScopeRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            expectedForestClientNumber);
    if (forestClientScopeRejection != null) {
      return forestClientScopeRejection;
    }
    ApplicationSubmissionImportResultDto orgUnitScopeRejection =
        orgUnitScopeRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            orgUnitConstraint);
    if (orgUnitScopeRejection != null) {
      return orgUnitScopeRejection;
    }

    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      return rejected(
          fileName,
          fileSize,
          List.of("Application validation is unavailable for LEXIS application submission."),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    if (submission.packageNumber() != null) {
      ApplicationDetailsRpcService.PackageValidityItem packageValidity =
          applicationDetailsService.isPackageValid(submission.packageNumber());
      if (packageValidity == null) {
        return rejected(
            fileName,
            fileSize,
            List.of("Package validation is unavailable for LEXIS application submission."),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
      if (!packageValidity.valid()) {
        return rejected(
            fileName,
            fileSize,
            List.of(
                packageValidity.message() == null
                    ? "Package " + submission.packageNumber() + " already exists."
                    : packageValidity.message()),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
    }

    ScheduleResolution scheduleResolution = resolveExportSchedule(submission);
    if (scheduleResolution.error() != null) {
      return rejected(
          fileName,
          fileSize,
          List.of(scheduleResolution.error()),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    CreateApplicationRequest applicationRequest =
        toCreateApplicationRequest(
            submission,
            LocalDate.now(clock),
            scheduleResolution.exportScheduleId(),
            normalizedUserReference);
    CreateApplicationResult applicationValidation =
        applicationDetailsService.validateApplication(applicationRequest);
    if (!applicationValidation.valid()) {
      return rejected(
          fileName,
          fileSize,
          resultErrors(applicationValidation.errors(), applicationValidation.message()),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    SubmissionImportValidationResult importValidation =
        applicationDetailsService.validateApplicationSubmissionImport(
            applicationRequest,
            toPackageMutationRequest(submission, null, normalizedUserReference),
            toScaleMutationRequests(submission, null));
    if (importValidation != null) {
      warnings = mergeWarnings(warnings, importValidation.warnings());
      if (!importValidation.valid()) {
        return rejected(
            fileName,
            fileSize,
            resultErrors(importValidation.errors(), "The LEXIS application submission could not be validated."),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
    }

    return new ApplicationSubmissionImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        VALIDATED,
        submission.packageNumber() == null
            ? "LEXIS application submission validated without a package with "
                + submission.scaleLines().size()
                + " scale rows."
            : "LEXIS application submission validated for package "
                + submission.packageNumber()
                + " with "
                + submission.scaleLines().size()
                + " scale rows.",
        null,
        submission.packageNumber(),
        submission.scaleLines().size(),
        List.of(),
        warnings,
        normalizedUserReference,
        submissionSummary);
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(
      byte[] submissionData, String originalFileName, String userReference) {
    return validateApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName), userReference);
  }

  public ApplicationSubmissionImportResultDto validateFederalApplicationSubmission(
      byte[] submissionData, String originalFileName, String userReference) {
    return validateApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName), userReference, true);
  }

  public ApplicationSubmissionImportResultDto validateDedicatedFederalApplicationSubmission(
      byte[] submissionData, String originalFileName, String userReference) {
    return validateApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName),
        userReference,
        true,
        FEDERAL_ENDPOINT_ONLY_ERROR);
  }

  public ApplicationSubmissionImportResultDto validateFederalApplicationSubmission(
      MultipartFile file, String userReference) {
    return validateApplicationSubmission(file, userReference, true);
  }

  public ApplicationSubmissionImportResultDto validateDedicatedFederalApplicationSubmission(
      MultipartFile file, String userReference) {
    return validateApplicationSubmission(file, userReference, true, FEDERAL_ENDPOINT_ONLY_ERROR);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(MultipartFile file, String userId) {
    return importApplicationSubmission(file, userId, null);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(MultipartFile file, String userId, String userReference) {
    return importApplicationSubmission(file, userId, userReference, null);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(
      MultipartFile file,
      String userId,
      String userReference,
      String expectedForestClientNumber) {
    return importApplicationSubmission(
        file,
        userId,
        userReference,
        expectedForestClientNumber,
        UNRESTRICTED_ORG_UNITS);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(
      MultipartFile file,
      String userId,
      String userReference,
      String expectedForestClientNumber,
      OrgUnitConstraint orgUnitConstraint) {
    return importApplicationSubmission(
        file,
        userId,
        userReference,
        false,
        FEDERAL_ESF_ONLY_ERROR,
        expectedForestClientNumber,
        orgUnitConstraint);
  }

  private ApplicationSubmissionImportResultDto importApplicationSubmission(
      MultipartFile file, String userId, String userReference, boolean federalOnly) {
    return importApplicationSubmission(
        file,
        userId,
        userReference,
        federalOnly,
        FEDERAL_ESF_ONLY_ERROR,
        null,
        UNRESTRICTED_ORG_UNITS);
  }

  private ApplicationSubmissionImportResultDto importApplicationSubmission(
      MultipartFile file, String userId, String userReference, boolean federalOnly, String federalOnlyError) {
    return importApplicationSubmission(
        file,
        userId,
        userReference,
        federalOnly,
        federalOnlyError,
        null,
        UNRESTRICTED_ORG_UNITS);
  }

  private ApplicationSubmissionImportResultDto importApplicationSubmission(
      MultipartFile file,
      String userId,
      String userReference,
      boolean federalOnly,
      String federalOnlyError,
      String expectedForestClientNumber,
      OrgUnitConstraint orgUnitConstraint) {
    String fileName = resolveFileName(file);
    long fileSize = file == null ? 0L : file.getSize();
    String normalizedUserReference = normalizeUserReference(userReference);
    List<String> userReferenceErrors = validateUserReference(normalizedUserReference);
    if (!userReferenceErrors.isEmpty()) {
      return rejected(fileName, fileSize, userReferenceErrors, List.of(), null, normalizedUserReference);
    }
    Optional<ApplicationSubmissionImportResultDto> virusScanRejection =
        rejectFailedVirusScan(file, fileName, fileSize, normalizedUserReference);
    if (virusScanRejection.isPresent()) {
      return virusScanRejection.get();
    }

    ParsedUpload parsedUpload = parseUploadedLexisSubmission(file, fileName, fileSize);
    if (parsedUpload.rejection() != null) {
      return withUserReference(parsedUpload.rejection(), normalizedUserReference);
    }

    ParsedSubmission submission = parsedUpload.submission();
    List<String> warnings = buildImportWarnings(parsedUpload.uploadedSubmission(), submission);
    ApplicationSubmissionSummaryDto submissionSummary = toSubmissionSummary(submission);
    ApplicationSubmissionImportResultDto federalOnlyRejection =
        federalOnlyRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            federalOnly,
            federalOnlyError);
    if (federalOnlyRejection != null) {
      return federalOnlyRejection;
    }
    ApplicationSubmissionImportResultDto forestClientScopeRejection =
        forestClientScopeRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            expectedForestClientNumber);
    if (forestClientScopeRejection != null) {
      return forestClientScopeRejection;
    }
    ApplicationSubmissionImportResultDto orgUnitScopeRejection =
        orgUnitScopeRejection(
            fileName,
            fileSize,
            submission,
            warnings,
            submissionSummary,
            normalizedUserReference,
            orgUnitConstraint);
    if (orgUnitScopeRejection != null) {
      return orgUnitScopeRejection;
    }

    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      return rejected(
          fileName,
          fileSize,
          List.of("Application persistence is unavailable for LEXIS application submission."),
          List.of(),
          submissionSummary,
          normalizedUserReference);
    }

    if (submission.packageNumber() != null) {
      ApplicationDetailsRpcService.PackageValidityItem packageValidity =
          applicationDetailsService.isPackageValid(submission.packageNumber());
      if (packageValidity == null) {
        return rejected(
            fileName,
            fileSize,
            List.of("Package validation is unavailable for LEXIS application submission."),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
      if (!packageValidity.valid()) {
        return rejected(
            fileName,
            fileSize,
            List.of(
                packageValidity.message() == null
                    ? "Package " + submission.packageNumber() + " already exists."
                    : packageValidity.message()),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
    }

    ScheduleResolution scheduleResolution = resolveExportSchedule(submission);
    if (scheduleResolution.error() != null) {
      return rejected(
          fileName,
          fileSize,
          List.of(scheduleResolution.error()),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    LocalDate importDate = LocalDate.now(clock);
    CreateApplicationRequest createRequest =
        toCreateApplicationRequest(
            submission,
            importDate,
            scheduleResolution.exportScheduleId(),
            normalizedUserReference);
    if (federalOnly) {
      SubmissionImportValidationResult importValidation =
          applicationDetailsService.validateApplicationSubmissionImport(
              createRequest,
              toPackageMutationRequest(submission, null, normalizedUserReference),
              toScaleMutationRequests(submission, null));
      if (importValidation != null) {
        warnings = mergeWarnings(warnings, importValidation.warnings());
        if (!importValidation.valid()) {
          return rejected(
              fileName,
              fileSize,
              resultErrors(
                  importValidation.errors(),
                  "The LEXIS application submission could not be validated."),
              warnings,
              submissionSummary,
              normalizedUserReference);
        }
      }
    }
    CreateApplicationResult applicationResult =
        federalOnly
            ? applicationDetailsService.addFederalImportedApplication(createRequest, userId)
            : applicationDetailsService.addApplication(createRequest, userId);
    if (!applicationResult.valid() || applicationResult.applicationNumber() == null) {
      markRollbackOnly();
      return rejected(
          fileName,
          fileSize,
          resultErrors(applicationResult.errors(), applicationResult.message()),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    Long applicationNumber = applicationResult.applicationNumber();
    if (submission.packageNumber() != null) {
      PackagePersistenceResult packageResult =
          applicationDetailsService.addPackage(
              toPackageMutationRequest(submission, applicationNumber, normalizedUserReference),
              userId);
      if (!packageResult.valid()) {
        markRollbackOnly();
        return rejected(
            fileName,
            fileSize,
            packagePersistenceErrors(
                applicationDetailsService, submission.packageNumber(), packageResult),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
    }

    int importedScales = 0;
    for (ScaleMutationRequest scaleRequest : toScaleMutationRequests(submission, applicationNumber)) {
      ScalePersistenceResult scaleResult =
          applicationDetailsService.addScaleToPackage(scaleRequest, userId);
      if (!scaleResult.valid()) {
        markRollbackOnly();
        return rejected(
            fileName,
            fileSize,
            resultErrors(scaleResult.errors(), null),
            warnings,
            submissionSummary,
            normalizedUserReference);
      }
      importedScales++;
    }

    return new ApplicationSubmissionImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        ACCEPTED,
        submission.packageNumber() == null
            ? "LEXIS application submission created application "
                + applicationNumber
                + " without a package and "
                + importedScales
                + " scale rows."
            : "LEXIS application submission created application "
                + applicationNumber
                + " with package "
                + submission.packageNumber()
                + " and "
                + importedScales
                + " scale rows.",
        applicationNumber,
        submission.packageNumber(),
        importedScales,
        List.of(),
        warnings,
        normalizedUserReference,
        submissionSummary);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(
      byte[] submissionData, String originalFileName, String userId, String userReference) {
    return importApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName), userId, userReference);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importFederalApplicationSubmission(
      byte[] submissionData, String originalFileName, String userId, String userReference) {
    return importApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName), userId, userReference, true);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importDedicatedFederalApplicationSubmission(
      byte[] submissionData, String originalFileName, String userId, String userReference) {
    return importApplicationSubmission(
        new InMemoryMultipartFile(submissionData, originalFileName),
        userId,
        userReference,
        true,
        FEDERAL_ENDPOINT_ONLY_ERROR);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importFederalApplicationSubmission(
      MultipartFile file, String userId, String userReference) {
    return importApplicationSubmission(file, userId, userReference, true);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importDedicatedFederalApplicationSubmission(
      MultipartFile file, String userId, String userReference) {
    return importApplicationSubmission(file, userId, userReference, true, FEDERAL_ENDPOINT_ONLY_ERROR);
  }

  private ParsedUpload parseUploadedLexisSubmission(MultipartFile file, String fileName, long fileSize) {
    if (file == null || file.isEmpty()) {
      return ParsedUpload.rejected(
          rejected(
              fileName,
              fileSize,
              List.of("Choose a LEXIS application submission file."),
              List.of()));
    }

    try {
      UploadedLexisSubmission uploadedSubmission = readUploadedLexisSubmission(file);
      ParsedSubmission submission =
          uploadedSubmission.format() == UploadFormat.GEOJSON
              ? parseGeoJson(uploadedSubmission.bytes())
              : parse(uploadedSubmission.bytes());
      return ParsedUpload.valid(uploadedSubmission, submission);
    } catch (ApplicationSubmissionImportException ex) {
      return ParsedUpload.rejected(rejected(fileName, fileSize, ex.errors(), List.of()));
    } catch (Exception ex) {
      LOGGER.warn(
          "event=lexis_submission_import outcome=parse_failed failureType={}",
          exceptionType(ex));
      return ParsedUpload.rejected(
          rejected(
              fileName,
              fileSize,
              List.of("The LEXIS application submission file could not be parsed."),
              List.of()));
    }
  }

  private List<String> buildImportWarnings(
      UploadedLexisSubmission uploadedSubmission, ParsedSubmission submission) {
    List<String> warnings = new ArrayList<>(uploadedSubmission.warnings());
    if (submission.applicationStatusCode() != null) {
      if (FEDERAL_JURISDICTION.equals(submission.jurisdictionCode())) {
        warnings.add(
            "Source application status "
                + submission.applicationStatusCode()
                + " will be applied to the imported federal application.");
      } else {
        warnings.add(
            "Source application status "
                + submission.applicationStatusCode()
                + " was ignored; application submissions create new applications.");
      }
    }
    return warnings;
  }

  private UploadedLexisSubmission readUploadedLexisSubmission(MultipartFile file) throws Exception {
    String fileName = resolveFileName(file);
    String lowerFileName = fileName.toLowerCase(Locale.ROOT);
    if (lowerFileName.endsWith(ZIP_EXTENSION)) {
      return readZippedLexisSubmission(file, fileName);
    }
    try (InputStream inputStream = file.getInputStream()) {
      byte[] bytes = readBounded(inputStream);
      UploadFormat format = resolveUploadFormat(fileName, bytes);
      if (format != null) {
        return new UploadedLexisSubmission(bytes, format, List.of());
      }
    }
    throw new ApplicationSubmissionImportException(
        List.of("The LEXIS application submission file must be an XML, GeoJSON, JSON, or ZIP file."));
  }

  private UploadedLexisSubmission readZippedLexisSubmission(MultipartFile file, String fileName) throws Exception {
    if (!hasZipHeader(file)) {
      throw new ApplicationSubmissionImportException(List.of("The uploaded Zip file is corrupt, and cannot be read."));
    }

    List<String> importEntryNames = new ArrayList<>();
    List<String> unexpectedEntryNames = new ArrayList<>();
    byte[] importBytes = null;
    UploadFormat importFormat = null;

    try (ZipInputStream zipInputStream = new ZipInputStream(file.getInputStream())) {
      ZipEntry entry;
      int entryCount = 0;
      long totalExpandedBytes = 0L;
      while ((entry = zipInputStream.getNextEntry()) != null) {
        String entryName = trimToNull(entry.getName());
        entryCount++;
        if (entryCount > MAX_ZIP_ENTRIES) {
          throw new ApplicationSubmissionImportException(
              List.of("The ZIP file contains too many entries."));
        }
        validateZipEntryName(entryName);
        if (entry.isDirectory()) {
          totalExpandedBytes += drainZipEntry(zipInputStream, MAX_IMPORT_BYTES - totalExpandedBytes);
          validateZipExpandedSizeAndRatio(file, totalExpandedBytes);
          zipInputStream.closeEntry();
          continue;
        }
        if (isIgnoredZipEntry(entryName)) {
          totalExpandedBytes += drainZipEntry(zipInputStream, MAX_IMPORT_BYTES - totalExpandedBytes);
          validateZipExpandedSizeAndRatio(file, totalExpandedBytes);
          zipInputStream.closeEntry();
          continue;
        }
        byte[] entryBytes = readBounded(zipInputStream);
        totalExpandedBytes += entryBytes.length;
        validateZipExpandedSizeAndRatio(file, totalExpandedBytes);
        UploadFormat entryFormat = resolveUploadFormat(entryName, entryBytes);
        if (entryFormat == null) {
          unexpectedEntryNames.add(entryName == null ? "(unnamed file)" : entryName);
          zipInputStream.closeEntry();
          continue;
        }
        importEntryNames.add(entryName);
        if (importBytes == null) {
          importBytes = entryBytes;
          importFormat = entryFormat;
        }
        zipInputStream.closeEntry();
      }
    } catch (ZipException ex) {
      throw new ApplicationSubmissionImportException(List.of("The uploaded Zip file is corrupt, and cannot be read."));
    }

    if (!unexpectedEntryNames.isEmpty()) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file must contain only one LEXIS XML or GeoJSON application submission file."));
    }
    if (importEntryNames.isEmpty() || importBytes == null || importFormat == null) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file must contain one LEXIS XML or GeoJSON application submission file."));
    }
    if (importEntryNames.size() > 1) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file must contain exactly one LEXIS XML or GeoJSON application submission file."));
    }

    return new UploadedLexisSubmission(
        importBytes,
        importFormat,
        List.of("Loaded " + importEntryNames.get(0) + " from ZIP archive " + fileName + "."));
  }

  private UploadFormat resolveUploadFormat(String fileName, byte[] bytes) {
    UploadFormat detectedFormat = uploadFormatFromBytes(bytes);
    return detectedFormat == null ? uploadFormatFromFileName(fileName) : detectedFormat;
  }

  private UploadFormat uploadFormatFromFileName(String fileName) {
    if (fileName == null) {
      return null;
    }
    String lowerFileName = fileName.toLowerCase(Locale.ROOT);
    if (lowerFileName.endsWith(XML_EXTENSION)) {
      return UploadFormat.XML;
    }
    if (lowerFileName.endsWith(GEOJSON_EXTENSION) || lowerFileName.endsWith(JSON_EXTENSION)) {
      return UploadFormat.GEOJSON;
    }
    return null;
  }

  private UploadFormat uploadFormatFromBytes(byte[] bytes) {
    if (bytes == null) {
      return null;
    }
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
      if (value == '<') {
        return UploadFormat.XML;
      }
      if (value == '{') {
        return UploadFormat.GEOJSON;
      }
      return null;
    }
    return null;
  }

  private boolean hasZipHeader(MultipartFile file) throws Exception {
    try (InputStream inputStream = file.getInputStream()) {
      int first = inputStream.read();
      int second = inputStream.read();
      return first == 'P' && second == 'K';
    }
  }

  private boolean isIgnoredZipEntry(String entryName) {
    if (entryName == null) {
      return false;
    }
    String normalized = entryName.replace('\\', '/');
    int lastSlash = normalized.lastIndexOf('/');
    String baseName = lastSlash >= 0 ? normalized.substring(lastSlash + 1) : normalized;
    return normalized.startsWith("__MACOSX/") || ".DS_Store".equals(baseName);
  }

  private long drainZipEntry(InputStream inputStream, long remainingBytes)
      throws Exception {
    if (remainingBytes < 0) {
      throw new ApplicationSubmissionImportException(
          List.of("The expanded ZIP contents must be 20 MiB or smaller."));
    }
    byte[] buffer = new byte[8192];
    long total = 0L;
    int read;
    while ((read = inputStream.read(buffer)) >= 0) {
      total += read;
      if (total > remainingBytes) {
        throw new ApplicationSubmissionImportException(
            List.of("The expanded ZIP contents must be 20 MiB or smaller."));
      }
    }
    return total;
  }

  private void validateZipExpandedSizeAndRatio(MultipartFile file, long totalExpandedBytes)
      throws ApplicationSubmissionImportException {
    if (totalExpandedBytes > MAX_IMPORT_BYTES) {
      throw new ApplicationSubmissionImportException(
          List.of("The expanded ZIP contents must be 20 MiB or smaller."));
    }
    if (file.getSize() > 0
        && totalExpandedBytes > 1024L * 1024L
        && totalExpandedBytes > file.getSize() * MAX_ZIP_COMPRESSION_RATIO) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file compression ratio exceeds the supported limit."));
    }
  }

  private void validateZipEntryName(String entryName) throws ApplicationSubmissionImportException {
    if (entryName == null || entryName.length() > MAX_ZIP_ENTRY_NAME_LENGTH) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file contains an invalid entry name."));
    }
    String normalized = entryName.replace('\\', '/');
    if (normalized.startsWith("/")
        || normalized.equals("..")
        || normalized.startsWith("../")
        || normalized.contains("/../")) {
      throw new ApplicationSubmissionImportException(
          List.of("The ZIP file contains an unsafe entry path."));
    }
  }

  private byte[] readBounded(InputStream inputStream) throws Exception {
    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    long totalBytes = 0L;
    int bytesRead;
    while ((bytesRead = inputStream.read(buffer)) >= 0) {
      totalBytes += bytesRead;
      if (totalBytes > MAX_IMPORT_BYTES) {
        throw new ApplicationSubmissionImportException(
            List.of("The LEXIS application submission file must be 20 MiB or smaller."));
      }
      outputStream.write(buffer, 0, bytesRead);
    }
    if (totalBytes == 0L) {
      throw new ApplicationSubmissionImportException(List.of("The LEXIS application submission file is empty."));
    }
    return outputStream.toByteArray();
  }

  private ParsedSubmission parse(byte[] xmlBytes) throws Exception {
    DocumentBuilderFactory factory = secureDocumentBuilderFactory();
    Document document;
    try (InputStream inputStream = new ByteArrayInputStream(xmlBytes)) {
      var builder = factory.newDocumentBuilder();
      builder.setErrorHandler(new QuietXmlErrorHandler());
      document = builder.parse(inputStream);
    } catch (SAXParseException ex) {
      throw new ApplicationSubmissionImportException(List.of(formatXmlParseError(ex)));
    }

    return parseDocument(document);
  }

  private ParsedSubmission parseDocument(Document document) throws ApplicationSubmissionImportException {
    Element root = document.getDocumentElement();
    List<String> errors = new ArrayList<>();
    Element lexisSubmission = resolveLexisSubmissionPayload(root, errors);
    if (lexisSubmission == null) {
      throw new ApplicationSubmissionImportException(errors);
    }

    Element applicant =
        requiredChild(
            lexisSubmission,
            LEXIS_NAMESPACE,
            "applicant",
            "Applicant section is required.",
            "Applicant section must appear only once.",
            errors);
    Element applicantDetails =
        applicant == null
            ? null
            : requiredChild(
                applicant,
                LEXIS_NAMESPACE,
                "applicantDetails",
                "Applicant details are required.",
                "Applicant details must appear only once.",
                errors);
    Element applicantContact =
        applicant == null
            ? null
            : optionalChild(
                applicant,
                LEXIS_NAMESPACE,
                "applicantContact",
                "Applicant contact must appear only once.",
                errors);
    Element applicationDetail =
        requiredChild(
            lexisSubmission,
            LEXIS_NAMESPACE,
            "applicationDetail",
            "Application details are required.",
            "Application details must appear only once.",
            errors);
    Element productDetail =
        requiredChild(
            lexisSubmission,
            LEXIS_NAMESPACE,
            "productDetail",
            "Product details are required.",
            "Product details must appear only once.",
            errors);

    String jurisdictionCode = upper(text(applicationDetail, "jurisdictionCode", "Jurisdiction code", errors));
    if (FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      validateLegacyLexisSchema(lexisSubmission, errors);
    }
    FederalSubmissionMetadata federalMetadata =
        federalSubmissionMetadata(applicationDetail, jurisdictionCode, errors);
    Long federalApplicationNumber = federalMetadata.federalApplicationNumber();
    String regionCode = upper(text(applicationDetail, "bcForestRegionCode", "Forest region code", errors));
    Long orgUnitNumber = resolveOrgUnitNumber(regionCode);
    String applicationStatusCode =
        upper(text(applicationDetail, "applStatusCode", "Application status code", errors));
    String exemptionReasonCode =
        upper(text(applicationDetail, "exemptionRsnCde", "Exemption reason", errors));
    String applicantTypeCode =
        upper(text(applicationDetail, "applicantTypeCode", "Applicant type", errors));
    Boolean reAdvertisement =
        parseOptionalBoolean(
            text(applicationDetail, "re-advertisement", "Re-advertisement indicator", errors),
            "re-advertisement indicator",
            errors);
    String productTypeCode = upper(text(productDetail, "productTypeCode", "Product type", errors));
    String speciesEndUseSort =
        upper(text(productDetail, "speciesEndUseSort", "Species/end-use sort", errors));
    String productLocation = text(productDetail, "productLocation", "Product location", errors);
    String ageClass = upper(text(productDetail, "ageClass", "Age class", errors));
    ParsedProduct product =
        parseProductDetail(productDetail, productTypeCode, jurisdictionCode, errors);
    boolean federalStandingWithoutPackage =
        FEDERAL_JURISDICTION.equals(jurisdictionCode)
            && PRODUCT_TYPE_STANDING.equals(productTypeCode)
            && product.packageNumber() == null;
    Double averageLength =
        parsePackageDimension(
            text(productDetail, "avgLength", "Average length", errors),
            "average length",
            federalStandingWithoutPackage,
            errors);
    Double averageDiameter =
        parsePackageDimension(
            text(productDetail, "avgDiameter", "Average diameter", errors),
            "average diameter",
            federalStandingWithoutPackage,
            errors);
    ParsedParties parties =
        parseSubmissionParties(
            lexisSubmission,
            applicantDetails,
            applicantContact,
            applicantTypeCode,
            errors);
    validateFederalApplicant(applicant, applicantDetails, applicantContact, jurisdictionCode, errors);
    validateFederalOwner(
        lexisSubmission, jurisdictionCode, applicantTypeCode, errors);

    if (orgUnitNumber == null) {
      errors.add("Forest region code " + nullToValue(regionCode) + " is not mapped to a LEXIS region.");
    }
    if (jurisdictionCode == null) {
      errors.add("Jurisdiction code is required.");
    } else if (!PROVINCIAL_JURISDICTION.equals(jurisdictionCode)
        && !FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      errors.add("Jurisdiction code must be P or F.");
    }
    if (applicationStatusCode == null) {
      errors.add("Application status code is required.");
    } else if (FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      validateFederalApplicationStatusCode(jurisdictionCode, applicationStatusCode, errors);
    } else if (!APPLICATION_STATUS_ACTIVE.equals(applicationStatusCode)) {
      errors.add("Application status code must be A for electronic LEXIS submissions.");
    }
    if (exemptionReasonCode == null) {
      errors.add("Exemption reason is required.");
    } else if (!LEGACY_EXEMPTION_REASON_CODES.contains(exemptionReasonCode)) {
      errors.add("Exemption reason code must be E, S, or U.");
    }
    if (applicantTypeCode == null) {
      errors.add("Applicant type is required.");
    } else if (!APPLICANT_TYPE_OWNER.equals(applicantTypeCode)
        && !APPLICANT_TYPE_MINISTERIAL.equals(applicantTypeCode)
        && !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      errors.add("Applicant type code must be A, M, or O.");
    }
    if (productTypeCode == null) {
      errors.add("Product type is required.");
    } else if (!PRODUCT_TYPE_HARVESTED.equals(productTypeCode)
        && !PRODUCT_TYPE_STANDING.equals(productTypeCode)) {
      errors.add("Product type code must be H or S.");
    }
    if (productLocation == null) {
      errors.add("Product location is required.");
    }
    if (ageClass == null) {
      errors.add("Age class is required.");
    } else if (!AGE_CLASS_OLD_GROWTH.equals(ageClass) && !AGE_CLASS_SECOND_GROWTH.equals(ageClass)) {
      errors.add("Age class must be O or S.");
    }
    if (FEDERAL_JURISDICTION.equals(jurisdictionCode) && reAdvertisement == null) {
      errors.add("Re-advertisement indicator is required for federal LEXIS submissions.");
    } else if (Boolean.TRUE.equals(reAdvertisement)
        && !FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      errors.add("Re-advertisements cannot be submitted electronically through LEXIS XML upload.");
    } else if (Boolean.TRUE.equals(reAdvertisement)
        && (PRODUCT_TYPE_STANDING.equals(productTypeCode)
            || children(productDetail, "harvestedTimber").isEmpty())) {
      errors.add(
          "Federal re-advertisements require harvested timber with a summary of scale.");
    }

    ParsedSpeciesEndUseSort parsedSpeciesEndUseSort =
        parseSpeciesEndUseSort(speciesEndUseSort, errors);
    if (!errors.isEmpty()) {
      throw new ApplicationSubmissionImportException(errors);
    }

    return new ParsedSubmission(
        parties.agentClientNumber(),
        parties.agentClientLocationCode(),
        parties.agentContactName(),
        parties.ownerClientNumber(),
        parties.ownerClientLocationCode(),
        parties.ownerContactName(),
        jurisdictionCode,
        FEDERAL_JURISDICTION.equals(jurisdictionCode) ? federalApplicationNumber : null,
        orgUnitNumber,
        applicationStatusCode,
        exemptionReasonCode,
        applicantTypeCode,
        productTypeCode,
        FEDERAL_JURISDICTION.equals(jurisdictionCode)
            ? upper(product.packageNumber())
            : product.packageNumber(),
        productLocation,
        ageClass,
        averageLength,
        averageDiameter,
        product.applicationVolume(),
        product.averageLogVolume(),
        parsedSpeciesEndUseSort.endUseCode(),
        parsedSpeciesEndUseSort.speciesCodes(),
        product.scaleLines(),
        federalMetadata.biweeklyListDate());
  }

  private void validateFederalApplicationStatusCode(
      String jurisdictionCode, String applicationStatusCode, List<String> errors) {
    if (!FEDERAL_JURISDICTION.equals(jurisdictionCode) || applicationStatusCode == null) {
      return;
    }
    if (!APPLICATION_STATUS_ACTIVE.equals(applicationStatusCode)) {
      errors.add("Federal application status code must be A.");
    }
  }

  private String toFederalCreateApplicationStatusCode(String applicationStatusCode) {
    if (applicationStatusCode == null) {
      return null;
    }
    return switch (applicationStatusCode) {
      case APPLICATION_STATUS_ACTIVE -> APPLICATION_STATUS_APPROVED;
      default -> null;
    };
  }

  private void validateFederalApplicant(
      Element applicant,
      Element applicantDetails,
      Element applicantContact,
      String jurisdictionCode,
      List<String> errors) {
    if (!FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      return;
    }

    requireFederalText(applicantDetails, "eicbNumber", "applicant EICB number", errors);
    requireFederalText(applicantDetails, "name", "applicant name", errors);
    requireFederalText(applicantDetails, "address", "applicant address", errors);
    requireFederalText(applicantDetails, "city", "applicant city", errors);
    requireFederalText(applicantDetails, "provinceState", "applicant province/state", errors);
    requireFederalText(applicantDetails, "postalZipCode", "applicant postal/zip code", errors);
    requireFederalText(applicantDetails, "country", "applicant country", errors);
    requireFederalText(applicantDetails, "telephoneNumber", "applicant telephone number", errors);
    requireFederalText(applicantContact, "contactSurname", "applicant contact surname", errors);
    requireFederalText(
        applicantContact, "contactFirstname", "applicant contact first name", errors);
    requireFederalText(
        applicantContact, "contactTelephoneNumber", "applicant contact telephone number", errors);

    Boolean canadianResident =
        parseOptionalBoolean(
            text(
                applicant,
                "declarationCanadianResident",
                "Canadian resident declaration",
                errors),
            "Canadian resident declaration",
            errors);
    if (canadianResident == null) {
      errors.add("Canadian resident declaration is required for federal LEXIS submissions.");
    } else if (!canadianResident) {
      errors.add("Federal LEXIS applicants must be Canadian residents.");
    }

    Boolean submittedOffersPast90Days =
        parseOptionalBoolean(
            text(
                applicant,
                "declarationSubmittedOffersPast90Days",
                "Past 90 days offers declaration",
                errors),
            "past 90 days offers declaration",
            errors);
    if (submittedOffersPast90Days == null) {
      errors.add("Past 90 days offers declaration is required for federal LEXIS submissions.");
    } else if (submittedOffersPast90Days) {
      errors.add(
          "Federal LEXIS applicants cannot have submitted offers during the past 90 days.");
    }
  }

  private void requireFederalText(
      Element parent, String localName, String label, List<String> errors) {
    if (text(parent, localName, "Federal " + label, errors) == null) {
      errors.add("Federal " + label + " is required.");
    }
  }

  private void validateFederalOwner(
      Element lexisSubmission,
      String jurisdictionCode,
      String applicantTypeCode,
      List<String> errors) {
    if (!FEDERAL_JURISDICTION.equals(jurisdictionCode)
        || !APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      return;
    }
    Element owner = firstElement(children(lexisSubmission, "owner"));
    Element ownerDetails = firstElement(children(owner, "ownerDetails"));
    Element ownerContact = firstElement(children(owner, "ownerContact"));
    if (ownerDetails == null || ownerContact == null) {
      return;
    }

    requireFederalText(ownerDetails, "name", "owner name", errors);
    requireFederalText(ownerDetails, "address", "owner address", errors);
    requireFederalText(ownerDetails, "city", "owner city", errors);
    requireFederalText(ownerDetails, "provinceState", "owner province/state", errors);
    requireFederalText(ownerDetails, "postalZipCode", "owner postal/zip code", errors);
    requireFederalText(ownerDetails, "country", "owner country", errors);
    requireFederalText(ownerDetails, "telephoneNumber", "owner telephone number", errors);
    requireFederalText(ownerContact, "contactSurname", "owner contact surname", errors);
    requireFederalText(ownerContact, "contactFirstname", "owner contact first name", errors);
    requireFederalText(
        ownerContact, "contactTelephoneNumber", "owner contact telephone number", errors);
  }

  private Element firstElement(List<Element> elements) {
    return elements.isEmpty() ? null : elements.get(0);
  }

  private FederalSubmissionMetadata federalSubmissionMetadata(
      Element applicationDetail, String jurisdictionCode, List<String> errors) {
    if (!FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      return FederalSubmissionMetadata.empty();
    }

    Element officeUseOnly =
        requiredChild(
            applicationDetail,
            LEXIS_NAMESPACE,
            "officeUseOnly",
            "Federal office use details are required.",
            "Federal office use details must appear only once.",
            errors);
    if (officeUseOnly == null) {
      return FederalSubmissionMetadata.empty();
    }

    Long federalApplicationNumber =
        parseNonNegativeLong(
            text(
                officeUseOnly,
                "internalOfficeUseRefId",
                "Federal application number",
                errors),
            "federal application number",
            errors);
    // The legacy service required this value, then replaced it with the ESF receipt date. Modern
    // LEXIS validates it but persists the service receipt date below for equivalent behaviour.
    requiredFederalOfficeUseDate(
        officeUseOnly, "internalOfficeUseApplicationDate", "application date", errors);
    LocalDate biweeklyListDate =
        requiredFederalOfficeUseDate(
            officeUseOnly,
            "internalOfficeUseBiWeeklyListDate",
            "biweekly list date",
            errors);
    String applicantUserId =
        text(
            officeUseOnly,
            "internalOfficeUseApplicantUserid",
            "Federal office use applicant user",
            errors);
    if (applicantUserId == null) {
      errors.add("Federal office use applicant user is required.");
    }
    String language =
        upper(
            text(
                officeUseOnly,
                "internalOfficeUseLanguage",
                "Federal office use language",
                errors));
    if (language == null) {
      errors.add("Federal office use language is required.");
    } else if (!"E".equals(language) && !"F".equals(language)) {
      errors.add("Federal office use language must be E or F.");
    }

    return new FederalSubmissionMetadata(federalApplicationNumber, biweeklyListDate);
  }

  private LocalDate requiredFederalOfficeUseDate(
      Element officeUseOnly, String localName, String label, List<String> errors) {
    String value = text(officeUseOnly, localName, "Federal office use " + label, errors);
    if (value == null) {
      errors.add("Federal office use " + label + " is required.");
      return null;
    }
    LocalDate parsed = parseIsoOrLegacyDate(value);
    if (parsed == null) {
      errors.add("Federal office use " + label + " must be a valid date.");
    }
    return parsed;
  }

  private List<Element> descendants(Element root, String localName) {
    if (root == null) {
      return List.of();
    }
    List<Element> matches = new ArrayList<>();
    var nodes = root.getElementsByTagNameNS("*", localName);
    for (int index = 0; index < nodes.getLength(); index++) {
      if (nodes.item(index) instanceof Element element) {
        matches.add(element);
      }
    }
    return matches;
  }

  private ParsedSubmission parseGeoJson(byte[] geoJsonBytes) throws ApplicationSubmissionImportException {
    JsonNode root;
    try {
      root = objectMapper.readTree(geoJsonBytes);
    } catch (Exception ex) {
      throw new ApplicationSubmissionImportException(List.of("The GeoJSON file is not well-formed JSON."));
    }

    List<String> errors = new ArrayList<>();
    if (root == null || !root.isObject()) {
      errors.add("The GeoJSON file must contain a FeatureCollection object.");
      throw new ApplicationSubmissionImportException(errors);
    }
    if (!GEOJSON_FEATURE_COLLECTION.equals(jsonScalarText(root.get("type")))) {
      errors.add("The GeoJSON type must be FeatureCollection.");
    }

    JsonNode lexis = requiredJsonObject(root, "lexis", "GeoJSON lexis metadata", errors);
    JsonNode features = requiredJsonArray(root, "features", "GeoJSON features", errors);
    if (!errors.isEmpty()) {
      throw new ApplicationSubmissionImportException(errors);
    }

    try {
      Document document = newLexisDocument();
      Element lexisSubmission = document.getDocumentElement();
      appendGeoJsonSubmissionContent(document, lexisSubmission, lexis, features, errors);
      if (!errors.isEmpty()) {
        throw new ApplicationSubmissionImportException(errors);
      }
      return parseDocument(document);
    } catch (ApplicationSubmissionImportException ex) {
      throw ex;
    } catch (Exception ex) {
      LOGGER.warn(
          "event=lexis_submission_import outcome=geojson_parse_failed failureType={}",
          exceptionType(ex));
      throw new ApplicationSubmissionImportException(List.of("The GeoJSON file could not be parsed."));
    }
  }

  private Document newLexisDocument() throws Exception {
    Document document = secureDocumentBuilderFactory().newDocumentBuilder().newDocument();
    Element root = lexisElement(document, "LexisSubmission");
    root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:lexis", LEXIS_NAMESPACE);
    root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:xsi", XML_SCHEMA_INSTANCE_NAMESPACE);
    root.setAttributeNS(
        XML_SCHEMA_INSTANCE_NAMESPACE,
        "xsi:schemaLocation",
        LEXIS_NAMESPACE + " " + EXPECTED_LEXIS_SCHEMA_LOCATION);
    document.appendChild(root);
    return document;
  }

  private void appendGeoJsonSubmissionContent(
      Document document, Element lexisSubmission, JsonNode lexis, JsonNode features, List<String> errors) {
    JsonNode applicant = requiredJsonObject(lexis, "applicant", "GeoJSON lexis.applicant", errors);
    JsonNode applicationDetail =
        requiredJsonObject(lexis, "applicationDetail", "GeoJSON lexis.applicationDetail", errors);
    JsonNode productDetail =
        requiredJsonObject(lexis, "productDetail", "GeoJSON lexis.productDetail", errors);
    if (applicant == null || applicationDetail == null || productDetail == null) {
      return;
    }

    Element applicantElement = lexisElement(document, "applicant");
    lexisSubmission.appendChild(applicantElement);

    JsonNode applicantDetails =
        requiredJsonObject(applicant, "applicantDetails", "GeoJSON lexis.applicant.applicantDetails", errors);
    if (applicantDetails != null) {
      appendObjectSection(
          document,
          applicantElement,
          "applicantDetails",
          applicantDetails,
          List.of("clientNumber", "clientLocnCode", "clientLocationCode", "name"));
    }

    JsonNode applicantContact =
        optionalJsonObject(applicant, "applicantContact", "GeoJSON lexis.applicant.applicantContact", errors);
    if (applicantContact != null) {
      appendObjectSection(
          document,
          applicantElement,
          "applicantContact",
          applicantContact,
          List.of("contactSurname", "contactFirstname"));
    }

    appendObjectSection(
        document,
        lexisSubmission,
        "applicationDetail",
        applicationDetail,
        List.of(
            "jurisdictionCode",
            "federalApplicationNumber",
            "fedApplicationNumber",
            "applicationNumber",
            "bcForestRegionCode",
            "applStatusCode",
            "exemptionRsnCde",
            "applicantTypeCode"));

    Element productDetailElement =
        appendObjectSection(
            document,
            lexisSubmission,
            "productDetail",
            productDetail,
            List.of(
                "productTypeCode",
                "boomNumber",
                "speciesEndUseSort",
                "productLocation",
                "ageClass",
                "avgLength",
                "avgDiameter"));
    appendGeoJsonScaleFeatures(document, productDetailElement, features, errors);
  }

  private Element appendObjectSection(
      Document document, Element parent, String localName, JsonNode object, List<String> fieldNames) {
    Element section = lexisElement(document, localName);
    parent.appendChild(section);
    for (String fieldName : fieldNames) {
      appendJsonScalarElement(document, section, fieldName, object.get(fieldName));
    }
    return section;
  }

  private void appendGeoJsonScaleFeatures(
      Document document, Element productDetailElement, JsonNode features, List<String> errors) {
    int featureNumber = 0;
    for (JsonNode feature : features) {
      featureNumber++;
      if (!feature.isObject()) {
        errors.add("GeoJSON feature " + featureNumber + " must be an object.");
        continue;
      }
      if (!"Feature".equals(jsonScalarText(feature.get("type")))) {
        errors.add("GeoJSON feature " + featureNumber + " must use type Feature.");
        continue;
      }
      JsonNode properties =
          requiredJsonObject(
              feature,
              "properties",
              "GeoJSON feature " + featureNumber + " properties",
              errors);
      if (properties == null) {
        continue;
      }
      String entityType = jsonScalarText(properties.get("lexisEntityType"));
      if (entityType == null) {
        errors.add("GeoJSON feature " + featureNumber + " must include properties.lexisEntityType.");
        continue;
      }
      if (!GEOJSON_HARVESTED_TIMBER_ENTITY.equals(normalizeGeoJsonEntityType(entityType))) {
        errors.add("GeoJSON feature " + featureNumber + " has an unsupported properties.lexisEntityType.");
        continue;
      }

      Element harvestedTimber = lexisElement(document, "harvestedTimber");
      productDetailElement.appendChild(harvestedTimber);
      for (String fieldName : List.of("timberMark", "numberOfPieces", "species", "grade", "quantityVolume")) {
        appendJsonScalarElement(document, harvestedTimber, fieldName, properties.get(fieldName));
      }
    }
  }

  private void appendJsonScalarElement(Document document, Element parent, String localName, JsonNode value) {
    String text = jsonScalarText(value);
    if (text == null) {
      return;
    }
    Element element = lexisElement(document, localName);
    element.setTextContent(text);
    parent.appendChild(element);
  }

  private Element lexisElement(Document document, String localName) {
    return document.createElementNS(LEXIS_NAMESPACE, "lexis:" + localName);
  }

  private JsonNode requiredJsonObject(
      JsonNode parent, String fieldName, String label, List<String> errors) {
    JsonNode child = parent == null ? null : parent.get(fieldName);
    if (child == null || child.isNull()) {
      errors.add(label + " is required.");
      return null;
    }
    if (!child.isObject()) {
      errors.add(label + " must be an object.");
      return null;
    }
    return child;
  }

  private JsonNode optionalJsonObject(
      JsonNode parent, String fieldName, String label, List<String> errors) {
    JsonNode child = parent == null ? null : parent.get(fieldName);
    if (child == null || child.isNull()) {
      return null;
    }
    if (!child.isObject()) {
      errors.add(label + " must be an object.");
      return null;
    }
    return child;
  }

  private JsonNode requiredJsonArray(
      JsonNode parent, String fieldName, String label, List<String> errors) {
    JsonNode child = parent == null ? null : parent.get(fieldName);
    if (child == null || child.isNull()) {
      errors.add(label + " are required.");
      return null;
    }
    if (!child.isArray()) {
      errors.add(label + " must be an array.");
      return null;
    }
    return child;
  }

  private String jsonScalarText(JsonNode value) {
    if (value == null || value.isNull() || value.isContainerNode()) {
      return null;
    }
    return trimToNull(value.asText());
  }

  private String normalizeGeoJsonEntityType(String value) {
    String normalized = upper(value);
    return normalized == null ? null : normalized.replaceAll("[^A-Z0-9]", "");
  }

  private Element resolveLexisSubmissionPayload(Element root, List<String> errors) {
    if (root == null) {
      errors.add("The XML root must be a LEXIS submission payload, ESF submission envelope, or SOAP envelope.");
      return null;
    }
    if ("LexisSubmission".equals(root.getLocalName()) && LEXIS_NAMESPACE.equals(root.getNamespaceURI())) {
      validateSchemaLocation(root, false, errors);
      return root;
    }
    if ("ESFSubmission".equals(root.getLocalName()) && ESF_NAMESPACE.equals(root.getNamespaceURI())) {
      validateSchemaLocation(root, true, errors);
      Element submissionContent =
          requiredChild(
              root,
              ESF_NAMESPACE,
              "submissionContent",
              "The XML file must include ESF submission content.",
              "The XML file must include only one ESF submission content section.",
              errors);
      return submissionContent == null ? null : lexisPayloadFromSubmissionContent(submissionContent, errors);
    }
    if ("Envelope".equals(root.getLocalName()) && isSoapNamespace(root.getNamespaceURI())) {
      return lexisPayloadFromSoapEnvelope(root, errors);
    }
    errors.add("The XML root must be a LEXIS submission payload, ESF submission envelope, or SOAP envelope.");
    return null;
  }

  private Element lexisPayloadFromSoapEnvelope(Element envelope, List<String> errors) {
    Element body = soapBody(envelope);
    if (body == null) {
      errors.add("SOAP envelope must include a Body.");
      return null;
    }

    Element esfPayload =
        singlePayloadDescendant(
            body,
            ESF_NAMESPACE,
            "ESFSubmission",
            "SOAP envelope must include only one ESF submission envelope.",
            errors);
    if (esfPayload != null) {
      return resolveLexisSubmissionPayload(esfPayload, errors);
    }

    Element lexisPayload =
        singlePayloadDescendant(
            body,
            LEXIS_NAMESPACE,
            "LexisSubmission",
            "SOAP envelope must include only one LEXIS submission payload.",
            errors);
    if (lexisPayload != null) {
      return resolveLexisSubmissionPayload(lexisPayload, errors);
    }

    List<Element> submissionDataElements = descendants(body, "submissionData");
    if (submissionDataElements.size() > 1) {
      errors.add("SOAP envelope must include only one submissionData element.");
    }
    if (!submissionDataElements.isEmpty()) {
      int errorCount = errors.size();
      Element submissionDataPayload = lexisPayloadFromSoapCarrier(submissionDataElements.get(0), errors);
      if (submissionDataPayload != null) {
        return submissionDataPayload;
      }
      if (errors.size() == errorCount) {
        errors.add("SOAP submissionData must contain a LEXIS submission payload.");
      }
      return null;
    }

    List<String> firstCandidateErrors = new ArrayList<>();
    for (Element candidate : elementDescendants(body)) {
      List<String> candidateErrors = new ArrayList<>();
      Element payload = lexisPayloadFromSoapCarrier(candidate, candidateErrors);
      if (payload != null) {
        return payload;
      }
      if (firstCandidateErrors.isEmpty() && !candidateErrors.isEmpty()) {
        firstCandidateErrors.addAll(candidateErrors);
      }
    }

    if (firstCandidateErrors.isEmpty()) {
      errors.add("SOAP envelope must include a LEXIS submission payload.");
    } else {
      errors.addAll(firstCandidateErrors);
    }
    return null;
  }

  private Element lexisPayloadFromSoapCarrier(Element carrier, List<String> errors) {
    Element resolvedCarrier = soapReferencedElement(carrier);
    if (resolvedCarrier != null) {
      carrier = resolvedCarrier;
    }

    Element esfPayload =
        singlePayloadDescendant(
            carrier,
            ESF_NAMESPACE,
            "ESFSubmission",
            "SOAP payload carrier must include only one ESF submission envelope.",
            errors);
    if (esfPayload != null) {
      return resolveLexisSubmissionPayload(esfPayload, errors);
    }

    Element lexisPayload =
        singlePayloadDescendant(
            carrier,
            LEXIS_NAMESPACE,
            "LexisSubmission",
            "SOAP payload carrier must include only one LEXIS submission payload.",
            errors);
    if (lexisPayload != null) {
      return resolveLexisSubmissionPayload(lexisPayload, errors);
    }

    String xmlText = trimToNull(carrier.getTextContent());
    if (xmlText == null || !xmlText.startsWith("<")) {
      return null;
    }
    return lexisPayloadFromXmlText(xmlText, "SOAP payload XML text", errors);
  }

  private Element lexisPayloadFromSubmissionContent(Element submissionContent, List<String> errors) {
    List<Element> lexisSubmissions = children(submissionContent, LEXIS_NAMESPACE, "LexisSubmission");
    if (lexisSubmissions.size() > 1) {
      errors.add("The XML file must include only one LEXIS submission payload.");
    }
    if (!lexisSubmissions.isEmpty()) {
      return lexisSubmissions.get(0);
    }

    int errorCount = errors.size();
    Element escapedPayload = lexisPayloadFromEscapedSubmissionContent(submissionContent, errors);
    if (escapedPayload != null) {
      return escapedPayload;
    }

    if (errors.size() == errorCount) {
      errors.add("The XML file must include a LEXIS submission payload.");
    }
    return null;
  }

  private Element lexisPayloadFromEscapedSubmissionContent(Element submissionContent, List<String> errors) {
    String escapedXml = trimToNull(submissionContent.getTextContent());
    if (escapedXml == null || !escapedXml.startsWith("<")) {
      return null;
    }
    return lexisPayloadFromXmlText(escapedXml, "ESF submission content text", errors);
  }

  private Element lexisPayloadFromXmlText(String xmlText, String label, List<String> errors) {
    Document document;
    try (InputStream inputStream = new ByteArrayInputStream(xmlText.getBytes(StandardCharsets.UTF_8))) {
      var builder = secureDocumentBuilderFactory().newDocumentBuilder();
      builder.setErrorHandler(new QuietXmlErrorHandler());
      document = builder.parse(inputStream);
    } catch (SAXParseException ex) {
      errors.add("The " + label + " is not well-formed XML. " + formatXmlParseError(ex));
      return null;
    } catch (Exception ex) {
      LOGGER.warn(
          "event=lexis_submission_import outcome=xml_parse_failed failureType={}",
          exceptionType(ex));
      errors.add("The " + label + " could not be parsed as XML.");
      return null;
    }

    Element root = document.getDocumentElement();
    return resolveLexisSubmissionPayload(root, errors);
  }

  private Element soapBody(Element envelope) {
    for (Node child = envelope.getFirstChild(); child != null; child = child.getNextSibling()) {
      if (child instanceof Element element
          && "Body".equals(element.getLocalName())
          && isSoapNamespace(element.getNamespaceURI())) {
        return element;
      }
    }
    return null;
  }

  private boolean isSoapNamespace(String namespace) {
    return SOAP_11_NAMESPACE.equals(namespace) || SOAP_12_NAMESPACE.equals(namespace);
  }

  private Element singlePayloadDescendant(
      Element root, String namespace, String localName, String duplicateMessage, List<String> errors) {
    if (root == null) {
      return null;
    }
    var nodes = root.getElementsByTagNameNS(namespace, localName);
    if (nodes.getLength() > 1) {
      errors.add(duplicateMessage);
    }
    return nodes.getLength() == 0 || !(nodes.item(0) instanceof Element element) ? null : element;
  }

  private Element firstDescendant(Element root, String namespace, String localName) {
    if (root == null) {
      return null;
    }
    var nodes = root.getElementsByTagNameNS(namespace, localName);
    return nodes.getLength() == 0 || !(nodes.item(0) instanceof Element element) ? null : element;
  }

  private List<Element> elementDescendants(Element root) {
    if (root == null) {
      return List.of();
    }
    List<Element> elements = new ArrayList<>();
    collectElementDescendants(root, elements);
    return elements;
  }

  private void collectElementDescendants(Element root, List<Element> elements) {
    for (Node child = root.getFirstChild(); child != null; child = child.getNextSibling()) {
      if (child instanceof Element element) {
        elements.add(element);
        collectElementDescendants(element, elements);
      }
    }
  }

  private Element soapReferencedElement(Element element) {
    if (element == null || element.getOwnerDocument() == null) {
      return null;
    }
    String href = trimToNull(element.getAttribute("href"));
    if (href == null || !href.startsWith("#") || href.length() == 1) {
      return null;
    }
    String id = href.substring(1);
    for (Element candidate : elementDescendants(element.getOwnerDocument().getDocumentElement())) {
      if (id.equals(candidate.getAttribute("id")) || id.equals(candidate.getAttribute("xml:id"))) {
        return candidate;
      }
    }
    return null;
  }

  private void validateSchemaLocation(Element root, boolean requireEsfSchema, List<String> errors) {
    String schemaLocation = trimToNull(root.getAttributeNS(XML_SCHEMA_INSTANCE_NAMESPACE, "schemaLocation"));
    if (schemaLocation == null) {
      errors.add("The XML file must include an xsi:schemaLocation attribute.");
      return;
    }

    String[] tokens = schemaLocation.split("\\s+");
    if (tokens.length % 2 != 0) {
      errors.add("The XML schema location must contain namespace and schema URL pairs.");
      return;
    }

    Map<String, String> schemaLocationsByNamespace = new LinkedHashMap<>();
    for (int index = 0; index < tokens.length; index += 2) {
      if (schemaLocationsByNamespace.containsKey(tokens[index])) {
        errors.add("The XML schema location must include each schema namespace only once.");
      } else {
        schemaLocationsByNamespace.put(tokens[index], tokens[index + 1]);
      }
    }
    if (requireEsfSchema) {
      validateExpectedSchemaLocation(
          schemaLocationsByNamespace,
          ESF_NAMESPACE,
          EXPECTED_ESF_SCHEMA_LOCATION,
          "ESF",
          errors);
    }
    validateExpectedSchemaLocation(
        schemaLocationsByNamespace,
        LEXIS_NAMESPACE,
        EXPECTED_LEXIS_SCHEMA_LOCATION,
        "LEXIS",
        errors);
  }

  private void validateExpectedSchemaLocation(
      Map<String, String> schemaLocationsByNamespace,
      String namespace,
      String expectedSchemaLocation,
      String label,
      List<String> errors) {
    String actualSchemaLocation = schemaLocationsByNamespace.get(namespace);
    if (actualSchemaLocation == null) {
      errors.add("The XML schema location must include the " + label + " schema namespace.");
      return;
    }
    if (!expectedSchemaLocation.equals(actualSchemaLocation)) {
      errors.add(
          "The XML schema location must use supported "
              + label
              + " schema version "
              + expectedSchemaLocation
              + ".");
    }
  }

  private DocumentBuilderFactory secureDocumentBuilderFactory() throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    return factory;
  }

  private String formatXmlParseError(SAXParseException exception) {
    return formatXmlLocation(exception) + normalizeXmlParseMessage(exception.getMessage());
  }

  private String formatXmlLocation(SAXParseException exception) {
    if (exception.getLineNumber() > 0) {
      String column =
          exception.getColumnNumber() > 0 ? " Column: " + exception.getColumnNumber() : "";
      return "Line: " + exception.getLineNumber() + column + ": ";
    }
    return "Line UNKNOWN: ";
  }

  private String normalizeXmlParseMessage(String message) {
    String normalized = trimToNull(message);
    if (normalized == null) {
      return "The submission is not a well-formed XML document.";
    }

    Matcher unterminatedTag = UNTERMINATED_XML_TAG_PATTERN.matcher(normalized);
    if (unterminatedTag.find()) {
      return "The tag '<"
          + unterminatedTag.group(1)
          + ">' must be terminated with a matching '</"
          + unterminatedTag.group(2)
          + ">' tag.";
    }

    Matcher incompleteTag = INCOMPLETE_XML_TAG_PATTERN.matcher(normalized);
    if (incompleteTag.find()) {
      return "An XML tag named '<" + incompleteTag.group(1) + ">' is missing a closing '>' or '/>'.";
    }

    Matcher invalidAttributeCharacter = INVALID_XML_ATTRIBUTE_CHARACTER_PATTERN.matcher(normalized);
    if (invalidAttributeCharacter.find()) {
      return "An XML attribute named '"
          + invalidAttributeCharacter.group(1)
          + "' contains the prohibited character '"
          + invalidAttributeCharacter.group(2)
          + "'.";
    }

    return "The submission is not a well-formed XML document. " + normalized;
  }

  private static Schema loadLegacyLexisSchema() {
    URL schemaResource = ApplicationSubmissionImportService.class.getResource(LEGACY_LEXIS_SCHEMA_RESOURCE);
    if (schemaResource == null) {
      throw new IllegalStateException(
          "Legacy LEXIS schema resource is missing: " + LEGACY_LEXIS_SCHEMA_RESOURCE);
    }
    try {
      SchemaFactory factory = SchemaFactory.newInstance(XMLConstants.W3C_XML_SCHEMA_NS_URI);
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "file,jar");
      return factory.newSchema(schemaResource);
    } catch (SAXException ex) {
      throw new IllegalStateException("Legacy LEXIS schema could not be loaded.", ex);
    }
  }

  private void validateLegacyLexisSchema(Element lexisSubmission, List<String> errors) {
    List<String> schemaErrors = new ArrayList<>();
    try {
      var validator = LEGACY_LEXIS_SCHEMA.newValidator();
      validator.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      validator.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
      validator.setErrorHandler(
          new ErrorHandler() {
            @Override
            public void warning(SAXParseException exception) {}

            @Override
            public void error(SAXParseException exception) {
              schemaErrors.add(legacySchemaError(exception));
            }

            @Override
            public void fatalError(SAXParseException exception) throws SAXException {
              schemaErrors.add(legacySchemaError(exception));
              throw exception;
            }
          });
      validator.validate(new DOMSource(lexisSubmission));
    } catch (SAXParseException ex) {
      if (schemaErrors.isEmpty()) {
        schemaErrors.add(legacySchemaError(ex));
      }
    } catch (SAXException | IOException ex) {
      String message = trimToNull(ex.getMessage());
      schemaErrors.add(
          "Legacy LEXIS schema validation failed"
              + (message == null ? "." : ": " + message));
    }
    schemaErrors.stream().distinct().forEach(errors::add);
  }

  private String legacySchemaError(SAXParseException exception) {
    String message = trimToNull(exception.getMessage());
    return "Legacy LEXIS schema validation failed"
        + (message == null ? "." : ": " + message);
  }

  private ParsedParties parseSubmissionParties(
      Element lexisSubmission,
      Element applicantDetails,
      Element applicantContact,
      String applicantTypeCode,
      List<String> errors) {
    ParsedParty applicantParty = parseParty(applicantDetails, applicantContact, "Applicant", errors);
    Element owner =
        APPLICANT_TYPE_AGENT.equals(applicantTypeCode)
            ? requiredChild(
                lexisSubmission,
                LEXIS_NAMESPACE,
                "owner",
                "Owner section is required when applicant type is A.",
                "Owner section must appear only once.",
                errors)
            : optionalChild(
                lexisSubmission,
                LEXIS_NAMESPACE,
                "owner",
                "Owner section must appear only once.",
                errors);
    ParsedParty ownerParty = owner == null ? null : parseOwnerParty(owner, errors);
    if (APPLICANT_TYPE_AGENT.equals(applicantTypeCode)) {
      return new ParsedParties(
          applicantParty.clientNumber(),
          applicantParty.clientLocationCode(),
          applicantParty.contactName(),
          ownerParty == null ? null : ownerParty.clientNumber(),
          ownerParty == null ? null : ownerParty.clientLocationCode(),
          ownerParty == null ? null : ownerParty.contactName());
    }
    return new ParsedParties(
        null,
        null,
        null,
        applicantParty.clientNumber(),
        applicantParty.clientLocationCode(),
        applicantParty.contactName());
  }

  private ParsedParty parseOwnerParty(Element owner, List<String> errors) {
    Element ownerDetails =
        requiredChild(
            owner,
            LEXIS_NAMESPACE,
            "ownerDetails",
            "Owner details are required when owner section is present.",
            "Owner details must appear only once.",
            errors);
    Element ownerContact =
        optionalChild(
            owner,
            LEXIS_NAMESPACE,
            "ownerContact",
            "Owner contact must appear only once.",
            errors);
    return parseParty(ownerDetails, ownerContact, "Owner", errors);
  }

  private ParsedParty parseParty(
      Element partyDetails, Element partyContact, String label, List<String> errors) {
    String clientNumber =
        normalizeClientNumber(text(partyDetails, "clientNumber", label + " client number", errors));
    String clientLocationCode = clientLocationCode(partyDetails, label, errors);
    String partyName = text(partyDetails, "name", label + " name", errors);
    String contactName = contactName(partyContact, partyName, label, errors);

    if (clientNumber == null) {
      errors.add(label + " client number is required.");
    }
    if (clientLocationCode == null) {
      errors.add(label + " client location is required.");
    }
    if (contactName == null) {
      errors.add(label + " contact or name is required.");
    }
    return new ParsedParty(clientNumber, clientLocationCode, contactName);
  }

  private ParsedProduct parseProductDetail(
      Element productDetail,
      String productTypeCode,
      String jurisdictionCode,
      List<String> errors) {
    if (productDetail == null) {
      return new ParsedProduct(null, null, null, List.of());
    }

    List<Element> harvestedTimberRows = children(productDetail, "harvestedTimber");
    List<Element> harvestedWithoutSummaryRows =
        children(productDetail, "harvestedTimberWithoutSummaryOfScale");
    List<Element> standingTimberRows = children(productDetail, "standingTimber");

    boolean hasHarvestedTimber = !harvestedTimberRows.isEmpty();
    boolean hasHarvestedWithoutSummary = !harvestedWithoutSummaryRows.isEmpty();
    boolean hasStandingTimber = !standingTimberRows.isEmpty();
    int shapeCount =
        (hasHarvestedTimber ? 1 : 0)
            + (hasHarvestedWithoutSummary ? 1 : 0)
            + (hasStandingTimber ? 1 : 0);
    if (shapeCount == 0) {
      errors.add(
          "Product details must include harvestedTimber, harvestedTimberWithoutSummaryOfScale, or standingTimber rows.");
      return new ParsedProduct(null, null, null, List.of());
    }
    if (shapeCount > 1) {
      errors.add(
          "Product details must not mix harvestedTimber, harvestedTimberWithoutSummaryOfScale, and standingTimber rows.");
      return new ParsedProduct(null, null, null, List.of());
    }

    if (hasStandingTimber && !PRODUCT_TYPE_STANDING.equals(productTypeCode)) {
      errors.add("Standing timber rows require product type S.");
    }
    if ((hasHarvestedTimber || hasHarvestedWithoutSummary)
        && !PRODUCT_TYPE_HARVESTED.equals(productTypeCode)) {
      errors.add("Harvested timber rows require product type H.");
    }

    if (hasHarvestedTimber) {
      return parseHarvestedSummaryProduct(productDetail, errors);
    }
    if (hasHarvestedWithoutSummary) {
      boolean federal = FEDERAL_JURISDICTION.equals(jurisdictionCode);
      return parseDeclaredVolumeProduct(
          productDetail,
          harvestedWithoutSummaryRows,
          "Harvested timber without summary",
          !federal,
          true,
          federal
              ? "Boom/package number must not be provided for federal harvested timber without summary of scale."
              : null,
          errors);
    }
    boolean federalStanding =
        FEDERAL_JURISDICTION.equals(jurisdictionCode)
            && PRODUCT_TYPE_STANDING.equals(productTypeCode);
    return parseDeclaredVolumeProduct(
        productDetail,
        standingTimberRows,
        "Standing timber",
        !federalStanding,
        !federalStanding,
        federalStanding
            ? "Boom/package number must not be provided for federal standing timber."
            : null,
        errors);
  }

  private ParsedProduct parseHarvestedSummaryProduct(
      Element productDetail, List<String> errors) {
    String packageNumber = packageNumber(productDetail, errors);
    validatePackageNumber(packageNumber, "Boom/package number", errors);
    List<ScaleLine> scaleLines = parseScaleLines(productDetail, errors);
    if (scaleLines.isEmpty() && errors.isEmpty()) {
      errors.add("At least one harvested timber scale row is required.");
    }

    double totalVolume = roundOneDecimal(scaleLines.stream().mapToDouble(ScaleLine::volume).sum());
    long totalPieces = scaleLines.stream().mapToLong(ScaleLine::pieces).sum();
    double averageLogVolume =
        totalPieces <= 0L ? 0.0d : roundOneDecimal(totalVolume / (double) totalPieces);
    return new ParsedProduct(packageNumber, totalVolume, averageLogVolume, scaleLines);
  }

  private ParsedProduct parseDeclaredVolumeProduct(
      Element productDetail,
      List<Element> timberRows,
      String label,
      boolean derivePackageFromTimberMark,
      boolean requirePackage,
      String providedPackageError,
      List<String> errors) {
    String packageNumber = packageNumber(productDetail, errors);
    List<String> timberMarks = parseTimberMarks(timberRows, label, errors);
    if (derivePackageFromTimberMark && packageNumber == null && !timberMarks.isEmpty()) {
      packageNumber = timberMarks.get(0);
    }
    if (providedPackageError != null && packageNumber != null) {
      errors.add(providedPackageError);
    }
    if (requirePackage || packageNumber != null) {
      validatePackageNumber(packageNumber, "Boom/package number", errors);
    }
    Double applicationVolume =
        parsePositiveDouble(
            text(productDetail, "exemptApplnVol", "Exemption application volume", errors),
            "application volume",
            errors);
    Double averageLogVolume =
        parseNonNegativeDouble(
            text(productDetail, "averageLogVolume", "Average log volume", errors),
            "average log volume",
            errors);
    return new ParsedProduct(
        packageNumber,
        applicationVolume == null ? null : roundOneDecimal(applicationVolume),
        averageLogVolume == null ? null : roundOneDecimal(averageLogVolume),
        List.of());
  }

  private List<String> parseTimberMarks(
      List<Element> timberRows, String label, List<String> errors) {
    List<String> timberMarks = new ArrayList<>();
    for (Element timberRow : timberRows) {
      String timberMark = upper(text(timberRow, "timberMark", label + " timber mark", errors));
      if (timberMark == null) {
        errors.add(label + " timber mark is required.");
      } else {
        timberMarks.add(timberMark);
      }
    }
    return timberMarks;
  }

  private void validatePackageNumber(String packageNumber, String label, List<String> errors) {
    if (packageNumber == null) {
      errors.add(label + " is required.");
    } else if (packageNumber.length() > MAX_PACKAGE_NUMBER_LENGTH) {
      errors.add(label + " must be 20 characters or fewer.");
    }
  }

  private List<ScaleLine> parseScaleLines(Element productDetail, List<String> errors) {
    if (productDetail == null) {
      return List.of();
    }
    List<ScaleLine> rows = new ArrayList<>();
    for (Element harvestedTimber : children(productDetail, "harvestedTimber")) {
      String timberMark = upper(text(harvestedTimber, "timberMark", "Scale timber mark", errors));
      Long pieces =
          parseNonNegativeLong(
              text(harvestedTimber, "numberOfPieces", "Scale pieces", errors), "pieces", errors);
      String species = upper(text(harvestedTimber, "species", "Scale species", errors));
      String grade = upper(text(harvestedTimber, "grade", "Scale grade", errors));
      Double volume =
          parseNonNegativeDouble(
              text(harvestedTimber, "quantityVolume", "Scale volume", errors), "scale volume", errors);

      if (timberMark == null) {
        errors.add("Scale timber mark is required.");
      }
      if (species == null) {
        errors.add("Scale species is required.");
      }
      if (grade == null) {
        errors.add("Scale grade is required.");
      }
      if (timberMark != null && pieces != null && species != null && grade != null && volume != null) {
        rows.add(new ScaleLine(timberMark, pieces, species, grade, roundOneDecimal(volume)));
      }
    }
    rejectDuplicateScaleCombinations(rows, errors);
    return rows;
  }

  private void rejectDuplicateScaleCombinations(List<ScaleLine> rows, List<String> errors) {
    Map<String, ScaleLine> rowsByCombination = new LinkedHashMap<>();
    for (ScaleLine row : rows) {
      String combinationKey = row.timberMark() + "\u0000" + row.speciesCode() + "\u0000" + row.gradeCode();
      if (rowsByCombination.putIfAbsent(combinationKey, row) != null) {
        errors.add("A scale with the same Timber Mark/Species/Grade combination already exists.");
      }
    }
  }

  private ScheduleResolution resolveExportSchedule(ParsedSubmission submission) {
    if (!FEDERAL_JURISDICTION.equals(submission.jurisdictionCode())) {
      return ScheduleResolution.resolved(null);
    }
    if (submission.biweeklyListDate() == null) {
      return ScheduleResolution.rejected("Federal biweekly list date is required.");
    }

    LexisReportScheduleRepository scheduleRepository =
        scheduleRepositoryProvider == null ? null : scheduleRepositoryProvider.getIfAvailable();
    if (scheduleRepository == null) {
      return ScheduleResolution.rejected(
          "Export schedule lookup is unavailable for federal LEXIS submission.");
    }

    Optional<ExportScheduleRowDto> exactSchedule =
        scheduleRepository.findExportScheduleByAdvertisingDate(submission.biweeklyListDate());
    if (exactSchedule.isPresent() && exactSchedule.get().exportScheduleId() != null) {
      return ScheduleResolution.resolved(exactSchedule.get().exportScheduleId());
    }

    Optional<Long> nextScheduleId =
        Optional.ofNullable(scheduleRepository.findUpcomingExportSchedules()).orElse(List.of()).stream()
            .filter(schedule -> schedule.exportScheduleId() != null)
            .filter(schedule -> schedule.advertisingDate() != null)
            .filter(
                schedule ->
                    !schedule.advertisingDate().isBefore(submission.biweeklyListDate()))
            .sorted(
                Comparator.comparing(ExportScheduleRowDto::advertisingDate)
                    .thenComparing(ExportScheduleRowDto::exportScheduleId))
            .map(ExportScheduleRowDto::exportScheduleId)
            .findFirst();
    return nextScheduleId
        .map(ScheduleResolution::resolved)
        .orElseGet(
            () ->
                ScheduleResolution.rejected(
                    "No export schedule is available for federal LEXIS submission."));
  }

  private CreateApplicationRequest toCreateApplicationRequest(
      ParsedSubmission submission,
      LocalDate importDate,
      Long exportScheduleId,
      String userReference) {
    String applicationStatusCode =
        FEDERAL_JURISDICTION.equals(submission.jurisdictionCode())
            ? toFederalCreateApplicationStatusCode(submission.applicationStatusCode())
            : null;
    return new CreateApplicationRequest(
        submission.federalApplicationNumber(),
        importDate,
        DEFAULT_TERM_DAYS,
        importDate,
        submission.applicationVolume(),
        submission.averageLogVolume(),
        submission.productLocation(),
        exportScheduleId,
        submission.agentClientNumber(),
        submission.agentClientLocationCode(),
        submission.ownerClientNumber(),
        submission.ownerClientLocationCode(),
        null,
        submission.exemptionReasonCode(),
        applicationStatusCode,
        submission.applicantTypeCode(),
        submission.orgUnitNumber(),
        submission.productTypeCode(),
        submission.jurisdictionCode(),
        submission.ageClass(),
        submission.agentContactName(),
        submission.ownerContactName(),
        DEFAULT_OIC_INDICATOR,
        submission.endUseCode(),
        submission.speciesCodes(),
        importRemark(userReference),
        true);
  }

  private PackageMutationRequest toPackageMutationRequest(
      ParsedSubmission submission, Long applicationNumber, String userReference) {
    if (submission.packageNumber() == null) {
      return null;
    }
    return new PackageMutationRequest(
        submission.packageNumber(),
        null,
        applicationNumber,
        submission.applicationVolume(),
        submission.averageLength(),
        submission.averageDiameter(),
        DEFAULT_PACKAGE_STATUS,
        importRemark(userReference),
        null,
        null,
        DEFAULT_REPROCESSED_INDICATOR,
        submission.ageClass(),
        submission.productTypeCode(),
        submission.endUseCode(),
        submission.speciesCodes());
  }

  private List<ScaleMutationRequest> toScaleMutationRequests(
      ParsedSubmission submission, Long applicationNumber) {
    return submission.scaleLines().stream()
        .map(
            scale ->
                new ScaleMutationRequest(
                    scale.timberMark(),
                    submission.packageNumber(),
                    scale.gradeCode(),
                    scale.speciesCode(),
                    applicationNumber,
                    scale.pieces(),
                    scale.volume()))
        .toList();
  }

  private ApplicationSubmissionSummaryDto toSubmissionSummary(ParsedSubmission submission) {
    return new ApplicationSubmissionSummaryDto(
        submission.ownerClientNumber(),
        submission.ownerClientLocationCode(),
        submission.ownerContactName(),
        submission.jurisdictionCode(),
        submission.federalApplicationNumber(),
        submission.orgUnitNumber(),
        submission.applicationStatusCode(),
        submission.exemptionReasonCode(),
        submission.applicantTypeCode(),
        submission.productTypeCode(),
        submission.packageNumber(),
        submission.productLocation(),
        submission.ageClass(),
        submission.averageLength(),
        submission.averageDiameter(),
        submission.applicationVolume(),
        submission.averageLogVolume(),
        submission.endUseCode(),
        submission.speciesCodes(),
        submission.scaleLines().size());
  }

  private Element requiredChild(
      Element parent,
      String namespace,
      String localName,
      String missingMessage,
      String duplicateMessage,
      List<String> errors) {
    List<Element> matches = children(parent, namespace, localName);
    if (matches.isEmpty()) {
      errors.add(missingMessage);
      return null;
    }
    if (matches.size() > 1) {
      errors.add(duplicateMessage);
    }
    return matches.get(0);
  }

  private Element optionalChild(
      Element parent, String namespace, String localName, String duplicateMessage, List<String> errors) {
    List<Element> matches = children(parent, namespace, localName);
    if (matches.size() > 1) {
      errors.add(duplicateMessage);
    }
    return matches.isEmpty() ? null : matches.get(0);
  }

  private List<Element> children(Element parent, String localName) {
    return children(parent, LEXIS_NAMESPACE, localName);
  }

  private List<Element> children(Element parent, String namespace, String localName) {
    if (parent == null) {
      return List.of();
    }
    List<Element> elements = new ArrayList<>();
    for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
      if (child instanceof Element element
          && namespace.equals(element.getNamespaceURI())
          && localName.equals(element.getLocalName())) {
        elements.add(element);
      }
    }
    return elements;
  }

  private String text(Element parent, String localName, String label, List<String> errors) {
    List<Element> matches = children(parent, localName);
    if (matches.isEmpty()) {
      return null;
    }
    if (matches.size() > 1 && errors != null && label != null) {
      errors.add(label + " must appear only once.");
    }
    Element child = matches.get(0);
    String value = child.getTextContent();
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String packageNumber(Element productDetail, List<String> errors) {
    return text(productDetail, "boomNumber", "Boom/package number", errors);
  }

  private String clientLocationCode(Element partyDetails, String label, List<String> errors) {
    return normalizeClientLocation(
        text(partyDetails, "clientLocnCode", label + " client location", errors));
  }

  private Long resolveOrgUnitNumber(String regionCode) {
    if (regionCode == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(regionCode);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ignored) {
      return ORG_UNIT_BY_REGION_CODE.get(regionCode.toUpperCase(Locale.ROOT));
    }
  }

  private String contactName(Element contact, String fallbackName, String label, List<String> errors) {
    String firstName = text(contact, "contactFirstname", label + " contact first name", errors);
    String surname = text(contact, "contactSurname", label + " contact surname", errors);
    String fullName = join(firstName, surname);
    return fullName == null ? fallbackName : fullName;
  }

  private String join(String left, String right) {
    if (left == null) {
      return right;
    }
    if (right == null) {
      return left;
    }
    return left + " " + right;
  }

  private ParsedSpeciesEndUseSort parseSpeciesEndUseSort(
      String speciesEndUseSort, List<String> errors) {
    if (speciesEndUseSort == null) {
      errors.add("Species/end-use sort is required.");
      return new ParsedSpeciesEndUseSort(List.of(), null);
    }
    int separator = speciesEndUseSort.lastIndexOf('/');
    if (separator < 0 || separator >= speciesEndUseSort.length() - 1) {
      errors.add("Species/end-use sort must be formatted as species/end use.");
      return new ParsedSpeciesEndUseSort(List.of(), null);
    }
    List<String> speciesCodes =
        Arrays.stream(speciesEndUseSort.substring(0, separator).split("/"))
            .map(String::trim)
            .filter(value -> !value.isEmpty())
            .distinct()
            .toList();
    if (speciesCodes.isEmpty()) {
      errors.add("Species/end-use sort must include at least one species.");
    }
    String endUse = speciesEndUseSort.substring(separator + 1).trim();
    if (endUse.isEmpty()) {
      errors.add("Species/end-use sort must include an end-use code.");
      return new ParsedSpeciesEndUseSort(speciesCodes, null);
    }
    return new ParsedSpeciesEndUseSort(speciesCodes, endUse);
  }

  private Long parseNonNegativeLong(String value, String label, List<String> errors) {
    if (value == null) {
      errors.add("A valid " + label + " is required.");
      return null;
    }
    try {
      long parsed = Long.parseLong(value);
      if (parsed < 0L) {
        errors.add("The " + label + " must be greater than or equal to 0.");
        return null;
      }
      return parsed;
    } catch (NumberFormatException ex) {
      errors.add("A valid " + label + " is required.");
      return null;
    }
  }

  private Long parseOptionalPositiveLong(String value, String label, List<String> errors) {
    if (value == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(value);
      if (parsed <= 0L) {
        errors.add("A valid " + label + " is required.");
        return null;
      }
      return parsed;
    } catch (NumberFormatException ex) {
      errors.add("A valid " + label + " is required.");
      return null;
    }
  }

  private Boolean parseOptionalBoolean(String value, String label, List<String> errors) {
    String normalized = upper(value);
    if (normalized == null) {
      return null;
    }
    if ("TRUE".equals(normalized) || "1".equals(normalized)) {
      return true;
    }
    if ("FALSE".equals(normalized) || "0".equals(normalized)) {
      return false;
    }
    errors.add("A valid " + label + " is required.");
    return null;
  }

  private Double parsePositiveDouble(String value, String label, List<String> errors) {
    Double parsed = parseDouble(value, label, errors);
    if (parsed != null && parsed <= 0.0d) {
      errors.add("The " + label + " must be greater than 0.");
      return null;
    }
    return parsed;
  }

  private Double parsePackageDimension(
      String value, String label, boolean optional, List<String> errors) {
    if (!optional) {
      return parsePositiveDouble(value, label, errors);
    }
    if (value == null) {
      return null;
    }
    return parseNonNegativeDouble(value, label, errors);
  }

  private Double parseNonNegativeDouble(String value, String label, List<String> errors) {
    Double parsed = parseDouble(value, label, errors);
    if (parsed != null && parsed < 0.0d) {
      errors.add("The " + label + " must be greater than or equal to 0.");
      return null;
    }
    return parsed;
  }

  private Double parseDouble(String value, String label, List<String> errors) {
    if (value == null) {
      errors.add("A valid " + label + " is required.");
      return null;
    }
    try {
      return Double.parseDouble(value);
    } catch (NumberFormatException ex) {
      errors.add("A valid " + label + " is required.");
      return null;
    }
  }

  private double roundOneDecimal(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).doubleValue();
  }

  private String normalizeClientLocation(String value) {
    String normalized = trimToNull(value);
    if (normalized == null || normalized.length() != 1) {
      return normalized;
    }
    return "0" + normalized;
  }

  private String upper(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private String nullToValue(String value) {
    return value == null ? "(missing)" : value;
  }

  private List<String> resultErrors(List<String> errors, String fallbackMessage) {
    if (errors != null && !errors.isEmpty()) {
      return errors;
    }
    String normalizedMessage = trimToNull(fallbackMessage);
    return List.of(
        normalizedMessage == null
            ? "The LEXIS application submission could not be persisted."
            : normalizedMessage);
  }

  private List<String> mergeWarnings(List<String> left, List<String> right) {
    if (right == null || right.isEmpty()) {
      return left == null ? List.of() : left;
    }
    List<String> warnings = new ArrayList<>(left == null ? List.of() : left);
    warnings.addAll(right);
    return warnings;
  }

  private List<String> packagePersistenceErrors(
      ApplicationDetailsRpcService applicationDetailsService,
      String packageNumber,
      PackagePersistenceResult packageResult) {
    PackageValidityItem currentPackageValidity = applicationDetailsService.isPackageValid(packageNumber);
    if (currentPackageValidity != null && !currentPackageValidity.valid()) {
      return List.of(
          currentPackageValidity.message() == null
              ? "Package " + packageNumber + " already exists."
              : currentPackageValidity.message());
    }
    return resultErrors(packageResult.errors(), null);
  }

  private String normalizeUserReference(String userReference) {
    return trimToNull(userReference);
  }

  private List<String> validateUserReference(String userReference) {
    if (userReference != null && userReference.length() > MAX_USER_REFERENCE_LENGTH) {
      return List.of("User reference must be " + MAX_USER_REFERENCE_LENGTH + " characters or fewer.");
    }
    return List.of();
  }

  private String importRemark(String userReference) {
    String normalizedUserReference = normalizeUserReference(userReference);
    if (normalizedUserReference == null) {
      return DEFAULT_IMPORT_REMARK;
    }
    return DEFAULT_IMPORT_REMARK + "\nUser reference: " + normalizedUserReference;
  }

  private ApplicationSubmissionImportResultDto withUserReference(
      ApplicationSubmissionImportResultDto result, String userReference) {
    if (userReference == null || result == null) {
      return result;
    }
    return new ApplicationSubmissionImportResultDto(
        result.uploadType(),
        result.fileName(),
        result.fileSize(),
        result.status(),
        result.message(),
        result.applicationNumber(),
        result.packageNumber(),
        result.scaleRows(),
        result.errors(),
        result.warnings(),
        userReference,
        result.submissionSummary());
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit tests and non-transactional call paths can still return validation details.
    }
  }

  private ApplicationSubmissionImportResultDto rejected(
      String fileName, long fileSize, List<String> errors, List<String> warnings) {
    return rejected(fileName, fileSize, errors, warnings, null);
  }

  private ApplicationSubmissionImportResultDto rejected(
      String fileName,
      long fileSize,
      List<String> errors,
      List<String> warnings,
      ApplicationSubmissionSummaryDto submissionSummary) {
    return rejected(fileName, fileSize, errors, warnings, submissionSummary, null);
  }

  private ApplicationSubmissionImportResultDto rejected(
      String fileName,
      long fileSize,
      List<String> errors,
      List<String> warnings,
      ApplicationSubmissionSummaryDto submissionSummary,
      String userReference) {
    List<String> normalizedErrors = errors == null ? List.of() : errors;
    List<String> normalizedWarnings = warnings == null ? List.of() : warnings;
    String detail =
        normalizedErrors.isEmpty() ? "No rejection reason was returned." : normalizedErrors.get(0);
    LOGGER.warn(
        "event=lexis_submission_import outcome=rejected fileSize={} errorCount={} warningCount={}",
        Math.max(0L, fileSize),
        normalizedErrors.size(),
        normalizedWarnings.size());
    return new ApplicationSubmissionImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        REJECTED,
        "LEXIS application submission rejected: " + detail,
        null,
        null,
        0,
        normalizedErrors,
        normalizedWarnings,
        userReference,
        submissionSummary);
  }

  private Optional<ApplicationSubmissionImportResultDto> rejectFailedVirusScan(
      MultipartFile file, String fileName, long fileSize, String userReference) {
    try {
      virusScanService.assertClean(file);
      return Optional.empty();
    } catch (VirusScanException ex) {
      return Optional.of(
          rejected(fileName, fileSize, List.of(ex.userMessage()), List.of(), null, userReference));
    }
  }

  private ApplicationSubmissionImportResultDto federalOnlyRejection(
      String fileName,
      long fileSize,
      ParsedSubmission submission,
      List<String> warnings,
      ApplicationSubmissionSummaryDto submissionSummary,
      String userReference,
      boolean federalOnly,
      String federalOnlyError) {
    boolean acceptedJurisdiction =
        federalOnly
            ? FEDERAL_JURISDICTION.equals(submission.jurisdictionCode())
            : PROVINCIAL_JURISDICTION.equals(submission.jurisdictionCode());
    if (acceptedJurisdiction) {
      return null;
    }
    return rejected(
        fileName,
        fileSize,
        List.of(federalOnly ? federalOnlyError : PROVINCIAL_ENDPOINT_ONLY_ERROR),
        warnings,
        submissionSummary,
        userReference);
  }

  private ApplicationSubmissionImportResultDto forestClientScopeRejection(
      String fileName,
      long fileSize,
      ParsedSubmission submission,
      List<String> warnings,
      ApplicationSubmissionSummaryDto submissionSummary,
      String userReference,
      String expectedForestClientNumber) {
    String normalizedExpectedClient = normalizeClientNumber(expectedForestClientNumber);
    if (normalizedExpectedClient == null
        || normalizedExpectedClient.equals(normalizeClientNumber(submission.ownerClientNumber()))
        || normalizedExpectedClient.equals(normalizeClientNumber(submission.agentClientNumber()))) {
      return null;
    }
    return rejected(
        fileName,
        fileSize,
        List.of("Submission owner or agent must match the authenticated forest-client scope."),
        warnings,
        submissionSummary,
        userReference);
  }

  private ApplicationSubmissionImportResultDto orgUnitScopeRejection(
      String fileName,
      long fileSize,
      ParsedSubmission submission,
      List<String> warnings,
      ApplicationSubmissionSummaryDto submissionSummary,
      String userReference,
      OrgUnitConstraint orgUnitConstraint) {
    if (orgUnitConstraint != null && orgUnitConstraint.allows(submission.orgUnitNumber())) {
      return null;
    }
    return rejected(
        fileName,
        fileSize,
        List.of("Submission forest region is outside the authenticated organization-unit scope."),
        warnings,
        submissionSummary,
        userReference);
  }

  private String resolveFileName(MultipartFile file) {
    if (file == null || file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()) {
      return "lexis-submission.xml";
    }
    return file.getOriginalFilename().trim();
  }

  private record ParsedUpload(
      UploadedLexisSubmission uploadedSubmission,
      ParsedSubmission submission,
      ApplicationSubmissionImportResultDto rejection) {
    static ParsedUpload valid(UploadedLexisSubmission uploadedSubmission, ParsedSubmission submission) {
      return new ParsedUpload(uploadedSubmission, submission, null);
    }

    static ParsedUpload rejected(ApplicationSubmissionImportResultDto rejection) {
      return new ParsedUpload(null, null, rejection);
    }
  }

  private record ParsedSubmission(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName,
      String jurisdictionCode,
      Long federalApplicationNumber,
      Long orgUnitNumber,
      String applicationStatusCode,
      String exemptionReasonCode,
      String applicantTypeCode,
      String productTypeCode,
      String packageNumber,
      String productLocation,
      String ageClass,
      Double averageLength,
      Double averageDiameter,
      Double applicationVolume,
      Double averageLogVolume,
      String endUseCode,
      List<String> speciesCodes,
      List<ScaleLine> scaleLines,
      LocalDate biweeklyListDate) {}

  private record FederalSubmissionMetadata(
      Long federalApplicationNumber, LocalDate biweeklyListDate) {
    static FederalSubmissionMetadata empty() {
      return new FederalSubmissionMetadata(null, null);
    }
  }

  private record ScheduleResolution(Long exportScheduleId, String error) {
    static ScheduleResolution resolved(Long exportScheduleId) {
      return new ScheduleResolution(exportScheduleId, null);
    }

    static ScheduleResolution rejected(String error) {
      return new ScheduleResolution(null, error);
    }
  }

  private record ParsedParties(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName) {}

  private record ParsedParty(
      String clientNumber, String clientLocationCode, String contactName) {}

  private record ParsedProduct(
      String packageNumber,
      Double applicationVolume,
      Double averageLogVolume,
      List<ScaleLine> scaleLines) {}

  private enum UploadFormat {
    XML,
    GEOJSON
  }

  private record UploadedLexisSubmission(byte[] bytes, UploadFormat format, List<String> warnings) {}

  private record ParsedSpeciesEndUseSort(List<String> speciesCodes, String endUseCode) {}

  private record ScaleLine(
      String timberMark, Long pieces, String speciesCode, String gradeCode, Double volume) {}

  private static final class InMemoryMultipartFile implements MultipartFile {

    private static final String DEFAULT_ORIGINAL_FILE_NAME = "esf-submission.xml";

    private final byte[] bytes;
    private final String originalFileName;

    private InMemoryMultipartFile(byte[] bytes, String originalFileName) {
      this.bytes = bytes == null ? new byte[0] : bytes;
      String normalizedFileName = trimToNull(originalFileName);
      this.originalFileName =
          normalizedFileName == null ? DEFAULT_ORIGINAL_FILE_NAME : normalizedFileName;
    }

    @Override
    public String getName() {
      return "submissionData";
    }

    @Override
    public String getOriginalFilename() {
      return originalFileName;
    }

    @Override
    public String getContentType() {
      return MediaType.APPLICATION_XML_VALUE;
    }

    @Override
    public boolean isEmpty() {
      return bytes.length == 0;
    }

    @Override
    public long getSize() {
      return bytes.length;
    }

    @Override
    public byte[] getBytes() {
      return bytes.clone();
    }

    @Override
    public InputStream getInputStream() {
      return new ByteArrayInputStream(bytes);
    }

    @Override
    public void transferTo(File dest) throws IOException {
      Files.write(dest.toPath(), bytes);
    }
  }

  private static class QuietXmlErrorHandler implements ErrorHandler {

    @Override
    public void warning(SAXParseException exception) {}

    @Override
    public void error(SAXParseException exception) throws SAXException {
      throw exception;
    }

    @Override
    public void fatalError(SAXParseException exception) throws SAXException {
      throw exception;
    }
  }

  private static class ApplicationSubmissionImportException extends Exception {
    private final List<String> errors;

    ApplicationSubmissionImportException(List<String> errors) {
      this.errors = List.copyOf(errors);
    }

    List<String> errors() {
      return errors;
    }
  }
}

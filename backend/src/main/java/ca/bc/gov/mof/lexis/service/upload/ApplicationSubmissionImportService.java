package ca.bc.gov.mof.lexis.service.upload;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionSummaryDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageValidityItem;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
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
  private static final String XML_SCHEMA_INSTANCE_NAMESPACE = XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI;
  private static final String EXPECTED_ESF_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd";
  private static final String EXPECTED_LEXIS_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd";
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
  private static final long MAX_IMPORT_BYTES = 20L * 1024L * 1024L;
  private static final long DEFAULT_TERM_DAYS = 180L;
  private static final String DEFAULT_PACKAGE_STATUS = "ACT";
  private static final String DEFAULT_REPROCESSED_INDICATOR = "N";
  private static final String DEFAULT_OIC_INDICATOR = "N";
  private static final String PROVINCIAL_JURISDICTION = "P";
  private static final String FEDERAL_JURISDICTION = "F";
  private static final int MAX_USER_REFERENCE_LENGTH = 50;
  private static final String DEFAULT_IMPORT_REMARK = "Created from LEXIS application submission.";
  private static final Pattern UNTERMINATED_XML_TAG_PATTERN =
      Pattern.compile("The element type \"([^\"]+)\" must be terminated by the matching end-tag \"</([^\"]+)>\"\\.");
  private static final Pattern INCOMPLETE_XML_TAG_PATTERN =
      Pattern.compile("Element type \"([^\"]+)\" must be followed by either attribute specifications, \">\" or \"/>\"\\.");
  private static final Pattern INVALID_XML_ATTRIBUTE_CHARACTER_PATTERN =
      Pattern.compile("The value of attribute \"([^\"]+)\".* must not contain the '([^']+)' character\\.");

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
  private final Clock clock;
  private final ObjectMapper objectMapper;

  @Autowired
  public ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectMapper objectMapper) {
    this(applicationDetailsServiceProvider, Clock.systemDefaultZone(), objectMapper);
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider, Clock clock) {
    this(applicationDetailsServiceProvider, clock, new ObjectMapper());
  }

  ApplicationSubmissionImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      Clock clock,
      ObjectMapper objectMapper) {
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.clock = clock;
    this.objectMapper = objectMapper;
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(MultipartFile file) {
    return validateApplicationSubmission(file, null);
  }

  public ApplicationSubmissionImportResultDto validateApplicationSubmission(MultipartFile file, String userReference) {
    String fileName = resolveFileName(file);
    long fileSize = file == null ? 0L : file.getSize();
    String normalizedUserReference = normalizeUserReference(userReference);
    List<String> userReferenceErrors = validateUserReference(normalizedUserReference);
    if (!userReferenceErrors.isEmpty()) {
      return rejected(fileName, fileSize, userReferenceErrors, List.of(), null, normalizedUserReference);
    }

    ParsedUpload parsedUpload = parseUploadedLexisSubmission(file, fileName, fileSize);
    if (parsedUpload.rejection() != null) {
      return withUserReference(parsedUpload.rejection(), normalizedUserReference);
    }

    ParsedSubmission submission = parsedUpload.submission();
    List<String> warnings = buildImportWarnings(parsedUpload.uploadedSubmission(), submission);
    ApplicationSubmissionSummaryDto submissionSummary = toSubmissionSummary(submission);
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

    ApplicationDetailsRpcService.PackageValidityItem packageValidity =
        applicationDetailsService.isPackageValid(submission.packageNumber());
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

    CreateApplicationResult applicationValidation =
        applicationDetailsService.validateApplication(
            toCreateApplicationRequest(submission, LocalDate.now(clock), normalizedUserReference));
    if (!applicationValidation.valid()) {
      return rejected(
          fileName,
          fileSize,
          resultErrors(applicationValidation.errors(), applicationValidation.message()),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    return new ApplicationSubmissionImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        VALIDATED,
        "LEXIS application submission validated for package "
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

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(MultipartFile file, String userId) {
    return importApplicationSubmission(file, userId, null);
  }

  @Transactional
  public ApplicationSubmissionImportResultDto importApplicationSubmission(MultipartFile file, String userId, String userReference) {
    String fileName = resolveFileName(file);
    long fileSize = file == null ? 0L : file.getSize();
    String normalizedUserReference = normalizeUserReference(userReference);
    List<String> userReferenceErrors = validateUserReference(normalizedUserReference);
    if (!userReferenceErrors.isEmpty()) {
      return rejected(fileName, fileSize, userReferenceErrors, List.of(), null, normalizedUserReference);
    }

    ParsedUpload parsedUpload = parseUploadedLexisSubmission(file, fileName, fileSize);
    if (parsedUpload.rejection() != null) {
      return withUserReference(parsedUpload.rejection(), normalizedUserReference);
    }

    ParsedSubmission submission = parsedUpload.submission();
    List<String> warnings = buildImportWarnings(parsedUpload.uploadedSubmission(), submission);
    ApplicationSubmissionSummaryDto submissionSummary = toSubmissionSummary(submission);

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

    ApplicationDetailsRpcService.PackageValidityItem packageValidity =
        applicationDetailsService.isPackageValid(submission.packageNumber());
    if (packageValidity != null && !packageValidity.valid()) {
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

    LocalDate importDate = LocalDate.now(clock);

    CreateApplicationResult applicationResult =
        applicationDetailsService.addApplication(
            toCreateApplicationRequest(submission, importDate, normalizedUserReference), userId);
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
    PackagePersistenceResult packageResult =
        applicationDetailsService.addPackage(
            toPackageMutationRequest(submission, applicationNumber, normalizedUserReference), userId);
    if (!packageResult.valid()) {
      markRollbackOnly();
      return rejected(
          fileName,
          fileSize,
          packagePersistenceErrors(applicationDetailsService, submission.packageNumber(), packageResult),
          warnings,
          submissionSummary,
          normalizedUserReference);
    }

    int importedScales = 0;
    for (ScaleLine scale : submission.scaleLines()) {
      ScalePersistenceResult scaleResult =
          applicationDetailsService.addScaleToPackage(
              new ScaleMutationRequest(
                  scale.timberMark(),
                  submission.packageNumber(),
                  scale.gradeCode(),
                  scale.speciesCode(),
                  applicationNumber,
                  scale.pieces(),
                  scale.volume()),
              userId);
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
        "LEXIS application submission created application "
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
          "LEXIS application submission failed while parsing [{}]: {}", fileName, ex.getMessage());
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
      warnings.add(
          "Source application status "
              + submission.applicationStatusCode()
              + " was ignored; application submissions create new applications.");
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
      while ((entry = zipInputStream.getNextEntry()) != null) {
        String entryName = trimToNull(entry.getName());
        if (entry.isDirectory() || isIgnoredZipEntry(entryName)) {
          zipInputStream.closeEntry();
          continue;
        }
        byte[] entryBytes = readBounded(zipInputStream);
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

  private byte[] readBounded(InputStream inputStream) throws Exception {
    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    long totalBytes = 0L;
    int bytesRead;
    while ((bytesRead = inputStream.read(buffer)) >= 0) {
      totalBytes += bytesRead;
      if (totalBytes > MAX_IMPORT_BYTES) {
        throw new ApplicationSubmissionImportException(
            List.of("The LEXIS application submission file must be 20 MB or smaller."));
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

    String ownerClientNumber =
        normalizeClientNumber(text(applicantDetails, "clientNumber", "Applicant client number", errors));
    String ownerClientLocationCode =
        normalizeClientLocation(
            text(applicantDetails, "clientLocnCode", "Applicant client location", errors));
    String applicantName = text(applicantDetails, "name", "Applicant name", errors);
    String ownerContactName = contactName(applicantContact, applicantName, errors);
    String jurisdictionCode = upper(text(applicationDetail, "jurisdictionCode", "Jurisdiction code", errors));
    Long federalApplicationNumber =
        parseOptionalPositiveLong(
            federalApplicationNumber(applicationDetail), "federal application number", errors);
    String regionCode = upper(text(applicationDetail, "bcForestRegionCode", "Forest region code", errors));
    Long orgUnitNumber = resolveOrgUnitNumber(regionCode);
    String applicationStatusCode =
        upper(text(applicationDetail, "applStatusCode", "Application status code", errors));
    String exemptionReasonCode =
        upper(text(applicationDetail, "exemptionRsnCde", "Exemption reason", errors));
    String applicantTypeCode =
        upper(text(applicationDetail, "applicantTypeCode", "Applicant type", errors));
    String productTypeCode = upper(text(productDetail, "productTypeCode", "Product type", errors));
    String packageNumber = text(productDetail, "boomNumber", "Boom/package number", errors);
    String speciesEndUseSort =
        upper(text(productDetail, "speciesEndUseSort", "Species/end-use sort", errors));
    String productLocation = text(productDetail, "productLocation", "Product location", errors);
    String ageClass = upper(text(productDetail, "ageClass", "Age class", errors));
    Double averageLength =
        parsePositiveDouble(text(productDetail, "avgLength", "Average length", errors), "average length", errors);
    Double averageDiameter =
        parsePositiveDouble(
            text(productDetail, "avgDiameter", "Average diameter", errors), "average diameter", errors);

    if (ownerClientNumber == null) {
      errors.add("Applicant client number is required.");
    }
    if (ownerClientLocationCode == null) {
      errors.add("Applicant client location is required.");
    }
    if (ownerContactName == null) {
      errors.add("Applicant contact or name is required.");
    }
    if (orgUnitNumber == null) {
      errors.add("Forest region code " + nullToValue(regionCode) + " is not mapped to a LEXIS region.");
    }
    if (jurisdictionCode == null) {
      errors.add("Jurisdiction code is required.");
    } else if (!PROVINCIAL_JURISDICTION.equals(jurisdictionCode)
        && !FEDERAL_JURISDICTION.equals(jurisdictionCode)) {
      errors.add("Jurisdiction code must be P or F.");
    } else if (FEDERAL_JURISDICTION.equals(jurisdictionCode) && federalApplicationNumber == null) {
      errors.add("A federal application number is required for federal LEXIS submissions.");
    }
    if (exemptionReasonCode == null) {
      errors.add("Exemption reason is required.");
    }
    if (applicantTypeCode == null) {
      errors.add("Applicant type is required.");
    }
    if (productTypeCode == null) {
      errors.add("Product type is required.");
    }
    if (packageNumber == null) {
      errors.add("Boom/package number is required.");
    } else if (packageNumber.length() > MAX_PACKAGE_NUMBER_LENGTH) {
      errors.add("Boom/package number must be 20 characters or fewer.");
    }
    if (productLocation == null) {
      errors.add("Product location is required.");
    }
    if (ageClass == null) {
      errors.add("Age class is required.");
    }

    List<ScaleLine> scaleLines = parseScaleLines(productDetail, errors);
    if (scaleLines.isEmpty()) {
      errors.add("At least one harvested timber scale row is required.");
    }

    double totalVolume = roundOneDecimal(scaleLines.stream().mapToDouble(ScaleLine::volume).sum());
    long totalPieces = scaleLines.stream().mapToLong(ScaleLine::pieces).sum();
    double averageLogVolume =
        totalPieces <= 0L ? 0.0d : roundOneDecimal(totalVolume / (double) totalPieces);
    ParsedSpeciesEndUseSort parsedSpeciesEndUseSort =
        parseSpeciesEndUseSort(speciesEndUseSort, errors);

    if (!errors.isEmpty()) {
      throw new ApplicationSubmissionImportException(errors);
    }

    return new ParsedSubmission(
        ownerClientNumber,
        ownerClientLocationCode,
        ownerContactName,
        jurisdictionCode,
        FEDERAL_JURISDICTION.equals(jurisdictionCode) ? federalApplicationNumber : null,
        orgUnitNumber,
        applicationStatusCode,
        exemptionReasonCode,
        applicantTypeCode,
        productTypeCode,
        packageNumber,
        productLocation,
        ageClass,
        averageLength,
        averageDiameter,
        totalVolume,
        averageLogVolume,
        parsedSpeciesEndUseSort.endUseCode(),
        parsedSpeciesEndUseSort.speciesCodes(),
        scaleLines);
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
      LOGGER.warn("LEXIS GeoJSON import failed while preparing validation: {}", ex.getMessage());
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
          List.of("clientNumber", "clientLocnCode", "name"));
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
      errors.add("The XML root must be a LEXIS submission payload or ESF submission envelope.");
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
      return submissionContent == null
          ? null
          : requiredChild(
              submissionContent,
              LEXIS_NAMESPACE,
              "LexisSubmission",
              "The XML file must include a LEXIS submission payload.",
              "The XML file must include only one LEXIS submission payload.",
              errors);
    }
    errors.add("The XML root must be a LEXIS submission payload or ESF submission envelope.");
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
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
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

  private CreateApplicationRequest toCreateApplicationRequest(
      ParsedSubmission submission, LocalDate importDate, String userReference) {
    return new CreateApplicationRequest(
        submission.federalApplicationNumber(),
        importDate,
        DEFAULT_TERM_DAYS,
        importDate,
        submission.applicationVolume(),
        submission.averageLogVolume(),
        submission.productLocation(),
        null,
        null,
        null,
        submission.ownerClientNumber(),
        submission.ownerClientLocationCode(),
        null,
        submission.exemptionReasonCode(),
        submission.applicantTypeCode(),
        submission.orgUnitNumber(),
        submission.productTypeCode(),
        submission.jurisdictionCode(),
        submission.ageClass(),
        null,
        submission.ownerContactName(),
        DEFAULT_OIC_INDICATOR,
        submission.endUseCode(),
        submission.speciesCodes(),
        importRemark(userReference),
        true);
  }

  private PackageMutationRequest toPackageMutationRequest(
      ParsedSubmission submission, Long applicationNumber, String userReference) {
    return new PackageMutationRequest(
        submission.packageNumber(),
        null,
        applicationNumber,
        submission.applicationVolume(),
        submission.averageLength(),
        submission.averageDiameter(),
        DEFAULT_PACKAGE_STATUS,
        importRemark(userReference),
        DEFAULT_REPROCESSED_INDICATOR,
        submission.ageClass(),
        submission.productTypeCode(),
        submission.endUseCode(),
        submission.speciesCodes());
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

  private String federalApplicationNumber(Element applicationDetail) {
    for (String fieldName : List.of("federalApplicationNumber", "fedApplicationNumber", "applicationNumber")) {
      String value = text(applicationDetail, fieldName, null, null);
      if (value != null) {
        return value;
      }
    }
    return null;
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

  private String contactName(Element contact, String fallbackName, List<String> errors) {
    String firstName = text(contact, "contactFirstname", "Applicant contact first name", errors);
    String surname = text(contact, "contactSurname", "Applicant contact surname", errors);
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

  private Double parsePositiveDouble(String value, String label, List<String> errors) {
    Double parsed = parseDouble(value, label, errors);
    if (parsed != null && parsed <= 0.0d) {
      errors.add("The " + label + " must be greater than 0.");
      return null;
    }
    return parsed;
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

  private String normalizeClientNumber(String value) {
    String normalized = trimToNull(value);
    if (normalized == null || normalized.length() >= 8) {
      return normalized;
    }
    return "0".repeat(8 - normalized.length()) + normalized;
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
    LOGGER.warn("LEXIS application submission rejected for [{}]: {}", fileName, detail);
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
      List<ScaleLine> scaleLines) {}

  private enum UploadFormat {
    XML,
    GEOJSON
  }

  private record UploadedLexisSubmission(byte[] bytes, UploadFormat format, List<String> warnings) {}

  private record ParsedSpeciesEndUseSort(List<String> speciesCodes, String endUseCode) {}

  private record ScaleLine(
      String timberMark, Long pieces, String speciesCode, String gradeCode, Double volume) {}

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

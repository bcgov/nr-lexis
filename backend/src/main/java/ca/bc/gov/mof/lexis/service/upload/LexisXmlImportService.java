package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisXmlImportResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
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

@Service
public class LexisXmlImportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisXmlImportService.class);

  private static final String ESF_NAMESPACE = "http://www.for.gov.bc.ca/schema/esf";
  private static final String LEXIS_NAMESPACE = "http://www.for.gov.bc.ca/schema/lexis";
  private static final String XML_SCHEMA_INSTANCE_NAMESPACE = XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI;
  private static final String EXPECTED_ESF_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd";
  private static final String EXPECTED_LEXIS_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd";
  private static final String UPLOAD_TYPE = "lexisXml";
  private static final String ACCEPTED = "accepted";
  private static final String REJECTED = "rejected";
  private static final String XML_EXTENSION = ".xml";
  private static final String ZIP_EXTENSION = ".zip";
  private static final int MAX_PACKAGE_NUMBER_LENGTH = 20;
  private static final long MAX_XML_BYTES = 20L * 1024L * 1024L;
  private static final long DEFAULT_TERM_DAYS = 180L;
  private static final String DEFAULT_PACKAGE_STATUS = "ACT";
  private static final String DEFAULT_REPROCESSED_INDICATOR = "N";
  private static final String DEFAULT_OIC_INDICATOR = "N";
  private static final String PROVINCIAL_JURISDICTION = "P";

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

  @Autowired
  public LexisXmlImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider) {
    this(applicationDetailsServiceProvider, Clock.systemDefaultZone());
  }

  LexisXmlImportService(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider, Clock clock) {
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.clock = clock;
  }

  @Transactional
  public LexisXmlImportResultDto importLexisXml(MultipartFile file, String userId) {
    String fileName = resolveFileName(file);
    long fileSize = file == null ? 0L : file.getSize();
    if (file == null || file.isEmpty()) {
      return rejected(fileName, fileSize, List.of("Choose a LEXIS XML file to import."), List.of());
    }

    ParsedSubmission submission;
    UploadedLexisXml uploadedXml;
    try {
      uploadedXml = readUploadedLexisXml(file);
      submission = parse(uploadedXml.xmlBytes());
    } catch (LexisXmlImportException ex) {
      return rejected(fileName, fileSize, ex.errors(), List.of());
    } catch (Exception ex) {
      LOGGER.warn("LEXIS XML import failed while parsing [{}]: {}", fileName, ex.getMessage());
      return rejected(fileName, fileSize, List.of("The XML file could not be parsed."), List.of());
    }

    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      return rejected(
          fileName,
          fileSize,
          List.of("Application persistence is unavailable for LEXIS XML import."),
          List.of());
    }

    LocalDate importDate = LocalDate.now(clock);
    List<String> warnings = new ArrayList<>(uploadedXml.warnings());
    if (submission.applicationStatusCode() != null) {
      warnings.add(
          "Source application status "
              + submission.applicationStatusCode()
              + " was ignored; imported applications are created as new.");
    }

    CreateApplicationResult applicationResult =
        applicationDetailsService.addApplication(
            toCreateApplicationRequest(submission, importDate), userId);
    if (!applicationResult.valid() || applicationResult.applicationNumber() == null) {
      markRollbackOnly();
      return rejected(
          fileName,
          fileSize,
          resultErrors(applicationResult.errors(), applicationResult.message()),
          warnings);
    }

    Long applicationNumber = applicationResult.applicationNumber();
    PackagePersistenceResult packageResult =
        applicationDetailsService.addPackage(toPackageMutationRequest(submission, applicationNumber), userId);
    if (!packageResult.valid()) {
      markRollbackOnly();
      return rejected(fileName, fileSize, resultErrors(packageResult.errors(), null), warnings);
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
        return rejected(fileName, fileSize, resultErrors(scaleResult.errors(), null), warnings);
      }
      importedScales++;
    }

    return new LexisXmlImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        ACCEPTED,
        "LEXIS XML import created application "
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
        warnings);
  }

  private UploadedLexisXml readUploadedLexisXml(MultipartFile file) throws Exception {
    String fileName = resolveFileName(file);
    String lowerFileName = fileName.toLowerCase(Locale.ROOT);
    if (lowerFileName.endsWith(XML_EXTENSION)) {
      try (InputStream inputStream = file.getInputStream()) {
        return new UploadedLexisXml(readBounded(inputStream), List.of());
      }
    }
    if (lowerFileName.endsWith(ZIP_EXTENSION)) {
      return readZippedLexisXml(file, fileName);
    }
    throw new LexisXmlImportException(
        List.of("The LEXIS import file must be an XML file or a ZIP file containing one XML file."));
  }

  private UploadedLexisXml readZippedLexisXml(MultipartFile file, String fileName) throws Exception {
    List<String> xmlEntryNames = new ArrayList<>();
    List<String> unexpectedEntryNames = new ArrayList<>();
    byte[] xmlBytes = null;

    try (ZipInputStream zipInputStream = new ZipInputStream(file.getInputStream())) {
      ZipEntry entry;
      while ((entry = zipInputStream.getNextEntry()) != null) {
        String entryName = trim(entry.getName());
        if (entry.isDirectory() || isIgnoredZipEntry(entryName)) {
          zipInputStream.closeEntry();
          continue;
        }
        if (entryName == null || !entryName.toLowerCase(Locale.ROOT).endsWith(XML_EXTENSION)) {
          unexpectedEntryNames.add(entryName == null ? "(unnamed file)" : entryName);
          zipInputStream.closeEntry();
          continue;
        }
        xmlEntryNames.add(entryName);
        if (xmlBytes == null) {
          xmlBytes = readBounded(zipInputStream);
        }
        zipInputStream.closeEntry();
      }
    }

    if (!unexpectedEntryNames.isEmpty()) {
      throw new LexisXmlImportException(
          List.of("The ZIP file must contain only one LEXIS XML file."));
    }
    if (xmlEntryNames.isEmpty() || xmlBytes == null) {
      throw new LexisXmlImportException(
          List.of("The ZIP file must contain one LEXIS XML file."));
    }
    if (xmlEntryNames.size() > 1) {
      throw new LexisXmlImportException(
          List.of("The ZIP file must contain exactly one LEXIS XML file."));
    }

    return new UploadedLexisXml(
        xmlBytes,
        List.of("Imported " + xmlEntryNames.get(0) + " from ZIP archive " + fileName + "."));
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
      if (totalBytes > MAX_XML_BYTES) {
        throw new LexisXmlImportException(List.of("The LEXIS XML file must be 20 MB or smaller."));
      }
      outputStream.write(buffer, 0, bytesRead);
    }
    if (totalBytes == 0L) {
      throw new LexisXmlImportException(List.of("The LEXIS XML file is empty."));
    }
    return outputStream.toByteArray();
  }

  private ParsedSubmission parse(byte[] xmlBytes) throws Exception {
    DocumentBuilderFactory factory = secureDocumentBuilderFactory();
    Document document;
    try (InputStream inputStream = new ByteArrayInputStream(xmlBytes)) {
      document = factory.newDocumentBuilder().parse(inputStream);
    }
    Element root = document.getDocumentElement();
    List<String> errors = new ArrayList<>();
    if (root == null
        || !"ESFSubmission".equals(root.getLocalName())
        || !ESF_NAMESPACE.equals(root.getNamespaceURI())) {
      errors.add("The XML root must be the expected LEXIS submission envelope.");
    } else {
      validateSchemaLocation(root, errors);
    }

    Element submissionContent =
        root == null
            ? null
            : requiredChild(
                root,
                ESF_NAMESPACE,
                "submissionContent",
                "The XML file must include ESF submission content.",
                "The XML file must include only one ESF submission content section.",
                errors);
    Element lexisSubmission =
        submissionContent == null
            ? null
            : requiredChild(
                submissionContent,
                LEXIS_NAMESPACE,
                "LexisSubmission",
                "The XML file must include a LEXIS submission payload.",
                "The XML file must include only one LEXIS submission payload.",
                errors);
    if (lexisSubmission == null) {
      throw new LexisXmlImportException(errors);
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

    String ownerClientNumber = text(applicantDetails, "clientNumber", "Applicant client number", errors);
    String ownerClientLocationCode =
        normalizeClientLocation(
            text(applicantDetails, "clientLocnCode", "Applicant client location", errors));
    String applicantName = text(applicantDetails, "name", "Applicant name", errors);
    String ownerContactName = contactName(applicantContact, applicantName, errors);
    String jurisdictionCode = upper(text(applicationDetail, "jurisdictionCode", "Jurisdiction code", errors));
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
    } else if (!PROVINCIAL_JURISDICTION.equals(jurisdictionCode)) {
      errors.add("Only provincial LEXIS XML submissions are supported.");
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
    String endUseCode = parseEndUseFromSpeciesEndUseSort(speciesEndUseSort, errors);
    List<String> speciesCodes =
        scaleLines.stream()
            .map(ScaleLine::speciesCode)
            .distinct()
            .toList();

    if (!errors.isEmpty()) {
      throw new LexisXmlImportException(errors);
    }

    return new ParsedSubmission(
        ownerClientNumber,
        ownerClientLocationCode,
        ownerContactName,
        jurisdictionCode,
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
        endUseCode,
        speciesCodes,
        scaleLines);
  }

  private void validateSchemaLocation(Element root, List<String> errors) {
    String schemaLocation = trim(root.getAttributeNS(XML_SCHEMA_INSTANCE_NAMESPACE, "schemaLocation"));
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
    validateExpectedSchemaLocation(
        schemaLocationsByNamespace,
        ESF_NAMESPACE,
        EXPECTED_ESF_SCHEMA_LOCATION,
        "ESF",
        errors);
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

  private List<ScaleLine> parseScaleLines(Element productDetail, List<String> errors) {
    if (productDetail == null) {
      return List.of();
    }
    List<ScaleLine> rows = new ArrayList<>();
    for (Element harvestedTimber : children(productDetail, "harvestedTimber")) {
      String timberMark = text(harvestedTimber, "timberMark", "Scale timber mark", errors);
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
    return rows;
  }

  private CreateApplicationRequest toCreateApplicationRequest(ParsedSubmission submission, LocalDate importDate) {
    return new CreateApplicationRequest(
        null,
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
        "Imported from LEXIS XML upload.",
        true);
  }

  private PackageMutationRequest toPackageMutationRequest(
      ParsedSubmission submission, Long applicationNumber) {
    return new PackageMutationRequest(
        submission.packageNumber(),
        null,
        applicationNumber,
        submission.applicationVolume(),
        submission.averageLength(),
        submission.averageDiameter(),
        DEFAULT_PACKAGE_STATUS,
        "Imported from LEXIS XML upload.",
        DEFAULT_REPROCESSED_INDICATOR,
        submission.ageClass(),
        submission.productTypeCode(),
        submission.endUseCode(),
        submission.speciesCodes());
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

  private String parseEndUseFromSpeciesEndUseSort(String speciesEndUseSort, List<String> errors) {
    if (speciesEndUseSort == null) {
      errors.add("Species/end-use sort is required.");
      return null;
    }
    int separator = speciesEndUseSort.lastIndexOf('/');
    if (separator < 0 || separator >= speciesEndUseSort.length() - 1) {
      errors.add("Species/end-use sort must be formatted as species/end use.");
      return null;
    }
    String endUse = speciesEndUseSort.substring(separator + 1).trim();
    if (endUse.isEmpty()) {
      errors.add("Species/end-use sort must include an end-use code.");
      return null;
    }
    return endUse;
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
    String normalized = trim(value);
    if (normalized == null || normalized.length() != 1) {
      return normalized;
    }
    return "0" + normalized;
  }

  private String upper(String value) {
    String normalized = trim(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String nullToValue(String value) {
    return value == null ? "(missing)" : value;
  }

  private List<String> resultErrors(List<String> errors, String fallbackMessage) {
    if (errors != null && !errors.isEmpty()) {
      return errors;
    }
    String normalizedMessage = trim(fallbackMessage);
    return List.of(normalizedMessage == null ? "The LEXIS XML import could not be persisted." : normalizedMessage);
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit tests and non-transactional call paths can still return validation details.
    }
  }

  private LexisXmlImportResultDto rejected(
      String fileName, long fileSize, List<String> errors, List<String> warnings) {
    List<String> normalizedErrors = errors == null ? List.of() : errors;
    List<String> normalizedWarnings = warnings == null ? List.of() : warnings;
    String detail =
        normalizedErrors.isEmpty() ? "No rejection reason was returned." : normalizedErrors.get(0);
    LOGGER.warn("LEXIS XML import rejected for [{}]: {}", fileName, detail);
    return new LexisXmlImportResultDto(
        UPLOAD_TYPE,
        fileName,
        fileSize,
        REJECTED,
        "LEXIS XML import rejected: " + detail,
        null,
        null,
        0,
        normalizedErrors,
        normalizedWarnings);
  }

  private String resolveFileName(MultipartFile file) {
    if (file == null || file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()) {
      return "lexis-submission.xml";
    }
    return file.getOriginalFilename().trim();
  }

  private record ParsedSubmission(
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName,
      String jurisdictionCode,
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

  private record UploadedLexisXml(byte[] xmlBytes, List<String> warnings) {}

  private record ScaleLine(
      String timberMark, Long pieces, String speciesCode, String gradeCode, Double volume) {}

  private static class LexisXmlImportException extends Exception {
    private final List<String> errors;

    LexisXmlImportException(List<String> errors) {
      this.errors = List.copyOf(errors);
    }

    List<String> errors() {
      return errors;
    }
  }
}

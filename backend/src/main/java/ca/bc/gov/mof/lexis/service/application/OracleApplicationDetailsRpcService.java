package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadRowDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitRequestDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitResponseDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ScaleUploadInsertRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.TimberMarkRow;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

@Service
@Profile("oracle")
public class OracleApplicationDetailsRpcService implements ApplicationDetailsRpcService {

  private static final String DESCRIPTION_NOT_ON_FILE = "Not on file";
  private static final int REMARK_DISPLAY_LIMIT = 70;
  private static final Set<String> TIMBER_MARK_ALIASES =
      Set.of("timbermark", "mark", "timbermarknumber");
  private static final Set<String> SPECIES_ALIASES =
      Set.of("species", "speciescode", "exportspeciescode");
  private static final Set<String> GRADE_ALIASES = Set.of("grade", "gradecode", "exportgradecode");
  private static final Set<String> PIECES_ALIASES =
      Set.of("pieces", "piececount", "piecescount", "numberofpieces", "scalepieces");
  private static final Set<String> VOLUME_ALIASES =
      Set.of("volume", "scalevolume", "speciesgradevolume", "totalvolume");
  private static final Set<String> PACKAGE_ALIASES =
      Set.of("package", "packagenumber", "exportpackagenumber");
  private static final Set<String> APPLICATION_ALIASES =
      Set.of("application", "applicationnumber", "exportapplicationnumber");
  private static final Set<String> VALID_TIMBER_MARK_STATUSES =
      Set.of("HI", "HA", "HB", "HC", "HN", "HP", "LC", "HX", "ACT");

  private final ApplicationDetailsRpcRepository repository;
  private final LexisApplicationService applicationService;

  public OracleApplicationDetailsRpcService(
      ApplicationDetailsRpcRepository repository, LexisApplicationService applicationService) {
    this.repository = repository;
    this.applicationService = applicationService;
  }

  @Override
  public List<DocumentItem> getDocumentDetails(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    List<ApplicationDetailsRpcRepository.DocumentRow> allDocuments = new ArrayList<>();
    allDocuments.addAll(repository.findApplicationDocumentDetailsByApplicationNumber(applicationNumber));

    for (Long permitNumber : repository.findPermitNumbersByApplicationNumber(applicationNumber)) {
      allDocuments.addAll(repository.findPermitDocumentDetailsByPermitNumber(permitNumber));
    }

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    return allDocuments.stream()
        .map(
            row ->
                new DocumentItem(
                    row.id(),
                    row.fileName(),
                    normalizeDescription(row.description()),
                    resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode)))
        .toList();
  }

  @Override
  public Optional<DocumentContent> getDocument(Long fileId) {
    return repository.findFileAttachmentBytes(fileId).map(DocumentContent::new);
  }

  @Override
  public boolean removeDocument(Long documentId) {
    return repository.deleteApplicationFile(documentId);
  }

  @Override
  public Optional<String> getRemark(Long remarkId) {
    if (remarkId == null || remarkId < 1) {
      return Optional.empty();
    }
    return repository.findRemarkByNumber(remarkId).map(ApplicationDetailsRpcRepository.RemarkRow::remark);
  }

  @Override
  public Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    String normalizedRemarkId = trimToNull(remarkId);
    String normalizedUserId = trimToNull(userId);
    String remark = remarkBody == null ? "" : remarkBody;

    if (normalizedRemarkId == null || "new".equalsIgnoreCase(normalizedRemarkId)) {
      return repository
          .insertRemark(applicationNumber, remark, normalizedUserId, Instant.now())
          .map(this::toPersistedRemark);
    }

    Long parsedRemarkId = parsePositiveLong(normalizedRemarkId);
    if (parsedRemarkId == null) {
      return Optional.empty();
    }

    boolean updated =
        repository.updateRemark(parsedRemarkId, applicationNumber, remark, normalizedUserId, Instant.now());
    if (!updated) {
      return Optional.empty();
    }
    return repository.findRemarkByNumber(parsedRemarkId).map(this::toPersistedRemark);
  }

  @Override
  public ApplicationScaleUploadPreviewResponseDto previewScaleXmlUpload(
      List<MultipartFile> files, Long applicationNumber, String packageNumber) {
    List<String> errors = new ArrayList<>();
    List<MultipartFile> selectedFiles =
        files == null ? List.of() : files.stream().filter(Objects::nonNull).toList();
    if (selectedFiles.isEmpty()) {
      errors.add("Choose one or more XML files to preview.");
      return emptyScaleUploadPreview(null, errors);
    }

    ScaleUploadValidationContext context = new ScaleUploadValidationContext();
    List<ApplicationScaleUploadRowDto> rows = new ArrayList<>();
    List<String> fileNames = new ArrayList<>();
    int lineNumber = 1;

    for (MultipartFile file : selectedFiles) {
      String fileName = resolveFileName(file);
      fileNames.add(fileName);

      if (file.isEmpty()) {
        errors.add("Scale XML file " + fileName + " is empty.");
        continue;
      }

      if (!fileName.toLowerCase(Locale.ROOT).endsWith(".xml")) {
        errors.add("Scale upload file " + fileName + " must be XML.");
        continue;
      }

      Document document;
      try {
        document = parseXml(file);
      } catch (IOException | ParserConfigurationException | SAXException ex) {
        errors.add("Unable to parse XML file " + fileName + ". Confirm the file is well-formed XML.");
        continue;
      }

      List<Element> scaleElements = findScaleRowElements(document);
      if (scaleElements.isEmpty()) {
        errors.add("No scale rows were found in " + fileName + ".");
        continue;
      }

      for (Element element : scaleElements) {
        rows.add(
            toScaleUploadRow(
                element, lineNumber++, fileName, applicationNumber, packageNumber, context));
      }
    }

    if (rows.isEmpty() && errors.isEmpty()) {
      errors.add("No scale rows were found in the XML file(s).");
    }

    return scaleUploadPreview(scaleUploadFileNameSummary(fileNames), rows, errors, List.of());
  }

  @Override
  @Transactional
  public ApplicationScaleUploadSubmitResponseDto submitScaleXmlUpload(
      ApplicationScaleUploadSubmitRequestDto request, String userId) {
    String normalizedUserId = trimToNull(userId);
    Long requestApplicationNumber = request == null ? null : request.applicationNumber();
    List<String> errors = new ArrayList<>();
    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }
    if (requestApplicationNumber == null || requestApplicationNumber < 1) {
      errors.add("A valid application number is required.");
    }
    if (request == null || request.rows() == null || request.rows().isEmpty()) {
      errors.add("At least one reviewed scale row is required.");
    }
    if (!errors.isEmpty()) {
      return scaleUploadSubmitFailure(requestApplicationNumber, errors, List.of());
    }

    ScaleUploadValidationContext context = new ScaleUploadValidationContext();
    List<ApplicationScaleUploadRowDto> validatedRows = new ArrayList<>();
    for (ApplicationScaleUploadSubmitRequestDto.ScaleRow row : request.rows()) {
      validatedRows.add(toScaleUploadRow(row, requestApplicationNumber, context));
    }

    List<String> rowErrors =
        validatedRows.stream().flatMap(row -> row.errors().stream()).distinct().toList();
    if (!rowErrors.isEmpty()) {
      return scaleUploadSubmitFailure(requestApplicationNumber, rowErrors, validatedRows);
    }

    int submittedRows = 0;
    for (ApplicationScaleUploadRowDto row : validatedRows) {
      Optional<ApplicationScaleDetailRow> inserted =
          repository.insertScaleDetail(
              new ScaleUploadInsertRow(
                  row.timberMark(),
                  row.pieces(),
                  row.volume(),
                  row.packageNumber(),
                  row.speciesCode(),
                  row.gradeCode(),
                  BigDecimal.ZERO),
              normalizedUserId);
      if (inserted.isEmpty()) {
        markCurrentTransactionRollbackOnly();
        return scaleUploadSubmitFailure(
            requestApplicationNumber,
            List.of("Unable to save scale row " + row.lineNumber() + "."),
            validatedRows);
      }
      submittedRows++;
    }

    return new ApplicationScaleUploadSubmitResponseDto(
        true,
        submittedRows + " scale row(s) saved successfully.",
        submittedRows,
        requestApplicationNumber,
        List.of(),
        List.of(),
        validatedRows);
  }

  private PersistedRemark toPersistedRemark(ApplicationDetailsRpcRepository.RemarkRow row) {
    String remark = row.remark() == null ? "" : row.remark();
    return new PersistedRemark(
        row.remarkId(),
        remark,
        truncateRemarkForDisplay(remark),
        row.user(),
        row.date());
  }

  private ApplicationScaleUploadPreviewResponseDto emptyScaleUploadPreview(
      String fileName, List<String> errors) {
    return new ApplicationScaleUploadPreviewResponseDto(
        fileName,
        0,
        0,
        0L,
        BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP),
        errors,
        List.of(),
        List.of());
  }

  private ApplicationScaleUploadPreviewResponseDto scaleUploadPreview(
      String fileName,
      List<ApplicationScaleUploadRowDto> rows,
      List<String> errors,
      List<String> warnings) {
    List<ApplicationScaleUploadRowDto> validRows =
        rows.stream().filter(ApplicationScaleUploadRowDto::valid).toList();
    long totalPieces =
        validRows.stream()
            .map(ApplicationScaleUploadRowDto::pieces)
            .mapToLong(value -> value == null ? 0L : value)
            .sum();
    BigDecimal totalVolume =
        validRows.stream()
            .map(ApplicationScaleUploadRowDto::volume)
            .filter(java.util.Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .setScale(1, RoundingMode.HALF_UP);

    return new ApplicationScaleUploadPreviewResponseDto(
        fileName, rows.size(), validRows.size(), totalPieces, totalVolume, errors, warnings, rows);
  }

  private ApplicationScaleUploadSubmitResponseDto scaleUploadSubmitFailure(
      Long applicationNumber, List<String> errors, List<ApplicationScaleUploadRowDto> rows) {
    return new ApplicationScaleUploadSubmitResponseDto(
        false, "", 0, applicationNumber, errors, List.of(), rows == null ? List.of() : rows);
  }

  private Document parseXml(MultipartFile file)
      throws ParserConfigurationException, IOException, SAXException {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    try (var inputStream = file.getInputStream()) {
      Document document = factory.newDocumentBuilder().parse(inputStream);
      document.getDocumentElement().normalize();
      return document;
    }
  }

  private List<Element> findScaleRowElements(Document document) {
    if (document == null || document.getDocumentElement() == null) {
      return List.of();
    }

    List<Element> elements = new ArrayList<>();
    collectScaleRowElements(document.getDocumentElement(), elements);
    return elements;
  }

  private void collectScaleRowElements(Element element, List<Element> elements) {
    if (isScaleRowElement(element)) {
      elements.add(element);
      return;
    }

    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      Node child = children.item(i);
      if (child instanceof Element childElement) {
        collectScaleRowElements(childElement, elements);
      }
    }
  }

  private boolean isScaleRowElement(Element element) {
    int fieldCount = 0;
    if (readField(element, TIMBER_MARK_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, SPECIES_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, GRADE_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, PIECES_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, VOLUME_ALIASES) != null) {
      fieldCount++;
    }
    return fieldCount >= 3
        && (readField(element, PIECES_ALIASES) != null || readField(element, VOLUME_ALIASES) != null);
  }

  private ApplicationScaleUploadRowDto toScaleUploadRow(
      Element element,
      int lineNumber,
      String sourceFileName,
      Long defaultApplicationNumber,
      String defaultPackageNumber,
      ScaleUploadValidationContext context) {
    String timberMark = trimToNull(readField(element, TIMBER_MARK_ALIASES));
    String speciesCode = normalizeCode(readField(element, SPECIES_ALIASES));
    String gradeCode = normalizeCode(readField(element, GRADE_ALIASES));
    Long pieces = parseNonNegativeLong(readField(element, PIECES_ALIASES));
    BigDecimal volume = parseNonNegativeDecimal(readField(element, VOLUME_ALIASES));
    String rowPackageNumber = trimToNull(readField(element, PACKAGE_ALIASES));
    String selectedPackageNumber = trimToNull(defaultPackageNumber);
    String packageNumber = firstNonNull(selectedPackageNumber, rowPackageNumber);
    boolean packageMismatch =
        selectedPackageNumber != null
            && rowPackageNumber != null
            && !normalizePackageNumber(selectedPackageNumber).equals(normalizePackageNumber(rowPackageNumber));
    Long rowApplicationNumber = parsePositiveLong(readField(element, APPLICATION_ALIASES));
    Long applicationNumber = firstNonNull(defaultApplicationNumber, rowApplicationNumber);
    boolean applicationMismatch =
        defaultApplicationNumber != null
            && rowApplicationNumber != null
            && !defaultApplicationNumber.equals(rowApplicationNumber);

    return validateScaleUploadRow(
        lineNumber,
        sourceFileName,
        timberMark,
        speciesCode,
        gradeCode,
        pieces,
        volume,
        packageNumber,
        applicationNumber,
        applicationMismatch,
        packageMismatch,
        context);
  }

  private ApplicationScaleUploadRowDto toScaleUploadRow(
      ApplicationScaleUploadSubmitRequestDto.ScaleRow row,
      Long defaultApplicationNumber,
      ScaleUploadValidationContext context) {
    Long rowApplicationNumber = row.applicationNumber();
    Long applicationNumber = firstNonNull(defaultApplicationNumber, rowApplicationNumber);
    boolean applicationMismatch =
        defaultApplicationNumber != null
            && rowApplicationNumber != null
            && !defaultApplicationNumber.equals(rowApplicationNumber);
    return validateScaleUploadRow(
        row.lineNumber(),
        trimToNull(row.sourceFileName()),
        trimToNull(row.timberMark()),
        normalizeCode(row.speciesCode()),
        normalizeCode(row.gradeCode()),
        row.pieces(),
        row.volume(),
        trimToNull(row.packageNumber()),
        applicationNumber,
        applicationMismatch,
        false,
        context);
  }

  private ApplicationScaleUploadRowDto validateScaleUploadRow(
      int lineNumber,
      String sourceFileName,
      String timberMark,
      String speciesCode,
      String gradeCode,
      Long pieces,
      BigDecimal volume,
      String packageNumber,
      Long applicationNumber,
      boolean applicationMismatch,
      boolean packageMismatch,
      ScaleUploadValidationContext context) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    boolean packageFound = false;
    LexisPackageLookupDto packageInfo = null;

    if (applicationMismatch) {
      errors.add("Row " + lineNumber + " application number does not match the selected application.");
    }
    if (packageMismatch) {
      errors.add("Row " + lineNumber + " package number does not match the selected package.");
    }
    if (packageNumber == null) {
      errors.add("Row " + lineNumber + " requires a package number.");
    } else {
      String normalizedPackageNumber = normalizePackageNumber(packageNumber);
      if (context.uploadPackageNumber == null) {
        context.uploadPackageNumber = normalizedPackageNumber;
      } else if (!context.uploadPackageNumber.equals(normalizedPackageNumber)) {
        errors.add("Row " + lineNumber + " must use the same package as the other uploaded rows.");
      }
      Optional<LexisPackageLookupDto> packageLookup =
          context.packageInfoByNumber.computeIfAbsent(
              packageNumber, applicationService::findPackageByPackageNumber);
      if (packageLookup.isEmpty()) {
        errors.add("Package " + packageNumber + " was not found.");
      } else {
        packageFound = true;
        packageInfo = packageLookup.get();
        if (applicationNumber == null) {
          applicationNumber = packageInfo.applicationNumber();
        } else if (packageInfo.applicationNumber() != null
            && !packageInfo.applicationNumber().equals(applicationNumber)) {
          errors.add(
              "Row "
                  + lineNumber
                  + " application number does not match package "
                  + packageNumber
                  + ".");
        }
      }
    }
    if (applicationNumber == null || applicationNumber < 1) {
      errors.add("Row " + lineNumber + " requires a valid application number.");
    } else {
      boolean applicationExists =
          context.applicationByNumber
              .computeIfAbsent(applicationNumber, applicationService::findByApplicationNumber)
              .isPresent();
      if (!applicationExists) {
        errors.add("Application " + applicationNumber + " was not found.");
      }
    }
    if (timberMark == null) {
      errors.add("Row " + lineNumber + " requires a timber mark.");
    } else {
      Optional<TimberMarkRow> timberMarkRow =
          context.timberMarkByMark.computeIfAbsent(timberMark, repository::findTimberMark);
      if (timberMarkRow.isEmpty()) {
        errors.add("Timber mark " + timberMark + " was not found.");
      } else if (!VALID_TIMBER_MARK_STATUSES.contains(
          normalizeCode(timberMarkRow.get().markStatus()))) {
        errors.add(
            "Timber mark "
                + timberMark
                + " is not valid for scale due to status "
                + timberMarkRow.get().markStatus()
                + ".");
      }
    }
    if (speciesCode == null) {
      errors.add("Row " + lineNumber + " requires a species code.");
    }
    if (gradeCode == null) {
      errors.add("Row " + lineNumber + " requires a grade code.");
    }
    if (pieces == null) {
      errors.add("Row " + lineNumber + " requires a numeric pieces value.");
    } else if (pieces < 0 || pieces > 999_999_999L) {
      errors.add("Row " + lineNumber + " pieces must be between 0 and 999999999.");
    }
    if (volume == null) {
      errors.add("Row " + lineNumber + " requires a numeric volume value.");
    } else if (volume.compareTo(BigDecimal.ZERO) < 0
        || volume.compareTo(BigDecimal.valueOf(99_999.9d)) > 0) {
      errors.add("Row " + lineNumber + " volume must be between 0 and 99999.9.");
    } else {
      volume = volume.setScale(1, RoundingMode.HALF_UP);
    }

    String speciesDescription = "";
    if (speciesCode != null) {
      Optional<String> description =
          context.speciesDescriptionByCode.computeIfAbsent(speciesCode, repository::findSpeciesDescription);
      if (description.isEmpty()) {
        errors.add("Row " + lineNumber + " species code " + speciesCode + " was not found.");
      }
      speciesDescription = description.orElse("");
    }

    String gradeDescription = "";
    if (gradeCode != null) {
      Optional<String> description =
          context.gradeDescriptionByCode.computeIfAbsent(gradeCode, repository::findGradeDescription);
      if (description.isEmpty()) {
        errors.add("Row " + lineNumber + " grade code " + gradeCode + " was not found.");
      }
      gradeDescription = description.orElse("");
    }

    String combinationKey = scaleCombinationKey(packageNumber, timberMark, speciesCode, gradeCode);
    List<ApplicationScaleDetailRow> existingScales = List.of();
    if (combinationKey != null && !context.uploadCombinationKeys.add(combinationKey)) {
      errors.add(
          "Row " + lineNumber + " duplicates another uploaded row for package, timber mark, species, and grade.");
    }
    if (combinationKey != null && packageNumber != null) {
      existingScales =
          context.scalesByPackageNumber.computeIfAbsent(
              packageNumber, repository::findScaleDetailsByPackageNumber);
      boolean existingCombination =
          existingScales.stream()
              .map(
                  scale ->
                      scaleCombinationKey(
                          scale.packageNumber(),
                          scale.timberMark(),
                          scale.exportSpeciesCode(),
                          scale.exportGradeCode()))
              .anyMatch(combinationKey::equals);
      if (existingCombination) {
        errors.add(
            "Row " + lineNumber + " already exists for package, timber mark, species, and grade.");
      }
    }

    if (packageFound && volume != null) {
      if (existingScales.isEmpty() && packageNumber != null) {
        existingScales =
            context.scalesByPackageNumber.computeIfAbsent(
                packageNumber, repository::findScaleDetailsByPackageNumber);
      }
      BigDecimal existingVolume =
          existingScales.stream()
              .map(scale -> BigDecimal.valueOf(scale.speciesGradeVolume()).setScale(1, RoundingMode.HALF_UP))
              .reduce(BigDecimal.ZERO, BigDecimal::add);
      String normalizedPackageNumber = normalizePackageNumber(packageNumber);
      BigDecimal uploadedVolume =
          context.uploadedVolumeByPackageNumber.getOrDefault(normalizedPackageNumber, BigDecimal.ZERO);
      BigDecimal nextTotalVolume = existingVolume.add(uploadedVolume).add(volume);
      BigDecimal packageVolume =
          BigDecimal.valueOf(packageInfo.packageVolume()).setScale(1, RoundingMode.HALF_UP);
      if (nextTotalVolume.compareTo(packageVolume) > 0) {
        BigDecimal remaining = packageVolume.subtract(existingVolume).subtract(uploadedVolume);
        errors.add(
            "Row "
                + lineNumber
                + " scale volume exceeds remaining package volume "
                + remaining.max(BigDecimal.ZERO).setScale(1, RoundingMode.HALF_UP)
                + ".");
      } else if (errors.isEmpty()) {
        context.uploadedVolumeByPackageNumber.put(normalizedPackageNumber, uploadedVolume.add(volume));
      }
    }

    return new ApplicationScaleUploadRowDto(
        lineNumber,
        sourceFileName,
        timberMark,
        speciesCode,
        speciesDescription,
        gradeCode,
        gradeDescription,
        pieces,
        volume,
        packageNumber,
        applicationNumber,
        errors.isEmpty(),
        errors,
        warnings);
  }

  private String readField(Element element, Set<String> aliases) {
    if (element == null) {
      return null;
    }

    for (int i = 0; i < element.getAttributes().getLength(); i++) {
      Node attribute = element.getAttributes().item(i);
      if (aliases.contains(normalizeXmlName(attribute.getNodeName()))) {
        return trimToNull(attribute.getNodeValue());
      }
    }

    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      Node child = children.item(i);
      if (child instanceof Element childElement
          && aliases.contains(normalizeXmlName(childElement.getNodeName()))) {
        return trimToNull(childElement.getTextContent());
      }
    }

    return null;
  }

  private String normalizeXmlName(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return "";
    }
    return normalized.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
  }

  private Long parseNonNegativeLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private BigDecimal parseNonNegativeDecimal(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      BigDecimal parsed = new BigDecimal(normalized);
      return parsed.compareTo(BigDecimal.ZERO) >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String scaleCombinationKey(
      String packageNumber, String timberMark, String speciesCode, String gradeCode) {
    if (packageNumber == null || timberMark == null || speciesCode == null || gradeCode == null) {
      return null;
    }
    return String.join(
        "|",
        packageNumber.trim().toUpperCase(Locale.ROOT),
        timberMark.trim().toUpperCase(Locale.ROOT),
        speciesCode.trim().toUpperCase(Locale.ROOT),
        gradeCode.trim().toUpperCase(Locale.ROOT));
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = trimToNull(attachmentTypeCode);
    if (normalizedCode == null) {
      return "";
    }

    String known = attachmentTypeByCode.get(normalizedCode);
    if (known != null) {
      return known;
    }

    String resolved =
        repository.findAttachmentTypeDescription(normalizedCode).orElse(normalizedCode);
    attachmentTypeByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String normalizeDescription(String description) {
    String normalized = trimToNull(description);
    return normalized == null ? DESCRIPTION_NOT_ON_FILE : normalized;
  }

  private String truncateRemarkForDisplay(String remark) {
    String normalized = remark == null ? "" : remark;
    String value =
        normalized.length() > REMARK_DISPLAY_LIMIT
            ? normalized.substring(0, REMARK_DISPLAY_LIMIT) + "..."
            : normalized;
    return sanitize(value);
  }

  private String sanitize(String input) {
    if (input == null || input.isEmpty()) {
      return "";
    }
    return input
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }

  private String resolveFileName(MultipartFile file) {
    String original = file == null ? null : trimToNull(file.getOriginalFilename());
    if (original == null) {
      return "scale-upload.xml";
    }
    int slashIndex = Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\'));
    if (slashIndex >= 0 && slashIndex < original.length() - 1) {
      return original.substring(slashIndex + 1);
    }
    return original;
  }

  private String scaleUploadFileNameSummary(List<String> fileNames) {
    if (fileNames == null || fileNames.isEmpty()) {
      return null;
    }
    if (fileNames.size() == 1) {
      return fileNames.get(0);
    }
    return fileNames.size() + " XML(s)";
  }

  private String normalizeCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private String normalizePackageNumber(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private <T> T firstNonNull(T first, T second) {
    return first != null ? first : second;
  }

  private void markCurrentTransactionRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ex) {
      // Unit tests can exercise this path without a Spring transaction.
    }
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private Long parsePositiveLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private static final class ScaleUploadValidationContext {
    private final Map<Long, Optional<LexisApplicationDetailDto>> applicationByNumber = new HashMap<>();
    private final Map<String, Optional<LexisPackageLookupDto>> packageInfoByNumber = new HashMap<>();
    private final Map<String, Optional<String>> speciesDescriptionByCode = new HashMap<>();
    private final Map<String, Optional<String>> gradeDescriptionByCode = new HashMap<>();
    private final Map<String, Optional<TimberMarkRow>> timberMarkByMark = new HashMap<>();
    private final Map<String, List<ApplicationScaleDetailRow>> scalesByPackageNumber = new HashMap<>();
    private final Map<String, BigDecimal> uploadedVolumeByPackageNumber = new HashMap<>();
    private final Set<String> uploadCombinationKeys = new LinkedHashSet<>();
    private String uploadPackageNumber;
  }
}

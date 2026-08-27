package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLResolver;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

final class RtmEmsLogAmvUploadPreviewAnalyzer {

  private static final String CONTENT_TYPES_ENTRY = "[Content_Types].xml";
  private static final String PACKAGE_RELATIONSHIPS_ENTRY = "_rels/.rels";
  private static final String WORKBOOK_ENTRY = "xl/workbook.xml";
  private static final String WORKBOOK_RELATIONSHIPS_ENTRY = "xl/_rels/workbook.xml.rels";
  private static final String SHARED_STRINGS_ENTRY = "xl/sharedStrings.xml";
  private static final String CONTENT_TYPES_NAMESPACE =
      "http://schemas.openxmlformats.org/package/2006/content-types";
  private static final String PACKAGE_RELATIONSHIPS_NAMESPACE =
      "http://schemas.openxmlformats.org/package/2006/relationships";
  private static final Set<String> SPREADSHEET_NAMESPACES =
      Set.of(
          "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
          "http://purl.oclc.org/ooxml/spreadsheetml/main");
  private static final Set<String> OFFICE_RELATIONSHIP_NAMESPACES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "http://purl.oclc.org/ooxml/officeDocument/relationships");
  private static final Set<String> OFFICE_RELATIONSHIP_TYPE_PREFIXES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/");
  private static final String RELATIONSHIPS_CONTENT_TYPE =
      "application/vnd.openxmlformats-package.relationships+xml";
  private static final String WORKBOOK_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  private static final String WORKSHEET_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
  private static final String SHARED_STRINGS_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml";
  private static final int MAX_ARCHIVE_ENTRIES = 128;
  private static final int MAX_ENTRY_NAME_LENGTH = 512;
  private static final int MAX_WORKBOOK_PART_BYTES = 12 * 1024 * 1024;
  private static final int MAX_ARCHIVE_EXPANDED_BYTES = 24 * 1024 * 1024;
  private static final long MAX_ARCHIVE_COMPRESSION_RATIO = 100L;
  private static final int MAX_CONTENT_TYPE_DECLARATIONS = 512;
  private static final int MAX_RELATIONSHIPS_PER_PART = 512;
  private static final int MAX_TOTAL_RELATIONSHIPS = 2_048;
  private static final int MAX_WORKBOOK_SHEETS = 256;
  private static final int MAX_ROWS = 10_000;
  private static final int MAX_CELLS_PER_ROW = 512;
  private static final int MAX_TOTAL_CELLS = 250_000;
  private static final int MAX_SHARED_STRINGS = 100_000;
  private static final int MAX_CELL_CHARACTERS = 4_096;
  private static final int MAX_CELL_REFERENCE_CHARACTERS = 32;
  private static final int MAX_ROW_REFERENCE_CHARACTERS = 16;
  private static final String XML_EXTENSION = ".xml";
  private static final String GRADE_HEADER = "GRADE";
  private static final Set<String> AMBIGUOUS_SPECIES_HEADERS = Set.of("P", "PINE");
  private static final Set<String> IMPORTABLE_GRADES =
      Set.of(
          "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
          "U", "W", "X", "Y", "Z", "1", "2", "3", "4", "5", "6", "BLANK");
  private static final Set<String> SCREEN_SPECIES =
      Set.of("BA", "HE", "CE", "CY", "FI", "SP", "WH", "LO", "YE", "PINE");
  private static final Pattern GROUPED_NUMERIC_VALUE =
      Pattern.compile("[+-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?");

  private RtmEmsLogAmvUploadPreviewAnalyzer() {}

  record Analysis(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      LocalDate retrievalDate,
      LocalDate updateDate,
      String growthIndicator,
      List<String> warnings,
      List<String> errors,
      List<UploadRow> rows) {}

  record UploadRow(
      String species,
      String grade,
      String growthIndicator,
      BigDecimal newValue,
      int sourceRow,
      int sourceColumn) {}

  record UploadParseResult(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      LocalDate retrievalDate,
      LocalDate updateDate,
      String growthIndicator,
      List<String> errors,
      List<String> warnings,
      List<UploadRow> rows) {}

  private record ParsedCell(int column, String value, boolean excelNumeric, boolean formula) {}
  private record ParsedRow(int rowNumber, List<ParsedCell> cells) {}
  private record ParsedWorkbook(List<ParsedRow> rows) {}
  private record UploadMetadata(LocalDate updateDate, String growthIndicator) {}
  private record ContentTypeManifest(
      Map<String, String> defaultTypes, Map<String, String> overrideTypes) {}
  private record PackageRelationship(String id, String type, String target) {}

  static Analysis analyze(InputStream inputStream) throws IOException {
    UploadParseResult result = parseForUpload(inputStream);
    return new Analysis(
        result.dataRowCount(),
        result.numericCellCount(),
        result.headerDetected(),
        result.retrievalDate(),
        result.updateDate(),
        result.growthIndicator(),
        result.warnings(),
        result.errors(),
        result.rows());
  }

  static UploadParseResult parseForUpload(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.rows(), null, null);
  }

  static UploadParseResult parseForUpload(InputStream inputStream, LocalDate effectiveMonth)
      throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.rows(), effectiveMonth, "O");
  }

  private static ParsedWorkbook readWorkbook(InputStream inputStream) throws IOException {
    Map<String, byte[]> capturedParts = new HashMap<>();
    Set<String> entryNames = new HashSet<>();
    Set<String> caseInsensitiveEntryNames = new HashSet<>();

    try (ZipInputStream zip = new ZipInputStream(inputStream)) {
      ZipEntry entry;
      int entryCount = 0;
      long totalExpandedBytes = 0L;
      while ((entry = zip.getNextEntry()) != null) {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw new IOException("The XLSX archive contains too many entries.");
        }
        String entryName = entry.getName();
        if (!isSafeArchiveEntryName(entryName)) {
          throw new IOException("The XLSX archive contains an invalid entry name.");
        }
        if (!entryNames.add(entryName)
            || !caseInsensitiveEntryNames.add(entryName.toLowerCase(Locale.ROOT))) {
          throw new IOException("The XLSX archive contains duplicate entries.");
        }
        if (isUnsafeWorkbookPart(entryName)) {
          throw new IOException("The XLSX workbook contains an unsafe part.");
        }

        boolean captureEntry = shouldCaptureWorkbookPart(entryName);
        ByteArrayOutputStream captured = captureEntry ? new ByteArrayOutputStream() : null;
        byte[] chunk = new byte[8192];
        long entryExpandedBytes = 0L;
        int read;
        while ((read = zip.read(chunk)) != -1) {
          entryExpandedBytes += read;
          totalExpandedBytes += read;
          if (totalExpandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
            throw new IOException("The XLSX archive expands beyond the supported size.");
          }
          if (captured != null && entryExpandedBytes > MAX_WORKBOOK_PART_BYTES) {
            throw new IOException("The XLSX workbook contains an oversized part.");
          }
          if (captured != null) {
            captured.write(chunk, 0, read);
          }
        }

        // Zip entries written with a data descriptor do not expose their compressed size until
        // EOF. Checking here keeps the ratio guard effective for those normal XLSX entries.
        rejectExcessiveCompressionRatio(entry, entryExpandedBytes);
        if (captured != null) {
          capturedParts.put(entryName, captured.toByteArray());
        }
        zip.closeEntry();
      }
    }

    byte[] contentTypesBytes = requirePart(capturedParts, CONTENT_TYPES_ENTRY);
    requirePart(capturedParts, PACKAGE_RELATIONSHIPS_ENTRY);
    byte[] workbookBytes = requirePart(capturedParts, WORKBOOK_ENTRY);
    requirePart(capturedParts, WORKBOOK_RELATIONSHIPS_ENTRY);

    ContentTypeManifest contentTypes = parseContentTypes(contentTypesBytes);
    validateWorkbookContentTypes(contentTypes);

    Map<String, List<PackageRelationship>> relationshipsByEntry = new HashMap<>();
    int totalRelationships = 0;
    for (Map.Entry<String, byte[]> part : capturedParts.entrySet()) {
      if (isRelationshipsEntry(part.getKey())) {
        List<PackageRelationship> relationships = parseRelationships(part.getValue());
        if (relationships.size() > MAX_TOTAL_RELATIONSHIPS - totalRelationships) {
          throw new IOException("The XLSX package contains too many relationships.");
        }
        totalRelationships += relationships.size();
        relationshipsByEntry.put(part.getKey(), relationships);
      }
    }
    validateRelationships(relationshipsByEntry);

    PackageRelationship officeDocument =
        findSingleRelationship(
            relationshipsByEntry.get(PACKAGE_RELATIONSHIPS_ENTRY), "officeDocument");
    String resolvedWorkbookEntry = resolveRelationshipTarget("", officeDocument.target());
    if (!WORKBOOK_ENTRY.equals(resolvedWorkbookEntry)) {
      throw new IOException("The XLSX package does not identify the expected workbook part.");
    }

    List<PackageRelationship> workbookRelationships =
        relationshipsByEntry.get(WORKBOOK_RELATIONSHIPS_ENTRY);
    PackageRelationship worksheetRelationship =
        findFirstDeclaredWorksheetRelationship(
            workbookRelationships, parseDeclaredSheetRelationshipIds(workbookBytes));
    String worksheetEntry =
        resolveRelationshipTarget(WORKBOOK_ENTRY, worksheetRelationship.target());
    if (!isWorksheetPart(worksheetEntry)) {
      throw new IOException("The XLSX workbook sheet target is invalid.");
    }
    requirePartContentType(contentTypes, worksheetEntry, WORKSHEET_CONTENT_TYPE);
    byte[] sheetBytes = requirePart(capturedParts, worksheetEntry);

    PackageRelationship sharedStringsRelationship =
        findOptionalSingleRelationship(workbookRelationships, "sharedStrings");
    byte[] sharedStringBytes = null;
    if (sharedStringsRelationship != null) {
      String sharedStringsEntry =
          resolveRelationshipTarget(WORKBOOK_ENTRY, sharedStringsRelationship.target());
      requirePartContentType(contentTypes, sharedStringsEntry, SHARED_STRINGS_CONTENT_TYPE);
      sharedStringBytes = requirePart(capturedParts, sharedStringsEntry);
    } else if (capturedParts.containsKey(SHARED_STRINGS_ENTRY)
        || capturedParts.keySet().stream()
            .anyMatch(
                partName ->
                    SHARED_STRINGS_CONTENT_TYPE.equals(
                        resolvePartContentType(contentTypes, partName)))) {
      throw new IOException("The XLSX shared strings part is missing its relationship.");
    }

    List<String> sharedStrings =
        sharedStringBytes == null ? List.of() : parseSharedStrings(sharedStringBytes);
    List<ParsedRow> rows = parseSheetRows(sheetBytes, sharedStrings);

    return new ParsedWorkbook(rows);
  }

  private static boolean isSafeArchiveEntryName(String entryName) {
    if (entryName == null
        || entryName.isBlank()
        || entryName.length() > MAX_ENTRY_NAME_LENGTH
        || entryName.startsWith("/")
        || entryName.contains("\\")
        || entryName.contains(":")) {
      return false;
    }

    for (int index = 0; index < entryName.length(); index++) {
      if (Character.isISOControl(entryName.charAt(index))) {
        return false;
      }
    }

    String candidate =
        entryName.endsWith("/") ? entryName.substring(0, entryName.length() - 1) : entryName;
    if (candidate.isBlank()) {
      return false;
    }
    for (String segment : candidate.split("/", -1)) {
      if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) {
        return false;
      }
    }
    return true;
  }

  private static boolean shouldCaptureWorkbookPart(String entryName) {
    return CONTENT_TYPES_ENTRY.equals(entryName)
        || isRelationshipsEntry(entryName)
        || entryName.endsWith(XML_EXTENSION);
  }

  private static boolean isRelationshipsEntry(String entryName) {
    return entryName != null && entryName.endsWith(".rels");
  }

  private static boolean isWorksheetPart(String entryName) {
    return entryName != null
        && entryName.startsWith("xl/worksheets/")
        && entryName.endsWith(XML_EXTENSION)
        && entryName.length() > "xl/worksheets/".length() + XML_EXTENSION.length();
  }

  private static boolean isUnsafeWorkbookPart(String entryName) {
    String normalized = entryName.toLowerCase(Locale.ROOT);
    return normalized.contains("vbaproject")
        || normalized.startsWith("xl/activex/")
        || normalized.startsWith("xl/embeddings/")
        || normalized.startsWith("xl/externallinks/");
  }

  private static void rejectExcessiveCompressionRatio(ZipEntry entry, long expandedBytes)
      throws IOException {
    long compressedSize = entry.getCompressedSize();
    if (compressedSize > 0
        && expandedBytes > 1024L * 1024L
        && compressedSize < expandedBytes
        && expandedBytes > compressedSize * MAX_ARCHIVE_COMPRESSION_RATIO) {
      throw new IOException("The XLSX archive compression ratio is too high.");
    }
  }

  private static byte[] requirePart(Map<String, byte[]> parts, String partName) throws IOException {
    byte[] part = parts.get(partName);
    if (part == null) {
      throw new IOException("The XLSX package is missing required part " + partName + ".");
    }
    return part;
  }

  private static ContentTypeManifest parseContentTypes(byte[] bytes) throws IOException {
    Map<String, String> defaultTypes = new HashMap<>();
    Map<String, String> overrideTypes = new HashMap<>();
    Set<String> caseInsensitivePartNames = new HashSet<>();
    XMLInputFactory factory = newXmlInputFactory();

    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      int declarationCount = 0;
      while (reader.hasNext()) {
        if (reader.next() != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        String elementName = reader.getLocalName();
        if (!rootSeen) {
          rootSeen = true;
          requireXmlRoot(reader, "Types", CONTENT_TYPES_NAMESPACE, "content types");
          continue;
        }
        if (!CONTENT_TYPES_NAMESPACE.equals(reader.getNamespaceURI())) {
          continue;
        }
        if ("Default".equals(elementName)) {
          declarationCount++;
          if (declarationCount > MAX_CONTENT_TYPE_DECLARATIONS) {
            throw new IOException(
                "The XLSX content type manifest contains too many declarations.");
          }
          String extension = requiredXmlAttribute(reader, "Extension", "content type");
          String contentType = requiredXmlAttribute(reader, "ContentType", "content type");
          String key = extension.toLowerCase(Locale.ROOT);
          if (defaultTypes.putIfAbsent(key, contentType) != null) {
            throw new IOException("The XLSX content type manifest contains duplicates.");
          }
          rejectUnsafeContentType(contentType);
        } else if ("Override".equals(elementName)) {
          declarationCount++;
          if (declarationCount > MAX_CONTENT_TYPE_DECLARATIONS) {
            throw new IOException(
                "The XLSX content type manifest contains too many declarations.");
          }
          String partName = requiredXmlAttribute(reader, "PartName", "content type");
          String contentType = requiredXmlAttribute(reader, "ContentType", "content type");
          String normalizedPartName = normalizeManifestPartName(partName);
          if (!caseInsensitivePartNames.add(normalizedPartName.toLowerCase(Locale.ROOT))
              || overrideTypes.putIfAbsent(normalizedPartName, contentType) != null) {
            throw new IOException("The XLSX content type manifest contains duplicates.");
          }
          rejectUnsafeContentType(contentType);
        }
      }
      reader.close();
      if (!rootSeen) {
        throw new IOException("The XLSX content type manifest is empty.");
      }
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse XLSX content types.", ex);
    }

    return new ContentTypeManifest(Map.copyOf(defaultTypes), Map.copyOf(overrideTypes));
  }

  private static void validateWorkbookContentTypes(ContentTypeManifest contentTypes)
      throws IOException {
    String relationshipsType = contentTypes.defaultTypes().get("rels");
    if (!RELATIONSHIPS_CONTENT_TYPE.equals(relationshipsType)) {
      throw new IOException("The XLSX package relationships content type is invalid.");
    }
    requirePartContentType(contentTypes, WORKBOOK_ENTRY, WORKBOOK_CONTENT_TYPE);
  }

  private static void requirePartContentType(
      ContentTypeManifest contentTypes, String partName, String expectedContentType)
      throws IOException {
    if (!expectedContentType.equals(resolvePartContentType(contentTypes, partName))) {
      throw new IOException("The XLSX package contains an invalid content type for " + partName + ".");
    }
  }

  private static String resolvePartContentType(
      ContentTypeManifest contentTypes, String partName) {
    String overrideType = contentTypes.overrideTypes().get(partName);
    if (overrideType != null) {
      return overrideType;
    }
    int extensionSeparator = partName.lastIndexOf('.');
    if (extensionSeparator < 0 || extensionSeparator == partName.length() - 1) {
      return null;
    }
    return contentTypes
        .defaultTypes()
        .get(partName.substring(extensionSeparator + 1).toLowerCase(Locale.ROOT));
  }

  private static String normalizeManifestPartName(String partName) throws IOException {
    if (partName == null || !partName.startsWith("/") || partName.length() == 1) {
      throw new IOException("The XLSX content type manifest contains an invalid part name.");
    }
    String normalized = partName.substring(1);
    if (!isSafeArchiveEntryName(normalized) || normalized.endsWith("/")) {
      throw new IOException("The XLSX content type manifest contains an invalid part name.");
    }
    return normalized;
  }

  private static void rejectUnsafeContentType(String contentType) throws IOException {
    String normalized = contentType.toLowerCase(Locale.ROOT);
    if (normalized.contains("macroenabled")
        || normalized.contains("macrosheet")
        || normalized.contains("vbaproject")
        || normalized.contains("externallink")
        || normalized.contains("oleobject")
        || normalized.contains("activex")
        || normalized.contains("querytable")
        || normalized.contains("connections")) {
      throw new IOException("The XLSX workbook contains an unsafe content type.");
    }
  }

  private static List<PackageRelationship> parseRelationships(byte[] bytes) throws IOException {
    List<PackageRelationship> relationships = new ArrayList<>();
    Set<String> ids = new HashSet<>();
    XMLInputFactory factory = newXmlInputFactory();

    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        if (reader.next() != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          requireXmlRoot(
              reader, "Relationships", PACKAGE_RELATIONSHIPS_NAMESPACE, "relationships");
          continue;
        }
        if (!PACKAGE_RELATIONSHIPS_NAMESPACE.equals(reader.getNamespaceURI())
            || !"Relationship".equals(reader.getLocalName())) {
          continue;
        }
        if (relationships.size() >= MAX_RELATIONSHIPS_PER_PART) {
          throw new IOException("The XLSX relationships part contains too many relationships.");
        }
        String id = requiredXmlAttribute(reader, "Id", "relationship");
        String type = requiredXmlAttribute(reader, "Type", "relationship");
        String target = requiredXmlAttribute(reader, "Target", "relationship");
        if (!ids.add(id)) {
          throw new IOException("The XLSX package contains duplicate relationship identifiers.");
        }
        String targetMode = attribute(reader, "TargetMode");
        if ("External".equalsIgnoreCase(targetMode)) {
          throw new IOException("The XLSX workbook contains an external relationship.");
        }
        rejectUnsafeRelationshipType(type);
        relationships.add(new PackageRelationship(id, type, target));
      }
      reader.close();
      if (!rootSeen) {
        throw new IOException("The XLSX relationships part is empty.");
      }
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse XLSX relationships.", ex);
    }
    return List.copyOf(relationships);
  }

  private static void validateRelationships(
      Map<String, List<PackageRelationship>> relationshipsByEntry) throws IOException {
    if (!relationshipsByEntry.containsKey(PACKAGE_RELATIONSHIPS_ENTRY)
        || !relationshipsByEntry.containsKey(WORKBOOK_RELATIONSHIPS_ENTRY)) {
      throw new IOException("The XLSX package is missing required relationships.");
    }

    for (Map.Entry<String, List<PackageRelationship>> relationshipsEntry :
        relationshipsByEntry.entrySet()) {
      String sourcePart = sourcePartForRelationships(relationshipsEntry.getKey());
      for (PackageRelationship relationship : relationshipsEntry.getValue()) {
        validateInternalRelationshipTarget(sourcePart, relationship.target());
      }
    }
  }

  private static String sourcePartForRelationships(String relationshipsEntry) throws IOException {
    if (PACKAGE_RELATIONSHIPS_ENTRY.equals(relationshipsEntry)) {
      return "";
    }
    int marker = relationshipsEntry.lastIndexOf("/_rels/");
    if (marker < 0 || !relationshipsEntry.endsWith(".rels")) {
      throw new IOException("The XLSX package contains an invalid relationships part.");
    }
    String prefix = relationshipsEntry.substring(0, marker + 1);
    String sourceName =
        relationshipsEntry.substring(marker + "/_rels/".length(), relationshipsEntry.length() - 5);
    String sourcePart = prefix + sourceName;
    if (!isSafeArchiveEntryName(sourcePart)) {
      throw new IOException("The XLSX package contains an invalid relationships part.");
    }
    return sourcePart;
  }

  private static void validateInternalRelationshipTarget(String sourcePart, String target)
      throws IOException {
    URI uri = parseRelationshipTarget(target);
    if (uri.isAbsolute() || uri.getRawAuthority() != null) {
      throw new IOException("The XLSX workbook contains an external relationship.");
    }
    if (uri.getPath() != null && !uri.getPath().isBlank()) {
      resolveRelationshipTarget(sourcePart, target);
    }
  }

  private static String resolveRelationshipTarget(String sourcePart, String target)
      throws IOException {
    URI uri = parseRelationshipTarget(target);
    if (uri.isAbsolute()
        || uri.getRawAuthority() != null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || uri.getPath() == null
        || uri.getPath().isBlank()) {
      throw new IOException("The XLSX workbook contains an invalid relationship target.");
    }

    String path = uri.getPath();
    String base = "";
    if (!path.startsWith("/") && sourcePart != null && !sourcePart.isBlank()) {
      int separator = sourcePart.lastIndexOf('/');
      base = separator < 0 ? "" : sourcePart.substring(0, separator + 1);
    }
    String candidate = path.startsWith("/") ? path.substring(1) : base + path;
    Deque<String> segments = new ArrayDeque<>();
    for (String segment : candidate.split("/", -1)) {
      if (segment.isBlank() || ".".equals(segment)) {
        continue;
      }
      if ("..".equals(segment)) {
        if (segments.isEmpty()) {
          throw new IOException("The XLSX workbook contains an unsafe relationship target.");
        }
        segments.removeLast();
      } else {
        segments.addLast(segment);
      }
    }
    String resolved = String.join("/", segments);
    if (!isSafeArchiveEntryName(resolved) || resolved.endsWith("/")) {
      throw new IOException("The XLSX workbook contains an unsafe relationship target.");
    }
    return resolved;
  }

  private static URI parseRelationshipTarget(String target) throws IOException {
    try {
      return new URI(target);
    } catch (URISyntaxException | NullPointerException ex) {
      throw new IOException("The XLSX workbook contains an invalid relationship target.", ex);
    }
  }

  private static void rejectUnsafeRelationshipType(String type) throws IOException {
    String normalized = type.toLowerCase(Locale.ROOT);
    if (normalized.contains("vbaproject")
        || normalized.contains("macrosheet")
        || normalized.contains("externallink")
        || normalized.contains("oleobject")
        || normalized.contains("activex")
        || normalized.contains("querytable")
        || normalized.endsWith("/connections")
        || normalized.contains("attachedtemplate")
        || normalized.endsWith("/package")) {
      throw new IOException("The XLSX workbook contains an unsafe relationship.");
    }
  }

  private static PackageRelationship findSingleRelationship(
      List<PackageRelationship> relationships, String typeSuffix) throws IOException {
    if (relationships == null) {
      throw new IOException("The XLSX package is missing required relationships.");
    }
    List<PackageRelationship> matches =
        relationships.stream()
            .filter(relationship -> isOfficeRelationshipType(relationship.type(), typeSuffix))
            .toList();
    if (matches.size() != 1) {
      throw new IOException("The XLSX package does not identify one " + typeSuffix + " relationship.");
    }
    return matches.get(0);
  }

  private static PackageRelationship findRelationshipById(
      List<PackageRelationship> relationships, String id) throws IOException {
    if (relationships != null) {
      for (PackageRelationship relationship : relationships) {
        if (relationship.id().equals(id)) {
          return relationship;
        }
      }
    }
    throw new IOException("The XLSX workbook references a missing sheet relationship.");
  }

  private static PackageRelationship findOptionalSingleRelationship(
      List<PackageRelationship> relationships, String typeSuffix) throws IOException {
    if (relationships == null) {
      return null;
    }
    PackageRelationship match = null;
    for (PackageRelationship relationship : relationships) {
      if (!isOfficeRelationshipType(relationship.type(), typeSuffix)) {
        continue;
      }
      if (match != null) {
        throw new IOException(
            "The XLSX package contains duplicate " + typeSuffix + " relationships.");
      }
      match = relationship;
    }
    return match;
  }

  private static PackageRelationship findFirstDeclaredWorksheetRelationship(
      List<PackageRelationship> relationships, List<String> declaredRelationshipIds)
      throws IOException {
    for (String relationshipId : declaredRelationshipIds) {
      PackageRelationship relationship = findRelationshipById(relationships, relationshipId);
      if (isOfficeRelationshipType(relationship.type(), "worksheet")) {
        return relationship;
      }
    }
    throw new IOException("The XLSX workbook does not declare a worksheet relationship.");
  }

  private static boolean isOfficeRelationshipType(String type, String suffix) {
    if (type == null) {
      return false;
    }
    for (String prefix : OFFICE_RELATIONSHIP_TYPE_PREFIXES) {
      if (type.equals(prefix + suffix)) {
        return true;
      }
    }
    return false;
  }

  private static List<String> parseDeclaredSheetRelationshipIds(byte[] workbookBytes)
      throws IOException {
    List<String> relationshipIds = new ArrayList<>();
    Set<String> observedRelationshipIds = new HashSet<>();
    XMLInputFactory factory = newXmlInputFactory();
    try {
      XMLStreamReader reader =
          factory.createXMLStreamReader(new ByteArrayInputStream(workbookBytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        if (reader.next() != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          requireSpreadsheetRoot(reader, "workbook", "workbook");
          continue;
        }
        if (SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())
            && "sheet".equals(reader.getLocalName())) {
          if (relationshipIds.size() >= MAX_WORKBOOK_SHEETS) {
            throw new IOException("The XLSX workbook declares too many sheets.");
          }
          String relationshipId = relationshipIdAttribute(reader);
          if (relationshipId == null || relationshipId.isBlank()) {
            throw new IOException("The XLSX workbook contains a sheet without a relationship.");
          }
          if (!observedRelationshipIds.add(relationshipId)) {
            throw new IOException(
                "The XLSX workbook contains duplicate sheet relationship identifiers.");
          }
          relationshipIds.add(relationshipId);
        }
      }
      reader.close();
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse XLSX workbook XML.", ex);
    }
    if (relationshipIds.isEmpty()) {
      throw new IOException("The XLSX workbook does not declare a sheet.");
    }
    return List.copyOf(relationshipIds);
  }

  private static String requiredXmlAttribute(
      XMLStreamReader reader, String localName, String context) throws IOException {
    String value = attribute(reader, localName);
    if (value == null || value.isBlank()) {
      throw new IOException("The XLSX " + context + " is missing " + localName + ".");
    }
    return value;
  }

  private static void requireXmlRoot(
      XMLStreamReader reader, String localName, String namespace, String context)
      throws IOException {
    if (!localName.equals(reader.getLocalName()) || !namespace.equals(reader.getNamespaceURI())) {
      throw new IOException("The XLSX " + context + " root element is invalid.");
    }
  }

  private static void requireSpreadsheetRoot(
      XMLStreamReader reader, String localName, String context) throws IOException {
    if (!localName.equals(reader.getLocalName())
        || !SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())) {
      throw new IOException("The XLSX " + context + " root element is invalid.");
    }
  }

  private static String relationshipIdAttribute(XMLStreamReader reader) {
    for (int index = 0; index < reader.getAttributeCount(); index++) {
      if ("id".equals(reader.getAttributeLocalName(index))
          && OFFICE_RELATIONSHIP_NAMESPACES.contains(reader.getAttributeNamespace(index))) {
        return reader.getAttributeValue(index);
      }
    }
    return null;
  }

  private static UploadParseResult parseUploadSheet(
      List<ParsedRow> rows, LocalDate effectiveMonth, String defaultGrowthIndicator) {
    int dataRows = 0;
    int numericCells = 0;
    boolean headerDetected = false;
    int headerRow = -1;
    UploadMetadata metadata = parseUploadMetadata(rows);
    LocalDate updateDate = effectiveMonth == null ? metadata.updateDate() : effectiveMonth;
    LocalDate retrievalDate = effectiveMonth == null ? updateDate : effectiveMonth.minusMonths(1);
    String growthIndicator =
        defaultGrowthIndicator == null ? metadata.growthIndicator() : defaultGrowthIndicator;
    Map<String, String> speciesHeaderAliases = speciesHeaderAliases(effectiveMonth != null);
    Map<Integer, String> speciesByColumn = new HashMap<>();
    Map<String, UploadRow> firstScreenUploadByKey = new HashMap<>();
    Set<Integer> screenUnmappedValueColumns = new HashSet<>();
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    List<UploadRow> uploadRows = new ArrayList<>();

    if (growthIndicator == null) {
      errors.add("Growth indicator is required in the uploaded template.");
    } else if (!Set.of("O", "S").contains(growthIndicator)) {
      errors.add("Growth indicator in the uploaded template must be O or S.");
    }

    for (ParsedRow parsedRow : rows) {
      int rowNumber = parsedRow.rowNumber();
      List<ParsedCell> rowCells = parsedRow.cells();

      if (!headerDetected && rowHasHeader(rowCells)) {
        headerDetected = true;
        headerRow = rowNumber;
        speciesByColumn =
            parseSpeciesHeaders(
                rowCells,
                rowNumber,
                errors,
                warnings,
                speciesHeaderAliases,
                effectiveMonth != null);

        if (speciesByColumn.isEmpty()) {
          errors.add("Header row %d does not include recognized species columns.".formatted(rowNumber));
        }
        continue;
      }

      if (rowNumber <= headerRow || headerRow < 0 || !rowHasAnyData(rowCells)) {
        continue;
      }

      String grade = "";
      ParsedCell gradeCell = null;
      boolean foundNumericValue = false;

      for (ParsedCell cell : rowCells) {
        if (cell.column() == 1) {
          grade = cell.value().trim();
          gradeCell = cell;
          break;
        }
      }

      if (gradeCell != null && gradeCell.formula()) {
        errors.add(
            "Row %d contains a formula at column A; enter a fixed grade."
                .formatted(rowNumber));
        continue;
      }

      if (gradeCell == null || grade.isBlank()) {
        if (effectiveMonth != null) {
          errors.add("Row %d contains AMV values but has no grade.".formatted(rowNumber));
        } else {
          warnings.add("Row %d was skipped because no grade value was found.".formatted(rowNumber));
        }
        continue;
      }

      if (!isUploadableGrade(grade)) {
        if (!isSummaryGrade(grade)) {
          if (effectiveMonth != null) {
            errors.add(
                "Row %d grade '%s' is not supported by the RTM AMV review."
                    .formatted(rowNumber, grade));
          } else {
            warnings.add(
                "Row %d grade '%s' was skipped because it is not an importable grade row."
                    .formatted(rowNumber, grade));
          }
        }
        continue;
      }

      dataRows++;
      for (ParsedCell cell : rowCells) {
        int column = cell.column();
        String value = cell.value();

        if (column <= 1) {
          continue;
        }

        if (cell.formula()) {
          errors.add(
              "Row %d contains a formula at column %s; enter a fixed numeric AMV value."
                  .formatted(rowNumber, columnToLetter(column)));
          continue;
        }

        if (value.isBlank()) {
          continue;
        }

        String speciesCode = speciesByColumn.get(column);
        if (speciesCode == null) {
          if (effectiveMonth != null && screenUnmappedValueColumns.add(column)) {
            errors.add(
                "Column %s contains AMV values but has no supported species header."
                    .formatted(columnToLetter(column)));
          } else if (effectiveMonth == null) {
            warnings.add(
                "Row %d includes unmapped species column %s; value '%s' was skipped."
                    .formatted(rowNumber, columnToLetter(column), normalizeStringValue(value)));
          }
          continue;
        }

        if (isNumeric(value)) {
          BigDecimal newValue = parseNumericValue(cell);
          UploadRow uploadRow =
              new UploadRow(
                  speciesCode, grade, growthIndicator, newValue, rowNumber, column);
          if (effectiveMonth != null) {
            String uploadKey = logicalScreenSpecies(speciesCode) + "|" + normalizeHeader(grade);
            UploadRow firstUpload = firstScreenUploadByKey.putIfAbsent(uploadKey, uploadRow);
            if (firstUpload != null) {
              errors.add(
                  ("Row %d column %s duplicates row %d column %s for species '%s' "
                          + "and grade '%s'.")
                      .formatted(
                          rowNumber,
                          columnToLetter(column),
                          firstUpload.sourceRow(),
                          columnToLetter(firstUpload.sourceColumn()),
                          logicalScreenSpecies(speciesCode),
                          normalizeHeader(grade)));
            }
          }
          uploadRows.add(uploadRow);
          numericCells++;
          foundNumericValue = true;
        } else {
          errors.add(
              "Row %d has non-numeric value '%s' at column %s."
                  .formatted(rowNumber, normalizeStringValue(value), columnToLetter(column)));
        }
      }

      if (!foundNumericValue && effectiveMonth == null) {
        warnings.add(
            "Row %d grade '%s' had no parseable AMV values and was skipped."
                .formatted(rowNumber, grade));
      }
    }

    if (!headerDetected) {
      errors.add("The template header was not recognized as RTM EMS AMV data.");
    }

    return new UploadParseResult(
        dataRows,
        numericCells,
        headerDetected,
        retrievalDate,
        updateDate,
        growthIndicator,
        errors,
        warnings,
        uploadRows);
  }

  private static Map<Integer, String> parseSpeciesHeaders(
      List<ParsedCell> cells,
      int rowNumber,
      List<String> errors,
      List<String> warnings,
      Map<String, String> speciesHeaderAliases,
      boolean screenWorkflow) {
    Map<Integer, String> speciesByColumn = new HashMap<>();
    Set<String> observedSpecies = new HashSet<>();

    for (ParsedCell cell : cells) {
      int column = cell.column();
      if (cell.formula()) {
        errors.add(
            "Header row %d contains a formula at column %s; enter fixed header text."
                .formatted(rowNumber, columnToLetter(column)));
        continue;
      }
      if (column <= 1) {
        continue;
      }

      String value = cell.value();
      if (value.isBlank()) {
        continue;
      }

      String normalizedValue = normalizeHeader(value);
      if (AMBIGUOUS_SPECIES_HEADERS.contains(normalizedValue)
          && !speciesHeaderAliases.containsKey(normalizedValue)) {
        errors.add(
            "Header row %d species '%s' is ambiguous; use separate WH, LO and YE columns."
                .formatted(rowNumber, normalizedValue));
        continue;
      }

      String speciesCode = resolveSpeciesCode(value, speciesHeaderAliases);
      if (speciesCode == null) {
        (screenWorkflow ? errors : warnings)
            .add(
                "Header row %d contains unmapped species header '%s' at column %s."
                    .formatted(rowNumber, normalizeStringValue(value), columnToLetter(column)));
        continue;
      }

      if (screenWorkflow && !SCREEN_SPECIES.contains(speciesCode)) {
        errors.add(
            "Header row %d contains unsupported species header '%s' at column %s."
                .formatted(rowNumber, normalizeStringValue(value), columnToLetter(column)));
        continue;
      }

      if (observedSpecies.contains(speciesCode)) {
        (screenWorkflow ? errors : warnings)
            .add(
                "Header row %d contains a duplicate species column for '%s'."
                    .formatted(rowNumber, normalizedValue));
        if (screenWorkflow) {
          continue;
        }
      }

      speciesByColumn.put(column, speciesCode);
      observedSpecies.add(speciesCode);
    }

    return speciesByColumn;
  }

  private static boolean rowHasHeader(List<ParsedCell> cells) {
    for (ParsedCell cell : cells) {
      if (GRADE_HEADER.equals(normalizeHeader(cell.value()))) {
        return true;
      }
    }

    return false;
  }

  private static boolean rowHasAnyData(List<ParsedCell> cells) {
    for (ParsedCell cell : cells) {
      if (!cell.value().isBlank()) {
        return true;
      }
    }

    return false;
  }

  private static boolean isNumeric(String value) {
    String trimmed = normalizeNumericValue(value);
    if (trimmed.isBlank()) {
      return false;
    }

    try {
      new BigDecimal(trimmed);
      return true;
    } catch (NumberFormatException ex) {
      return false;
    }
  }

  private static BigDecimal parseNumericValue(ParsedCell cell) {
    BigDecimal value = new BigDecimal(normalizeNumericValue(cell.value()));
    if (!cell.excelNumeric()) {
      return value;
    }

    // Excel numeric cells use binary64; their XML serialization can expose precision tails.
    double excelValue = value.doubleValue();
    return Double.isFinite(excelValue) ? BigDecimal.valueOf(excelValue) : value;
  }

  private static boolean isUploadableGrade(String grade) {
    String normalized = trimToNull(grade);
    if (normalized == null) {
      return false;
    }

    String upperGrade = normalized.toUpperCase(Locale.CANADA);
    return IMPORTABLE_GRADES.contains(upperGrade);
  }

  private static boolean isSummaryGrade(String grade) {
    String normalized = trimToNull(grade);
    if (normalized == null) {
      return true;
    }
    String upperGrade = normalized.toUpperCase(Locale.CANADA);
    return GRADE_HEADER.equals(upperGrade)
        || upperGrade.equals("AVERAGE")
        || upperGrade.startsWith("GRAND TOTAL");
  }

  private static UploadMetadata parseUploadMetadata(List<ParsedRow> rows) {
    LocalDate updateDate = null;
    String growthIndicator = null;

    for (ParsedRow row : rows) {
      List<ParsedCell> cells = row.cells();
      if (rowHasHeader(cells)) {
        break;
      }

      if (updateDate == null && rowContainsLabel(cells, "UPDATE DATE")) {
        updateDate = parseDateFromRow(cells);
      }

      if (growthIndicator == null && rowContainsLabel(cells, "GROWTH INDICATOR")) {
        growthIndicator = parseGrowthIndicatorFromRow(cells);
      }
    }

    return new UploadMetadata(updateDate, growthIndicator);
  }

  private static boolean rowContainsLabel(List<ParsedCell> cells, String label) {
    for (ParsedCell cell : cells) {
      if (normalizeHeader(cell.value()).contains(label)) {
        return true;
      }
    }
    return false;
  }

  private static LocalDate parseDateFromRow(List<ParsedCell> cells) {
    for (ParsedCell cell : cells) {
      if (rowContainsLabel(List.of(cell), "UPDATE DATE")) {
        continue;
      }

      LocalDate parsedDate = parseWorkbookDate(cell.value());
      if (parsedDate != null) {
        return parsedDate;
      }
    }
    return null;
  }

  private static String parseGrowthIndicatorFromRow(List<ParsedCell> cells) {
    for (ParsedCell cell : cells) {
      if (rowContainsLabel(List.of(cell), "GROWTH INDICATOR")) {
        continue;
      }

      String normalized = normalizeHeader(cell.value());
      if (!normalized.isBlank()) {
        return normalized;
      }
    }
    return null;
  }

  private static LocalDate parseWorkbookDate(String value) {
    String normalized = normalizeStringValue(value);
    if (normalized.isBlank()) {
      return null;
    }

    String digitsOnly = normalized.replaceAll("[^0-9]", "");
    if (digitsOnly.length() == 6) {
      try {
        return YearMonth.parse(digitsOnly, DateTimeFormatter.ofPattern("yyyyMM")).atDay(1);
      } catch (DateTimeParseException ignored) {
        // Try other date formats below.
      }
    }
    if (digitsOnly.length() == 8) {
      try {
        return LocalDate.parse(digitsOnly, DateTimeFormatter.ofPattern("yyyyMMdd"));
      } catch (DateTimeParseException ignored) {
        // Try other date formats below.
      }
    }

    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      // Try year-month below.
    }

    try {
      return YearMonth.parse(normalized, DateTimeFormatter.ofPattern("yyyy-MM")).atDay(1);
    } catch (DateTimeParseException ignored) {
      // Try Excel serial below.
    }

    try {
      BigDecimal numericValue = new BigDecimal(normalized);
      int excelSerial = numericValue.intValueExact();
      if (excelSerial >= 20000 && excelSerial <= 60000) {
        return LocalDate.of(1899, 12, 30).plusDays(excelSerial);
      }
    } catch (ArithmeticException | NumberFormatException ignored) {
      // Not an Excel serial date.
    }

    return null;
  }

  private static String resolveSpeciesCode(
      String value, Map<String, String> speciesHeaderAliases) {
    String normalized = normalizeHeader(value);
    if (normalized.isBlank() || GRADE_HEADER.equals(normalized)) {
      return null;
    }

    String alias = speciesHeaderAliases.get(normalized);
    if (alias != null) {
      return alias;
    }

    if (!AMBIGUOUS_SPECIES_HEADERS.contains(normalized)
        && normalized.matches("[A-Z0-9]{2}")) {
      return normalized;
    }

    return null;
  }

  private static String logicalScreenSpecies(String speciesCode) {
    return Set.of("WH", "LO", "YE", "PINE").contains(speciesCode) ? "PINE" : speciesCode;
  }

  private static String normalizeHeader(String value) {
    return normalizeStringValue(value)
        .toUpperCase(Locale.CANADA)
        .replace("(CODE)", "")
        .replace("*", "")
        .strip();
  }

  private static Map<String, String> speciesHeaderAliases(boolean allowGroupedPine) {
    Map<String, String> aliases = new LinkedHashMap<>();
    aliases.put("BA", "BA");
    aliases.put("BALSAM", "BA");
    aliases.put("HE", "HE");
    aliases.put("HEMLOCK", "HE");
    aliases.put("CE", "CE");
    aliases.put("CEDAR", "CE");
    aliases.put("CY", "CY");
    aliases.put("CYPRESS", "CY");
    aliases.put("FI", "FI");
    aliases.put("FIR", "FI");
    aliases.put("SP", "SP");
    aliases.put("SPRUCE", "SP");
    aliases.put("WH", "WH");
    aliases.put("LO", "LO");
    aliases.put("YE", "YE");
    if (allowGroupedPine) {
      aliases.put("PINE", "PINE");
    }
    return aliases;
  }

  private static String trimToNull(String value) {
    String normalized = normalizeStringValue(value);
    return normalized.isBlank() ? null : normalized;
  }

  private static String normalizeStringValue(String value) {
    return value == null ? "" : value.strip();
  }

  private static int parseIntSafe(String value) {
    try {
      return Integer.parseInt(value);
    } catch (NumberFormatException ex) {
      return -1;
    }
  }

  private static int columnIndex(String column) {
    int index = 0;
    for (char character : column.toCharArray()) {
      int value = character - 'A' + 1;
      index = index * 26 + value;
    }

    return index;
  }

  private static String normalizeNumericValue(String value) {
    String normalized = value.strip();
    if (normalized.contains(",") && !GROUPED_NUMERIC_VALUE.matcher(normalized).matches()) {
      return normalized;
    }
    return normalized.replace(",", "");
  }

  private static List<ParsedRow> parseSheetRows(byte[] sheetBytes, List<String> sharedStrings)
      throws IOException {
    List<ParsedRow> rows = new ArrayList<>();
    XMLInputFactory factory = newXmlInputFactory();

    try {
      XMLStreamReader reader =
          factory.createXMLStreamReader(new ByteArrayInputStream(sheetBytes));
      int rowNumber = -1;
      List<ParsedCell> cells = null;
      int cellColumn = -1;
      String cellType = null;
      StringBuilder cellValue = null;
      boolean cellFormula = false;
      boolean readingCellValue = false;
      int totalCells = 0;
      boolean rootSeen = false;

      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.START_ELEMENT) {
          String elementName = reader.getLocalName();
          if (!rootSeen) {
            rootSeen = true;
            requireSpreadsheetRoot(reader, "worksheet", "worksheet");
          } else if (!SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())) {
            continue;
          } else if ("row".equals(elementName)) {
            String rowReference = attribute(reader, "r");
            if (rowReference != null
                && rowReference.length() > MAX_ROW_REFERENCE_CHARACTERS) {
              throw new IOException("The XLSX worksheet contains an oversized row reference.");
            }
            rowNumber = parseIntSafe(rowReference);
            if (rowNumber <= 0) {
              throw new IOException("The XLSX worksheet contains an invalid row reference.");
            }
            cells = new ArrayList<>();
          } else if (cells != null && "c".equals(elementName)) {
            if (cells.size() >= MAX_CELLS_PER_ROW || totalCells >= MAX_TOTAL_CELLS) {
              throw new IOException("The XLSX worksheet contains too many cells.");
            }
            String cellReference = attribute(reader, "r");
            if (cellReference != null
                && cellReference.length() > MAX_CELL_REFERENCE_CHARACTERS) {
              throw new IOException("The XLSX worksheet contains an oversized cell reference.");
            }
            cellColumn = columnIndexFromCellReference(cellReference);
            if (cellColumn <= 0
                || rowIndexFromCellReference(cellReference) != rowNumber) {
              throw new IOException("The XLSX worksheet contains an invalid cell reference.");
            }
            cellType = attribute(reader, "t");
            cellValue = new StringBuilder();
            cellFormula = false;
          } else if (cellValue != null && "f".equals(elementName)) {
            cellFormula = true;
          } else if (cellValue != null
              && ("v".equals(elementName)
                  || ("t".equals(elementName) && "inlineStr".equals(cellType)))) {
            readingCellValue = true;
          }
        } else if ((event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA)
            && readingCellValue
            && cellValue != null) {
          if (cellValue.length() + reader.getTextLength() > MAX_CELL_CHARACTERS) {
            throw new IOException("The XLSX worksheet contains an oversized cell value.");
          }
          cellValue.append(reader.getText());
        } else if (event == XMLStreamConstants.END_ELEMENT
            && SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())) {
          String elementName = reader.getLocalName();
          if (cellValue != null
              && ("v".equals(elementName)
                  || ("t".equals(elementName) && "inlineStr".equals(cellType)))) {
            readingCellValue = false;
          } else if ("c".equals(elementName) && cells != null) {
            if (cellColumn > 0) {
              cells.add(
                  new ParsedCell(
                      cellColumn,
                      resolveCellValue(
                          cellValue == null ? "" : cellValue.toString(), cellType, sharedStrings),
                      cellType == null || cellType.isBlank() || "n".equals(cellType),
                      cellFormula));
              totalCells++;
            }
            cellColumn = -1;
            cellType = null;
            cellValue = null;
            cellFormula = false;
            readingCellValue = false;
          } else if ("row".equals(elementName) && cells != null) {
            if (rowNumber >= 0) {
              if (rows.size() >= MAX_ROWS) {
                throw new IOException("The XLSX worksheet contains too many rows.");
              }
              rows.add(new ParsedRow(rowNumber, List.copyOf(cells)));
            }
            rowNumber = -1;
            cells = null;
          }
        }
      }

      reader.close();
      if (!rootSeen) {
        throw new IOException("The XLSX worksheet is empty.");
      }
      return rows;
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse workbook worksheet XML.", ex);
    }
  }

  private static String resolveCellValue(
      String rawValue, String cellType, List<String> sharedStrings) throws IOException {
    String normalizedRawValue = rawValue == null ? "" : rawValue.trim();
    if ("b".equals(cellType)) {
      return switch (normalizedRawValue) {
        case "1" -> "TRUE";
        case "0" -> "FALSE";
        default -> normalizedRawValue;
      };
    }
    if (!"s".equals(cellType)) {
      return normalizedRawValue;
    }

    int stringIndex = parseIntSafe(normalizedRawValue);
    if (stringIndex < 0 || stringIndex >= sharedStrings.size()) {
      throw new IOException("The XLSX cell references a missing shared string.");
    }

    return sharedStrings.get(stringIndex);
  }

  private static List<String> parseSharedStrings(byte[] sharedStringBytes) throws IOException {
    List<String> sharedStrings = new ArrayList<>();
    XMLInputFactory factory = newXmlInputFactory();

    try {
      XMLStreamReader reader =
          factory.createXMLStreamReader(new ByteArrayInputStream(sharedStringBytes));
      boolean insideSharedString = false;
      boolean insideText = false;
      StringBuilder currentValue = null;
      boolean rootSeen = false;

      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.START_ELEMENT) {
          String elementName = reader.getLocalName();
          if (!rootSeen) {
            rootSeen = true;
            requireSpreadsheetRoot(reader, "sst", "shared strings");
          } else if (!SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())) {
            continue;
          } else if ("si".equals(elementName)) {
            insideSharedString = true;
            currentValue = new StringBuilder();
          } else if (insideSharedString && "t".equals(elementName)) {
            insideText = true;
          }
        } else if ((event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA)
            && insideText
            && currentValue != null) {
          if (currentValue.length() + reader.getTextLength() > MAX_CELL_CHARACTERS) {
            throw new IOException("The XLSX workbook contains an oversized shared string.");
          }
          currentValue.append(reader.getText());
        } else if (event == XMLStreamConstants.END_ELEMENT
            && SPREADSHEET_NAMESPACES.contains(reader.getNamespaceURI())) {
          String elementName = reader.getLocalName();
          if ("t".equals(elementName)) {
            insideText = false;
          } else if ("si".equals(elementName) && insideSharedString) {
            if (sharedStrings.size() >= MAX_SHARED_STRINGS) {
              throw new IOException("The XLSX workbook contains too many shared strings.");
            }
            sharedStrings.add(currentValue == null ? "" : currentValue.toString());
            insideSharedString = false;
            currentValue = null;
          }
        }
      }

      reader.close();
      if (!rootSeen) {
        throw new IOException("The XLSX shared strings part is empty.");
      }
      return sharedStrings;
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse workbook shared strings XML.", ex);
    }
  }

  private static XMLInputFactory newXmlInputFactory() {
    XMLInputFactory factory = XMLInputFactory.newFactory();
    factory.setProperty(XMLInputFactory.IS_NAMESPACE_AWARE, true);
    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
    factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
    factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
    factory.setXMLResolver(
        (XMLResolver)
            (publicID, systemID, baseURI, namespace) -> {
              throw new XMLStreamException("External entities are not allowed.");
            });
    return factory;
  }

  private static String attribute(XMLStreamReader reader, String localName) {
    for (int index = 0; index < reader.getAttributeCount(); index++) {
      if (localName.equals(reader.getAttributeLocalName(index))) {
        return reader.getAttributeValue(index);
      }
    }

    return null;
  }

  private static int columnIndexFromCellReference(String cellReference) {
    if (cellReference == null || cellReference.isBlank()) {
      return -1;
    }

    StringBuilder column = new StringBuilder();
    for (int index = 0; index < cellReference.length(); index++) {
      char character = cellReference.charAt(index);
      if (!Character.isLetter(character)) {
        break;
      }
      column.append(Character.toUpperCase(character));
    }

    return column.isEmpty() ? -1 : columnIndex(column.toString());
  }

  private static int rowIndexFromCellReference(String cellReference) {
    if (cellReference == null || cellReference.isBlank()) {
      return -1;
    }

    int rowStart = 0;
    while (rowStart < cellReference.length()
        && Character.isLetter(cellReference.charAt(rowStart))) {
      rowStart++;
    }
    if (rowStart == 0 || rowStart == cellReference.length()) {
      return -1;
    }
    for (int index = rowStart; index < cellReference.length(); index++) {
      if (!Character.isDigit(cellReference.charAt(index))) {
        return -1;
      }
    }
    return parseIntSafe(cellReference.substring(rowStart));
  }

  private static String columnToLetter(int index) {
    StringBuilder column = new StringBuilder();
    int current = index;
    while (current > 0) {
      int remainder = (current - 1) % 26;
      column.insert(0, (char) ('A' + remainder));
      current = (current - 1) / 26;
    }

    return column.toString();
  }

}

package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLResolver;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

final class RtmEmsLogAmvUploadPreviewAnalyzer {

  private static final String WORKSHEET_ENTRY_PREFIX = "xl/worksheets/sheet";
  private static final String XML_EXTENSION = ".xml";
  private static final String GRADE_HEADER = "GRADE";
  static final List<String> DEFAULT_PINE_SPECIES_CODES = List.of("PL", "PW", "PY");

  private RtmEmsLogAmvUploadPreviewAnalyzer() {}

  record Analysis(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> warnings,
      List<String> errors,
      List<UploadRow> rows) {}

  record UploadRow(
      String species, String grade, BigDecimal newValue, int sourceRow, int sourceColumn) {}

  record UploadParseResult(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> errors,
      List<String> warnings,
      List<UploadRow> rows) {}

  private record ParsedCell(int column, String value) {}
  private record ParsedRow(int rowNumber, List<ParsedCell> cells) {}
  private record ParsedWorkbook(List<ParsedRow> rows) {}

  static Analysis analyze(InputStream inputStream) throws IOException {
    UploadParseResult result = parseForUpload(inputStream);
    return new Analysis(
        result.dataRowCount(),
        result.numericCellCount(),
        result.headerDetected(),
        result.retrievalDate(),
        result.updateDate(),
        result.warnings(),
        result.errors(),
        result.rows());
  }

  static UploadParseResult parseForUpload(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.rows(), DEFAULT_PINE_SPECIES_CODES);
  }

  static UploadParseResult parseForUpload(
      InputStream inputStream, List<String> pineSpeciesCodes) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.rows(), pineSpeciesCodes);
  }

  private static ParsedWorkbook readWorkbook(InputStream inputStream) throws IOException {
    byte[] sheetBytes = null;
    byte[] sharedStringBytes = null;

    try (ZipInputStream zip = new ZipInputStream(inputStream)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        if ("xl/sharedStrings.xml".equals(entry.getName())) {
          sharedStringBytes = readAllBytes(zip);
        } else if (isWorksheetEntry(entry.getName()) && sheetBytes == null) {
          sheetBytes = readAllBytes(zip);
        }
      }
    }

    List<String> sharedStrings =
        sharedStringBytes == null ? List.of() : parseSharedStrings(sharedStringBytes);
    List<ParsedRow> rows =
        sheetBytes == null ? List.of() : parseSheetRows(sheetBytes, sharedStrings);

    return new ParsedWorkbook(rows);
  }

  private static UploadParseResult parseUploadSheet(
      List<ParsedRow> rows, List<String> pineSpeciesCodes) {
    int dataRows = 0;
    int numericCells = 0;
    boolean headerDetected = false;
    int headerRow = -1;
    LocalDate updateDate = parseUpdateDate(rows);
    LocalDate retrievalDate =
        updateDate == null ? null : updateDate.minusMonths(1).withDayOfMonth(1);
    Map<String, List<String>> speciesHeaderAliases = speciesHeaderAliases(pineSpeciesCodes);
    Map<Integer, List<String>> speciesByColumn = new HashMap<>();
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    List<UploadRow> uploadRows = new ArrayList<>();

    if (updateDate == null) {
      errors.add("The first row must include the update date.");
    }

    for (ParsedRow parsedRow : rows) {
      int rowNumber = parsedRow.rowNumber();
      List<ParsedCell> rowCells = parsedRow.cells();

      if (!headerDetected && rowHasHeader(rowCells, speciesHeaderAliases)) {
        headerDetected = true;
        headerRow = rowNumber;
        speciesByColumn = parseSpeciesHeaders(rowCells, rowNumber, warnings, speciesHeaderAliases);

        if (speciesByColumn.isEmpty()) {
          errors.add("Header row %d does not include recognized species columns.".formatted(rowNumber));
        }
        continue;
      }

      if (rowNumber <= headerRow || headerRow < 0 || !rowHasAnyData(rowCells)) {
        continue;
      }

      String grade = "";
      boolean foundGrade = false;
      boolean foundNumericValue = false;

      for (ParsedCell cell : rowCells) {
        if (cell.column() == 1) {
          grade = cell.value().trim();
          foundGrade = true;
          break;
        }
      }

      if (!foundGrade || grade.isBlank()) {
        warnings.add("Row %d was skipped because no grade value was found.".formatted(rowNumber));
        continue;
      }

      if (!isUploadableGrade(grade)) {
        if (!isSummaryGrade(grade)) {
          warnings.add(
              "Row %d grade '%s' was skipped because it is not an importable grade row."
                  .formatted(rowNumber, grade));
        }
        continue;
      }

      dataRows++;
      for (ParsedCell cell : rowCells) {
        int column = cell.column();
        String value = cell.value();

        if (column <= 1 || value.isBlank()) {
          continue;
        }

        List<String> speciesCodes = speciesByColumn.get(column);
        if (speciesCodes == null || speciesCodes.isEmpty()) {
          warnings.add(
              "Row %d includes unmapped species column %s; value '%s' was skipped."
                  .formatted(rowNumber, columnToLetter(column), normalizeStringValue(value)));
          continue;
        }

        if (isNumeric(value)) {
          BigDecimal newValue = new BigDecimal(normalizeNumericValue(value));
          for (String species : speciesCodes) {
            uploadRows.add(new UploadRow(species, grade, newValue, rowNumber, column));
          }
          numericCells++;
          foundNumericValue = true;
        } else {
          warnings.add(
              "Row %d has non-numeric value '%s' at column %s; this value was skipped."
                  .formatted(rowNumber, normalizeStringValue(value), columnToLetter(column)));
        }
      }

      if (!foundNumericValue) {
        warnings.add(
            "Row %d grade '%s' had no parseable AMV values and was skipped."
                .formatted(rowNumber, grade));
      }
    }

    if (!headerDetected) {
      errors.add("The template header was not recognized as RTM EMS AMV data.");
    }

    return new UploadParseResult(
        dataRows, numericCells, headerDetected, retrievalDate, updateDate, errors, warnings, uploadRows);
  }

  private static Map<Integer, List<String>> parseSpeciesHeaders(
      List<ParsedCell> cells,
      int rowNumber,
      List<String> warnings,
      Map<String, List<String>> speciesHeaderAliases) {
    Map<Integer, List<String>> speciesByColumn = new HashMap<>();
    Set<String> observedSpecies = new HashSet<>();

    for (ParsedCell cell : cells) {
      int column = cell.column();
      if (column <= 1) {
        continue;
      }

      String value = cell.value();
      if (value.isBlank()) {
        continue;
      }

      String normalizedValue = normalizeHeader(value);
      List<String> speciesCodes = resolveSpeciesCodes(value, speciesHeaderAliases);
      if (speciesCodes.isEmpty()) {
        warnings.add(
            "Header row %d contains unmapped species header '%s' at column %s."
                .formatted(rowNumber, normalizeStringValue(value), columnToLetter(column)));
        continue;
      }

      String speciesKey = String.join(",", speciesCodes);
      if (observedSpecies.contains(speciesKey)) {
        warnings.add(
            "Header row %d contains a duplicate species column for '%s'."
                .formatted(rowNumber, normalizedValue));
      }

      speciesByColumn.put(column, speciesCodes);
      observedSpecies.add(speciesKey);
    }

    return speciesByColumn;
  }

  private static boolean rowHasHeader(
      List<ParsedCell> cells, Map<String, List<String>> speciesHeaderAliases) {
    for (ParsedCell cell : cells) {
      if (containsExpectedHeader(cell.value(), speciesHeaderAliases)) {
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

  private static boolean containsExpectedHeader(
      String value, Map<String, List<String>> speciesHeaderAliases) {
    String normalized = normalizeHeader(value);
    return GRADE_HEADER.equals(normalized) || !resolveSpeciesCodes(value, speciesHeaderAliases).isEmpty();
  }

  private static boolean isUploadableGrade(String grade) {
    String normalized = trimToNull(grade);
    if (normalized == null) {
      return false;
    }

    String upperGrade = normalized.toUpperCase(Locale.CANADA);
    return upperGrade.matches("[A-Z]") || upperGrade.matches("[1-6]");
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

  private static LocalDate parseUpdateDate(List<ParsedRow> rows) {
    for (ParsedRow row : rows) {
      if (row.rowNumber() != 1) {
        continue;
      }
      for (ParsedCell cell : row.cells()) {
        LocalDate parsedDate = parseWorkbookDate(cell.value());
        if (parsedDate != null) {
          return parsedDate.withDayOfMonth(1);
        }
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

  private static List<String> resolveSpeciesCodes(
      String value, Map<String, List<String>> speciesHeaderAliases) {
    String normalized = normalizeHeader(value);
    if (normalized.isBlank() || GRADE_HEADER.equals(normalized)) {
      return List.of();
    }

    List<String> alias = speciesHeaderAliases.get(normalized);
    if (alias != null) {
      return alias;
    }

    if (normalized.matches("[A-Z0-9]{1,3}")) {
      return List.of(normalized);
    }

    return List.of();
  }

  private static String normalizeHeader(String value) {
    return normalizeStringValue(value)
        .toUpperCase(Locale.CANADA)
        .replace("(CODE)", "")
        .replace("*", "")
        .strip();
  }

  private static Map<String, List<String>> speciesHeaderAliases(List<String> pineSpeciesCodes) {
    Map<String, List<String>> aliases = new LinkedHashMap<>();
    List<String> normalizedPineSpeciesCodes = normalizePineSpeciesCodes(pineSpeciesCodes);
    aliases.put("BA", List.of("BA"));
    aliases.put("BALSAM", List.of("BA"));
    aliases.put("HE", List.of("HE"));
    aliases.put("HEMLOCK", List.of("HE"));
    aliases.put("CE", List.of("CE"));
    aliases.put("CEDAR", List.of("CE"));
    aliases.put("CY", List.of("CY"));
    aliases.put("CYPRESS", List.of("CY"));
    aliases.put("FI", List.of("FI"));
    aliases.put("FIR", List.of("FI"));
    aliases.put("SP", List.of("SP"));
    aliases.put("SPRUCE", List.of("SP"));
    aliases.put("P", normalizedPineSpeciesCodes);
    aliases.put("PINE", normalizedPineSpeciesCodes);
    for (String pineCode : normalizedPineSpeciesCodes) {
      aliases.put(pineCode, normalizedPineSpeciesCodes);
    }
    return aliases;
  }

  private static List<String> normalizePineSpeciesCodes(List<String> pineSpeciesCodes) {
    List<String> normalized =
        pineSpeciesCodes == null
            ? List.of()
            : pineSpeciesCodes.stream()
                .map(RtmEmsLogAmvUploadPreviewAnalyzer::normalizeHeader)
                .filter(code -> code.matches("[A-Z0-9]{1,3}"))
                .distinct()
                .toList();

    return normalized.isEmpty() ? DEFAULT_PINE_SPECIES_CODES : normalized;
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
    return value.replace(",", "").strip();
  }

  private static boolean isWorksheetEntry(String entryName) {
    if (entryName == null
        || !entryName.startsWith(WORKSHEET_ENTRY_PREFIX)
        || !entryName.endsWith(XML_EXTENSION)) {
      return false;
    }

    String sheetNumber =
        entryName.substring(
            WORKSHEET_ENTRY_PREFIX.length(), entryName.length() - XML_EXTENSION.length());
    if (sheetNumber.isBlank()) {
      return false;
    }

    for (int index = 0; index < sheetNumber.length(); index++) {
      if (!Character.isDigit(sheetNumber.charAt(index))) {
        return false;
      }
    }

    return true;
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
      boolean readingCellValue = false;

      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.START_ELEMENT) {
          String elementName = reader.getLocalName();
          if ("row".equals(elementName)) {
            rowNumber = parseIntSafe(attribute(reader, "r"));
            cells = new ArrayList<>();
          } else if (cells != null && "c".equals(elementName)) {
            cellColumn = columnIndexFromCellReference(attribute(reader, "r"));
            cellType = attribute(reader, "t");
            cellValue = new StringBuilder();
          } else if (cellValue != null
              && ("v".equals(elementName)
                  || ("t".equals(elementName) && "inlineStr".equals(cellType)))) {
            readingCellValue = true;
          }
        } else if ((event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA)
            && readingCellValue
            && cellValue != null) {
          cellValue.append(reader.getText());
        } else if (event == XMLStreamConstants.END_ELEMENT) {
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
                          cellValue == null ? "" : cellValue.toString(), cellType, sharedStrings)));
            }
            cellColumn = -1;
            cellType = null;
            cellValue = null;
            readingCellValue = false;
          } else if ("row".equals(elementName) && cells != null) {
            if (rowNumber >= 0) {
              rows.add(new ParsedRow(rowNumber, List.copyOf(cells)));
            }
            rowNumber = -1;
            cells = null;
          }
        }
      }

      reader.close();
      return rows;
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse workbook worksheet XML.", ex);
    }
  }

  private static String resolveCellValue(
      String rawValue, String cellType, List<String> sharedStrings) {
    String normalizedRawValue = rawValue == null ? "" : rawValue.trim();
    if (!"s".equals(cellType)) {
      return normalizedRawValue;
    }

    int stringIndex = parseIntSafe(normalizedRawValue);
    if (stringIndex < 0 || stringIndex >= sharedStrings.size()) {
      return "";
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

      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.START_ELEMENT) {
          String elementName = reader.getLocalName();
          if ("si".equals(elementName)) {
            insideSharedString = true;
            currentValue = new StringBuilder();
          } else if (insideSharedString && "t".equals(elementName)) {
            insideText = true;
          }
        } else if ((event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA)
            && insideText
            && currentValue != null) {
          currentValue.append(reader.getText());
        } else if (event == XMLStreamConstants.END_ELEMENT) {
          String elementName = reader.getLocalName();
          if ("t".equals(elementName)) {
            insideText = false;
          } else if ("si".equals(elementName) && insideSharedString) {
            sharedStrings.add(currentValue == null ? "" : currentValue.toString());
            insideSharedString = false;
            currentValue = null;
          }
        }
      }

      reader.close();
      return sharedStrings;
    } catch (XMLStreamException ex) {
      throw new IOException("Could not parse workbook shared strings XML.", ex);
    }
  }

  private static XMLInputFactory newXmlInputFactory() {
    XMLInputFactory factory = XMLInputFactory.newFactory();
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

  private static byte[] readAllBytes(InputStream inputStream) throws IOException {
    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
    byte[] chunk = new byte[4096];
    int read;

    while ((read = inputStream.read(chunk)) >= 0) {
      buffer.write(chunk, 0, read);
    }

    return buffer.toByteArray();
  }
}

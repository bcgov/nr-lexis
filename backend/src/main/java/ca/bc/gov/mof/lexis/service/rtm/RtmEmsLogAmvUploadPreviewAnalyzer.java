package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

final class RtmEmsLogAmvUploadPreviewAnalyzer {

  private static final String WORKSHEET_ENTRY_PREFIX = "xl/worksheets/sheet";
  private static final String XML_EXTENSION = ".xml";
  private static final Set<String> EXPECTED_TEMPLATE_HEADERS = new HashSet<>(
          Arrays.asList(
          "GRADE",
          "BALSAM",
          "HEMLOCK",
          "CEDAR",
          "CYPRESS",
          "FIR",
          "SPRUCE",
          "PINE**"));

  private static final String GRADE_HEADER = "GRADE";

  private RtmEmsLogAmvUploadPreviewAnalyzer() {}

  record Analysis(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      List<String> warnings,
      List<String> errors) {}

  record UploadRow(String species, String grade, BigDecimal newValue, int sourceRow, int sourceColumn) {}

  record UploadParseResult(
      int dataRowCount,
      int numericCellCount,
      boolean headerDetected,
      List<String> errors,
      List<String> warnings,
      List<UploadRow> rows) {}

  private record ParsedCell(int column, String value) {}
  private record ParsedRow(int rowNumber, List<ParsedCell> cells) {}

  static Analysis analyze(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return analyzeSheet(parsedWorkbook.rows());
  }

  static UploadParseResult parseForUpload(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.rows());
  }

  private static ParsedWorkbook readWorkbook(InputStream inputStream) throws IOException {
    byte[] sheetBytes = null;
    byte[] sharedStringBytes = null;

    try (ZipInputStream zip = new ZipInputStream(inputStream)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        if ("xl/sharedStrings.xml".equals(entry.getName())) {
          sharedStringBytes = readAllBytes(zip);
        } else if (isWorksheetEntry(entry.getName())) {
          if (sheetBytes == null) {
            sheetBytes = readAllBytes(zip);
          }
        }
      }
    }

    List<String> sharedStrings =
        sharedStringBytes == null
            ? Collections.emptyList()
            : parseSharedStrings(sharedStringBytes);
    List<ParsedRow> rows =
        sheetBytes == null ? Collections.emptyList() : parseSheetRows(sheetBytes, sharedStrings);

    return new ParsedWorkbook(rows);
  }

  private static Analysis analyzeSheet(List<ParsedRow> rows) {
    int dataRows = 0;
    int numericCells = 0;
    boolean foundHeader = false;
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();

    for (ParsedRow row : rows) {
      int rowNumber = row.rowNumber();
      if (rowNumber <= 1) {
        if (rowNumber == 1 && rowHasHeader(row.cells())) {
          foundHeader = true;
        }
        continue;
      }

      if (rowHasAnyData(row.cells())) {
        dataRows++;
        numericCells += countNumericCells(row.cells());
      }
    }

    if (!foundHeader) {
      errors.add("The template header was not recognized as RTM EMS AMV data.");
    }

    return new Analysis(dataRows, numericCells, foundHeader, warnings, errors);
  }

  private static UploadParseResult parseUploadSheet(List<ParsedRow> rows) {
    int dataRows = 0;
    int numericCells = 0;
    boolean headerDetected = false;
    int headerRow = -1;
    Map<Integer, String> speciesByColumn = new HashMap<>();
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    List<UploadRow> uploadRows = new ArrayList<>();
    for (ParsedRow parsedRow : rows) {
      int rowNumber = parsedRow.rowNumber();
      List<ParsedCell> rowCells = parsedRow.cells();

      if (!headerDetected && rowHasHeader(rowCells)) {
        headerDetected = true;
        headerRow = rowNumber;
        List<String> parsedHeaderWarnings = new ArrayList<>();
        speciesByColumn = parseSpeciesHeaders(rowCells, rowNumber, parsedHeaderWarnings);

        if (speciesByColumn.isEmpty()) {
          errors.add("Header row %d does not include recognized species columns.".formatted(rowNumber));
        }
        warnings.addAll(parsedHeaderWarnings);
        continue;
      }

      if (rowNumber <= headerRow || headerRow < 0 || !rowHasAnyData(rowCells)) {
        continue;
      }

      dataRows++;

      String grade = "";
      boolean foundGrade = false;
      boolean foundNumericValue = false;

      for (ParsedCell cell : rowCells) {
        int column = cell.column();
        String value = cell.value();
        if (column == 1) {
          grade = value.trim();
          foundGrade = true;
          continue;
        }
      }

      if (!foundGrade || grade.isBlank()) {
        warnings.add(
            "Row %d was skipped because no grade value was found.".formatted(rowNumber));
        continue;
      }

      if (!isUploadableGrade(grade)) {
        warnings.add(
            "Row %d grade '%s' was skipped because it is not an importable grade row.".formatted(
                rowNumber,
                grade));
        continue;
      }

      for (ParsedCell cell : rowCells) {
        int column = cell.column();
        String value = cell.value();

        if (column <= 1 || value.isBlank()) {
          continue;
        }

        String species = speciesByColumn.get(column);
        if (species == null) {
          warnings.add(
              "Row %d includes unmapped species column %s; value '%s' was skipped.".formatted(
                  rowNumber,
                  columnToLetter(column),
                  normalizeStringValue(value)));
          continue;
        }

        if (isNumeric(value)) {
          uploadRows.add(
              new UploadRow(
                  species,
                  grade,
                  new BigDecimal(normalizeNumericValue(value)),
                  rowNumber,
                  column));
          numericCells++;
          foundNumericValue = true;
        } else {
          warnings.add(
              "Row %d has non-numeric value '%s' for species '%s' at column %s; this value was skipped.".formatted(
                  rowNumber,
                  normalizeStringValue(value),
                  species,
                  columnToLetter(column)));
        }
      }

      if (!foundNumericValue) {
        warnings.add(
            "Row %d grade '%s' had no parseable AMV values and was skipped.".formatted(
                rowNumber, grade));
      }
    }

    return new UploadParseResult(
        dataRows, numericCells, headerDetected, errors, warnings, uploadRows);
  }

  private static Map<Integer, String> parseSpeciesHeaders(
      List<ParsedCell> cells,
      int rowNumber,
      List<String> warnings) {
    Map<Integer, String> speciesByColumn = new HashMap<>();
    Set<String> observedSpecies = new HashSet<>();

    for (ParsedCell cell : cells) {
      int column = cell.column();
      if (column <= 1) {
        continue;
      }

      String value = cell.value();
      if (!value.isBlank()) {
        String normalizedValue = value.trim();
        if (observedSpecies.contains(normalizedValue.toUpperCase())) {
          warnings.add(
              "Header row %d contains a duplicate species column for '%s'.".formatted(
                  rowNumber,
                  normalizedValue));
        }

        speciesByColumn.put(column, value);
        observedSpecies.add(normalizedValue.toUpperCase());
      }
    }

    Set<String> expectedHeaders = new HashSet<>(EXPECTED_TEMPLATE_HEADERS);
    expectedHeaders.remove("GRADE");
    if (!speciesByColumn.isEmpty()) {
      Set<String> present = new HashSet<>();
      for (String species : speciesByColumn.values()) {
        present.add(species.trim().toUpperCase());
      }

      expectedHeaders.removeAll(present);
      if (!expectedHeaders.isEmpty()) {
        warnings.add(
            "Header row %d does not include all expected species columns. Missing: %s".formatted(
                rowNumber, String.join(", ", expectedHeaders)));
      }
    }

    return speciesByColumn;
  }

  private static boolean rowHasHeader(List<ParsedCell> cells) {
    for (ParsedCell cell : cells) {
      if (containsExpectedHeader(cell.value())) {
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

  private static int countNumericCells(List<ParsedCell> cells) {
    int count = 0;
    for (ParsedCell cell : cells) {
      if (isNumeric(cell.value())) {
        count++;
      }
    }

    return count;
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

  private static boolean containsExpectedHeader(String value) {
    return EXPECTED_TEMPLATE_HEADERS.stream().anyMatch(
        expected -> expected.equalsIgnoreCase(value.trim()));
  }

  private static boolean isUploadableGrade(String grade) {
    String normalized = trimToNull(grade);
    if (normalized == null) {
      return false;
    }

    String upperGrade = normalized.toUpperCase();
    return !GRADE_HEADER.equalsIgnoreCase(normalized) && !upperGrade.equals("AVERAGE") && !upperGrade.startsWith("GRAND TOTAL");
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
                      resolveCellValue(cellValue == null ? "" : cellValue.toString(), cellType, sharedStrings)));
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
    setXmlProperty(factory, XMLInputFactory.SUPPORT_DTD, false);
    setXmlProperty(factory, XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
    return factory;
  }

  private static void setXmlProperty(XMLInputFactory factory, String property, Object value) {
    try {
      factory.setProperty(property, value);
    } catch (IllegalArgumentException ex) {
      // Some StAX implementations do not expose all hardening flags.
    }
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

  private record ParsedWorkbook(List<ParsedRow> rows) {}
}

package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class RtmEmsLogAmvUploadPreviewAnalyzer {

  private static final Pattern ROW_PATTERN =
      Pattern.compile("<row[^>]*\\br=\"(\\d+)\"[^>]*>(.*?)</row>", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
  private static final Pattern CELL_PATTERN =
      Pattern.compile(
          "(<c[^>]*\\sr=\"([A-Z]{1,3})(\\d+)\"[^>]*>.*?</c>)",
          Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
  private static final Pattern VALUE_PATTERN = Pattern.compile("<v>(.*?)</v>", Pattern.DOTALL);
  private static final Pattern SHARED_STRING_PATTERN =
      Pattern.compile("<si><t[^>]*>(.*?)</t></si>", Pattern.DOTALL);
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

  static Analysis analyze(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return analyzeSheet(parsedWorkbook.sheetXml(), parsedWorkbook.sharedStrings());
  }

  static UploadParseResult parseForUpload(InputStream inputStream) throws IOException {
    ParsedWorkbook parsedWorkbook = readWorkbook(inputStream);
    return parseUploadSheet(parsedWorkbook.sheetXml(), parsedWorkbook.sharedStrings());
  }

  private static ParsedWorkbook readWorkbook(InputStream inputStream) throws IOException {
    byte[] sheetBytes = null;
    byte[] sharedStringBytes = null;

    try (ZipInputStream zip = new ZipInputStream(inputStream)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        if ("xl/sharedStrings.xml".equals(entry.getName())) {
          sharedStringBytes = readAllBytes(zip);
        } else if (entry.getName().matches("xl/worksheets/sheet\\d+\\.xml")) {
          if (sheetBytes == null) {
            sheetBytes = readAllBytes(zip);
          }
        }
      }
    }

    if (sheetBytes == null) {
      return new ParsedWorkbook("", Collections.emptyList());
    }

    List<String> sharedStrings =
        sharedStringBytes == null
            ? Collections.emptyList()
            : parseSharedStrings(new String(sharedStringBytes, StandardCharsets.UTF_8));

    return new ParsedWorkbook(new String(sheetBytes, StandardCharsets.UTF_8), sharedStrings);
  }

  private static Analysis analyzeSheet(String sheetXml, List<String> sharedStrings) {
    Matcher rowMatcher = ROW_PATTERN.matcher(sheetXml);

    int dataRows = 0;
    int numericCells = 0;
    boolean foundHeader = false;
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();

    while (rowMatcher.find()) {
      int rowNumber = parseIntSafe(rowMatcher.group(1));
      if (rowNumber <= 1) {
        if (rowNumber == 1 && rowHasHeader(rowMatcher.group(2), sharedStrings)) {
          foundHeader = true;
        }
        continue;
      }

      String rowXml = rowMatcher.group(2);
      if (rowHasAnyData(rowXml, sharedStrings)) {
        dataRows++;
        numericCells += countNumericCells(rowXml, sharedStrings);
      }
    }

    if (!foundHeader) {
      errors.add("The template header was not recognized as RTM EMS AMV data.");
    }

    return new Analysis(dataRows, numericCells, foundHeader, warnings, errors);
  }

  private static UploadParseResult parseUploadSheet(String sheetXml, List<String> sharedStrings) {
    Matcher rowMatcher = ROW_PATTERN.matcher(sheetXml);

    int dataRows = 0;
    int numericCells = 0;
    boolean headerDetected = false;
    int headerRow = -1;
    Map<Integer, String> speciesByColumn = new HashMap<>();
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    List<UploadRow> rows = new ArrayList<>();
    while (rowMatcher.find()) {
      int rowNumber = parseIntSafe(rowMatcher.group(1));
      String rowXml = rowMatcher.group(2);

      if (!headerDetected && rowHasHeader(rowXml, sharedStrings)) {
        headerDetected = true;
        headerRow = rowNumber;
        List<String> parsedHeaderWarnings = new ArrayList<>();
        speciesByColumn = parseSpeciesHeaders(rowXml, sharedStrings, rowNumber, parsedHeaderWarnings);

        if (speciesByColumn.isEmpty()) {
          errors.add("Header row %d does not include recognized species columns.".formatted(rowNumber));
        }
        warnings.addAll(parsedHeaderWarnings);
        continue;
      }

      if (rowNumber <= headerRow || headerRow < 0 || !rowHasAnyData(rowXml, sharedStrings)) {
        continue;
      }

      dataRows++;

      String grade = "";
      List<ParsedCell> rowCells = new ArrayList<>();
      Matcher cellMatcher = CELL_PATTERN.matcher(rowXml);
      boolean foundGrade = false;
      boolean foundNumericValue = false;

      while (cellMatcher.find()) {
        int column = columnIndex(cellMatcher.group(2));
        String value = extractCellValue(cellMatcher.group(1), sharedStrings);
        rowCells.add(new ParsedCell(column, value));
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
          rows.add(
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
        dataRows, numericCells, headerDetected, errors, warnings, rows);
  }

  private static Map<Integer, String> parseSpeciesHeaders(
      String rowXml,
      List<String> sharedStrings,
      int rowNumber,
      List<String> warnings) {
    Map<Integer, String> speciesByColumn = new HashMap<>();
    Set<String> observedSpecies = new HashSet<>();

    Matcher cellMatcher = CELL_PATTERN.matcher(rowXml);
    while (cellMatcher.find()) {
      int column = columnIndex(cellMatcher.group(2));
      if (column <= 1) {
        continue;
      }

      String value = extractCellValue(cellMatcher.group(1), sharedStrings);
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

  private static boolean rowHasHeader(String rowXml, List<String> sharedStrings) {
    Matcher cellMatcher = CELL_PATTERN.matcher(rowXml);
    while (cellMatcher.find()) {
      String value = extractCellValue(cellMatcher.group(1), sharedStrings);
      if (containsExpectedHeader(value)) {
        return true;
      }
    }

    return false;
  }

  private static boolean rowHasAnyData(String rowXml, List<String> sharedStrings) {
    Matcher cellMatcher = CELL_PATTERN.matcher(rowXml);
    while (cellMatcher.find()) {
      String value = extractCellValue(cellMatcher.group(1), sharedStrings);
      if (!value.isBlank()) {
        return true;
      }
    }

    return false;
  }

  private static int countNumericCells(String rowXml, List<String> sharedStrings) {
    int count = 0;
    Matcher cellMatcher = CELL_PATTERN.matcher(rowXml);
    while (cellMatcher.find()) {
      String value = extractCellValue(cellMatcher.group(1), sharedStrings);
      if (isNumeric(value)) {
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

  private static String extractCellValue(String cellXml, List<String> sharedStrings) {
    Matcher valueMatcher = VALUE_PATTERN.matcher(cellXml);
    if (!valueMatcher.find()) {
      return "";
    }

    String rawValue = valueMatcher.group(1).trim();
    if (!cellXml.contains("t=\"s\"")) {
      return rawValue;
    }

    int stringIndex = parseIntSafe(rawValue);
    if (stringIndex < 0 || stringIndex >= sharedStrings.size()) {
      return "";
    }

    return sharedStrings.get(stringIndex);
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

  private static List<String> parseSharedStrings(String sharedStringsXml) {
    List<String> sharedStrings = new ArrayList<>();
    Matcher matcher = SHARED_STRING_PATTERN.matcher(sharedStringsXml);
    while (matcher.find()) {
      sharedStrings.add(matcher.group(1));
    }

    return sharedStrings;
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

  private record ParsedWorkbook(String sheetXml, List<String> sharedStrings) {}
}

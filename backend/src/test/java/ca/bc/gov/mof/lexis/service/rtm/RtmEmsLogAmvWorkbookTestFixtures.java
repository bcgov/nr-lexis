package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class RtmEmsLogAmvWorkbookTestFixtures {

  private RtmEmsLogAmvWorkbookTestFixtures() {}

  static byte[] matrixWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(
                3,
                text("A3", "GRADE"),
                text("B3", "BA"),
                text("C3", "HE"),
                text("D3", "WH"),
                text("E3", "LO"),
                text("F3", "YE")),
            row(
                4,
                text("A4", "A"),
                number("B4", "10.25"),
                number("C4", "20.50"),
                number("D4", "30.75"),
                number("E4", "31.75"),
                number("F4", "32.75")),
            row(5, text("A5", "1"), number("B5", "1.25"))));
  }

  static byte[] matrixWorkbookWithMetadataRows() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(
                4,
                text("A4", "GRADE"),
                text("B4", "BA"),
                text("C4", "HE"),
                text("D4", "WH"),
                text("E4", "LO"),
                text("F4", "YE")),
            row(
                5,
                text("A5", "A"),
                number("B5", "10.25"),
                number("C5", "20.50"),
                number("D5", "30.75"),
                number("E5", "31.75"),
                number("F5", "32.75")),
            row(6, text("A6", "1"), number("B6", "1.25"))));
  }

  static byte[] singleBalsamWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "10.25"))));
  }

  static byte[] screenSingleBalsamWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "B"), number("B4", "10.25"))));
  }

  static byte[] screenGradeAAndBWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "99.99")),
            row(5, text("A5", "B"), number("B5", "10.25"))));
  }

  static byte[] futureSingleBalsamWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-08-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "10.25"))));
  }

  static byte[] midMonthSingleBalsamWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-20")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "10.25"))));
  }

  static byte[] optionalCedarGradeWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "CE")),
            row(4, text("A4", "C"), number("B4", "11.11"))));
  }

  static byte[] precisionErrorsWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "HE"), text("C3", "CE")),
            row(
                4,
                text("A4", "J"),
                number("B4", "10.123"),
                number("C4", "20.456"))));
  }

  static byte[] singleWhitePineWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "WH")),
            row(4, text("A4", "A"), number("B4", "30.75"))));
  }

  static byte[] ambiguousPineWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "PINE")),
            row(4, text("A4", "A"), number("B4", "30.75"))));
  }

  static byte[] screenPineWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")),
            row(3, text("A3", "GRADE"), text("B3", "PINE")),
            row(4, text("A4", "B"), number("B4", "30.75"))));
  }

  static byte[] missingGrowthWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "10.25"))));
  }

  static byte[] invalidGrowthWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")),
            row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "X")),
            row(3, text("A3", "GRADE"), text("B3", "BA")),
            row(4, text("A4", "A"), number("B4", "10.25"))));
  }

  static byte[] invalidWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "not a date")),
            row(2, text("A2", "not a template"), text("B2", "still not a template"))));
  }

  static byte[] fullGradeWorkbookWithBlankRow() throws IOException {
    List<String> rows = new ArrayList<>();
    rows.add(row(1, text("A1", "Update Date (YYYY-MM-01)"), text("B1", "2026-06-01")));
    rows.add(row(2, text("A2", "Growth Indicator (O or S)"), text("B2", "O")));
    rows.add(row(3, text("A3", "GRADE"), text("B3", "BA")));

    int rowNumber = 4;
    for (char grade = 'A'; grade <= 'Z'; grade++) {
      rows.add(
          row(
              rowNumber,
              text("A" + rowNumber, String.valueOf(grade)),
              number("B" + rowNumber, "10")));
      rowNumber++;
    }
    for (int grade = 1; grade <= 6; grade++) {
      rows.add(
          row(
              rowNumber,
              text("A" + rowNumber, String.valueOf(grade)),
              number("B" + rowNumber, "20")));
      rowNumber++;
    }
    rows.add(row(rowNumber, text("A" + rowNumber, "BLANK"), number("B" + rowNumber, "30")));

    return workbook(rows);
  }

  private static String row(int number, String... cells) {
    return "<row r=\"" + number + "\">" + String.join("", cells) + "</row>";
  }

  private static String text(String ref, String value) {
    return "<c r=\""
        + ref
        + "\" t=\"inlineStr\"><is><t>"
        + escape(value)
        + "</t></is></c>";
  }

  private static String number(String ref, String value) {
    return "<c r=\"" + ref + "\"><v>" + value + "</v></c>";
  }

  private static byte[] workbook(List<String> rows) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(output, StandardCharsets.UTF_8)) {
      write(
          zip,
          "[Content_Types].xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
            <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
          </Types>
          """);
      write(
          zip,
          "_rels/.rels",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
          </Relationships>
          """);
      write(
          zip,
          "xl/workbook.xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <sheets><sheet name="Template" sheetId="1" r:id="rId1"/></sheets>
          </workbook>
          """);
      write(
          zip,
          "xl/_rels/workbook.xml.rels",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
          </Relationships>
          """);
      write(
          zip,
          "xl/worksheets/sheet1.xml",
          """
          <?xml version="1.0" encoding="UTF-8"?>
          <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
            <sheetData>
          """
              + String.join("", rows)
              + """
            </sheetData>
          </worksheet>
          """);
    }
    return output.toByteArray();
  }

  private static void write(ZipOutputStream zip, String path, String content) throws IOException {
    zip.putNextEntry(new ZipEntry(path));
    zip.write(content.stripLeading().getBytes(StandardCharsets.UTF_8));
    zip.closeEntry();
  }

  private static String escape(String value) {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;");
  }
}

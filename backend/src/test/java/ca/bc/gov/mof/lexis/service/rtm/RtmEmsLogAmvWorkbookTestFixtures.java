package ca.bc.gov.mof.lexis.service.rtm;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class RtmEmsLogAmvWorkbookTestFixtures {

  private RtmEmsLogAmvWorkbookTestFixtures() {}

  static byte[] matrixWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "Date:first day of the month/year"), text("B1", "202607")),
            row(2, text("A2", "GRADE"), text("B2", "BA"), text("C2", "HE"), text("D2", "PINE**")),
            row(3, text("A3", "A"), number("B3", "10.25"), number("C3", "20.50"), number("D3", "30.75")),
            row(4, text("A4", "1"), number("B4", "1.25"))));
  }

  static byte[] invalidWorkbook() throws IOException {
    return workbook(
        List.of(
            row(1, text("A1", "not a date")),
            row(2, text("A2", "not a template"), text("B2", "still not a template"))));
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

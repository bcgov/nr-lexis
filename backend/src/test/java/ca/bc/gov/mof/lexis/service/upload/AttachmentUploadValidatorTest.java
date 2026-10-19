package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.upload.AttachmentUploadValidator.ValidationResult;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;
import javax.imageio.ImageIO;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@DisplayName("Unit Test | AttachmentUploadValidator")
class AttachmentUploadValidatorTest {

  private final AttachmentUploadValidator validator = new AttachmentUploadValidator();

  @ParameterizedTest(name = "accepts active legacy format {0}")
  @MethodSource("activeLegacyFiles")
  void shouldPreserveEveryActiveOracleFileType(String fileName, byte[] content) {
    ValidationResult result = validator.validate(file(fileName, content), "Legacy attachment");

    assertThat(result.accepted()).isTrue();
    assertThat(result.fileTypeCode())
        .isEqualTo(fileName.substring(fileName.lastIndexOf('.') + 1).toUpperCase());
  }

  @Test
  void shouldAcceptExistingRealWorkbookFixture() throws IOException {
    byte[] workbook;
    try (InputStream input =
        getClass()
            .getResourceAsStream("/rtm-upload-samples/data_upload_template-success.xlsx")) {
      assertThat(input).isNotNull();
      workbook = input.readAllBytes();
    }

    ValidationResult result = validator.validate(file("legacy-template.xlsx", workbook), null);

    assertThat(result.accepted()).isTrue();
  }

  @Test
  void shouldAcceptExactOracleMetadataLimitWithoutNormalizingIt() {
    String fileName = "a".repeat(246) + ".PDF";
    String description = "line one\r\n\t" + "d".repeat(239);

    assertThat(fileName).hasSize(250);
    assertThat(description).hasSize(250);
    assertThat(validator.validate(file(fileName, validPdf()), description).accepted()).isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "Permit 1:2 signed.pdf",
        "Joe's report (final) #2 & more, v1.0.pdf",
        "a name with spaces.pdf"
      })
  void shouldAcceptColonsAndOtherPrintableAsciiInFileNames(String fileName) {
    assertThat(validator.validate(file(fileName, validPdf()), "Signed: 10:30").accepted()).isTrue();
  }

  @ParameterizedTest
  @MethodSource("unsafeFileNames")
  void shouldRejectUnsafeFileNames(String fileName) {
    ValidationResult result = validator.validate(file(fileName, validPdf()), "description");

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).containsAnyOf("usable", "US-ASCII", "path");
  }

  @ParameterizedTest
  @MethodSource("unsafeDescriptions")
  void shouldRejectUnsafeDescriptions(String description) {
    ValidationResult result = validator.validate(file("application.pdf", validPdf()), description);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).startsWith("Descriptions must");
  }

  @Test
  void shouldRejectRenamedExecutableAsPdfAndText() {
    byte[] executable = new byte[] {'M', 'Z', 0, 0, 'b', 'i', 'n', 'a', 'r', 'y'};

    assertThat(validator.validate(file("renamed.pdf", executable), null).accepted()).isFalse();
    assertThat(validator.validate(file("renamed.txt", executable), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectOleWordAndExcelExtensionMismatch() throws IOException {
    assertThat(validator.validate(file("word.xls", oleDocument("WordDocument")), null).accepted())
        .isFalse();
    assertThat(validator.validate(file("sheet.doc", oleDocument("Workbook")), null).accepted())
        .isFalse();
  }

  @Test
  void shouldRejectMacroAndEmbeddedObjectStoragesInLegacyOfficeFiles() throws IOException {
    for (String unsafeName : new String[] {"Macros", "_VBA_PROJECT_CUR", "ObjectPool"}) {
      assertThat(
              validator
                  .validate(file("word.doc", oleDocumentWithDirectory("WordDocument", unsafeName)), null)
                  .accepted())
          .as("DOC storage %s", unsafeName)
          .isFalse();
      assertThat(
              validator
                  .validate(file("sheet.xls", oleDocumentWithDirectory("Workbook", unsafeName)), null)
                  .accepted())
          .as("XLS storage %s", unsafeName)
          .isFalse();
    }
  }

  @Test
  void shouldRejectEmbeddedRtfObjects() {
    for (String controlWord : new String[] {"object", "objdata"}) {
      byte[] content =
          ("{\\rtf1\\ansi {\\" + controlWord + " data}}").getBytes(StandardCharsets.US_ASCII);
      assertThat(validator.validate(file("embedded.rtf", content), null).accepted())
          .as("RTF control word %s", controlWord)
          .isFalse();
    }
  }

  @Test
  void shouldAcceptRtfWithOrdinaryControlWordsThatStartLikeObject() {
    byte[] content =
        "{\\rtf1\\ansi \\objectivefont plain text}".getBytes(StandardCharsets.US_ASCII);

    assertThat(validator.validate(file("letter.rtf", content), null).accepted()).isTrue();
  }

  @Test
  void shouldRejectOoxmlWordAndExcelExtensionMismatch() throws IOException {
    assertThat(validator.validate(file("word.xlsx", officePackage(true, Map.of())), null).accepted())
        .isFalse();
    assertThat(validator.validate(file("sheet.docx", officePackage(false, Map.of())), null).accepted())
        .isFalse();
  }

  @Test
  void shouldResolveOoxmlMainPartFromDefaultContentType() throws IOException {
    ValidationResult result =
        validator.validate(file("word.docx", officePackage(true, Map.of(), true, false)), null);

    assertThat(result.accepted()).isTrue();
  }

  @Test
  void shouldAcceptStrictOfficeDocumentRelationshipAndRejectLookalikeType() throws IOException {
    byte[] strictPackage = officePackage(true, Map.of(), false, true);
    byte[] lookalikePackage =
        replaceZipEntry(
            strictPackage,
            "_rels/.rels",
            relationships(
                    "<Relationship Id=\"rId1\" Type=\"https://attacker.invalid/officeDocument\" Target=\"word/document.xml\"/>")
                .getBytes(StandardCharsets.UTF_8));

    assertThat(validator.validate(file("strict.docx", strictPackage), null).accepted()).isTrue();
    assertThat(validator.validate(file("lookalike.docx", lookalikePackage), null).accepted())
        .isFalse();
  }

  @ParameterizedTest(name = "rejects active content part {1}")
  @MethodSource("activeOoxmlParts")
  void shouldRejectMacroActiveXEmbeddedAndExternalDataParts(boolean word, String entryName)
      throws IOException {
    byte[] content = officePackage(word, Map.of(entryName, new byte[] {1, 2, 3}));

    assertThat(validator.validate(file(word ? "active.docx" : "active.xlsx", content), null).accepted())
        .isFalse();
  }

  @ParameterizedTest(name = "rejects active content type {1}")
  @MethodSource("activeOoxmlContentTypes")
  void shouldRejectMacroActiveXEmbeddedAndExternalDataContentTypes(
      boolean word, String contentType)
      throws IOException {
    byte[] content =
        officePackage(
            word,
            Map.of(),
            "<Default Extension=\"dat\" ContentType=\"" + contentType + "\"/>");

    assertThat(validator.validate(file(word ? "active.docx" : "active.xlsx", content), null).accepted())
        .isFalse();
  }

  @ParameterizedTest(name = "rejects relationship type {0}")
  @MethodSource("activeOoxmlRelationshipTypes")
  void shouldRejectMacroActiveXEmbeddedTemplateAndExternalDataRelationships(
      String relationshipType)
      throws IOException {
    byte[] content =
        officePackage(
            true,
            Map.of(
                "word/_rels/document.xml.rels",
                relationships(
                        "<Relationship Id=\"rId2\" Type=\""
                            + relationshipType
                            + "\" Target=\"parts/part1.bin\"/>")
                    .getBytes(StandardCharsets.UTF_8)));

    assertThat(validator.validate(file("active.docx", content), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectRemoteObjectAndOtherExternalRelationships() throws IOException {
    String oleObjectType =
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject";
    String imageType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
    for (String relationship :
        new String[] {
          "<Relationship Id=\"rId2\" Type=\"" + oleObjectType
              + "\" Target=\"https://attacker.invalid/payload.html!\" TargetMode=\"External\"/>",
          "<Relationship Id=\"rId2\" Type=\"" + imageType
              + "\" Target=\"https://attacker.invalid/pixel.png\" TargetMode=\"External\"/>"
        }) {
      byte[] content =
          officePackage(
              true,
              Map.of(
                  "word/_rels/document.xml.rels",
                  relationships(relationship).getBytes(StandardCharsets.UTF_8)));

      assertThat(validator.validate(file("external.docx", content), null).accepted())
          .as(relationship)
          .isFalse();
    }
  }

  @ParameterizedTest(name = "rejects attached template target {0}")
  @ValueSource(
      strings = {
        "Letter.dotx",
        "../Templates/Letter.dotx",
        "file:///C:/Users/analyst/Templates/Letter.dotx",
        "C:\\Users\\analyst\\Templates\\Letter.dotx",
        "https://example.gov.bc.ca/templates/Letter.dotm",
        "\\\\ministry.invalid\\templates\\Letter.dotx",
        "file://ministry.invalid/templates/Letter.dotx"
      })
  void shouldRejectDocumentsWithAnAttachedTemplate(String templateTarget) throws IOException {
    for (String type :
        new String[] {
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/attachedTemplate"
        }) {
      for (String targetMode : new String[] {" TargetMode=\"External\"", ""}) {
        assertThat(
                validator
                    .validate(
                        documentWithSettingsRelationship(
                            "<Relationship Id=\"rId1\" Type=\""
                                + type
                                + "\" Target=\""
                                + templateTarget
                                + "\""
                                + targetMode
                                + "/>"),
                        null)
                    .accepted())
            .as("%s %s%s", type, templateTarget, targetMode)
            .isFalse();
      }
    }
  }

  @Test
  void shouldAcceptOrdinarySettingsRelationships() throws IOException {
    String relationship =
        "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
            + " Target=\"media/image1.png\"/>";

    assertThat(validator.validate(documentWithSettingsRelationship(relationship), null).accepted())
        .isTrue();
  }

  private MultipartFile documentWithSettingsRelationship(String relationship) throws IOException {
    byte[] content =
        officePackage(
            true,
            Map.of(
                "word/_rels/settings.xml.rels",
                relationships(relationship).getBytes(StandardCharsets.UTF_8)));
    return file("letter.docx", content);
  }

  @ParameterizedTest(name = "rejects a chart that embeds a workbook in {0}")
  @ValueSource(booleans = {true, false})
  void shouldRejectChartsThatEmbedAWorkbook(boolean word) throws IOException {
    String folder = word ? "word/" : "xl/";
    String officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
    Map<String, byte[]> chartOnly = new LinkedHashMap<>();
    chartOnly.put(
        folder + "_rels/" + (word ? "document" : "workbook") + ".xml.rels",
        relationships(
                "<Relationship Id=\"rId1\" Type=\""
                    + officeRelationships
                    + "chart\" Target=\"charts/chart1.xml\"/>")
            .getBytes(StandardCharsets.UTF_8));
    chartOnly.put(
        folder + "charts/chart1.xml",
        "<?xml version=\"1.0\"?><chart/>".getBytes(StandardCharsets.UTF_8));
    Map<String, byte[]> withEmbeddedWorkbook = new LinkedHashMap<>(chartOnly);
    withEmbeddedWorkbook.put(
        folder + "charts/_rels/chart1.xml.rels",
        relationships(
                "<Relationship Id=\"rId1\" Type=\""
                    + officeRelationships
                    + "package\" Target=\"../embeddings/Microsoft_Excel_Sheet1.xlsx\"/>")
            .getBytes(StandardCharsets.UTF_8));
    withEmbeddedWorkbook.put(
        folder + "embeddings/Microsoft_Excel_Sheet1.xlsx", new byte[] {'P', 'K', 3, 4});
    String contentTypes =
        "<Default Extension=\"xlsx\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\"/>"
            + "<Override PartName=\"/"
            + folder
            + "charts/chart1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.drawingml.chart+xml\"/>";
    String fileName = word ? "chart.docx" : "chart.xlsx";

    assertThat(
            validator
                .validate(file(fileName, officePackage(word, chartOnly, contentTypes)), null)
                .accepted())
        .isTrue();
    assertThat(
            validator
                .validate(
                    file(fileName, officePackage(word, withEmbeddedWorkbook, contentTypes)), null)
                .accepted())
        .isFalse();
  }

  @Test
  void shouldRejectMacroProjectsHiddenInsideEmbeddings() throws IOException {
    byte[] content =
        officePackage(true, Map.of("word/embeddings/vbaProject.bin", new byte[] {1, 2, 3}));

    assertThat(validator.validate(file("embedded-macro.docx", content), null).accepted()).isFalse();
  }

  @Test
  void shouldAllowOnlySafeAbsoluteExternalHyperlinks() throws IOException {
    String hyperlinkType =
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
    byte[] safe =
        officePackage(
            true,
            Map.of(
                "word/_rels/document.xml.rels",
                relationships(
                        "<Relationship Id=\"rId2\" Type=\""
                            + hyperlinkType
                            + "\" Target=\"https://example.gov.bc.ca/reference\" TargetMode=\"External\"/>"
                            + "<Relationship Id=\"rId3\" Type=\""
                            + hyperlinkType
                            + "\" Target=\"mailto:analyst@example.gov.bc.ca\" TargetMode=\"External\"/>")
                    .getBytes(StandardCharsets.UTF_8)));
    byte[] credentialed =
        officePackage(
            true,
            Map.of(
                "word/_rels/document.xml.rels",
                relationships(
                        "<Relationship Id=\"rId2\" Type=\""
                            + hyperlinkType
                            + "\" Target=\"https://user:password@example.invalid/reference\" TargetMode=\"External\"/>")
                    .getBytes(StandardCharsets.UTF_8)));

    assertThat(validator.validate(file("linked.docx", safe), null).accepted()).isTrue();
    assertThat(validator.validate(file("credentialed.docx", credentialed), null).accepted())
        .isFalse();
  }

  @Test
  void shouldRejectZipPathTraversalAndTruncation() throws IOException {
    byte[] traversal = zip(Map.of("../outside.txt", "unsafe".getBytes(StandardCharsets.UTF_8)));
    byte[] valid = zip(Map.of("inside.txt", "safe".getBytes(StandardCharsets.UTF_8)));
    byte[] truncated = java.util.Arrays.copyOf(valid, valid.length - 12);

    assertThat(validator.validate(file("traversal.zip", traversal), null).accepted()).isFalse();
    assertThat(validator.validate(file("truncated.zip", truncated), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectZipWithoutARealCentralDirectory() throws IOException {
    byte[] archive = zip(Map.of("inside.txt", "safe".getBytes(StandardCharsets.UTF_8)));
    int centralDirectory = indexOf(archive, new byte[] {'P', 'K', 1, 2});
    archive[centralDirectory] = 0;

    ValidationResult result = validator.validate(file("forged.zip", archive), null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).contains("safe, valid ZIP");
  }

  @Test
  void shouldRejectDifferentLocalAndCentralDirectoryNames() throws IOException {
    byte[] archive = zip(Map.of("safe.txt", "safe".getBytes(StandardCharsets.UTF_8)));
    int centralHeader = indexOf(archive, new byte[] {'P', 'K', 1, 2});
    byte[] alternateName = "evil.txt".getBytes(StandardCharsets.US_ASCII);
    System.arraycopy(alternateName, 0, archive, centralHeader + 46, alternateName.length);

    ValidationResult result = validator.validate(file("ambiguous.zip", archive), null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).contains("safe, valid ZIP");
  }

  @Test
  void shouldRequireUnicodePathExtraFieldToMatchCanonicalName() throws IOException {
    byte[] matching = zipWithUnicodePath("safe.txt", "safe.txt");
    byte[] alternate = zipWithUnicodePath("safe.txt", "../x.txt");

    assertThat(validator.validate(file("matching.zip", matching), null).accepted()).isTrue();
    assertThat(validator.validate(file("alternate.zip", alternate), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectExcessiveZipCompressionRatio() throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(output)) {
      zip.putNextEntry(new java.util.zip.ZipEntry("large.txt"));
      byte[] zeros = new byte[8192];
      for (int written = 0; written < 2 * 1024 * 1024; written += zeros.length) {
        zip.write(zeros);
      }
      zip.closeEntry();
    }

    ValidationResult result = validator.validate(file("compressed.zip", output.toByteArray()), null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).contains("safe, valid ZIP");
  }

  @Test
  void shouldRejectXmlWithDoctypeAndExternalEntity() {
    byte[] xml =
        ("<?xml version=\"1.0\"?>"
                + "<!DOCTYPE root [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>"
                + "<root>&xxe;</root>")
            .getBytes(StandardCharsets.UTF_8);

    ValidationResult result = validator.validate(file("unsafe.xml", xml), null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).doesNotContain("/etc/passwd", "XMLStreamException");
  }

  @Test
  void shouldAcceptTextLikeWindows1252Content() {
    byte[] windows1252 = new byte[] {'c', 'a', 'f', (byte) 0xe9, '\r', '\n'};

    assertThat(validator.validate(file("legacy.txt", windows1252), null).accepted()).isTrue();
    assertThat(validator.validate(file("legacy.csv", windows1252), null).accepted()).isTrue();
  }

  @Test
  void shouldAcceptJpegWithDataAfterTheEndMarker() throws IOException {
    byte[] photo = image("jpg");
    byte[] withTrailer = concat(photo, "MPF-trailer-data".getBytes(StandardCharsets.US_ASCII));
    byte[] withPadding = concat(photo, new byte[32]);

    assertThat(validator.validate(file("phone.jpg", withTrailer), null).accepted()).isTrue();
    assertThat(validator.validate(file("padded.jpg", withPadding), null).accepted()).isTrue();
  }

  @Test
  void shouldRejectJpegNamedContentThatIsNotAJpeg() throws IOException {
    assertThat(validator.validate(file("document.jpg", validPdf()), null).accepted()).isFalse();
    assertThat(validator.validate(file("image.jpg", image("png")), null).accepted()).isFalse();
    assertThat(
            validator
                .validate(file("short.jpg", new byte[] {(byte) 0xff, (byte) 0xd8}), null)
                .accepted())
        .isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"notes.txt", "records.csv"})
  void shouldAcceptUtf16TextWithAByteOrderMark(String fileName) {
    String text = "id,name\r\n1,Caf\u00e9 \u201cquoted\u201d \u2013 dash\r\n";
    byte[] littleEndian =
        concat(new byte[] {(byte) 0xff, (byte) 0xfe}, text.getBytes(StandardCharsets.UTF_16LE));
    byte[] bigEndian =
        concat(new byte[] {(byte) 0xfe, (byte) 0xff}, text.getBytes(StandardCharsets.UTF_16BE));

    assertThat(validator.validate(file(fileName, littleEndian), null).accepted()).isTrue();
    assertThat(validator.validate(file(fileName, bigEndian), null).accepted()).isTrue();
  }

  @Test
  void shouldAcceptUtf16TextRegardlessOfHowTheStreamIsChunked() throws IOException {
    String text = "line of unicode text \u2013 caf\u00e9\n".repeat(2000);
    byte[] content =
        concat(new byte[] {(byte) 0xff, (byte) 0xfe}, text.getBytes(StandardCharsets.UTF_16LE));
    MultipartFile file =
        new MockMultipartFile("formFile", "export.txt", "text/plain", content) {
          @Override
          public InputStream getInputStream() {
            return new SingleByteReadsInputStream(new ByteArrayInputStream(content));
          }
        };

    assertThat(validator.validate(file, null).accepted()).isTrue();
  }

  @Test
  void shouldRejectUtf16TextThatIsTruncatedOrContainsControlCharacters() {
    byte[] bom = new byte[] {(byte) 0xff, (byte) 0xfe};
    byte[] truncated = concat(bom, new byte[] {'a', 0, 'b'});
    byte[] withNul = concat(bom, new byte[] {'a', 0, 0, 0, 'b', 0});
    byte[] withEscape = concat(bom, new byte[] {'a', 0, 0x1b, 0, 'b', 0});
    byte[] onlyLineBreaks = concat(bom, new byte[] {'\r', 0, '\n', 0});

    assertThat(validator.validate(file("truncated.txt", truncated), null).accepted()).isFalse();
    assertThat(validator.validate(file("nul.txt", withNul), null).accepted()).isFalse();
    assertThat(validator.validate(file("escape.csv", withEscape), null).accepted()).isFalse();
    assertThat(validator.validate(file("blank.txt", onlyLineBreaks), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectBinaryContentNamedAsTextWithoutAByteOrderMark() {
    byte[] withNul = new byte[] {'a', 0, 'b', 0, 'c', 0};

    assertThat(validator.validate(file("binary.txt", withNul), null).accepted()).isFalse();
    assertThat(validator.validate(file("binary.csv", withNul), null).accepted()).isFalse();
  }

  @Test
  void shouldRejectDeclaredOversizeBeforeOpeningContent() throws IOException {
    MultipartFile file = mock(MultipartFile.class);
    when(file.getOriginalFilename()).thenReturn("oversize.txt");
    when(file.getSize()).thenReturn(AttachmentUploadValidator.MAX_UPLOAD_BYTES + 1);

    ValidationResult result = validator.validate(file, null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).isEqualTo("Files must be 20 MB or smaller.");
    verify(file, never()).getInputStream();
  }

  @Test
  void shouldRejectActualStreamThatExceedsAFalseSmallDeclaredSize() throws IOException {
    MultipartFile file = mock(MultipartFile.class);
    when(file.getOriginalFilename()).thenReturn("misreported.txt");
    when(file.getSize()).thenReturn(1L);
    when(file.getInputStream())
        .thenReturn(new PatternInputStream(AttachmentUploadValidator.MAX_UPLOAD_BYTES + 1));

    ValidationResult result = validator.validate(file, null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).contains("safely validated");
  }

  @Test
  void sizeLimitedStreamShouldCountSkippedBytes() throws IOException {
    try (InputStream input =
        new AttachmentUploadValidator.SizeLimitedInputStream(
            new PatternInputStream(AttachmentUploadValidator.MAX_UPLOAD_BYTES + 1),
            AttachmentUploadValidator.MAX_UPLOAD_BYTES)) {
      assertThat(input.skip(AttachmentUploadValidator.MAX_UPLOAD_BYTES))
          .isEqualTo(AttachmentUploadValidator.MAX_UPLOAD_BYTES);
      assertThatThrownBy(() -> input.skip(1)).isInstanceOf(IOException.class);
    }
  }

  private static Stream<Arguments> activeLegacyFiles() throws IOException {
    return Stream.of(
        Arguments.of("image.bmp", validBmp()),
        Arguments.of("records.csv", "id,value\n1,123\n".getBytes(StandardCharsets.UTF_8)),
        Arguments.of("letter.doc", oleDocument("WordDocument")),
        Arguments.of("letter.docx", officePackage(true, Map.of())),
        Arguments.of("photo.jpg", image("jpg")),
        Arguments.of("document.pdf", validPdf()),
        Arguments.of("image.png", image("png")),
        Arguments.of("letter.rtf", "{\\rtf1\\ansi legacy}".getBytes(StandardCharsets.US_ASCII)),
        Arguments.of("notes.txt", "Unicode text: café\n".getBytes(StandardCharsets.UTF_8)),
        Arguments.of("sheet.xls", oleDocument("Workbook")),
        Arguments.of("sheet.xlsx", officePackage(false, Map.of())),
        Arguments.of("data.xml", "<?xml version=\"1.0\"?><root/>".getBytes(StandardCharsets.UTF_8)),
        Arguments.of("archive.zip", zip(Map.of("file.txt", "content".getBytes(StandardCharsets.UTF_8)))));
  }

  private static Stream<Arguments> activeOoxmlParts() {
    return Stream.of(
        Arguments.of(true, "word/vbaProject.bin"),
        Arguments.of(true, "word/activeX/activeX1.xml"),
        Arguments.of(true, "word/embeddings/oleObject1.bin"),
        Arguments.of(true, "word/embeddings/Microsoft_Excel_Sheet1.xlsx"),
        Arguments.of(true, "word/externalLinks/externalLink1.xml"),
        Arguments.of(true, "word/customUI/customUI.xml"),
        Arguments.of(true, "word/afchunk.htm"),
        Arguments.of(false, "xl/vbaProject.bin"),
        Arguments.of(false, "xl/activeX/activeX1.xml"),
        Arguments.of(false, "xl/embeddings/oleObject1.bin"),
        Arguments.of(false, "xl/embeddings/Microsoft_Word_Document1.docx"),
        Arguments.of(false, "xl/externalLinks/externalLink1.xml"),
        Arguments.of(false, "xl/connections.xml"),
        Arguments.of(false, "xl/queryTables/queryTable1.xml"),
        Arguments.of(false, "xl/customUI/customUI.xml"));
  }

  private static Stream<Arguments> activeOoxmlContentTypes() {
    return Stream.of(
        Arguments.of(true, "application/vnd.ms-word.document.macroEnabled.12"),
        Arguments.of(true, "application/vnd.ms-office.vbaProject"),
        Arguments.of(true, "application/vnd.ms-office.activeX+xml"),
        Arguments.of(true, "application/vnd.openxmlformats-officedocument.oleObject"),
        Arguments.of(false, "application/vnd.openxmlformats-officedocument.oleObject"),
        Arguments.of(false, "application/vnd.ms-excel.sheet.macroEnabled.12"),
        Arguments.of(false, "application/vnd.ms-excel.macrosheet+xml"),
        Arguments.of(
            false, "application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml"),
        Arguments.of(
            false, "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml"),
        Arguments.of(
            false, "application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml"));
  }

  private static Stream<String> activeOoxmlRelationshipTypes() {
    return Stream.of(
        "http://schemas.microsoft.com/office/2006/relationships/vbaProject",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/activeXControl",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject",
        "http://purl.oclc.org/ooxml/officeDocument/relationships/oleObject",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate",
        "http://purl.oclc.org/ooxml/officeDocument/relationships/attachedTemplate",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/queryTable",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk");
  }

  private static Stream<String> unsafeFileNames() {
    return Stream.of(
        "a".repeat(247) + ".PDF",
        "résumé.pdf",
        "Joe\u2019s permit.pdf",
        "Permit 12 \u2013 signed.pdf",
        "../application.pdf",
        "folder/application.pdf",
        "folder\\application.pdf",
        "application\r\n.pdf",
        " application.pdf",
        "application.pdf ");
  }

  private static Stream<String> unsafeDescriptions() {
    return Stream.of(
        "d".repeat(251),
        "café",
        "Joe\u2019s permit",
        "contains\u0000nul",
        "escape\u001bsequence");
  }

  private static MockMultipartFile file(String fileName, byte[] content) {
    return new MockMultipartFile("formFile", fileName, "application/octet-stream", content);
  }

  private static byte[] validPdf() {
    return "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
  }

  private static byte[] validBmp() {
    ByteBuffer buffer = ByteBuffer.allocate(58).order(ByteOrder.LITTLE_ENDIAN);
    buffer.put((byte) 'B').put((byte) 'M');
    buffer.putInt(58);
    buffer.putInt(0);
    buffer.putInt(54);
    buffer.putInt(40);
    buffer.putInt(1);
    buffer.putInt(1);
    buffer.putShort((short) 1);
    buffer.putShort((short) 24);
    buffer.putInt(0);
    buffer.putInt(4);
    buffer.putInt(0).putInt(0).putInt(0).putInt(0);
    buffer.putInt(0x00ffffff);
    return buffer.array();
  }

  private static byte[] image(String format) throws IOException {
    BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
    image.setRGB(0, 0, 0x336699);
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    assertThat(ImageIO.write(image, format, output)).isTrue();
    return output.toByteArray();
  }

  private static byte[] oleDocument(String streamName) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (POIFSFileSystem fileSystem = new POIFSFileSystem()) {
      fileSystem.createDocument(
          new ByteArrayInputStream("legacy-content".getBytes(StandardCharsets.US_ASCII)),
          streamName);
      fileSystem.writeFilesystem(output);
    }
    return output.toByteArray();
  }

  private static byte[] oleDocumentWithDirectory(String streamName, String directoryName)
      throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (POIFSFileSystem fileSystem = new POIFSFileSystem()) {
      fileSystem.createDocument(
          new ByteArrayInputStream("legacy-content".getBytes(StandardCharsets.US_ASCII)),
          streamName);
      fileSystem.getRoot().createDirectory(directoryName);
      fileSystem.writeFilesystem(output);
    }
    return output.toByteArray();
  }

  private static byte[] concat(byte[] first, byte[] second) {
    byte[] combined = java.util.Arrays.copyOf(first, first.length + second.length);
    System.arraycopy(second, 0, combined, first.length, second.length);
    return combined;
  }

  private static byte[] officePackage(boolean word, Map<String, byte[]> extraEntries)
      throws IOException {
    return officePackage(word, extraEntries, false, false, "");
  }

  private static byte[] officePackage(
      boolean word, Map<String, byte[]> extraEntries, String extraContentTypes)
      throws IOException {
    return officePackage(word, extraEntries, false, false, extraContentTypes);
  }

  private static byte[] officePackage(
      boolean word,
      Map<String, byte[]> extraEntries,
      boolean defaultMainContentType,
      boolean strictRelationship)
      throws IOException {
    return officePackage(word, extraEntries, defaultMainContentType, strictRelationship, "");
  }

  private static byte[] officePackage(
      boolean word,
      Map<String, byte[]> extraEntries,
      boolean defaultMainContentType,
      boolean strictRelationship,
      String extraContentTypes)
      throws IOException {
    String mainPart = word ? "word/document.xml" : "xl/workbook.xml";
    String mainType =
        word
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
    String xmlDefaultType = defaultMainContentType ? mainType : "application/xml";
    String mainOverride =
        defaultMainContentType
            ? ""
            : "<Override PartName=\"/"
                + mainPart
                + "\" ContentType=\""
                + mainType
                + "\"/>";
    String contentTypes =
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
            + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
            + "<Default Extension=\"xml\" ContentType=\""
            + xmlDefaultType
            + "\"/>"
            + mainOverride
            + extraContentTypes
            + "</Types>";
    String relationshipType =
        strictRelationship
            ? "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"
            : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
    String rootRelationships =
        relationships(
            "<Relationship Id=\"rId1\" Type=\""
                + relationshipType
                + "\" Target=\""
                + mainPart
                + "\"/>");
    Map<String, byte[]> entries = new LinkedHashMap<>();
    entries.put("[Content_Types].xml", contentTypes.getBytes(StandardCharsets.UTF_8));
    entries.put("_rels/.rels", rootRelationships.getBytes(StandardCharsets.UTF_8));
    entries.put(mainPart, "<?xml version=\"1.0\"?><root/>".getBytes(StandardCharsets.UTF_8));
    entries.putAll(extraEntries);
    return zip(entries);
  }

  private static String relationships(String relationships) {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
        + relationships
        + "</Relationships>";
  }

  private static byte[] zip(Map<String, byte[]> entries) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(output)) {
      for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
        zip.putNextEntry(new java.util.zip.ZipEntry(entry.getKey()));
        zip.write(entry.getValue());
        zip.closeEntry();
      }
    }
    return output.toByteArray();
  }

  private static byte[] zipWithUnicodePath(String fileName, String unicodePath)
      throws IOException {
    byte[] rawName = fileName.getBytes(StandardCharsets.UTF_8);
    byte[] unicodeName = unicodePath.getBytes(StandardCharsets.UTF_8);
    java.util.zip.CRC32 crc = new java.util.zip.CRC32();
    crc.update(rawName);
    ByteBuffer extra =
        ByteBuffer.allocate(4 + 5 + unicodeName.length).order(ByteOrder.LITTLE_ENDIAN);
    extra.putShort((short) 0x7075);
    extra.putShort((short) (5 + unicodeName.length));
    extra.put((byte) 1);
    extra.putInt((int) crc.getValue());
    extra.put(unicodeName);

    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(output)) {
      java.util.zip.ZipEntry entry = new java.util.zip.ZipEntry(fileName);
      entry.setExtra(extra.array());
      zip.putNextEntry(entry);
      zip.write("safe".getBytes(StandardCharsets.UTF_8));
      zip.closeEntry();
    }
    return output.toByteArray();
  }

  private static byte[] replaceZipEntry(byte[] archive, String entryName, byte[] replacement)
      throws IOException {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    try (java.util.zip.ZipInputStream zip =
        new java.util.zip.ZipInputStream(new ByteArrayInputStream(archive))) {
      java.util.zip.ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        byte[] content = zip.readAllBytes();
        entries.put(entry.getName(), entryName.equals(entry.getName()) ? replacement : content);
      }
    }
    return zip(entries);
  }

  private static int indexOf(byte[] value, byte[] target) {
    for (int index = 0; index <= value.length - target.length; index++) {
      boolean matches = true;
      for (int targetIndex = 0; targetIndex < target.length; targetIndex++) {
        if (value[index + targetIndex] != target[targetIndex]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return index;
      }
    }
    throw new AssertionError("ZIP signature not found");
  }

  private static final class SingleByteReadsInputStream extends FilterInputStream {
    private SingleByteReadsInputStream(InputStream input) {
      super(input);
    }

    @Override
    public int read(byte[] bytes, int offset, int length) throws IOException {
      return super.read(bytes, offset, Math.min(length, 1));
    }
  }

  private static final class PatternInputStream extends InputStream {
    private long remaining;

    private PatternInputStream(long remaining) {
      this.remaining = remaining;
    }

    @Override
    public int read() {
      if (remaining <= 0) {
        return -1;
      }
      remaining--;
      return 'a';
    }

    @Override
    public int read(byte[] bytes, int offset, int length) {
      if (remaining <= 0) {
        return -1;
      }
      int count = (int) Math.min(length, remaining);
      java.util.Arrays.fill(bytes, offset, offset + count, (byte) 'a');
      remaining -= count;
      return count;
    }

    @Override
    public long skip(long count) {
      long skipped = Math.min(count, remaining);
      remaining -= skipped;
      return skipped;
    }
  }
}

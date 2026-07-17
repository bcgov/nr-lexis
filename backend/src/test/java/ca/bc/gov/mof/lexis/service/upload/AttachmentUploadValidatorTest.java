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

  @Test
  void shouldRejectMacroEnabledAndUnsafeExternalOoxml() throws IOException {
    byte[] macroEnabled =
        officePackage(
            true,
            Map.of(
                "word/vbaProject.bin", new byte[] {1, 2, 3}));
    byte[] external =
        officePackage(
            true,
            Map.of(
                "word/_rels/document.xml.rels",
                relationships(
                        "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate\" Target=\"file:///unsafe/template.dotm\" TargetMode=\"External\"/>")
                    .getBytes(StandardCharsets.UTF_8)));

    assertThat(validator.validate(file("macro.docx", macroEnabled), null).accepted()).isFalse();
    assertThat(validator.validate(file("external.docx", external), null).accepted()).isFalse();
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
  void shouldRejectDeclaredOversizeBeforeOpeningContent() throws IOException {
    MultipartFile file = mock(MultipartFile.class);
    when(file.getOriginalFilename()).thenReturn("oversize.txt");
    when(file.getSize()).thenReturn(AttachmentUploadValidator.MAX_UPLOAD_BYTES + 1);

    ValidationResult result = validator.validate(file, null);

    assertThat(result.accepted()).isFalse();
    assertThat(result.rejectionMessage()).isEqualTo("Files must be 20 MiB or smaller.");
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

  private static Stream<String> unsafeFileNames() {
    return Stream.of(
        "a".repeat(247) + ".PDF",
        "résumé.pdf",
        "../application.pdf",
        "folder/application.pdf",
        "folder\\application.pdf",
        "application\r\n.pdf",
        " application.pdf",
        "application.pdf ");
  }

  private static Stream<String> unsafeDescriptions() {
    return Stream.of("d".repeat(251), "café", "contains\u0000nul", "escape\u001bsequence");
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

  private static byte[] officePackage(boolean word, Map<String, byte[]> extraEntries)
      throws IOException {
    return officePackage(word, extraEntries, false, false);
  }

  private static byte[] officePackage(
      boolean word,
      Map<String, byte[]> extraEntries,
      boolean defaultMainContentType,
      boolean strictRelationship)
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

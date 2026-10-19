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

  private static final String OFFICE_RELATIONSHIPS =
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  private static final String[] ATTACHED_TEMPLATE_TYPES = {
    OFFICE_RELATIONSHIPS + "attachedTemplate",
    "http://purl.oclc.org/ooxml/officeDocument/relationships/attachedTemplate"
  };

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
  void shouldRejectExcelEmbeddedObjectAndActiveXStorages() throws IOException {
    byte[] embeddedObject = oleDocumentWithDirectory("Workbook", "MBD00A1B2C3");
    byte[] activeXControls = oleDocumentWithStreams("Workbook", "Ctls");

    assertThat(validator.validate(file("sheet.xls", embeddedObject), null).accepted())
        .as("XLS embedded object storage")
        .isFalse();
    assertThat(validator.validate(file("sheet.xls", activeXControls), null).accepted())
        .as("XLS ActiveX control stream")
        .isFalse();
  }

  @Test
  void shouldRejectExcelMacroAndVbaModuleSheets() throws IOException {
    for (int sheetType : new int[] {0x01, 0x06}) {
      assertThat(
              validator
                  .validate(file("sheet.xls", workbookDocument(biffWorkbook(sheetType))), null)
                  .accepted())
          .as("XLS sheet type %d", sheetType)
          .isFalse();
    }
  }

  @Test
  void shouldAcceptExcelWorksheetsAndCharts() throws IOException {
    byte[] content = workbookDocument(biffWorkbook(0x00, 0x02));

    assertThat(validator.validate(file("sheet.xls", content), null).accepted()).isTrue();
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
  void shouldRejectMacroActiveXEmbeddedAndExternalDataRelationships(String relationshipType)
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

  @ParameterizedTest(name = "accepts local attached template target {0}")
  @ValueSource(
      strings = {
        "Letter.dotx",
        "../Templates/Letter.dotx",
        "Templates\\Letter.dotx",
        "\\Templates\\Letter.dotx",
        "C:\\Users\\analyst\\Templates\\Letter.dotx",
        "C:/Users/analyst/Templates/Letter.dotx",
        "file:///C:/Users/analyst/Templates/Letter.dotx",
        "file:///C:\\Users\\analyst\\AppData\\Roaming\\Microsoft\\Templates\\Normal.dotm",
        "FILE:///c:/Program%20Files/Microsoft%20Office/Templates/Letter.dotx",
        " file:///C:/Users/analyst/My Templates/Letter.dotx ",
        "/Users/analyst/Templates/Letter.dotx",
        "file:///Users/analyst/Library/Group%20Containers/UBF8T346G9.Office/User%20Content.localized"
            + "/Templates.localized/Letter.dotx",
        "file://localhost/C:/Users/analyst/Templates/Letter.dotx",
        "FILE://LOCALHOST/Users/analyst/Templates/Letter.dotx",
        "file:///C:/Users/Jos%C3%A9/Templates/Letter.dotx",
        "C:\\Users\\José\\Templates\\Letter.dotx"
      })
  void shouldAcceptDocumentsWithALocalAttachedTemplate(String templateTarget) throws IOException {
    for (String type : ATTACHED_TEMPLATE_TYPES) {
      for (String targetMode : new String[] {" TargetMode=\"External\"", ""}) {
        String relationship = attachedTemplate(type, templateTarget, targetMode);
        ValidationResult result =
            validator.validate(documentWithSettingsRelationship(relationship), null);

        assertThat(result.accepted())
            .as("%s %s%s: %s", type, templateTarget, targetMode, result.rejectionMessage())
            .isTrue();
      }
    }
  }

  @ParameterizedTest(name = "rejects remote attached template target {0}")
  @ValueSource(
      strings = {
        "\\\\ministry.invalid\\templates\\Letter.dotx",
        "//ministry.invalid/templates/Letter.dotx",
        "\\/ministry.invalid/templates/Letter.dotx",
        "/\\ministry.invalid\\templates\\Letter.dotx",
        "file://ministry.invalid/templates/Letter.dotx",
        "FILE://Ministry.invalid/templates/Letter.dotx",
        "file:////ministry.invalid/templates/Letter.dotx",
        "file:///\\\\ministry.invalid\\templates\\Letter.dotx",
        "file:/\\ministry.invalid\\templates\\Letter.dotx",
        "file: //ministry.invalid/templates/Letter.dotx",
        "http://ministry.invalid/templates/Letter.dotx",
        "https://example.gov.bc.ca/templates/Letter.dotm",
        "HTTPS://example.invalid/Letter.dotx",
        "ftp://ministry.invalid/Letter.dotx",
        "%5C%5Cministry.invalid%5Ctemplates%5CLetter.dotx",
        "%255C%255Cministry.invalid%255Ctemplates%255CLetter.dotx",
        "file:%2F%2Fministry.invalid/templates/Letter.dotx",
        "http%3A//ministry.invalid/Letter.dotx",
        "  \\\\ministry.invalid\\templates\\Letter.dotx",
        "\uFF3C\uFF3Cministry.invalid\uFF3CLetter.dotx",
        "%EF%BC%BC%EF%BC%BCministry.invalid%EF%BC%BCLetter.dotx",
        "%C0%AF%C0%AFministry.invalid/Letter.dotx",
        "file://localhost//ministry.invalid/templates/Letter.dotx",
        "file://localhost.ministry.invalid/templates/Letter.dotx",
        "\\??\\UNC\\ministry.invalid\\templates\\Letter.dotx",
        "file:///%3F%3F/UNC/ministry.invalid/templates/Letter.dotx"
      })
  void shouldRejectDocumentsWithARemoteAttachedTemplate(String templateTarget)
      throws IOException {
    for (String type : ATTACHED_TEMPLATE_TYPES) {
      for (String targetMode : new String[] {" TargetMode=\"External\"", ""}) {
        String relationship = attachedTemplate(type, templateTarget, targetMode);
        ValidationResult result =
            validator.validate(documentWithSettingsRelationship(relationship), null);

        assertThat(result.accepted()).as("%s %s%s", type, templateTarget, targetMode).isFalse();
        assertThat(result.rejectionMessage())
            .isEqualTo(
                "The uploaded .DOCX file contains a link to a remote template in"
                    + " word/_rels/settings.xml.rels.");
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

  @Test
  void shouldCheckRelationshipPartsWhateverTheCaseOfTheirName() throws IOException {
    String remoteTemplate =
        attachedTemplate(
            ATTACHED_TEMPLATE_TYPES[0],
            "\\\\ministry.invalid\\templates\\Letter.dotx",
            " TargetMode=\"External\"");
    String remoteObject =
        "<Relationship Id=\"rId2\" Type=\""
            + OFFICE_RELATIONSHIPS
            + "oleObject\" Target=\"https://attacker.invalid/payload.bin\" TargetMode=\"External\"/>";
    byte[] upperCaseExtension =
        officePackage(
            true,
            Map.of(
                "word/_rels/settings.xml.RELS",
                relationships(remoteTemplate).getBytes(StandardCharsets.UTF_8)));
    byte[] upperCaseFolder =
        officePackage(
            true,
            Map.of(
                "word/_RELS/document.xml.rels",
                relationships(remoteObject).getBytes(StandardCharsets.UTF_8)));
    byte[] embeddedWorkbook =
        officePackage(
            "word",
            new LinkedHashMap<>(
                Map.of(
                    "word/_RELS/document.xml.rels",
                    relationships(
                            packageRelationship(
                                "rId5", "embeddings/Microsoft_Excel_Worksheet1.xlsx"))
                        .getBytes(StandardCharsets.UTF_8),
                    "word/embeddings/Microsoft_Excel_Worksheet1.xlsx",
                    officePackage(false, Map.of()))),
            false,
            false,
            "");

    assertThat(rejection("template.docx", upperCaseExtension))
        .isEqualTo(
            "The uploaded .DOCX file contains a link to a remote template in"
                + " word/_rels/settings.xml.RELS.");
    assertThat(rejection("object.docx", upperCaseFolder))
        .isEqualTo(
            "The uploaded .DOCX file contains an external link in word/_RELS/document.xml.rels.");
    assertAccepted("embedded-workbook.docx", embeddedWorkbook);
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

  @Test
  void shouldAcceptChartsWithTheirEmbeddedWorkbook() throws IOException {
    byte[] documentChart =
        packageWithChart(
            "word",
            packageRelationship("rId1", "../embeddings/Microsoft_Excel_Worksheet1.xlsx")
                + "<Relationship Id=\"rId2\" Type=\"http://schemas.microsoft.com/office/2011/relationships/chartStyle\""
                + " Target=\"style1.xml\"/>",
            Map.of(
                "word/charts/style1.xml",
                "<?xml version=\"1.0\"?><chartStyle/>".getBytes(StandardCharsets.UTF_8),
                "word/embeddings/Microsoft_Excel_Worksheet1.xlsx",
                officePackage(false, Map.of())));
    byte[] workbookChart = packageWithChart("xl", null, Map.of());

    assertAccepted("chart.docx", documentChart);
    assertAccepted("chart.xlsx", workbookChart);
  }

  @ParameterizedTest(name = "rejects chart data relationship {0}")
  @MethodSource("chartDataOutsideThePackage")
  void shouldRejectChartDataOutsideThePackage(String relationship, String expectedFinding)
      throws IOException {
    byte[] content =
        packageWithChart(
            "word",
            relationship,
            Map.of(
                "word/media/Book1.xlsx",
                officePackage(false, Map.of()),
                "word/embeddings/Microsoft_Excel_Worksheet1.xlsx",
                officePackage(false, Map.of())));

    assertThat(rejection("chart.docx", content))
        .isEqualTo(
            "The uploaded .DOCX file contains "
                + expectedFinding
                + " in word/charts/_rels/chart1.xml.rels.");
  }

  @Test
  void shouldRejectChartsWhoseEmbeddedWorkbookIsNotAValidWorkbook() throws IOException {
    byte[] content =
        packageWithChart(
            "word",
            packageRelationship("rId1", "../embeddings/Microsoft_Excel_Worksheet1.xlsx"),
            Map.of(
                "word/embeddings/Microsoft_Excel_Worksheet1.xlsx", new byte[] {'P', 'K', 3, 4}));

    assertThat(rejection("chart.docx", content))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded document that is not a safe, valid"
                + " Office file in word/embeddings/Microsoft_Excel_Worksheet1.xlsx.");
  }

  @Test
  void shouldAcceptEmbeddedOfficeDocumentsThatPassTheSameChecks() throws IOException {
    byte[] workbookInDocument =
        packageWithEmbeddedPart(
            "word", "Microsoft_Excel_Worksheet1.xlsx", officePackage(false, Map.of()));
    byte[] documentInWorkbook =
        packageWithEmbeddedPart(
            "xl", "Microsoft_Word_Document1.docx", officePackage(true, Map.of()));
    byte[] presentationWithChart =
        packageWithChart(
            "ppt",
            packageRelationship("rId1", "../embeddings/Microsoft_Excel_Worksheet1.xlsx"),
            Map.of(
                "ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx", officePackage(false, Map.of())));
    byte[] presentationInDocument =
        packageWithEmbeddedPart(
            "word", "Microsoft_PowerPoint_Presentation1.pptx", presentationWithChart);

    assertAccepted("embedded-workbook.docx", workbookInDocument);
    assertAccepted("embedded-document.xlsx", documentInWorkbook);
    assertAccepted("embedded-presentation.docx", presentationInDocument);
  }

  @Test
  void shouldRejectAnEmbeddedWorkbookWithAMacroAndNameThePart() throws IOException {
    byte[] workbookWithMacro =
        officePackage(false, Map.of("xl/vbaProject.bin", new byte[] {1, 2, 3}));
    byte[] content =
        packageWithEmbeddedPart("word", "Microsoft_Excel_Worksheet1.xlsx", workbookWithMacro);

    assertThat(rejection("embedded-macro.docx", content))
        .isEqualTo(
            "The uploaded .DOCX file contains a macro in"
                + " word/embeddings/Microsoft_Excel_Worksheet1.xlsx (xl/vbaProject.bin).");
  }

  @Test
  void shouldRejectOleObjectAndMacroEnabledEmbeddings() throws IOException {
    byte[] oleObject = oleDocument("Workbook");
    byte[] workbookWithOleObject =
        packageWithEmbeddedPart("xl", "oleObject1.bin", new byte[] {1, 2, 3});

    assertThat(
            rejection(
                "ole.docx",
                packageWithEmbeddedPart("word", "oleObject1.bin", new byte[] {1, 2, 3})))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded object in"
                + " word/embeddings/oleObject1.bin.");
    assertThat(
            rejection(
                "ole.docx",
                packageWithEmbeddedPart("word", "Microsoft_Excel_Worksheet1.xlsx", oleObject)))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded object in"
                + " word/embeddings/Microsoft_Excel_Worksheet1.xlsx.");
    assertThat(
            rejection(
                "ole.docx",
                packageWithEmbeddedPart(
                    "word", "Microsoft_Excel_Worksheet1.xlsx", workbookWithOleObject)))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded object in"
                + " word/embeddings/Microsoft_Excel_Worksheet1.xlsx"
                + " (xl/embeddings/oleObject1.bin).");
    assertThat(
            rejection(
                "macro.xlsx",
                packageWithEmbeddedPart(
                    "xl",
                    "Microsoft_Word_Macro-Enabled_Document1.docm",
                    officePackage(true, Map.of()))))
        .isEqualTo(
            "The uploaded .XLSX file contains a macro in"
                + " xl/embeddings/Microsoft_Word_Macro-Enabled_Document1.docm.");
  }

  @Test
  void shouldNameTheRefusedPartRatherThanTheContentTypesPart() throws IOException {
    String oleObjectDefault =
        "<Default Extension=\"bin\" ContentType=\"application/vnd.openxmlformats-officedocument.oleObject\"/>";
    String macroDefault =
        "<Default Extension=\"bin\" ContentType=\"application/vnd.ms-office.vbaProject\"/>";
    String dataDefault =
        "<Default Extension=\"dat\" ContentType=\"application/vnd.openxmlformats-officedocument.oleObject\"/>";
    Map<String, byte[]> oleObjectEntries = new LinkedHashMap<>();
    oleObjectEntries.put(
        "word/_rels/document.xml.rels",
        relationships(
                "<Relationship Id=\"rId5\" Type=\""
                    + OFFICE_RELATIONSHIPS
                    + "oleObject\" Target=\"embeddings/oleObject1.bin\"/>")
            .getBytes(StandardCharsets.UTF_8));
    oleObjectEntries.put("word/embeddings/oleObject1.bin", new byte[] {1, 2, 3});
    Map<String, byte[]> macroEntries = new LinkedHashMap<>();
    macroEntries.put(
        "word/_rels/document.xml.rels",
        relationships(
                "<Relationship Id=\"rId6\" Type=\"http://schemas.microsoft.com/office/2006/relationships/vbaProject\""
                    + " Target=\"vbaProject.bin\"/>")
            .getBytes(StandardCharsets.UTF_8));
    macroEntries.put("word/vbaProject.bin", new byte[] {1});
    byte[] oleObject = officePackage("word", oleObjectEntries, false, false, oleObjectDefault);
    byte[] macro = officePackage("word", macroEntries, false, false, macroDefault);
    byte[] oleObjectWithoutRelationship =
        officePackage(
            "word",
            Map.of("word/embeddings/oleObject1.bin", new byte[] {1, 2, 3}),
            false,
            false,
            oleObjectDefault);
    byte[] dataPart =
        officePackage(
            "word", Map.of("word/media/object1.dat", new byte[] {1}), false, false, dataDefault);
    byte[] overriddenDataPart =
        officePackage(
            "word",
            Map.of("word/media/object1.dat", new byte[] {1}),
            false,
            false,
            dataDefault
                + "<Override PartName=\"/word/media/object1.dat\" ContentType=\"image/png\"/>");

    assertThat(rejection("ole.docx", oleObject))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded object in"
                + " word/embeddings/oleObject1.bin.");
    assertThat(rejection("macro.docx", macro))
        .isEqualTo("The uploaded .DOCX file contains a macro in word/vbaProject.bin.");
    assertThat(rejection("ole.docx", oleObjectWithoutRelationship))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded object in"
                + " word/embeddings/oleObject1.bin.");
    assertThat(rejection("object.docx", dataPart))
        .isEqualTo("The uploaded .DOCX file contains an embedded object in word/media/object1.dat.");
    assertThat(rejection("object.docx", overriddenDataPart))
        .isEqualTo("The uploaded .DOCX file contains an embedded object in [Content_Types].xml.");
  }

  @Test
  void shouldAcceptEmbeddedDocumentsInArchivesWithFolderEntries() throws IOException {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    entries.put("word/", new byte[0]);
    entries.put("word/_rels/", new byte[0]);
    entries.put(
        "word/_rels/document.xml.rels",
        relationships(packageRelationship("rId5", "embeddings/Microsoft_Excel_Worksheet1.xlsx"))
            .getBytes(StandardCharsets.UTF_8));
    entries.put("word/embeddings/", new byte[0]);
    entries.put("word/embeddings/Microsoft_Excel_Worksheet1.xlsx", officePackage(false, Map.of()));

    assertAccepted(
        "repacked.docx",
        officePackage(
            "word",
            entries,
            false,
            false,
            "<Default Extension=\"xlsx\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\"/>"));
  }

  @Test
  void shouldShareOneInMemoryLimitAcrossNestedEmbeddedDocuments() throws IOException {
    byte[] withinLimit =
        packageWithEmbeddedPart(
            "word",
            "level1.xlsx",
            packageWithEmbeddedPart(
                "xl",
                "level2.docx",
                officePackage(
                    true, Map.of("word/media/image1.bin", randomBytes(9 * 1024 * 1024, 1)))));
    byte[] overLimit =
        packageWithEmbeddedPart(
            "word",
            "level1.xlsx",
            packageWithEmbeddedPart(
                "xl",
                "level2.docx",
                officePackage(
                    true,
                    Map.of("word/media/image1.bin", randomBytes(21 * 512 * 1024, 2)))));

    assertThat(overLimit.length).isLessThan((int) AttachmentUploadValidator.MAX_UPLOAD_BYTES);
    assertAccepted("nested.docx", withinLimit);
    assertThat(rejection("nested.docx", overLimit))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded document that is not a safe, valid"
                + " Office file in word/embeddings/level1.xlsx (xl/embeddings/level2.docx).");
  }

  @Test
  void shouldLimitHowDeeplyEmbeddedDocumentsAreNested() throws IOException {
    byte[] levelTwo = packageWithEmbeddedPart("xl", "level2.docx", officePackage(true, Map.of()));
    byte[] tooDeep =
        packageWithEmbeddedPart(
            "xl",
            "level2.docx",
            packageWithEmbeddedPart("word", "level3.xlsx", officePackage(false, Map.of())));

    assertAccepted("nested.docx", packageWithEmbeddedPart("word", "level1.xlsx", levelTwo));
    assertThat(rejection("nested.docx", packageWithEmbeddedPart("word", "level1.xlsx", tooDeep)))
        .isEqualTo(
            "The uploaded .DOCX file contains embedded documents nested more than 2 levels deep in"
                + " word/embeddings/level1.xlsx > xl/embeddings/level2.docx"
                + " (word/embeddings/level3.xlsx).");
  }

  @Test
  void shouldApplyArchiveLimitsToEmbeddedDocuments() throws IOException {
    byte[] compressionBomb =
        officePackage(false, Map.of("xl/worksheets/sheet1.xml", new byte[2 * 1024 * 1024]));
    byte[] content =
        packageWithEmbeddedPart("word", "Microsoft_Excel_Worksheet1.xlsx", compressionBomb);

    assertThat(content.length).isLessThan(64 * 1024);
    assertThat(rejection("bomb.docx", content))
        .isEqualTo(
            "The uploaded .DOCX file contains an embedded document that is not a safe, valid"
                + " Office file in word/embeddings/Microsoft_Excel_Worksheet1.xlsx.");
  }

  @Test
  void shouldRejectMacroProjectsHiddenInsideEmbeddings() throws IOException {
    byte[] content =
        officePackage(true, Map.of("word/embeddings/vbaProject.bin", new byte[] {1, 2, 3}));

    assertThat(rejection("embedded-macro.docx", content))
        .isEqualTo(
            "The uploaded .DOCX file contains a macro in word/embeddings/vbaProject.bin.");
  }

  @Test
  void shouldNameTheOfficePartThatWasRefused() throws IOException {
    assertThat(
            rejection(
                "macro.docx", officePackage(true, Map.of("word/vbaProject.bin", new byte[] {1}))))
        .isEqualTo("The uploaded .DOCX file contains a macro in word/vbaProject.bin.");
    assertThat(
            rejection(
                "connection.xlsx",
                officePackage(false, Map.of("xl/connections.xml", new byte[] {1}))))
        .isEqualTo("The uploaded .XLSX file contains a data connection in xl/connections.xml.");
    assertThat(
            rejection(
                "control.docx",
                officePackage(true, Map.of("word/activeX/activeX1.xml", new byte[] {1}))))
        .isEqualTo(
            "The uploaded .DOCX file contains an ActiveX control in word/activeX/activeX1.xml.");
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
  void shouldCheckOnlyTheSignatureOfPngBmpAndPdfFiles() throws IOException {
    byte[] trailer = "trailing-data-test-2026-10-19".getBytes(StandardCharsets.US_ASCII);
    byte[] bmpWithoutDeclaredSize = validBmp();
    java.util.Arrays.fill(bmpWithoutDeclaredSize, 2, 6, (byte) 0);
    byte[] bmpWithoutPixelOffset = validBmp();
    java.util.Arrays.fill(bmpWithoutPixelOffset, 10, 14, (byte) 0);
    byte[] pdfWithTrailingData = new byte[9000];
    java.util.Arrays.fill(pdfWithTrailingData, (byte) 'x');
    byte[] pdfWithoutEndMarker =
        "%PDF-1.4\n1 0 obj\n<<>>\nendobj\n".getBytes(StandardCharsets.US_ASCII);

    assertAccepted("image.png", concat(image("png"), trailer));
    assertAccepted("image.bmp", concat(validBmp(), trailer));
    assertAccepted("image.bmp", bmpWithoutDeclaredSize);
    assertAccepted("image.bmp", bmpWithoutPixelOffset);
    assertAccepted("image.bmp", concat(new byte[] {'B', 'M'}, new byte[32]));
    assertAccepted("document.pdf", concat(validPdf(), pdfWithTrailingData));
    assertAccepted("document.pdf", pdfWithoutEndMarker);

    assertThat(rejection("image.png", image("jpg")))
        .isEqualTo("The uploaded file content does not match the .PNG file extension.");
    assertThat(rejection("image.bmp", image("png")))
        .isEqualTo("The uploaded file content does not match the .BMP file extension.");
    assertThat(rejection("image.bmp", concat(new byte[] {'B', 'A'}, new byte[32])))
        .isEqualTo("The uploaded file content does not match the .BMP file extension.");
    assertThat(rejection("image.bmp", new byte[] {'B'}))
        .isEqualTo("The uploaded file content does not match the .BMP file extension.");
    assertThat(rejection("document.pdf", "PDF-1.7 report".getBytes(StandardCharsets.US_ASCII)))
        .isEqualTo("The uploaded file content does not match the .PDF file extension.");
    assertThat(rejection("document.pdf", image("png")))
        .isEqualTo("The uploaded file content does not match the .PDF file extension.");
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
        Arguments.of(true, "word/externalLinks/externalLink1.xml"),
        Arguments.of(true, "word/customUI/customUI.xml"),
        Arguments.of(true, "word/afchunk.htm"),
        Arguments.of(false, "xl/vbaProject.bin"),
        Arguments.of(false, "xl/activeX/activeX1.xml"),
        Arguments.of(false, "xl/embeddings/oleObject1.bin"),
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
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/connections",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/queryTable",
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk");
  }

  private static Stream<Arguments> chartDataOutsideThePackage() {
    return Stream.of(
        Arguments.of(
            "<Relationship Id=\"rId1\" Type=\""
                + OFFICE_RELATIONSHIPS
                + "package\" Target=\"file:///C:/Data/Book1.xlsx\" TargetMode=\"External\"/>",
            "an external link"),
        Arguments.of(
            "<Relationship Id=\"rId1\" Type=\""
                + OFFICE_RELATIONSHIPS
                + "oleObject\" Target=\"\\\\ministry.invalid\\share\\Book1.xlsx\""
                + " TargetMode=\"External\"/>",
            "an external link"),
        Arguments.of(packageRelationship("rId1", "../../../Book1.xlsx"), "an external link"),
        Arguments.of(
            packageRelationship("rId1", "%2E%2E/%2E%2E/%2E%2E/Book1.xlsx"), "an external link"),
        Arguments.of(packageRelationship("rId1", "../media/Book1.xlsx"), "an embedded object"));
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

  private void assertAccepted(String fileName, byte[] content) {
    ValidationResult result = validator.validate(file(fileName, content), null);

    assertThat(result.accepted()).as("%s: %s", fileName, result.rejectionMessage()).isTrue();
  }

  private String rejection(String fileName, byte[] content) {
    ValidationResult result = validator.validate(file(fileName, content), null);

    assertThat(result.accepted()).as(fileName).isFalse();
    return result.rejectionMessage();
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

  private static byte[] oleDocumentWithStreams(String... streamNames) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (POIFSFileSystem fileSystem = new POIFSFileSystem()) {
      for (String streamName : streamNames) {
        fileSystem.createDocument(
            new ByteArrayInputStream("legacy-content".getBytes(StandardCharsets.US_ASCII)),
            streamName);
      }
      fileSystem.writeFilesystem(output);
    }
    return output.toByteArray();
  }

  private static byte[] workbookDocument(byte[] workbookStream) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    try (POIFSFileSystem fileSystem = new POIFSFileSystem()) {
      fileSystem.createDocument(new ByteArrayInputStream(workbookStream), "Workbook");
      fileSystem.writeFilesystem(output);
    }
    return output.toByteArray();
  }

  /** A BIFF8 workbook globals stream: BOF, one sheet record per sheet type, then EOF. */
  private static byte[] biffWorkbook(int... sheetTypes) {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] beginningOfFile = new byte[16];
    beginningOfFile[1] = 0x06;
    beginningOfFile[2] = 0x05;
    writeBiffRecord(output, 0x0809, beginningOfFile);
    for (int index = 0; index < sheetTypes.length; index++) {
      byte[] name = ("Sheet" + (index + 1)).getBytes(StandardCharsets.US_ASCII);
      ByteArrayOutputStream sheet = new ByteArrayOutputStream();
      sheet.writeBytes(new byte[] {0, 0, 0, 0, 0, (byte) sheetTypes[index]});
      sheet.write(name.length);
      sheet.write(0);
      sheet.writeBytes(name);
      writeBiffRecord(output, 0x0085, sheet.toByteArray());
    }
    writeBiffRecord(output, 0x000a, new byte[0]);
    return output.toByteArray();
  }

  private static void writeBiffRecord(ByteArrayOutputStream output, int type, byte[] data) {
    output.write(type & 0xff);
    output.write(type >> 8);
    output.write(data.length & 0xff);
    output.write(data.length >> 8);
    output.writeBytes(data);
  }

  private static byte[] randomBytes(int length, long seed) {
    byte[] bytes = new byte[length];
    new java.util.Random(seed).nextBytes(bytes);
    return bytes;
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
    return officePackage(
        word ? "word" : "xl",
        extraEntries,
        defaultMainContentType,
        strictRelationship,
        extraContentTypes);
  }

  private static byte[] officePackage(
      String folder,
      Map<String, byte[]> extraEntries,
      boolean defaultMainContentType,
      boolean strictRelationship,
      String extraContentTypes)
      throws IOException {
    String mainPart = mainPart(folder);
    String mainType =
        switch (folder) {
          case "word" ->
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
          case "xl" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
          default ->
              "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
        };
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

  private static String mainPart(String folder) {
    return switch (folder) {
      case "word" -> "word/document.xml";
      case "xl" -> "xl/workbook.xml";
      default -> "ppt/presentation.xml";
    };
  }

  private static String mainPartRelationships(String folder) {
    String mainPart = mainPart(folder);
    return folder + "/_rels/" + mainPart.substring(folder.length() + 1) + ".rels";
  }

  private static String packageRelationship(String id, String target) {
    return "<Relationship Id=\""
        + id
        + "\" Type=\""
        + OFFICE_RELATIONSHIPS
        + "package\" Target=\""
        + target
        + "\"/>";
  }

  private static String attachedTemplate(String type, String target, String targetMode) {
    return "<Relationship Id=\"rId1\" Type=\""
        + type
        + "\" Target=\""
        + target
        + "\""
        + targetMode
        + "/>";
  }

  private static byte[] packageWithEmbeddedPart(String folder, String partName, byte[] content)
      throws IOException {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    entries.put(
        mainPartRelationships(folder),
        relationships(packageRelationship("rId5", "embeddings/" + partName))
            .getBytes(StandardCharsets.UTF_8));
    entries.put(folder + "/embeddings/" + partName, content);
    return officePackage(
        folder,
        entries,
        false,
        false,
        "<Default Extension=\"xlsx\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\"/>"
            + "<Default Extension=\"docx\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\"/>");
  }

  private static byte[] packageWithChart(
      String folder, String chartRelationships, Map<String, byte[]> extraEntries)
      throws IOException {
    Map<String, byte[]> entries = new LinkedHashMap<>();
    entries.put(
        mainPartRelationships(folder),
        relationships(
                "<Relationship Id=\"rId1\" Type=\""
                    + OFFICE_RELATIONSHIPS
                    + "chart\" Target=\"charts/chart1.xml\"/>")
            .getBytes(StandardCharsets.UTF_8));
    entries.put(
        folder + "/charts/chart1.xml",
        "<?xml version=\"1.0\"?><chartSpace/>".getBytes(StandardCharsets.UTF_8));
    if (chartRelationships != null) {
      entries.put(
          folder + "/charts/_rels/chart1.xml.rels",
          relationships(chartRelationships).getBytes(StandardCharsets.UTF_8));
    }
    entries.putAll(extraEntries);
    return officePackage(
        folder,
        entries,
        false,
        false,
        "<Default Extension=\"xlsx\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\"/>"
            + "<Override PartName=\"/"
            + folder
            + "/charts/chart1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.drawingml.chart+xml\"/>");
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

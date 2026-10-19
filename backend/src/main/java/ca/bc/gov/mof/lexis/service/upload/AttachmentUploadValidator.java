package ca.bc.gov.mof.lexis.service.upload;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SequenceInputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.Deque;
import java.util.regex.Pattern;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.poifs.filesystem.DirectoryEntry;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.Entry;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/** Validates legacy Oracle attachment metadata and content without changing BLOB persistence. */
@Component
public class AttachmentUploadValidator {

  static final long MAX_UPLOAD_BYTES = 20L * 1024L * 1024L;
  static final int MAX_METADATA_BYTES = 250;

  private static final long MAX_ARCHIVE_EXPANDED_BYTES = 100L * 1024L * 1024L;
  private static final long MAX_ARCHIVE_ENTRY_BYTES = 50L * 1024L * 1024L;
  private static final long MAX_CAPTURED_PACKAGE_PART_BYTES = 1024L * 1024L;
  private static final int MAX_ARCHIVE_ENTRIES = 2048;
  private static final int MAX_ARCHIVE_ENTRY_NAME_LENGTH = 512;
  private static final int MAX_ARCHIVE_COMPRESSION_RATIO = 100;
  private static final int ZIP_END_RECORD_MAX_BYTES = 65_557;
  private static final int MAX_EMBEDDED_PACKAGE_DEPTH = 2;
  // Embedded documents are held in memory while they are checked, and every nesting level shares
  // this limit.
  private static final long MAX_RETAINED_EMBEDDED_BYTES = MAX_UPLOAD_BYTES;
  private static final int MAX_PERCENT_DECODING_ROUNDS = 4;
  private static final Charset ZIP_LEGACY_CHARSET = Charset.forName("IBM437");
  private static final Pattern RTF_EMBEDDED_OBJECT =
      Pattern.compile("\\\\(?:object|objdata)(?![a-z])", Pattern.CASE_INSENSITIVE);
  private static final Pattern LOCAL_DRIVE_PATH = Pattern.compile("[a-z]:/(?!/)");
  private static final Pattern URI_SCHEME = Pattern.compile("([a-z][a-z0-9+.-]*):");
  private static final int BIFF_BOF_RECORD = 0x0809;
  private static final int BIFF_EOF_RECORD = 0x000a;
  private static final int BIFF_FILEPASS_RECORD = 0x002f;
  private static final int BIFF_BOUNDSHEET_RECORD = 0x0085;
  private static final int BIFF_BOUNDSHEET_FIXED_BYTES = 6;
  private static final int BIFF_MACRO_SHEET_TYPE = 0x01;
  private static final int BIFF_VBA_MODULE_SHEET_TYPE = 0x06;
  private static final byte[] OLE_COMPOUND_FILE_SIGNATURE =
      new byte[] {
        (byte) 0xd0, (byte) 0xcf, 0x11, (byte) 0xe0, (byte) 0xa1, (byte) 0xb1, 0x1a, (byte) 0xe1
      };

  private static final Set<String> SUPPORTED_FILE_TYPES =
      Set.of(
          "BMP", "CSV", "DOC", "DOCX", "JPG", "PDF", "PNG", "RTF", "TXT", "XLS",
          "XLSX", "XML", "ZIP");

  private static final String CONTENT_TYPES_ENTRY = "[Content_Types].xml";
  private static final String PACKAGE_RELATIONSHIPS_ENTRY = "_rels/.rels";
  private static final String WORD_DOCUMENT_ENTRY = "word/document.xml";
  private static final String EXCEL_WORKBOOK_ENTRY = "xl/workbook.xml";
  private static final String POWERPOINT_PRESENTATION_ENTRY = "ppt/presentation.xml";
  private static final String CONTENT_TYPES_NAMESPACE =
      "http://schemas.openxmlformats.org/package/2006/content-types";
  private static final String RELATIONSHIPS_NAMESPACE =
      "http://schemas.openxmlformats.org/package/2006/relationships";
  private static final String RELATIONSHIPS_CONTENT_TYPE =
      "application/vnd.openxmlformats-package.relationships+xml";
  private static final String WORD_DOCUMENT_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  private static final String EXCEL_WORKBOOK_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  private static final String POWERPOINT_PRESENTATION_CONTENT_TYPE =
      "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
  private static final List<String> OFFICE_PART_FOLDERS = List.of("word/", "xl/", "ppt/");
  private static final Set<String> MACRO_ENABLED_PACKAGE_EXTENSIONS =
      Set.of("docm", "dotm", "xlsm", "xltm", "xlam", "pptm", "potm", "ppsm", "ppam", "sldm");
  private static final Set<String> OFFICE_DOCUMENT_RELATIONSHIP_TYPES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument");
  private static final Set<String> HYPERLINK_RELATIONSHIP_TYPES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink");
  private static final Set<String> ATTACHED_TEMPLATE_RELATIONSHIP_TYPES =
      Set.of(
          "http://schemas.openxmlformats.org/officedocument/2006/relationships/attachedtemplate",
          "http://purl.oclc.org/ooxml/officedocument/relationships/attachedtemplate");

  public ValidationResult validate(MultipartFile file, String description) {
    if (file == null || file.isEmpty()) {
      return ValidationResult.rejected("Select a non-empty file before uploading.");
    }

    String fileName = file.getOriginalFilename();
    String metadataRejection = validateFileName(fileName);
    if (metadataRejection != null) {
      return ValidationResult.rejected(metadataRejection);
    }
    metadataRejection = validateDescription(description);
    if (metadataRejection != null) {
      return ValidationResult.rejected(metadataRejection);
    }
    if (file.getSize() <= 0 || file.getSize() > MAX_UPLOAD_BYTES) {
      return ValidationResult.rejected("Files must be 20 MB or smaller.");
    }

    String fileTypeCode = extension(fileName);
    if (fileTypeCode == null) {
      return ValidationResult.rejected(
          "Document uploads need a file extension so LEXIS can resolve the file type.");
    }
    if (!SUPPORTED_FILE_TYPES.contains(fileTypeCode)) {
      return ValidationResult.rejected(
          "File type "
              + fileTypeCode
              + " is not configured in LEXIS. Use a supported file type before uploading.");
    }

    try {
      validateContent(file, fileTypeCode);
      return ValidationResult.accepted(fileTypeCode);
    } catch (InvalidAttachmentException ex) {
      return ValidationResult.rejected(ex.userMessage());
    } catch (IOException | RuntimeException ex) {
      return ValidationResult.rejected(
          "The uploaded file could not be safely validated. Check the file and try again.");
    }
  }

  // File names and descriptions are stored in US7ASCII VARCHAR2(250 BYTE) columns, which cannot
  // hold other characters, so only US-ASCII text of at most 250 characters is accepted.
  private String validateFileName(String fileName) {
    if (fileName == null || fileName.isBlank()) {
      return "The uploaded file must have a usable file name.";
    }
    if (!fileName.equals(fileName.strip())
        || ".".equals(fileName)
        || "..".equals(fileName)) {
      return "The uploaded file must have a usable file name.";
    }
    if (!isUsAscii(fileName) || fileName.length() > MAX_METADATA_BYTES) {
      return "File names must use US-ASCII characters and be 250 bytes or fewer.";
    }
    for (int index = 0; index < fileName.length(); index++) {
      char character = fileName.charAt(index);
      if (Character.isISOControl(character) || character == '/' || character == '\\') {
        return "File names must not contain a path or control characters.";
      }
    }
    return null;
  }

  private String validateDescription(String description) {
    if (description == null) {
      return null;
    }
    if (!isUsAscii(description) || description.length() > MAX_METADATA_BYTES) {
      return "Descriptions must use US-ASCII characters and be 250 bytes or fewer.";
    }
    for (int index = 0; index < description.length(); index++) {
      char character = description.charAt(index);
      if (Character.isISOControl(character)
          && character != '\r'
          && character != '\n'
          && character != '\t') {
        return "Descriptions must not contain control characters other than line breaks or tabs.";
      }
    }
    return null;
  }

  private boolean isUsAscii(String value) {
    for (int index = 0; index < value.length(); index++) {
      if (value.charAt(index) > 0x7f) {
        return false;
      }
    }
    return true;
  }

  private String extension(String fileName) {
    int extensionIndex = fileName.lastIndexOf('.');
    if (extensionIndex <= 0 || extensionIndex >= fileName.length() - 1) {
      return null;
    }
    return fileName.substring(extensionIndex + 1).toUpperCase(Locale.ROOT);
  }

  private void validateContent(MultipartFile file, String fileTypeCode) throws IOException {
    switch (fileTypeCode) {
      case "BMP" -> validateBmp(file);
      case "JPG" -> validateJpeg(file);
      case "PDF" -> validatePdf(file);
      case "PNG" -> validatePng(file);
      case "RTF" -> validateRtf(file);
      case "DOC" -> validateOle(file, true);
      case "XLS" -> validateOle(file, false);
      case "DOCX" ->
          validateZip(file::getInputStream, OfficePackageType.WORD, OfficeScope.upload("DOCX"));
      case "XLSX" ->
          validateZip(file::getInputStream, OfficePackageType.EXCEL, OfficeScope.upload("XLSX"));
      case "ZIP" ->
          validateZip(file::getInputStream, OfficePackageType.NONE, OfficeScope.upload("ZIP"));
      case "XML" -> validateXml(file);
      case "CSV", "TXT" -> validateText(file);
      default -> throw InvalidAttachmentException.mismatch(fileTypeCode);
    }
  }

  // Image and PDF files are recognized by the signature at the start of the file, so data after
  // the image or document end is accepted.
  private void validateBmp(MultipartFile file) throws IOException {
    byte[] prefix = inspect(file::getInputStream, 2, 0).prefix();
    if (prefix.length < 2 || prefix[0] != 'B' || prefix[1] != 'M') {
      throw InvalidAttachmentException.mismatch("BMP");
    }
  }

  private void validateJpeg(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file::getInputStream, 4, 0);
    byte[] prefix = envelope.prefix();
    if (prefix.length < 4
        || (prefix[0] & 0xff) != 0xff
        || (prefix[1] & 0xff) != 0xd8
        || (prefix[2] & 0xff) != 0xff) {
      throw InvalidAttachmentException.mismatch("JPG");
    }
  }

  private void validatePdf(MultipartFile file) throws IOException {
    byte[] prefix = inspect(file::getInputStream, 8, 0).prefix();
    if (prefix.length < 8
        || prefix[0] != '%'
        || prefix[1] != 'P'
        || prefix[2] != 'D'
        || prefix[3] != 'F'
        || prefix[4] != '-'
        || !asciiDigit(prefix[5])
        || prefix[6] != '.'
        || !asciiDigit(prefix[7])) {
      throw InvalidAttachmentException.mismatch("PDF");
    }
  }

  private void validatePng(MultipartFile file) throws IOException {
    byte[] signature =
        new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
    if (!startsWith(inspect(file::getInputStream, signature.length, 0).prefix(), signature)) {
      throw InvalidAttachmentException.mismatch("PNG");
    }
  }

  private void validateRtf(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file::getInputStream, 8, 64);
    byte[] prefix = envelope.prefix();
    byte[] tail = envelope.tail();
    byte[] signature = "{\\rtf".getBytes(StandardCharsets.US_ASCII);
    int last = tail.length - 1;
    while (last >= 0 && isAsciiWhitespace(tail[last])) {
      last--;
    }
    if (!startsWith(prefix, signature) || last < 0 || tail[last] != '}') {
      throw InvalidAttachmentException.mismatch("RTF");
    }
    try (InputStream input = limited(file.getInputStream())) {
      if (RTF_EMBEDDED_OBJECT.matcher(new String(input.readAllBytes(), StandardCharsets.ISO_8859_1))
          .find()) {
        throw InvalidAttachmentException.unsafeLegacyOffice("RTF");
      }
    }
  }

  private void validateOle(MultipartFile file, boolean expectWordDocument) throws IOException {
    try (InputStream input = limited(file.getInputStream());
        POIFSFileSystem fileSystem = new POIFSFileSystem(input)) {
      boolean hasWordDocument = fileSystem.getRoot().hasEntry("WordDocument");
      boolean hasWorkbook =
          fileSystem.getRoot().hasEntry("Workbook") || fileSystem.getRoot().hasEntry("Book");
      if (expectWordDocument
          ? !hasWordDocument || hasWorkbook
          : !hasWorkbook || hasWordDocument) {
        throw InvalidAttachmentException.mismatch(expectWordDocument ? "DOC" : "XLS");
      }
      String fileTypeCode = expectWordDocument ? "DOC" : "XLS";
      Deque<DirectoryEntry> directories = new ArrayDeque<>();
      directories.add(fileSystem.getRoot());
      while (!directories.isEmpty()) {
        var entries = directories.removeFirst().getEntries();
        while (entries.hasNext()) {
          Entry entry = entries.next();
          String name = entry.getName();
          // Word keeps macros and embedded objects in Macros, _VBA_PROJECT_CUR and ObjectPool.
          // Excel keeps macros in _VBA_PROJECT_CUR, embedded objects and ActiveX controls in MBD
          // storages, and ActiveX control data in the Ctls stream.
          if (name.equalsIgnoreCase("Macros")
              || name.equalsIgnoreCase("_VBA_PROJECT_CUR")
              || name.equalsIgnoreCase("ObjectPool")
              || (!expectWordDocument
                  && (name.equalsIgnoreCase("Ctls")
                      || (entry instanceof DirectoryEntry
                          && name.regionMatches(true, 0, "MBD", 0, 3))))) {
            throw InvalidAttachmentException.unsafeLegacyOffice(fileTypeCode);
          }
          if (entry instanceof DirectoryEntry directory) {
            directories.add(directory);
          }
        }
      }
      if (!expectWordDocument && hasExcelMacroSheet(fileSystem.getRoot())) {
        throw InvalidAttachmentException.unsafeLegacyOffice(fileTypeCode);
      }
    } catch (InvalidAttachmentException ex) {
      throw ex;
    } catch (IOException | RuntimeException ex) {
      throw InvalidAttachmentException.mismatch(expectWordDocument ? "DOC" : "XLS");
    }
  }

  /**
   * Whether the workbook's sheet list names an Excel 4.0 macro sheet or a VBA module sheet. The
   * list is read from the workbook globals, and only up to an encryption record, after which the
   * sheet types are encrypted.
   */
  private boolean hasExcelMacroSheet(DirectoryEntry root) throws IOException {
    Entry workbook = root.getEntry(root.hasEntry("Workbook") ? "Workbook" : "Book");
    if (!(workbook instanceof DocumentEntry document)) {
      return false;
    }
    try (DocumentInputStream input = new DocumentInputStream(document)) {
      byte[] header = new byte[4];
      boolean firstRecord = true;
      while (input.available() >= header.length) {
        input.readFully(header);
        int recordType = (header[0] & 0xff) | (header[1] & 0xff) << 8;
        int recordLength = (header[2] & 0xff) | (header[3] & 0xff) << 8;
        if ((firstRecord && recordType != BIFF_BOF_RECORD)
            || recordType == BIFF_EOF_RECORD
            || recordType == BIFF_FILEPASS_RECORD
            || recordLength > input.available()) {
          return false;
        }
        firstRecord = false;
        int remaining = recordLength;
        if (recordType == BIFF_BOUNDSHEET_RECORD && recordLength >= BIFF_BOUNDSHEET_FIXED_BYTES) {
          byte[] sheet = new byte[BIFF_BOUNDSHEET_FIXED_BYTES];
          input.readFully(sheet);
          int sheetType = sheet[BIFF_BOUNDSHEET_FIXED_BYTES - 1] & 0xff;
          if (sheetType == BIFF_MACRO_SHEET_TYPE || sheetType == BIFF_VBA_MODULE_SHEET_TYPE) {
            return true;
          }
          remaining -= BIFF_BOUNDSHEET_FIXED_BYTES;
        }
        if (remaining > 0) {
          input.readFully(new byte[remaining]);
        }
      }
    }
    return false;
  }

  private void validateZip(ContentSource source, OfficePackageType packageType, OfficeScope scope)
      throws IOException {
    ContentEnvelope envelope = inspect(source, 4, ZIP_END_RECORD_MAX_BYTES);
    ZipEndRecord endRecord = validateZipEnvelope(envelope);
    Set<String> entryNames = new LinkedHashSet<>();
    Set<String> caseInsensitiveEntryNames = new HashSet<>();
    Map<String, LocalZipEntry> localEntries = new HashMap<>();
    ContentTypeManifest contentTypes = null;
    String officeDocumentTarget = null;
    int entryCount = 0;

    try (InputStream input = limited(source.open());
        ZipInputStream zip = new ZipInputStream(input, ZIP_LEGACY_CHARSET)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        entryCount++;
        scope.budget().countEntry();
        String entryName = entry.getName();
        if (!safeArchiveEntryName(entryName)
            || !entryNames.add(entryName)
            || !caseInsensitiveEntryNames.add(entryName.toLowerCase(Locale.ROOT))) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        OfficePackageType embeddedType = null;
        if (packageType != OfficePackageType.NONE) {
          OfficeFinding finding = unsafeOfficePart(entryName);
          if (finding != null) {
            throw scope.refusal(finding, entryName);
          }
          // Folder entries, which ordinary ZIP tools add, are not parts.
          if (embeddingPart(entryName) && !entryName.endsWith("/")) {
            embeddedType = embeddedPackageType(entryName, scope);
          }
        }
        if (entry.getSize() > MAX_ARCHIVE_ENTRY_BYTES) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        boolean capture =
            packageType != OfficePackageType.NONE
                && (CONTENT_TYPES_ENTRY.equals(entryName) || relationshipsPart(entryName));
        ByteArrayOutputStream captured = capture ? new ByteArrayOutputStream() : null;
        EmbeddedPart embedded = embeddedType != null ? new EmbeddedPart() : null;
        byte[] chunk = new byte[8192];
        long entryExpandedBytes = 0;
        int read;
        while ((read = zip.read(chunk)) != -1) {
          entryExpandedBytes += read;
          scope.budget().countExpandedBytes(read);
          if (entryExpandedBytes > MAX_ARCHIVE_ENTRY_BYTES) {
            throw InvalidAttachmentException.unsafeArchive();
          }
          if (captured != null) {
            if (entryExpandedBytes > MAX_CAPTURED_PACKAGE_PART_BYTES) {
              throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, entryName);
            }
            captured.write(chunk, 0, read);
          }
          if (embedded != null && !embedded.append(chunk, read, scope.budget())) {
            throw scope.refusal(OfficeFinding.INVALID_EMBEDDED_DOCUMENT, entryName);
          }
        }
        rejectCompressionBomb(entry, entryExpandedBytes);
        zip.closeEntry();
        LocalZipEntry localEntry =
            new LocalZipEntry(
                entryName,
                entry.getMethod(),
                entry.getCrc(),
                entry.getCompressedSize(),
                entry.getSize());
        if (localEntry.crc() < 0
            || localEntry.compressedSize() < 0
            || localEntry.uncompressedSize() < 0
            || localEntries.putIfAbsent(entryName, localEntry) != null) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        if (captured != null) {
          if (CONTENT_TYPES_ENTRY.equals(entryName)) {
            if (contentTypes != null) {
              throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, entryName);
            }
            contentTypes = parseContentTypes(captured.toByteArray(), scope);
          } else {
            String target = parseRelationships(captured.toByteArray(), entryName, scope);
            if (PACKAGE_RELATIONSHIPS_ENTRY.equals(entryName)) {
              if (officeDocumentTarget != null || target == null) {
                throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, entryName);
              }
              officeDocumentTarget = target;
            }
          }
        }
        if (embedded != null) {
          try {
            embedded.trim(scope.budget());
            validateEmbeddedPackage(embedded, entryName, embeddedType, scope);
          } finally {
            embedded.release(scope.budget());
          }
        }
      }
    } catch (InvalidAttachmentException ex) {
      throw ex;
    } catch (ZipException ex) {
      throw InvalidAttachmentException.unsafeArchive();
    }

    if (entryCount != endRecord.entryCount()) {
      throw InvalidAttachmentException.unsafeArchive();
    }
    validateCentralDirectory(source, endRecord, localEntries);
    if (packageType == OfficePackageType.NONE) {
      return;
    }
    if (contentTypes != null) {
      rejectRefusedDefaultContentTypes(contentTypes, entryNames, scope);
    }

    String expectedPart = packageType.mainPart();
    if (!entryNames.contains(CONTENT_TYPES_ENTRY)
        || !entryNames.contains(PACKAGE_RELATIONSHIPS_ENTRY)
        || !entryNames.contains(expectedPart)
        || containsOtherMainPart(entryNames, packageType)
        || !expectedPart.equals(normalizePackageTarget(officeDocumentTarget))
        || contentTypes == null
        || !packageType.mainContentType().equals(resolveContentType(contentTypes, expectedPart))) {
      throw InvalidAttachmentException.mismatch(packageType.extension());
    }
  }

  private boolean containsOtherMainPart(Set<String> entryNames, OfficePackageType packageType) {
    for (OfficePackageType otherType : OfficePackageType.values()) {
      if (otherType != OfficePackageType.NONE
          && otherType != packageType
          && entryNames.contains(otherType.mainPart())) {
        return true;
      }
    }
    return false;
  }

  // A Default content type applies to every part with its extension that has no Override, so a
  // refused Default names the first such part, or [Content_Types].xml when no part uses it.
  private void rejectRefusedDefaultContentTypes(
      ContentTypeManifest contentTypes, Set<String> entryNames, OfficeScope scope) {
    Map<String, OfficeFinding> refusedDefaults = contentTypes.refusedDefaults();
    if (refusedDefaults.isEmpty()) {
      return;
    }
    for (String entryName : entryNames) {
      OfficeFinding finding = refusedDefaults.get(partExtension(entryName));
      if (finding != null
          && !CONTENT_TYPES_ENTRY.equals(entryName)
          && !contentTypes.overrides().containsKey(entryName)) {
        throw scope.refusal(finding, entryName);
      }
    }
    throw scope.refusal(refusedDefaults.values().iterator().next(), CONTENT_TYPES_ENTRY);
  }

  // Embedded DOCX, XLSX and PPTX parts (embedded documents and chart data) must pass the same
  // checks as an uploaded Office file, nested at most MAX_EMBEDDED_PACKAGE_DEPTH levels deep.
  // Other embeddings, such as OLE objects, are refused.
  private OfficePackageType embeddedPackageType(String entryName, OfficeScope scope) {
    String extension = partExtension(entryName);
    OfficePackageType packageType =
        switch (extension) {
          case "docx" -> OfficePackageType.WORD;
          case "xlsx" -> OfficePackageType.EXCEL;
          case "pptx" -> OfficePackageType.POWERPOINT;
          default -> null;
        };
    if (packageType == null) {
      throw scope.refusal(
          MACRO_ENABLED_PACKAGE_EXTENSIONS.contains(extension)
              ? OfficeFinding.MACRO
              : OfficeFinding.EMBEDDED_OBJECT,
          entryName);
    }
    if (scope.depth() >= MAX_EMBEDDED_PACKAGE_DEPTH) {
      throw scope.refusal(OfficeFinding.NESTED_TOO_DEEP, entryName);
    }
    return packageType;
  }

  private void validateEmbeddedPackage(
      EmbeddedPart content, String entryName, OfficePackageType packageType, OfficeScope scope)
      throws IOException {
    if (content.startsWith(OLE_COMPOUND_FILE_SIGNATURE)) {
      throw scope.refusal(OfficeFinding.EMBEDDED_OBJECT, entryName);
    }
    try {
      validateZip(content::open, packageType, scope.enter(entryName));
    } catch (InvalidAttachmentException ex) {
      if (ex.namesOfficePart()) {
        throw ex;
      }
      throw scope.refusal(OfficeFinding.INVALID_EMBEDDED_DOCUMENT, entryName);
    }
  }

  private String partExtension(String partName) {
    String fileName = partName.substring(partName.lastIndexOf('/') + 1);
    int extensionIndex = fileName.lastIndexOf('.');
    return extensionIndex < 0
        ? ""
        : fileName.substring(extensionIndex + 1).toLowerCase(Locale.ROOT);
  }

  private ZipEndRecord validateZipEnvelope(ContentEnvelope envelope) {
    byte[] prefix = envelope.prefix();
    if (prefix.length < 4
        || prefix[0] != 'P'
        || prefix[1] != 'K'
        || !((prefix[2] == 3 && prefix[3] == 4) || (prefix[2] == 5 && prefix[3] == 6))) {
      throw InvalidAttachmentException.unsafeArchive();
    }

    byte[] tail = envelope.tail();
    for (int index = tail.length - 22; index >= 0; index--) {
      if (tail[index] == 'P'
          && tail[index + 1] == 'K'
          && tail[index + 2] == 5
          && tail[index + 3] == 6) {
        int commentLength = unsignedLittleEndianShort(tail, index + 20);
        if (index + 22 + commentLength != tail.length
            || unsignedLittleEndianShort(tail, index + 4) != 0
            || unsignedLittleEndianShort(tail, index + 6) != 0) {
          continue;
        }
        int entriesOnDisk = unsignedLittleEndianShort(tail, index + 8);
        int totalEntries = unsignedLittleEndianShort(tail, index + 10);
        long centralDirectorySize = unsignedLittleEndianInt(tail, index + 12);
        long centralDirectoryOffset = unsignedLittleEndianInt(tail, index + 16);
        long absoluteEndRecordOffset = envelope.size() - tail.length + index;
        if (entriesOnDisk != totalEntries
            || totalEntries == 0xffff
            || centralDirectorySize == 0xffff_ffffL
            || centralDirectoryOffset == 0xffff_ffffL
            || centralDirectorySize > MAX_UPLOAD_BYTES
            || centralDirectoryOffset + centralDirectorySize != absoluteEndRecordOffset
            || (totalEntries == 0
                && (centralDirectoryOffset != 0 || centralDirectorySize != 0))
            || (totalEntries > 0 && centralDirectorySize < 46L * totalEntries)) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        return new ZipEndRecord(
            totalEntries, centralDirectoryOffset, centralDirectorySize);
      }
    }
    throw InvalidAttachmentException.unsafeArchive();
  }

  private void validateCentralDirectory(
      ContentSource source, ZipEndRecord endRecord, Map<String, LocalZipEntry> localEntries)
      throws IOException {
    List<CentralZipEntry> centralEntries = new ArrayList<>(endRecord.entryCount());
    Set<String> names = new HashSet<>();
    Set<String> caseInsensitiveNames = new HashSet<>();
    long remaining = endRecord.centralDirectorySize();

    try (InputStream input = limited(source.open())) {
      discardExactly(input, endRecord.centralDirectoryOffset());
      for (int entryIndex = 0; entryIndex < endRecord.entryCount(); entryIndex++) {
        byte[] header = readExactly(input, 46);
        remaining -= header.length;
        if (header.length != 46
            || remaining < 0
            || header[0] != 'P'
            || header[1] != 'K'
            || header[2] != 1
            || header[3] != 2) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        int flags = unsignedLittleEndianShort(header, 8);
        int method = unsignedLittleEndianShort(header, 10);
        long crc = unsignedLittleEndianInt(header, 16);
        long compressedSize = unsignedLittleEndianInt(header, 20);
        long uncompressedSize = unsignedLittleEndianInt(header, 24);
        int nameLength = unsignedLittleEndianShort(header, 28);
        int extraLength = unsignedLittleEndianShort(header, 30);
        int commentLength = unsignedLittleEndianShort(header, 32);
        int diskNumber = unsignedLittleEndianShort(header, 34);
        long localHeaderOffset = unsignedLittleEndianInt(header, 42);
        long variableLength = (long) nameLength + extraLength + commentLength;
        if ((flags & 1) != 0
            || nameLength == 0
            || nameLength > MAX_ARCHIVE_ENTRY_NAME_LENGTH
            || diskNumber != 0
            || compressedSize == 0xffff_ffffL
            || uncompressedSize == 0xffff_ffffL
            || localHeaderOffset == 0xffff_ffffL
            || compressedSize > MAX_ARCHIVE_ENTRY_BYTES
            || uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES
            || variableLength > remaining) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        byte[] nameBytes = readExactly(input, nameLength);
        String name = decodeZipName(nameBytes, flags);
        byte[] extra = readExactly(input, extraLength);
        if (nameBytes.length != nameLength || extra.length != extraLength) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        validateZipExtraFields(extra, nameBytes, name);
        discardExactly(input, commentLength);
        remaining -= variableLength;
        if (!safeArchiveEntryName(name)
            || !names.add(name)
            || !caseInsensitiveNames.add(name.toLowerCase(Locale.ROOT))) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        LocalZipEntry localEntry = localEntries.get(name);
        if (localEntry == null
            || localEntry.method() != method
            || localEntry.crc() != crc
            || localEntry.compressedSize() != compressedSize
            || localEntry.uncompressedSize() != uncompressedSize) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        centralEntries.add(
            new CentralZipEntry(
                name,
                flags,
                method,
                crc,
                compressedSize,
                uncompressedSize,
                localHeaderOffset));
      }
      if (remaining != 0 || !localEntries.keySet().equals(names)) {
        throw InvalidAttachmentException.unsafeArchive();
      }
    }

    validateLocalHeaders(source, endRecord.centralDirectoryOffset(), centralEntries);
  }

  private void validateLocalHeaders(
      ContentSource source, long centralDirectoryOffset, List<CentralZipEntry> centralEntries)
      throws IOException {
    List<CentralZipEntry> sortedEntries =
        centralEntries.stream()
            .sorted(Comparator.comparingLong(CentralZipEntry::localHeaderOffset))
            .toList();
    Set<Long> offsets = new HashSet<>();
    long position = 0;
    long minimumNextOffset = 0;
    if (!sortedEntries.isEmpty() && sortedEntries.getFirst().localHeaderOffset() != 0) {
      throw InvalidAttachmentException.unsafeArchive();
    }

    try (InputStream input = limited(source.open())) {
      for (CentralZipEntry entry : sortedEntries) {
        if (!offsets.add(entry.localHeaderOffset())
            || entry.localHeaderOffset() < minimumNextOffset
            || entry.localHeaderOffset() >= centralDirectoryOffset) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        discardExactly(input, entry.localHeaderOffset() - position);
        position = entry.localHeaderOffset();
        byte[] header = readExactly(input, 30);
        position += header.length;
        if (header.length != 30
            || header[0] != 'P'
            || header[1] != 'K'
            || header[2] != 3
            || header[3] != 4) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        int flags = unsignedLittleEndianShort(header, 6);
        int method = unsignedLittleEndianShort(header, 8);
        long crc = unsignedLittleEndianInt(header, 14);
        long compressedSize = unsignedLittleEndianInt(header, 18);
        long uncompressedSize = unsignedLittleEndianInt(header, 22);
        int nameLength = unsignedLittleEndianShort(header, 26);
        int extraLength = unsignedLittleEndianShort(header, 28);
        if (flags != entry.flags()
            || method != entry.method()
            || nameLength == 0
            || nameLength > MAX_ARCHIVE_ENTRY_NAME_LENGTH
            || compressedSize == 0xffff_ffffL
            || uncompressedSize == 0xffff_ffffL) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        byte[] nameBytes = readExactly(input, nameLength);
        position += nameBytes.length;
        String localName = decodeZipName(nameBytes, flags);
        byte[] extra = readExactly(input, extraLength);
        position += extra.length;
        if (nameBytes.length != nameLength
            || extra.length != extraLength
            || !entry.name().equals(localName)) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        validateZipExtraFields(extra, nameBytes, localName);
        if ((flags & 8) == 0
            && (crc != entry.crc()
                || compressedSize != entry.compressedSize()
                || uncompressedSize != entry.uncompressedSize())) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        minimumNextOffset = position + entry.compressedSize();
        if (minimumNextOffset > centralDirectoryOffset) {
          throw InvalidAttachmentException.unsafeArchive();
        }
      }
    }
  }

  private String decodeZipName(byte[] nameBytes, int flags) {
    Charset charset = (flags & (1 << 11)) != 0 ? StandardCharsets.UTF_8 : ZIP_LEGACY_CHARSET;
    try {
      return charset
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(nameBytes))
          .toString();
    } catch (CharacterCodingException ex) {
      throw InvalidAttachmentException.unsafeArchive();
    }
  }

  private void validateZipExtraFields(byte[] extra, byte[] rawName, String canonicalName) {
    int offset = 0;
    while (offset < extra.length) {
      if (extra.length - offset < 4) {
        throw InvalidAttachmentException.unsafeArchive();
      }
      int headerId = unsignedLittleEndianShort(extra, offset);
      int dataLength = unsignedLittleEndianShort(extra, offset + 2);
      offset += 4;
      if (dataLength > extra.length - offset) {
        throw InvalidAttachmentException.unsafeArchive();
      }
      if (headerId == 0x7075) {
        if (dataLength < 5 || extra[offset] != 1) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        CRC32 nameCrc = new CRC32();
        nameCrc.update(rawName);
        long declaredCrc = unsignedLittleEndianInt(extra, offset + 1);
        byte[] unicodeNameBytes =
            java.util.Arrays.copyOfRange(extra, offset + 5, offset + dataLength);
        String unicodeName = decodeUtf8(unicodeNameBytes);
        if (declaredCrc != nameCrc.getValue()
            || !canonicalName.equals(unicodeName)
            || !safeArchiveEntryName(unicodeName)) {
          throw InvalidAttachmentException.unsafeArchive();
        }
      }
      offset += dataLength;
    }
  }

  private String decodeUtf8(byte[] value) {
    try {
      return StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(value))
          .toString();
    } catch (CharacterCodingException ex) {
      throw InvalidAttachmentException.unsafeArchive();
    }
  }

  private byte[] readExactly(InputStream input, int length) throws IOException {
    return input.readNBytes(length);
  }

  private void discardExactly(InputStream input, long length) throws IOException {
    long remaining = length;
    if (remaining < 0) {
      throw InvalidAttachmentException.unsafeArchive();
    }
    while (remaining > 0) {
      long skipped = input.skip(remaining);
      if (skipped > 0) {
        remaining -= skipped;
        continue;
      }
      if (input.read() == -1) {
        throw InvalidAttachmentException.unsafeArchive();
      }
      remaining--;
    }
  }

  private void rejectCompressionBomb(ZipEntry entry, long expandedBytes) {
    long compressedSize = entry.getCompressedSize();
    if (compressedSize > 0
        && expandedBytes > 1024L * 1024L
        && expandedBytes > compressedSize * MAX_ARCHIVE_COMPRESSION_RATIO) {
      throw InvalidAttachmentException.unsafeArchive();
    }
  }

  private boolean safeArchiveEntryName(String entryName) {
    if (entryName == null
        || entryName.isBlank()
        || entryName.length() > MAX_ARCHIVE_ENTRY_NAME_LENGTH
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

  private OfficeFinding unsafeOfficePart(String entryName) {
    String normalized = entryName.toLowerCase(Locale.ROOT);
    if (normalized.contains("vbaproject")) {
      return OfficeFinding.MACRO;
    }
    for (String folder : OFFICE_PART_FOLDERS) {
      if (normalized.startsWith(folder + "activex/")) {
        return OfficeFinding.ACTIVEX;
      }
      if (normalized.startsWith(folder + "externallinks/")) {
        return OfficeFinding.EXTERNAL_LINK;
      }
      if (normalized.startsWith(folder + "customui/")) {
        return OfficeFinding.UNSUPPORTED_CONTENT;
      }
    }
    if (normalized.startsWith("word/afchunk")) {
      return OfficeFinding.EMBEDDED_OBJECT;
    }
    if (normalized.startsWith("xl/querytables/") || normalized.equals("xl/connections.xml")) {
      return OfficeFinding.DATA_CONNECTION;
    }
    return null;
  }

  private boolean embeddingPart(String partName) {
    String normalized = partName.toLowerCase(Locale.ROOT);
    for (String folder : OFFICE_PART_FOLDERS) {
      if (normalized.startsWith(folder + "embeddings/")) {
        return true;
      }
    }
    return false;
  }

  // Package part names are compared without regard to case, so relationship parts are too.
  private boolean relationshipsPart(String partName) {
    return partName.regionMatches(true, partName.length() - 5, ".rels", 0, 5);
  }

  private ContentTypeManifest parseContentTypes(byte[] bytes, OfficeScope scope) {
    Map<String, String> defaults = new HashMap<>();
    Map<String, String> overrides = new HashMap<>();
    Map<String, OfficeFinding> refusedDefaults = new LinkedHashMap<>();
    XMLInputFactory factory = secureXmlInputFactory();
    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.DTD) {
          throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
        }
        if (event != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          if (!"Types".equals(reader.getLocalName())
              || !CONTENT_TYPES_NAMESPACE.equals(reader.getNamespaceURI())) {
            throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
          }
          continue;
        }
        if (!CONTENT_TYPES_NAMESPACE.equals(reader.getNamespaceURI())) {
          continue;
        }
        String contentType = reader.getAttributeValue(null, "ContentType");
        if (contentType == null) {
          throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
        }
        String partName = reader.getAttributeValue(null, "PartName");
        OfficeFinding finding = unsafeOfficeContentType(contentType);
        boolean defaultElement = "Default".equals(reader.getLocalName());
        if (finding != null && !defaultElement) {
          boolean namedPart =
              "Override".equals(reader.getLocalName())
                  && partName != null
                  && partName.startsWith("/")
                  && safeArchiveEntryName(partName.substring(1));
          throw scope.refusal(finding, namedPart ? partName.substring(1) : CONTENT_TYPES_ENTRY);
        }
        if (defaultElement) {
          String extension = reader.getAttributeValue(null, "Extension");
          if (extension == null
              || extension.isBlank()
              || defaults.putIfAbsent(extension.toLowerCase(Locale.ROOT), contentType) != null) {
            throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
          }
          if (finding != null) {
            refusedDefaults.put(extension.toLowerCase(Locale.ROOT), finding);
          }
        } else if ("Override".equals(reader.getLocalName())) {
          if (partName == null
              || !partName.startsWith("/")
              || !safeArchiveEntryName(partName.substring(1))
              || overrides.putIfAbsent(partName.substring(1), contentType) != null) {
            throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
          }
        }
      }
      reader.close();
      if (!rootSeen
          || !RELATIONSHIPS_CONTENT_TYPE.equals(defaults.get("rels"))) {
        throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
      }
      return new ContentTypeManifest(
          Map.copyOf(defaults),
          Map.copyOf(overrides),
          Collections.unmodifiableMap(refusedDefaults));
    } catch (XMLStreamException ex) {
      throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, CONTENT_TYPES_ENTRY);
    }
  }

  private String parseRelationships(byte[] bytes, String relationshipsPart, OfficeScope scope) {
    String sourceFolder = relationshipSourceFolder(relationshipsPart);
    String officeDocumentTarget = null;
    XMLInputFactory factory = secureXmlInputFactory();
    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.DTD) {
          throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
        }
        if (event != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          if (!"Relationships".equals(reader.getLocalName())
              || !RELATIONSHIPS_NAMESPACE.equals(reader.getNamespaceURI())) {
            throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
          }
          continue;
        }
        if (!"Relationship".equals(reader.getLocalName())
            || !RELATIONSHIPS_NAMESPACE.equals(reader.getNamespaceURI())) {
          continue;
        }
        String targetMode = reader.getAttributeValue(null, "TargetMode");
        String type = reader.getAttributeValue(null, "Type");
        String target = reader.getAttributeValue(null, "Target");
        if (type == null || target == null) {
          throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
        }
        boolean external = "external".equalsIgnoreCase(targetMode);
        if (!external && targetMode != null && !targetMode.isBlank()) {
          throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
        }
        if (ATTACHED_TEMPLATE_RELATIONSHIP_TYPES.contains(type.toLowerCase(Locale.ROOT))) {
          if (remoteTemplateTarget(target)) {
            throw scope.refusal(OfficeFinding.REMOTE_TEMPLATE, relationshipsPart);
          }
          continue;
        }
        if (external) {
          if (!HYPERLINK_RELATIONSHIP_TYPES.contains(type) || !safeExternalHyperlink(target)) {
            throw scope.refusal(OfficeFinding.EXTERNAL_LINK, relationshipsPart);
          }
          continue;
        }
        OfficeFinding finding = unsafeRelationshipType(type);
        String resolvedTarget =
            unsafeInternalRelationshipTarget(target)
                ? null
                : resolvePartTarget(sourceFolder, target);
        if (finding != null) {
          // The refusal names the part the relationship points to when it is a usable part name.
          throw scope.refusal(
              finding,
              resolvedTarget != null && safeArchiveEntryName(resolvedTarget)
                  ? resolvedTarget
                  : relationshipsPart);
        }
        if (resolvedTarget == null) {
          throw scope.refusal(OfficeFinding.EXTERNAL_LINK, relationshipsPart);
        }
        if (type.toLowerCase(Locale.ROOT).endsWith("/package") && !embeddingPart(resolvedTarget)) {
          throw scope.refusal(OfficeFinding.EMBEDDED_OBJECT, relationshipsPart);
        }
        if (OFFICE_DOCUMENT_RELATIONSHIP_TYPES.contains(type)) {
          if (officeDocumentTarget != null) {
            throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
          }
          officeDocumentTarget = target;
        }
      }
      reader.close();
      if (!rootSeen) {
        throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
      }
      return officeDocumentTarget;
    } catch (XMLStreamException ex) {
      throw scope.refusal(OfficeFinding.UNSUPPORTED_CONTENT, relationshipsPart);
    }
  }

  private OfficeFinding unsafeOfficeContentType(String contentType) {
    String normalized = contentType.toLowerCase(Locale.ROOT);
    if (normalized.contains("macroenabled")
        || normalized.contains("macrosheet")
        || normalized.contains("vbaproject")) {
      return OfficeFinding.MACRO;
    }
    if (normalized.contains("oleobject")) {
      return OfficeFinding.EMBEDDED_OBJECT;
    }
    if (normalized.contains("activex")) {
      return OfficeFinding.ACTIVEX;
    }
    if (normalized.contains("externallink")) {
      return OfficeFinding.EXTERNAL_LINK;
    }
    if (normalized.contains("querytable") || normalized.contains("connections")) {
      return OfficeFinding.DATA_CONNECTION;
    }
    return null;
  }

  private OfficeFinding unsafeRelationshipType(String type) {
    String normalized = type.toLowerCase(Locale.ROOT);
    if (normalized.contains("vbaproject")) {
      return OfficeFinding.MACRO;
    }
    if (normalized.endsWith("/oleobject") || normalized.endsWith("/afchunk")) {
      return OfficeFinding.EMBEDDED_OBJECT;
    }
    if (normalized.endsWith("/activexcontrol")) {
      return OfficeFinding.ACTIVEX;
    }
    if (normalized.endsWith("/externallink")) {
      return OfficeFinding.EXTERNAL_LINK;
    }
    if (normalized.endsWith("/connections") || normalized.endsWith("/querytable")) {
      return OfficeFinding.DATA_CONNECTION;
    }
    return null;
  }

  // An attached template is fetched from its target when the document opens, so a template on
  // another host (a UNC or NT device path, a file URL with a host other than localhost, or any
  // other URL scheme) is refused. Local, rooted and relative paths are accepted. The target is
  // decoded and its separators, case and whitespace are normalized first so a remote target
  // cannot be disguised as a local one.
  private boolean remoteTemplateTarget(String target) {
    String location = canonicalTemplateLocation(target);
    if (location == null
        || location.isEmpty()
        || location.startsWith("//")
        || location.indexOf('?') >= 0) {
      return true;
    }
    if (LOCAL_DRIVE_PATH.matcher(location).lookingAt()) {
      return false;
    }
    var scheme = URI_SCHEME.matcher(location);
    if (!scheme.lookingAt()) {
      return false;
    }
    if (!"file".equals(scheme.group(1))) {
      return true;
    }
    String path = location.substring(scheme.end());
    int slashes = 0;
    while (slashes < path.length() && path.charAt(slashes) == '/') {
      slashes++;
    }
    String afterSlashes = path.substring(slashes);
    return switch (slashes) {
      case 0, 1, 3 -> false;
      case 2 -> !afterSlashes.startsWith("localhost/") || afterSlashes.startsWith("localhost//");
      default -> true;
    };
  }

  private String canonicalTemplateLocation(String target) {
    String decoded = percentDecoded(Normalizer.normalize(target, Normalizer.Form.NFKC));
    if (decoded == null) {
      return null;
    }
    String normalized = Normalizer.normalize(decoded, Normalizer.Form.NFKC);
    StringBuilder location = new StringBuilder(normalized.length());
    for (int index = 0; index < normalized.length(); ) {
      int codePoint = normalized.codePointAt(index);
      index += Character.charCount(codePoint);
      if (Character.isWhitespace(codePoint)
          || Character.isSpaceChar(codePoint)
          || Character.isISOControl(codePoint)
          || Character.getType(codePoint) == Character.FORMAT) {
        continue;
      }
      location.appendCodePoint(codePoint == '\\' ? '/' : Character.toLowerCase(codePoint));
    }
    return location.toString();
  }

  // Decodes %XX escapes until the value stops changing, returning null for values that are still
  // encoded after MAX_PERCENT_DECODING_ROUNDS rounds or whose escapes are not valid UTF-8.
  private String percentDecoded(String value) {
    String decoded = value;
    for (int round = 0; round <= MAX_PERCENT_DECODING_ROUNDS; round++) {
      String next = percentDecodeOnce(decoded);
      if (next == null) {
        return null;
      }
      if (next.equals(decoded)) {
        return decoded;
      }
      decoded = next;
    }
    return null;
  }

  // Each run of %XX escapes is read as UTF-8, as package consumers decode relationship targets.
  private String percentDecodeOnce(String value) {
    StringBuilder decoded = new StringBuilder(value.length());
    ByteArrayOutputStream escapedBytes = new ByteArrayOutputStream();
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      if (character == '%' && index + 2 < value.length()) {
        int high = hexValue(value.charAt(index + 1));
        int low = hexValue(value.charAt(index + 2));
        if (high >= 0 && low >= 0) {
          escapedBytes.write((high << 4) | low);
          index += 2;
          continue;
        }
      }
      if (!appendUtf8(decoded, escapedBytes)) {
        return null;
      }
      decoded.append(character);
    }
    return appendUtf8(decoded, escapedBytes) ? decoded.toString() : null;
  }

  private boolean appendUtf8(StringBuilder decoded, ByteArrayOutputStream escapedBytes) {
    if (escapedBytes.size() == 0) {
      return true;
    }
    try {
      decoded.append(
          StandardCharsets.UTF_8
              .newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(escapedBytes.toByteArray())));
      escapedBytes.reset();
      return true;
    } catch (CharacterCodingException ex) {
      return false;
    }
  }

  private int hexValue(char character) {
    if (character >= '0' && character <= '9') {
      return character - '0';
    }
    if (character >= 'a' && character <= 'f') {
      return character - 'a' + 10;
    }
    if (character >= 'A' && character <= 'F') {
      return character - 'A' + 10;
    }
    return -1;
  }

  private String relationshipSourceFolder(String relationshipsPart) {
    if (relationshipsPart.regionMatches(true, 0, "_rels/", 0, 6)) {
      return "";
    }
    for (int index = relationshipsPart.length() - 7; index >= 0; index--) {
      if (relationshipsPart.regionMatches(true, index, "/_rels/", 0, 7)) {
        return relationshipsPart.substring(0, index + 1);
      }
    }
    return relationshipsPart.substring(0, relationshipsPart.lastIndexOf('/') + 1);
  }

  // Resolves an internal relationship target against the folder of its source part, returning
  // null when the target climbs above the package root.
  private String resolvePartTarget(String sourceFolder, String target) {
    String decoded = percentDecoded(target);
    if (decoded == null) {
      return null;
    }
    String path = decoded.replace('\\', '/');
    path = path.startsWith("/") ? path.substring(1) : sourceFolder + path;
    Deque<String> segments = new ArrayDeque<>();
    for (String segment : path.split("/", -1)) {
      if (segment.isEmpty() || ".".equals(segment)) {
        continue;
      }
      if ("..".equals(segment)) {
        if (segments.isEmpty()) {
          return null;
        }
        segments.removeLast();
        continue;
      }
      segments.addLast(segment);
    }
    return String.join("/", segments);
  }

  private boolean safeExternalHyperlink(String target) {
    for (int index = 0; index < target.length(); index++) {
      if (Character.isISOControl(target.charAt(index))) {
        return false;
      }
    }
    try {
      URI uri = new URI(target);
      if (!uri.isAbsolute() || !uri.normalize().equals(uri)) {
        return false;
      }
      String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
      if ("http".equals(scheme) || "https".equals(scheme)) {
        return !uri.isOpaque()
            && uri.getHost() != null
            && !uri.getHost().isBlank()
            && uri.getRawUserInfo() == null;
      }
      if ("mailto".equals(scheme)) {
        return uri.isOpaque()
            && uri.getRawSchemeSpecificPart() != null
            && !uri.getRawSchemeSpecificPart().isBlank()
            && !uri.getRawSchemeSpecificPart().startsWith("//")
            && uri.getRawFragment() == null;
      }
      return false;
    } catch (URISyntaxException ex) {
      return false;
    }
  }

  private boolean unsafeInternalRelationshipTarget(String target) {
    if (target.isBlank()
        || target.startsWith("//")
        || target.contains("\\")
        || target.contains(":")) {
      return true;
    }
    for (int index = 0; index < target.length(); index++) {
      if (Character.isISOControl(target.charAt(index))) {
        return true;
      }
    }
    return false;
  }

  private String normalizePackageTarget(String target) {
    if (target == null || target.isBlank() || target.contains("\\") || target.contains(":")) {
      return null;
    }
    String normalized = target.startsWith("/") ? target.substring(1) : target;
    return safeArchiveEntryName(normalized) ? normalized : null;
  }

  private String resolveContentType(ContentTypeManifest contentTypes, String entryName) {
    String override = contentTypes.overrides().get(entryName);
    if (override != null) {
      return override;
    }
    int extensionSeparator = entryName.lastIndexOf('.');
    if (extensionSeparator < 0 || extensionSeparator == entryName.length() - 1) {
      return null;
    }
    return contentTypes
        .defaults()
        .get(entryName.substring(extensionSeparator + 1).toLowerCase(Locale.ROOT));
  }

  private void validateXml(MultipartFile file) throws IOException {
    XMLInputFactory factory = secureXmlInputFactory();
    try (InputStream input = limited(file.getInputStream())) {
      XMLStreamReader reader = factory.createXMLStreamReader(input);
      boolean rootSeen = false;
      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.DTD) {
          throw InvalidAttachmentException.mismatch("XML");
        }
        if (event == XMLStreamConstants.START_ELEMENT) {
          rootSeen = true;
        }
      }
      reader.close();
      if (!rootSeen) {
        throw InvalidAttachmentException.mismatch("XML");
      }
    } catch (XMLStreamException ex) {
      throw InvalidAttachmentException.mismatch("XML");
    }
  }

  private XMLInputFactory secureXmlInputFactory() {
    XMLInputFactory factory = XMLInputFactory.newFactory();
    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
    factory.setProperty("javax.xml.stream.isSupportingExternalEntities", false);
    factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
    factory.setXMLResolver(
        (publicId, systemId, baseUri, namespace) -> {
          throw new XMLStreamException("External entities are disabled.");
        });
    return factory;
  }

  private void validateText(MultipartFile file) throws IOException {
    String fileTypeCode = extension(file.getOriginalFilename());
    try (InputStream input = limited(file.getInputStream())) {
      byte[] prefix = input.readNBytes(4);
      if (isExecutableSignature(prefix)) {
        throw InvalidAttachmentException.mismatch(fileTypeCode);
      }
      boolean visibleCharacter =
          hasUtf16ByteOrderMark(prefix)
              ? scanUtf16Text(prefix, input, fileTypeCode)
              : scanByteText(prefix, input, fileTypeCode);
      if (!visibleCharacter) {
        throw InvalidAttachmentException.mismatch(fileTypeCode);
      }
    }
  }

  private boolean scanByteText(byte[] prefix, InputStream input, String fileTypeCode)
      throws IOException {
    boolean visibleCharacter = false;
    for (byte value : prefix) {
      if (invalidTextUnit(value & 0xff)) {
        throw InvalidAttachmentException.mismatch(fileTypeCode);
      }
      visibleCharacter |= visibleTextUnit(value & 0xff);
    }
    byte[] chunk = new byte[8192];
    int read;
    while ((read = input.read(chunk)) != -1) {
      for (int index = 0; index < read; index++) {
        int value = chunk[index] & 0xff;
        if (invalidTextUnit(value)) {
          throw InvalidAttachmentException.mismatch(fileTypeCode);
        }
        visibleCharacter |= visibleTextUnit(value);
      }
    }
    return visibleCharacter;
  }

  /** Scans UTF-16 text that starts with a byte order mark, two bytes per character. */
  private boolean scanUtf16Text(byte[] prefix, InputStream input, String fileTypeCode)
      throws IOException {
    boolean littleEndian = (prefix[0] & 0xff) == 0xff;
    InputStream remaining =
        new SequenceInputStream(new ByteArrayInputStream(prefix, 2, prefix.length - 2), input);
    boolean visibleCharacter = false;
    int pendingByte = -1;
    byte[] chunk = new byte[8192];
    int read;
    while ((read = remaining.read(chunk)) != -1) {
      for (int index = 0; index < read; index++) {
        int value = chunk[index] & 0xff;
        if (pendingByte < 0) {
          pendingByte = value;
          continue;
        }
        int unit = littleEndian ? (value << 8) | pendingByte : (pendingByte << 8) | value;
        pendingByte = -1;
        if (invalidTextUnit(unit)) {
          throw InvalidAttachmentException.mismatch(fileTypeCode);
        }
        visibleCharacter |= visibleTextUnit(unit);
      }
    }
    if (pendingByte >= 0) {
      throw InvalidAttachmentException.mismatch(fileTypeCode);
    }
    return visibleCharacter;
  }

  private boolean hasUtf16ByteOrderMark(byte[] prefix) {
    if (prefix.length < 2) {
      return false;
    }
    int first = prefix[0] & 0xff;
    int second = prefix[1] & 0xff;
    return (first == 0xff && second == 0xfe) || (first == 0xfe && second == 0xff);
  }

  private boolean invalidTextUnit(int unit) {
    return unit == 0
        || (unit < 0x20 && unit != '\n' && unit != '\r' && unit != '\t')
        || unit == 0x7f;
  }

  private boolean visibleTextUnit(int unit) {
    return unit >= 0x80 || (unit >= 0x20 && unit != 0x7f);
  }

  private boolean isExecutableSignature(byte[] prefix) {
    if (prefix.length >= 2 && prefix[0] == 'M' && prefix[1] == 'Z') {
      return true;
    }
    if (prefix.length >= 4
        && prefix[0] == 0x7f
        && prefix[1] == 'E'
        && prefix[2] == 'L'
        && prefix[3] == 'F') {
      return true;
    }
    if (prefix.length < 4) {
      return false;
    }
    int signature = ByteBuffer.wrap(prefix, 0, 4).order(ByteOrder.BIG_ENDIAN).getInt();
    return signature == 0xfeedface
        || signature == 0xcefaedfe
        || signature == 0xfeedfacf
        || signature == 0xcffaedfe
        || signature == 0xcafebabe;
  }

  private ContentEnvelope inspect(ContentSource source, int prefixCapacity, int tailCapacity)
      throws IOException {
    ByteArrayOutputStream prefix = new ByteArrayOutputStream(prefixCapacity);
    byte[] tail = new byte[tailCapacity];
    int tailLength = 0;
    long total = 0;
    try (InputStream input = limited(source.open())) {
      byte[] chunk = new byte[8192];
      int read;
      while ((read = input.read(chunk)) != -1) {
        if (prefix.size() < prefixCapacity) {
          int prefixBytes = Math.min(read, prefixCapacity - prefix.size());
          prefix.write(chunk, 0, prefixBytes);
        }
        if (tailCapacity > 0) {
          if (read >= tailCapacity) {
            System.arraycopy(chunk, read - tailCapacity, tail, 0, tailCapacity);
            tailLength = tailCapacity;
          } else {
            int retained = Math.min(tailLength, tailCapacity - read);
            if (retained > 0) {
              System.arraycopy(tail, tailLength - retained, tail, 0, retained);
            }
            System.arraycopy(chunk, 0, tail, retained, read);
            tailLength = retained + read;
          }
        }
        total += read;
      }
    }
    byte[] orderedTail = new byte[tailLength];
    if (tailLength > 0) {
      System.arraycopy(tail, 0, orderedTail, 0, tailLength);
    }
    return new ContentEnvelope(prefix.toByteArray(), orderedTail, total);
  }

  private InputStream limited(InputStream input) {
    return new SizeLimitedInputStream(input, MAX_UPLOAD_BYTES);
  }

  private long unsignedLittleEndianInt(byte[] bytes, int offset) {
    return Integer.toUnsignedLong(
        ByteBuffer.wrap(bytes, offset, Integer.BYTES).order(ByteOrder.LITTLE_ENDIAN).getInt());
  }

  private int unsignedLittleEndianShort(byte[] bytes, int offset) {
    return Short.toUnsignedInt(
        ByteBuffer.wrap(bytes, offset, Short.BYTES).order(ByteOrder.LITTLE_ENDIAN).getShort());
  }

  private boolean asciiDigit(byte value) {
    return value >= '0' && value <= '9';
  }

  private boolean startsWith(byte[] value, byte[] prefix) {
    if (value.length < prefix.length) {
      return false;
    }
    for (int index = 0; index < prefix.length; index++) {
      if (value[index] != prefix[index]) {
        return false;
      }
    }
    return true;
  }

  private boolean isAsciiWhitespace(byte value) {
    return value == ' ' || value == '\t' || value == '\r' || value == '\n' || value == '\f';
  }

  public record ValidationResult(String fileTypeCode, String rejectionMessage) {
    static ValidationResult accepted(String fileTypeCode) {
      return new ValidationResult(fileTypeCode, null);
    }

    static ValidationResult rejected(String message) {
      return new ValidationResult(null, message);
    }

    public boolean accepted() {
      return rejectionMessage == null;
    }
  }

  private enum OfficePackageType {
    NONE(null, null, null),
    WORD("DOCX", WORD_DOCUMENT_ENTRY, WORD_DOCUMENT_CONTENT_TYPE),
    EXCEL("XLSX", EXCEL_WORKBOOK_ENTRY, EXCEL_WORKBOOK_CONTENT_TYPE),
    POWERPOINT("PPTX", POWERPOINT_PRESENTATION_ENTRY, POWERPOINT_PRESENTATION_CONTENT_TYPE);

    private final String extension;
    private final String mainPart;
    private final String mainContentType;

    OfficePackageType(String extension, String mainPart, String mainContentType) {
      this.extension = extension;
      this.mainPart = mainPart;
      this.mainContentType = mainContentType;
    }

    String extension() {
      return extension;
    }

    String mainPart() {
      return mainPart;
    }

    String mainContentType() {
      return mainContentType;
    }
  }

  private enum OfficeFinding {
    MACRO("a macro"),
    ACTIVEX("an ActiveX control"),
    EMBEDDED_OBJECT("an embedded object"),
    EXTERNAL_LINK("an external link"),
    REMOTE_TEMPLATE("a link to a remote template"),
    DATA_CONNECTION("a data connection"),
    UNSUPPORTED_CONTENT("unsupported content"),
    INVALID_EMBEDDED_DOCUMENT("an embedded document that is not a safe, valid Office file"),
    NESTED_TOO_DEEP(
        "embedded documents nested more than " + MAX_EMBEDDED_PACKAGE_DEPTH + " levels deep");

    private final String description;

    OfficeFinding(String description) {
      this.description = description;
    }

    String description() {
      return description;
    }
  }

  @FunctionalInterface
  private interface ContentSource {
    InputStream open() throws IOException;
  }

  /**
   * Where an Office check runs: the uploaded file's extension, the chain of embedded parts that
   * leads to the package being checked, and the archive limits shared by every nested package.
   */
  private record OfficeScope(
      String uploadExtension, List<String> embeddedParts, ArchiveBudget budget) {
    static OfficeScope upload(String uploadExtension) {
      return new OfficeScope(uploadExtension, List.of(), new ArchiveBudget());
    }

    int depth() {
      return embeddedParts.size();
    }

    OfficeScope enter(String embeddedPart) {
      List<String> parts = new ArrayList<>(embeddedParts);
      parts.add(embeddedPart);
      return new OfficeScope(uploadExtension, List.copyOf(parts), budget);
    }

    InvalidAttachmentException refusal(OfficeFinding finding, String part) {
      String location =
          embeddedParts.isEmpty() ? part : String.join(" > ", embeddedParts) + " (" + part + ")";
      return InvalidAttachmentException.unsafeOfficeContent(
          uploadExtension, finding.description(), location);
    }
  }

  private static final class ArchiveBudget {
    private int entries;
    private long expandedBytes;
    private long retainedBytes;

    void countEntry() {
      entries++;
      if (entries > MAX_ARCHIVE_ENTRIES) {
        throw InvalidAttachmentException.unsafeArchive();
      }
    }

    void countExpandedBytes(int bytes) {
      expandedBytes += bytes;
      if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
        throw InvalidAttachmentException.unsafeArchive();
      }
    }

    long retainableBytes() {
      return MAX_RETAINED_EMBEDDED_BYTES - retainedBytes;
    }

    void retain(long bytes) {
      retainedBytes += bytes;
    }

    void release(long bytes) {
      retainedBytes -= bytes;
    }
  }

  /**
   * An embedded part held in memory while it is checked. Its buffer counts against the limit that
   * every nesting level shares, and never grows past what that limit has left.
   */
  private static final class EmbeddedPart {
    private byte[] bytes = new byte[0];
    private int length;

    boolean append(byte[] chunk, int count, ArchiveBudget budget) {
      int required = length + count;
      if (required > bytes.length) {
        long capacity =
            Math.min(
                Math.max(required, 2L * bytes.length), bytes.length + budget.retainableBytes());
        if (capacity < required) {
          return false;
        }
        budget.retain(capacity - bytes.length);
        bytes = Arrays.copyOf(bytes, (int) capacity);
      }
      System.arraycopy(chunk, 0, bytes, length, count);
      length = required;
      return true;
    }

    // Returns the unused part of the buffer to the shared limit once the part has been read.
    void trim(ArchiveBudget budget) {
      if (bytes.length > length) {
        budget.release(bytes.length - length);
        bytes = Arrays.copyOf(bytes, length);
      }
    }

    void release(ArchiveBudget budget) {
      budget.release(bytes.length);
      bytes = new byte[0];
      length = 0;
    }

    boolean startsWith(byte[] prefix) {
      return length >= prefix.length
          && Arrays.equals(bytes, 0, prefix.length, prefix, 0, prefix.length);
    }

    InputStream open() {
      return new ByteArrayInputStream(bytes, 0, length);
    }
  }

  private record ContentEnvelope(byte[] prefix, byte[] tail, long size) {}

  private record ZipEndRecord(
      int entryCount, long centralDirectoryOffset, long centralDirectorySize) {}

  private record LocalZipEntry(
      String name, int method, long crc, long compressedSize, long uncompressedSize) {}

  private record CentralZipEntry(
      String name,
      int flags,
      int method,
      long crc,
      long compressedSize,
      long uncompressedSize,
      long localHeaderOffset) {}

  /** Content types by extension and by part, and the refused Default content types. */
  private record ContentTypeManifest(
      Map<String, String> defaults,
      Map<String, String> overrides,
      Map<String, OfficeFinding> refusedDefaults) {}

  private static final class InvalidAttachmentException extends RuntimeException {
    private final String userMessage;
    private final boolean namesOfficePart;

    private InvalidAttachmentException(String userMessage) {
      this(userMessage, false);
    }

    private InvalidAttachmentException(String userMessage, boolean namesOfficePart) {
      super(userMessage);
      this.userMessage = userMessage;
      this.namesOfficePart = namesOfficePart;
    }

    static InvalidAttachmentException mismatch(String fileTypeCode) {
      return new InvalidAttachmentException(
          "The uploaded file content does not match the ." + fileTypeCode + " file extension.");
    }

    static InvalidAttachmentException unsafeArchive() {
      return new InvalidAttachmentException(
          "The uploaded ZIP file is not a safe, valid ZIP archive.");
    }

    static InvalidAttachmentException unsafeOfficeContent(
        String fileTypeCode, String finding, String location) {
      return new InvalidAttachmentException(
          "The uploaded ." + fileTypeCode + " file contains " + finding + " in " + location + ".",
          true);
    }

    static InvalidAttachmentException unsafeLegacyOffice(String fileTypeCode) {
      return new InvalidAttachmentException(
          "The uploaded ." + fileTypeCode + " file contains an embedded object or macro.");
    }

    String userMessage() {
      return userMessage;
    }

    boolean namesOfficePart() {
      return namesOfficePart;
    }
  }

  static final class SizeLimitedInputStream extends FilterInputStream {
    private final long maximumBytes;
    private long bytesRead;

    SizeLimitedInputStream(InputStream input, long maximumBytes) {
      super(input);
      this.maximumBytes = maximumBytes;
    }

    @Override
    public int read() throws IOException {
      int value = super.read();
      if (value >= 0) {
        recordRead(1);
      }
      return value;
    }

    @Override
    public int read(byte[] bytes, int offset, int length) throws IOException {
      int read = super.read(bytes, offset, length);
      if (read > 0) {
        recordRead(read);
      }
      return read;
    }

    @Override
    public long skip(long count) throws IOException {
      if (count <= 0) {
        return 0;
      }
      long remaining = maximumBytes - bytesRead;
      if (remaining <= 0) {
        int value = super.read();
        if (value >= 0) {
          throw new IOException("Upload exceeds the configured size limit.");
        }
        return 0;
      }
      long skipped = super.skip(Math.min(count, remaining));
      if (skipped > 0) {
        recordRead(Math.toIntExact(skipped));
      }
      return skipped;
    }

    private void recordRead(int count) throws IOException {
      bytesRead += count;
      if (bytesRead > maximumBytes) {
        throw new IOException("Upload exceeds the configured size limit.");
      }
    }
  }
}

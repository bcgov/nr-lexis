package ca.bc.gov.mof.lexis.service.upload;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipInputStream;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
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
  private static final Charset ZIP_LEGACY_CHARSET = Charset.forName("IBM437");

  private static final Set<String> SUPPORTED_FILE_TYPES =
      Set.of(
          "BMP", "CSV", "DOC", "DOCX", "JPG", "PDF", "PNG", "RTF", "TXT", "XLS",
          "XLSX", "XML", "ZIP");

  private static final String CONTENT_TYPES_ENTRY = "[Content_Types].xml";
  private static final String PACKAGE_RELATIONSHIPS_ENTRY = "_rels/.rels";
  private static final String WORD_DOCUMENT_ENTRY = "word/document.xml";
  private static final String EXCEL_WORKBOOK_ENTRY = "xl/workbook.xml";
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
  private static final Set<String> OFFICE_DOCUMENT_RELATIONSHIP_TYPES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument");
  private static final Set<String> HYPERLINK_RELATIONSHIP_TYPES =
      Set.of(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
          "http://purl.oclc.org/ooxml/officeDocument/relationships/hyperlink");

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
      return ValidationResult.rejected("Files must be 20 MiB or smaller.");
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
      if (Character.isISOControl(character)
          || character == '/'
          || character == '\\'
          || character == ':') {
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
      case "DOCX" -> validateZip(file, OfficePackageType.WORD);
      case "XLSX" -> validateZip(file, OfficePackageType.EXCEL);
      case "ZIP" -> validateZip(file, OfficePackageType.NONE);
      case "XML" -> validateXml(file);
      case "CSV", "TXT" -> validateText(file);
      default -> throw InvalidAttachmentException.mismatch(fileTypeCode);
    }
  }

  private void validateBmp(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file, 64, 0);
    byte[] prefix = envelope.prefix();
    if (prefix.length < 26 || prefix[0] != 'B' || prefix[1] != 'M') {
      throw InvalidAttachmentException.mismatch("BMP");
    }
    long declaredSize = unsignedLittleEndianInt(prefix, 2);
    long pixelOffset = unsignedLittleEndianInt(prefix, 10);
    long dibHeaderSize = unsignedLittleEndianInt(prefix, 14);
    if (declaredSize != envelope.size()
        || dibHeaderSize < 12
        || 14 + dibHeaderSize > envelope.size()
        || pixelOffset < 14 + dibHeaderSize
        || pixelOffset >= envelope.size()) {
      throw InvalidAttachmentException.mismatch("BMP");
    }
  }

  private void validateJpeg(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file, 4, 2);
    byte[] prefix = envelope.prefix();
    byte[] tail = envelope.tail();
    if (prefix.length < 4
        || (prefix[0] & 0xff) != 0xff
        || (prefix[1] & 0xff) != 0xd8
        || (prefix[2] & 0xff) != 0xff
        || tail.length < 2
        || (tail[tail.length - 2] & 0xff) != 0xff
        || (tail[tail.length - 1] & 0xff) != 0xd9) {
      throw InvalidAttachmentException.mismatch("JPG");
    }
  }

  private void validatePdf(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file, 8, 8192);
    byte[] prefix = envelope.prefix();
    if (prefix.length < 8
        || prefix[0] != '%'
        || prefix[1] != 'P'
        || prefix[2] != 'D'
        || prefix[3] != 'F'
        || prefix[4] != '-'
        || !asciiDigit(prefix[5])
        || prefix[6] != '.'
        || !asciiDigit(prefix[7])
        || !endsWithPdfEof(envelope.tail())) {
      throw InvalidAttachmentException.mismatch("PDF");
    }
  }

  private void validatePng(MultipartFile file) throws IOException {
    byte[] signature =
        new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a};
    byte[] iend =
        new byte[] {0, 0, 0, 0, 'I', 'E', 'N', 'D', (byte) 0xae, 0x42, 0x60, (byte) 0x82};
    ContentEnvelope envelope = inspect(file, signature.length, iend.length);
    if (!startsWith(envelope.prefix(), signature) || !endsWith(envelope.tail(), iend)) {
      throw InvalidAttachmentException.mismatch("PNG");
    }
  }

  private void validateRtf(MultipartFile file) throws IOException {
    ContentEnvelope envelope = inspect(file, 8, 64);
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
    } catch (InvalidAttachmentException ex) {
      throw ex;
    } catch (IOException | RuntimeException ex) {
      throw InvalidAttachmentException.mismatch(expectWordDocument ? "DOC" : "XLS");
    }
  }

  private void validateZip(MultipartFile file, OfficePackageType packageType) throws IOException {
    ContentEnvelope envelope = inspect(file, 4, ZIP_END_RECORD_MAX_BYTES);
    ZipEndRecord endRecord = validateZipEnvelope(envelope);
    Set<String> entryNames = new HashSet<>();
    Set<String> caseInsensitiveEntryNames = new HashSet<>();
    Map<String, LocalZipEntry> localEntries = new HashMap<>();
    ContentTypeManifest contentTypes = null;
    String officeDocumentTarget = null;
    int entryCount = 0;
    long totalExpandedBytes = 0;

    try (InputStream input = limited(file.getInputStream());
        ZipInputStream zip = new ZipInputStream(input, ZIP_LEGACY_CHARSET)) {
      ZipEntry entry;
      while ((entry = zip.getNextEntry()) != null) {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        String entryName = entry.getName();
        if (!safeArchiveEntryName(entryName)
            || !entryNames.add(entryName)
            || !caseInsensitiveEntryNames.add(entryName.toLowerCase(Locale.ROOT))) {
          throw InvalidAttachmentException.unsafeArchive();
        }
        if (packageType != OfficePackageType.NONE && unsafeOfficePart(entryName)) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if (entry.getSize() > MAX_ARCHIVE_ENTRY_BYTES) {
          throw InvalidAttachmentException.unsafeArchive();
        }

        boolean capture =
            packageType != OfficePackageType.NONE
                && (CONTENT_TYPES_ENTRY.equals(entryName) || entryName.endsWith(".rels"));
        ByteArrayOutputStream captured = capture ? new ByteArrayOutputStream() : null;
        byte[] chunk = new byte[8192];
        long entryExpandedBytes = 0;
        int read;
        while ((read = zip.read(chunk)) != -1) {
          entryExpandedBytes += read;
          totalExpandedBytes += read;
          if (entryExpandedBytes > MAX_ARCHIVE_ENTRY_BYTES
              || totalExpandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
            throw InvalidAttachmentException.unsafeArchive();
          }
          if (captured != null) {
            if (entryExpandedBytes > MAX_CAPTURED_PACKAGE_PART_BYTES) {
              throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
            }
            captured.write(chunk, 0, read);
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
              throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
            }
            contentTypes = parseContentTypes(captured.toByteArray(), packageType);
          } else {
            String target = parseRelationships(captured.toByteArray(), packageType);
            if (PACKAGE_RELATIONSHIPS_ENTRY.equals(entryName)) {
              if (officeDocumentTarget != null || target == null) {
                throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
              }
              officeDocumentTarget = target;
            }
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
    validateCentralDirectory(file, endRecord, localEntries);
    if (packageType == OfficePackageType.NONE) {
      return;
    }

    String expectedPart = packageType.mainPart();
    if (!entryNames.contains(CONTENT_TYPES_ENTRY)
        || !entryNames.contains(PACKAGE_RELATIONSHIPS_ENTRY)
        || !entryNames.contains(expectedPart)
        || entryNames.contains(packageType.otherMainPart())
        || !expectedPart.equals(normalizePackageTarget(officeDocumentTarget))
        || contentTypes == null
        || !packageType.mainContentType().equals(resolveContentType(contentTypes, expectedPart))) {
      throw InvalidAttachmentException.mismatch(packageType.extension());
    }
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
      MultipartFile file, ZipEndRecord endRecord, Map<String, LocalZipEntry> localEntries)
      throws IOException {
    List<CentralZipEntry> centralEntries = new ArrayList<>(endRecord.entryCount());
    Set<String> names = new HashSet<>();
    Set<String> caseInsensitiveNames = new HashSet<>();
    long remaining = endRecord.centralDirectorySize();

    try (InputStream input = limited(file.getInputStream())) {
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

    validateLocalHeaders(file, endRecord.centralDirectoryOffset(), centralEntries);
  }

  private void validateLocalHeaders(
      MultipartFile file, long centralDirectoryOffset, List<CentralZipEntry> centralEntries)
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

    try (InputStream input = limited(file.getInputStream())) {
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

  private boolean unsafeOfficePart(String entryName) {
    String normalized = entryName.toLowerCase(Locale.ROOT);
    return normalized.contains("vbaproject")
        || normalized.startsWith("word/activex/")
        || normalized.startsWith("word/embeddings/")
        || normalized.startsWith("word/externallinks/")
        || normalized.startsWith("word/customui/")
        || normalized.startsWith("word/afchunk")
        || normalized.startsWith("xl/activex/")
        || normalized.startsWith("xl/embeddings/")
        || normalized.startsWith("xl/externallinks/")
        || normalized.startsWith("xl/customui/")
        || normalized.startsWith("xl/querytables/")
        || normalized.equals("xl/connections.xml");
  }

  private ContentTypeManifest parseContentTypes(byte[] bytes, OfficePackageType packageType) {
    Map<String, String> defaults = new HashMap<>();
    Map<String, String> overrides = new HashMap<>();
    XMLInputFactory factory = secureXmlInputFactory();
    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.DTD) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if (event != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          if (!"Types".equals(reader.getLocalName())
              || !CONTENT_TYPES_NAMESPACE.equals(reader.getNamespaceURI())) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
          }
          continue;
        }
        if (!CONTENT_TYPES_NAMESPACE.equals(reader.getNamespaceURI())) {
          continue;
        }
        String contentType = reader.getAttributeValue(null, "ContentType");
        if (contentType == null || unsafeOfficeContentType(contentType)) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if ("Default".equals(reader.getLocalName())) {
          String extension = reader.getAttributeValue(null, "Extension");
          if (extension == null
              || extension.isBlank()
              || defaults.putIfAbsent(extension.toLowerCase(Locale.ROOT), contentType) != null) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
          }
        } else if ("Override".equals(reader.getLocalName())) {
          String partName = reader.getAttributeValue(null, "PartName");
          if (partName == null
              || !partName.startsWith("/")
              || !safeArchiveEntryName(partName.substring(1))
              || overrides.putIfAbsent(partName.substring(1), contentType) != null) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
          }
        }
      }
      reader.close();
      if (!rootSeen
          || !RELATIONSHIPS_CONTENT_TYPE.equals(defaults.get("rels"))) {
        throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
      }
      return new ContentTypeManifest(Map.copyOf(defaults), Map.copyOf(overrides));
    } catch (XMLStreamException ex) {
      throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
    }
  }

  private String parseRelationships(byte[] bytes, OfficePackageType packageType) {
    String officeDocumentTarget = null;
    XMLInputFactory factory = secureXmlInputFactory();
    try {
      XMLStreamReader reader = factory.createXMLStreamReader(new ByteArrayInputStream(bytes));
      boolean rootSeen = false;
      while (reader.hasNext()) {
        int event = reader.next();
        if (event == XMLStreamConstants.DTD) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if (event != XMLStreamConstants.START_ELEMENT) {
          continue;
        }
        if (!rootSeen) {
          rootSeen = true;
          if (!"Relationships".equals(reader.getLocalName())
              || !RELATIONSHIPS_NAMESPACE.equals(reader.getNamespaceURI())) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
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
        if (type == null
            || target == null
            || unsafeRelationshipType(type)) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if ("external".equalsIgnoreCase(targetMode)) {
          if (!HYPERLINK_RELATIONSHIP_TYPES.contains(type) || !safeExternalHyperlink(target)) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
          }
          continue;
        }
        if (targetMode != null && !targetMode.isBlank()) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if (unsafeInternalRelationshipTarget(target)) {
          throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
        }
        if (OFFICE_DOCUMENT_RELATIONSHIP_TYPES.contains(type)) {
          if (officeDocumentTarget != null) {
            throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
          }
          officeDocumentTarget = target;
        }
      }
      reader.close();
      if (!rootSeen) {
        throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
      }
      return officeDocumentTarget;
    } catch (XMLStreamException ex) {
      throw InvalidAttachmentException.unsafeOfficePackage(packageType.extension());
    }
  }

  private boolean unsafeOfficeContentType(String contentType) {
    String normalized = contentType.toLowerCase(Locale.ROOT);
    return normalized.contains("macroenabled")
        || normalized.contains("macrosheet")
        || normalized.contains("vbaproject")
        || normalized.contains("oleobject")
        || normalized.contains("activex")
        || normalized.contains("externallink")
        || normalized.contains("querytable")
        || normalized.contains("connections");
  }

  private boolean unsafeRelationshipType(String type) {
    String normalized = type.toLowerCase(Locale.ROOT);
    return normalized.contains("vbaproject")
        || normalized.endsWith("/oleobject")
        || normalized.endsWith("/activexcontrol")
        || normalized.endsWith("/externallink")
        || normalized.endsWith("/attachedtemplate")
        || normalized.endsWith("/afchunk")
        || normalized.endsWith("/connections")
        || normalized.endsWith("/querytable");
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
    try (InputStream input = limited(file.getInputStream())) {
      byte[] prefix = input.readNBytes(4);
      if (isExecutableSignature(prefix)) {
        throw InvalidAttachmentException.mismatch(extension(file.getOriginalFilename()));
      }
      boolean visibleCharacter = false;
      for (byte value : prefix) {
        if (invalidTextByte(value)) {
          throw InvalidAttachmentException.mismatch(extension(file.getOriginalFilename()));
        }
        visibleCharacter |= visibleTextByte(value);
      }
      byte[] chunk = new byte[8192];
      int read;
      while ((read = input.read(chunk)) != -1) {
        for (int index = 0; index < read; index++) {
          if (invalidTextByte(chunk[index])) {
            throw InvalidAttachmentException.mismatch(extension(file.getOriginalFilename()));
          }
          visibleCharacter |= visibleTextByte(chunk[index]);
        }
      }
      if (!visibleCharacter) {
        throw InvalidAttachmentException.mismatch(extension(file.getOriginalFilename()));
      }
    }
  }

  private boolean invalidTextByte(byte value) {
    int unsigned = value & 0xff;
    return unsigned == 0
        || (unsigned < 0x20 && unsigned != '\n' && unsigned != '\r' && unsigned != '\t')
        || unsigned == 0x7f;
  }

  private boolean visibleTextByte(byte value) {
    int unsigned = value & 0xff;
    return unsigned >= 0x80 || (unsigned >= 0x20 && unsigned != 0x7f);
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

  private ContentEnvelope inspect(MultipartFile file, int prefixCapacity, int tailCapacity)
      throws IOException {
    ByteArrayOutputStream prefix = new ByteArrayOutputStream(prefixCapacity);
    byte[] tail = new byte[tailCapacity];
    int tailLength = 0;
    long total = 0;
    try (InputStream input = limited(file.getInputStream())) {
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

  private boolean endsWith(byte[] value, byte[] suffix) {
    if (value.length < suffix.length) {
      return false;
    }
    int offset = value.length - suffix.length;
    for (int index = 0; index < suffix.length; index++) {
      if (value[offset + index] != suffix[index]) {
        return false;
      }
    }
    return true;
  }

  private boolean endsWithPdfEof(byte[] tail) {
    byte[] marker = "%%EOF".getBytes(StandardCharsets.US_ASCII);
    for (int index = tail.length - marker.length; index >= 0; index--) {
      boolean matches = true;
      for (int markerIndex = 0; markerIndex < marker.length; markerIndex++) {
        if (tail[index + markerIndex] != marker[markerIndex]) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        continue;
      }
      for (int suffixIndex = index + marker.length; suffixIndex < tail.length; suffixIndex++) {
        if (!isAsciiWhitespace(tail[suffixIndex])) {
          return false;
        }
      }
      return true;
    }
    return false;
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
    NONE(null, null, null, null),
    WORD("DOCX", WORD_DOCUMENT_ENTRY, EXCEL_WORKBOOK_ENTRY, WORD_DOCUMENT_CONTENT_TYPE),
    EXCEL("XLSX", EXCEL_WORKBOOK_ENTRY, WORD_DOCUMENT_ENTRY, EXCEL_WORKBOOK_CONTENT_TYPE);

    private final String extension;
    private final String mainPart;
    private final String otherMainPart;
    private final String mainContentType;

    OfficePackageType(
        String extension, String mainPart, String otherMainPart, String mainContentType) {
      this.extension = extension;
      this.mainPart = mainPart;
      this.otherMainPart = otherMainPart;
      this.mainContentType = mainContentType;
    }

    String extension() {
      return extension;
    }

    String mainPart() {
      return mainPart;
    }

    String otherMainPart() {
      return otherMainPart;
    }

    String mainContentType() {
      return mainContentType;
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

  private record ContentTypeManifest(
      Map<String, String> defaults, Map<String, String> overrides) {}

  private static final class InvalidAttachmentException extends RuntimeException {
    private final String userMessage;

    private InvalidAttachmentException(String userMessage) {
      super(userMessage);
      this.userMessage = userMessage;
    }

    static InvalidAttachmentException mismatch(String fileTypeCode) {
      return new InvalidAttachmentException(
          "The uploaded file content does not match the ." + fileTypeCode + " file extension.");
    }

    static InvalidAttachmentException unsafeArchive() {
      return new InvalidAttachmentException(
          "The uploaded ZIP file is not a safe, valid ZIP archive.");
    }

    static InvalidAttachmentException unsafeOfficePackage(String fileTypeCode) {
      return new InvalidAttachmentException(
          "The uploaded ." + fileTypeCode + " file is not a safe Office document.");
    }

    String userMessage() {
      return userMessage;
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

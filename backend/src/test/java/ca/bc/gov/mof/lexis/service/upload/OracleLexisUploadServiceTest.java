package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository.UploadFailureReason;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository.UploadPersistenceResult;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleLexisUploadService")
class OracleLexisUploadServiceTest {

  @Mock private UploadRepository uploadRepository;
  @Mock private VirusScanService virusScanService;

  @Test
  void uploadApplicationShouldUppercaseFileExtensionBeforePersisting() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(UploadPersistenceResult.success());

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.uploadType()).isEqualTo("application");
    assertThat(result.fileName()).isEqualTo("application.pdf");
    verify(uploadRepository)
        .insertApplicationFile(
            eq(7000123L),
            eq("application.pdf"),
            eq("App file"),
            eq("INS"),
            eq("PDF"),
            eq("jsmith"),
            any(byte[].class));
  }

  @ParameterizedTest
  @CsvSource({
    "application.pdf, application/pdf, PDF",
    "application.jpg, image/jpeg, JPG",
    "application.png, image/png, PNG"
  })
  void uploadApplicationShouldScanLegacyDocumentUploadsBeforeOracleInsert(
      String fileName, String contentType, String fileTypeCode) {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", fileName, contentType, "file-bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid(fileTypeCode)).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq(fileName),
                eq("Application document"),
                eq("INS"),
                eq(fileTypeCode),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(UploadPersistenceResult.success());

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "Application document", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("accepted");
    InOrder ordered = inOrder(virusScanService, uploadRepository);
    ordered.verify(virusScanService).assertClean(file);
    ordered
        .verify(uploadRepository)
        .insertApplicationFile(
            eq(7000123L),
            eq(fileName),
            eq("Application document"),
            eq("INS"),
            eq(fileTypeCode),
            eq("jsmith"),
            any(byte[].class));
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultForUnsupportedFileTypeBeforeInsert() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.xyz", "application/octet-stream", "bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid("XYZ")).thenReturn(false);

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "File type XYZ is not configured in LEXIS. Use a supported file type before uploading.");
    verify(uploadRepository).isFileTypeCodeValid("XYZ");
    verifyNoMoreInteractions(uploadRepository);
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultWhenVirusScanFailsBeforeInsert() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid("PDF")).thenReturn(true);
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(file);

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).isEqualTo("The uploaded file failed virus scanning.");
    verify(uploadRepository).isFileTypeCodeValid("PDF");
    verifyNoMoreInteractions(uploadRepository);
  }

  @Test
  void uploadApplicationShouldRejectFilesWithoutExtensionBeforeCallingOracle() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application", "application/octet-stream", "bytes".getBytes(StandardCharsets.UTF_8));

    assertThat(service.uploadApplication(file, 7000123L, "App file", "jsmith")).isEmpty();
    verifyNoInteractions(uploadRepository);
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultWhenOracleDoesNotPersist() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(UploadPersistenceResult.failed(UploadFailureReason.UNKNOWN));

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "Could not attach file to application 7000123. Confirm the application exists before uploading.");
  }

  @Test
  void uploadApplicationShouldReturnParentKeyMessageWhenOracleParentIsMissing() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(uploadRepository.isFileTypeCodeValid("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(UploadPersistenceResult.failed(UploadFailureReason.PARENT_NOT_FOUND));

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "Could not attach file to application 7000123 because the Oracle attachment parent row was not found. Refresh the details page and confirm the application is saved before uploading.");
  }

  @Test
  void uploadInvoiceShouldRejectInvalidLegacyInvoiceFieldsBeforeCallingOracle() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "invoice.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));

    assertThat(
            service.uploadInvoice(
                file,
                7000123L,
                "1234567890",
                "",
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                "jsmith"))
        .isEmpty();
    verifyNoInteractions(uploadRepository);
  }

  private OracleLexisUploadService service() {
    return new OracleLexisUploadService(uploadRepository, virusScanService);
  }
}

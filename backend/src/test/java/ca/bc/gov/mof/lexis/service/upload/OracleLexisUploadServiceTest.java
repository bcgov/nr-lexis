package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import java.io.ByteArrayInputStream;
import java.io.InputStream;
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
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.multipart.MultipartFile;

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
            "formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(InputStream.class),
                eq(file.getSize())))
        .thenReturn(UploadPersistenceResult.success());

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "  App file  ", "jsmith").orElseThrow();

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
            any(InputStream.class),
            eq(file.getSize()));
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
        new MockMultipartFile("formFile", fileName, contentType, validContent(fileTypeCode));
    when(uploadRepository.isFileTypeCodeValidRequired(fileTypeCode)).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq(fileName),
                eq("Application document"),
                eq("INS"),
                eq(fileTypeCode),
                eq("jsmith"),
                any(InputStream.class),
                eq(file.getSize())))
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
            any(InputStream.class),
            eq(file.getSize()));
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultForUnsupportedFileTypeBeforeInsert() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.xyz", "application/octet-stream", "bytes".getBytes(StandardCharsets.UTF_8));
    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "File type XYZ is not configured in LEXIS. Use a supported file type before uploading.");
    verifyNoInteractions(uploadRepository, virusScanService);
  }

  @Test
  void uploadApplicationShouldTreatLegitimatelyMissingOracleFileTypeAsUnsupported() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(false);

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "File type PDF is not configured in LEXIS. Use a supported file type before uploading.");
    verifyNoInteractions(virusScanService);
  }

  @Test
  void uploadApplicationShouldPropagateOracleFileTypeLookupFailure() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", validPdf());
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("file type lookup unavailable");
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenThrow(failure);

    assertThatThrownBy(
            () -> service.uploadApplication(file, 7000123L, "App file", "jsmith"))
        .isSameAs(failure);
    verifyNoInteractions(virusScanService);
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultWhenVirusScanFailsBeforeInsert() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(file);

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).isEqualTo("The uploaded file failed virus scanning.");
    verify(uploadRepository).isFileTypeCodeValidRequired("PDF");
    verifyNoMoreInteractions(uploadRepository);
  }

  @Test
  void uploadApplicationShouldRejectFilesWithoutExtensionBeforeCallingOracle() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application", "application/octet-stream", "bytes".getBytes(StandardCharsets.UTF_8));

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).contains("file extension");
    verifyNoInteractions(uploadRepository, virusScanService);
  }

  @Test
  void everyOracleAttachmentPathShouldRejectUnsafeMetadataBeforeLookupScanOrPersistence() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", validPdf());
    String unsafeDescription = "non-ASCII café";

    assertThat(
            service
                .uploadApplication(file, 7000123L, unsafeDescription, "jsmith")
                .orElseThrow()
                .status())
        .isEqualTo("rejected");
    assertThat(
            service
                .uploadPermit(file, 7000123L, unsafeDescription, "jsmith")
                .orElseThrow()
                .status())
        .isEqualTo("rejected");
    assertThat(
            service
                .uploadExemption(file, "E-100", unsafeDescription, "jsmith")
                .orElseThrow()
                .status())
        .isEqualTo("rejected");
    assertThat(
            service
                .uploadInvoice(
                    file,
                    7000123L,
                    "123456789",
                    unsafeDescription,
                    BigDecimal.ONE,
                    BigDecimal.ONE,
                    BigDecimal.ONE,
                    "jsmith")
                .orElseThrow()
                .status())
        .isEqualTo("rejected");
    verifyNoInteractions(uploadRepository, virusScanService);
  }

  @Test
  void validateAndUploadShouldRejectContentMismatchBeforeLookupScanOrPersistence() {
    OracleLexisUploadService service = service();
    MockMultipartFile executable =
        new MockMultipartFile(
            "formFile",
            "renamed.pdf",
            "application/pdf",
            new byte[] {'M', 'Z', 0, 0, 'b', 'i', 'n'});

    assertThat(service.validateDocument(executable, "application").orElseThrow().status())
        .isEqualTo("rejected");
    assertThat(
            service
                .uploadApplication(executable, 7000123L, "description", "jsmith")
                .orElseThrow()
                .status())
        .isEqualTo("rejected");
    verifyNoInteractions(uploadRepository, virusScanService);
  }

  @Test
  void validationShouldNotClaimVirusScanningWhenItIsDisabled() {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(virusScanService.isEnabled()).thenReturn(false);

    LexisUploadResultDto result =
        service().validateDocument(file, "application").orElseThrow();

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.message()).isEqualTo("File passed validation.");
    verify(virusScanService).assertClean(file);
  }

  @Test
  void validationShouldConfirmVirusScanningWhenItIsEnabled() {
    MockMultipartFile file =
        new MockMultipartFile("formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(virusScanService.isEnabled()).thenReturn(true);

    LexisUploadResultDto result =
        service().validateDocument(file, "application").orElseThrow();

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.message()).isEqualTo("File passed validation and virus scanning.");
    verify(virusScanService).assertClean(file);
  }

  @Test
  void uploadShouldRejectUnsafeFileNameBeforeLookupScanOrPersistence() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile("formFile", "café.pdf", "application/pdf", validPdf());

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "description", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).contains("US-ASCII");
    verifyNoInteractions(uploadRepository, virusScanService);
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultWhenOracleDoesNotPersist() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(InputStream.class),
                eq(file.getSize())))
        .thenReturn(UploadPersistenceResult.failed(UploadFailureReason.UNKNOWN));

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "Could not attach file to application 7000123. Confirm the application exists before uploading.");
  }

  @Test
  void uploadApplicationShouldRollBackWhenOracleResultCannotBeVerified() {
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(InputStream.class),
                eq(file.getSize())))
        .thenReturn(UploadPersistenceResult.failed(UploadFailureReason.UNKNOWN));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    LexisUploadResultDto result =
        transactionalService(transactionManager)
            .uploadApplication(file, 7000123L, "App file", "jsmith")
            .orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void uploadApplicationShouldReturnParentKeyMessageWhenOracleParentIsMissing() {
    OracleLexisUploadService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", validPdf());
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(InputStream.class),
                eq(file.getSize())))
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

  @Test
  void uploadApplicationShouldStreamContentWithoutMaterializingMultipartBytes() throws Exception {
    OracleLexisUploadService service = service();
    byte[] bytes = validPdf();
    MultipartFile file = mock(MultipartFile.class);
    when(file.isEmpty()).thenReturn(false);
    when(file.getOriginalFilename()).thenReturn("application.pdf");
    when(file.getSize()).thenReturn((long) bytes.length);
    when(file.getInputStream()).thenAnswer(ignored -> new ByteArrayInputStream(bytes));
    when(uploadRepository.isFileTypeCodeValidRequired("PDF")).thenReturn(true);
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(InputStream.class),
                eq((long) bytes.length)))
        .thenReturn(UploadPersistenceResult.success());

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("accepted");
    verify(file, times(2)).getInputStream();
    verify(file, never()).getBytes();
  }

  private OracleLexisUploadService service() {
    return new OracleLexisUploadService(
        uploadRepository, virusScanService, new AttachmentUploadValidator());
  }

  private LexisUploadService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service());
    proxyFactory.addAdvice(transactionInterceptor);
    return (LexisUploadService) proxyFactory.getProxy();
  }

  private byte[] validContent(String fileTypeCode) {
    return switch (fileTypeCode) {
      case "PDF" -> validPdf();
      case "JPG" ->
          new byte[] {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xe0, (byte) 0xff, (byte) 0xd9};
      case "PNG" ->
          new byte[] {
            (byte) 0x89,
            'P',
            'N',
            'G',
            0x0d,
            0x0a,
            0x1a,
            0x0a,
            0,
            0,
            0,
            0,
            'I',
            'E',
            'N',
            'D',
            (byte) 0xae,
            0x42,
            0x60,
            (byte) 0x82
          };
      default -> throw new IllegalArgumentException("Unsupported fixture type " + fileTypeCode);
    };
  }

  private byte[] validPdf() {
    return "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
  }

  private static final class RecordingTransactionManager
      extends AbstractPlatformTransactionManager {

    private int commits;
    private int rollbacks;

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // Nothing to enlist for this transaction-boundary test.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisUploadController")
class LexisUploadControllerTest {

  @Mock private ObjectProvider<LexisUploadService> uploadServiceProvider;
  @Mock private ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider;
  @Mock private LexisUploadService uploadService;
  @Mock private ApplicationSubmissionImportService applicationSubmissionImportService;
  @Mock private ApplicationEditLockService applicationEditLockService;

  @Test
  void uploadShouldReturnBadRequestForEmptyFile() {
    LexisUploadController controller = controller();
    MultipartFile file = new MockMultipartFile("file", "empty.csv", "text/csv", new byte[0]);

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(file, null, 7000123L, "test", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("Choose a file and enter a valid application number before uploading documents.");
    verifyNoInteractions(uploadService);
  }

  @Test
  void uploadShouldReturnNoContentWhenServiceMissing() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(null);
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("application.csv");

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(file, null, 7000123L, "test", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(uploadService);
  }

  @Test
  void fileApplicationUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("application.csv");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("application", "application.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadApplication(file, 7000123L, "App file", "jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(file, null, 7000123L, "App file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadApplication(file, 7000123L, "App file", "jsmith");
  }

  @Test
  void fileApplicationUploadShouldAcceptReactFormFileField() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile formFile = sampleFile("application.pdf");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("application", "application.pdf", formFile.getSize(), "accepted", "queued");
    when(uploadService.uploadApplication(formFile, 7000123L, "App file", null))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(null, formFile, 7000123L, "App file", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadApplication(formFile, 7000123L, "App file", null);
  }

  @Test
  void fileApplicationUploadShouldReturnUnprocessableEntityWhenPersistenceFails() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile formFile = sampleFile("application.pdf");
    when(uploadService.uploadApplication(formFile, 7000123L, "App file", null))
        .thenReturn(Optional.empty());

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(null, formFile, 7000123L, "App file", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo(
            "We were unable to save this application document. Confirm the application exists and try again.");
    verify(uploadService).uploadApplication(formFile, 7000123L, "App file", null);
  }

  @Test
  void fileApplicationUploadShouldReturnRejectedPayloadWhenPersistenceFails() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile formFile = sampleFile("application.pdf");
    LexisUploadResultDto payload =
        new LexisUploadResultDto(
            "application",
            "application.pdf",
            formFile.getSize(),
            "rejected",
            "Could not attach file to application 7000123. Confirm the application exists before uploading.");
    when(uploadService.uploadApplication(formFile, 7000123L, "App file", null))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(null, formFile, 7000123L, "App file", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadApplication(formFile, 7000123L, "App file", null);
  }

  @Test
  void fileApplicationUploadShouldRejectWhenApplicationLockedByAnotherUser() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("application.pdf");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(applicationEditLockService.snapshot(7000123L, "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This application is currently locked for editing by another user.",
                null));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(file, null, 7000123L, "App file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("This application is currently locked for editing by another user.");
    verify(uploadServiceProvider, never()).getIfAvailable();
  }

  @Test
  void filePermitUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("permit.csv");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("permit", "permit.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadPermit(file, 7000123L, "Permit file", "jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.filePermitUpload(file, null, 7000123L, "Permit file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadPermit(file, 7000123L, "Permit file", "jsmith");
  }

  @Test
  void fileExemptionUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("exemption.csv");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("exemption", "exemption.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadExemption(file, "E-123", "Exemption file", "jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileExemptionUpload(file, null, "E-123", "Exemption file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadExemption(file, "E-123", "Exemption file", "jsmith");
  }

  @Test
  void fileInvoiceUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("invoice.csv");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("invoice", "invoice.csv", file.getSize(), "accepted", "queued");
    when(
            uploadService.uploadInvoice(
                file,
                7000123L,
                "INV-1001",
                "Invoice INV-1001",
                BigDecimal.valueOf(1234.56),
                BigDecimal.valueOf(1.25),
                BigDecimal.valueOf(55.0),
                "jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileInvoiceUpload(
            file,
            null,
            7000123L,
            "INV-1001",
            "Invoice INV-1001",
            null,
            BigDecimal.valueOf(1234.56),
            null,
            BigDecimal.valueOf(1.25),
            null,
            BigDecimal.valueOf(55.0),
            null,
            authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService)
        .uploadInvoice(
            file,
            7000123L,
            "INV-1001",
            "Invoice INV-1001",
            BigDecimal.valueOf(1234.56),
            BigDecimal.valueOf(1.25),
            BigDecimal.valueOf(55.0),
            "jsmith");
  }

  @Test
  void filePermitUploadShouldReturnBadRequestWhenPermitNumberMissing() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("permit.csv");

    ResponseEntity<LexisUploadResultDto> response =
        controller.filePermitUpload(file, null, null, "Permit file", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("Choose a file and enter a valid permit number before uploading documents.");
    verifyNoInteractions(uploadService);
  }

  @Test
  void applicationSubmissionUploadShouldReturnBadRequestPayloadForMissingFile() {
    LexisUploadController controller = controller();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionUpload(null, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("Choose a LEXIS application submission file before uploading.");
    assertThat(response.getBody().errors())
        .containsExactly("Choose a LEXIS application submission file before uploading.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void applicationSubmissionUploadShouldDelegateToImportService() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "accepted",
            "created",
            9001L,
            "PKG-1",
            3,
            List.of(),
            List.of());
    when(applicationSubmissionImportService.importApplicationSubmission(file, "jsmith", "CLIENT-REF-1")).thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionUpload(file, null, "CLIENT-REF-1", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(applicationSubmissionImportService).importApplicationSubmission(file, "jsmith", "CLIENT-REF-1");
  }

  @Test
  void applicationSubmissionUploadShouldReturnUnprocessableEntityForRejectedImport() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "rejected",
            "rejected",
            null,
            null,
            0,
            List.of("Invalid XML"),
            List.of());
    when(applicationSubmissionImportService.importApplicationSubmission(file, null, null)).thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionUpload(file, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isEqualTo(payload);
  }

  @Test
  void applicationSubmissionValidationShouldDelegateToValidationService() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "validated",
            "validated",
            null,
            "PKG-1",
            3,
            List.of(),
            List.of());
    when(applicationSubmissionImportService.validateApplicationSubmission(file, "CLIENT-REF-1")).thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionValidation(file, null, "CLIENT-REF-1", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(applicationSubmissionImportService).validateApplicationSubmission(file, "CLIENT-REF-1");
  }

  @Test
  void applicationSubmissionValidationShouldReturnUnprocessableEntityForRejectedValidation() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "rejected",
            "rejected",
            null,
            null,
            0,
            List.of("Invalid XML"),
            List.of());
    when(applicationSubmissionImportService.validateApplicationSubmission(file, null)).thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionValidation(file, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isEqualTo(payload);
  }

  private MultipartFile sampleFile(String fileName) {
    return new MockMultipartFile(
        "file",
        fileName,
        "text/csv",
        "col1,col2\nvalue1,value2\n".getBytes(StandardCharsets.UTF_8));
  }

  private MultipartFile sampleXmlFile() {
    return new MockMultipartFile(
        "formFile",
        "submission.xml",
        "application/xml",
        "<esf:ESFSubmission xmlns:esf=\"http://www.for.gov.bc.ca/schema/esf\"/>"
            .getBytes(StandardCharsets.UTF_8));
  }

  private LexisUploadController controller() {
    lenient()
        .when(applicationEditLockService.snapshot(any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
    return new LexisUploadController(
        uploadServiceProvider,
        applicationSubmissionImportServiceProvider,
        applicationEditLockService);
  }
}

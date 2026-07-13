package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.DocumentUploadMutationPolicy;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.servlet.http.HttpServletRequest;
import java.math.BigDecimal;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisUploadController")
class LexisUploadControllerTest {

  private static final OrgUnitConstraint UNRESTRICTED_ORG_UNITS =
      new OrgUnitConstraint(false, List.of());

  @Mock private ObjectProvider<LexisUploadService> uploadServiceProvider;
  @Mock private ObjectProvider<ApplicationSubmissionImportService> applicationSubmissionImportServiceProvider;
  @Mock private ObjectProvider<MeterRegistry> meterRegistryProvider;
  @Mock private LexisUploadService uploadService;
  @Mock private ApplicationSubmissionImportService applicationSubmissionImportService;
  @Mock private ApplicationEditLockService applicationEditLockService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private DocumentUploadMutationPolicy documentUploadMutationPolicy;
  @Mock private HttpServletRequest httpServletRequest;

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
    when(uploadService.uploadApplication(file, 7000123L, "App file", "idir\\jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileApplicationUpload(file, null, 7000123L, "App file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(documentUploadMutationPolicy).requireApplicationMutable(7000123L);
    verify(applicationEditLockService)
        .acquire(7000123L, "idir\\jsmith", "idir\\jsmith", false);
    verify(uploadService).uploadApplication(file, 7000123L, "App file", "idir\\jsmith");
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
  void validateApplicationUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = controller();
    MultipartFile formFile = sampleFile("application.pdf");
    LexisUploadResultDto payload =
        new LexisUploadResultDto(
            "application",
            "application.pdf",
            formFile.getSize(),
            "validated",
            "File passed validation and virus scanning.");
    when(uploadService.validateDocument(formFile, "application")).thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.validateApplicationUpload(null, formFile, 7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).validateDocument(formFile, "application");
  }

  @Test
  void validateApplicationUploadShouldReturnBadRequestWhenTargetMissing() {
    LexisUploadController controller = controller();
    MultipartFile formFile = sampleFile("application.pdf");

    ResponseEntity<LexisUploadResultDto> response =
        controller.validateApplicationUpload(null, formFile, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("Choose a file and enter a valid application number before validating documents.");
    verifyNoInteractions(uploadService);
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
    when(applicationEditLockService.acquire(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
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
  void fileApplicationUploadShouldRejectExpiredCanonicalTargetBeforeLock() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("application.pdf");
    doThrow(new AccessDeniedException("Expired applications are read-only."))
        .when(documentUploadMutationPolicy)
        .requireApplicationMutable(7000123L);

    assertThatThrownBy(
            () ->
                controller.fileApplicationUpload(
                    file, null, 7000123L, "App file", null, null))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired applications are read-only.");

    verify(provincialAuthorizationService, times(2))
        .requireApplication(null, 7000123L);
    verifyNoInteractions(applicationEditLockService, uploadService);
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
    when(uploadService.uploadPermit(file, 7000123L, "Permit file", "idir\\jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.filePermitUpload(file, null, 7000123L, "Permit file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(documentUploadMutationPolicy).requirePermitMutable(7000123L);
    verify(applicationEditLockService)
        .acquirePermit(7000123L, "idir\\jsmith", "idir\\jsmith", false);
    verify(uploadService).uploadPermit(file, 7000123L, "Permit file", "idir\\jsmith");
  }

  @Test
  void filePermitUploadShouldRejectWhenPermitLockedByAnotherUser() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("permit.pdf");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(applicationEditLockService.acquirePermit(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This permit is currently locked for editing by another user.",
                null));

    ResponseEntity<LexisUploadResultDto> response =
        controller.filePermitUpload(file, null, 7000123L, "Permit file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("This permit is currently locked for editing by another user.");
    verify(uploadServiceProvider, never()).getIfAvailable();
  }

  @Test
  void permitAndInvoiceUploadsShouldRejectExpiredCanonicalTargetBeforeLock() {
    LexisUploadController controller = controller();
    MultipartFile permitFile = sampleFile("permit.pdf");
    MultipartFile invoiceFile = sampleFile("invoice.pdf");
    doThrow(new AccessDeniedException("Expired permits are read-only."))
        .when(documentUploadMutationPolicy)
        .requirePermitMutable(7000123L);
    doThrow(new AccessDeniedException("Invoices can only be added to active permits."))
        .when(documentUploadMutationPolicy)
        .requireInvoicePermitActive(7000123L);

    assertThatThrownBy(
            () ->
                controller.filePermitUpload(
                    permitFile, null, 7000123L, "Permit file", null, null))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired permits are read-only.");
    assertThatThrownBy(
            () ->
                controller.fileInvoiceUpload(
                    invoiceFile,
                    null,
                    7000123L,
                    "INV-1001",
                    "Invoice INV-1001",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Invoices can only be added to active permits.");

    verify(documentUploadMutationPolicy).requirePermitMutable(7000123L);
    verify(documentUploadMutationPolicy).requireInvoicePermitActive(7000123L);
    verify(applicationEditLockService, never()).acquirePermit(any(), any(), any(), anyBoolean());
    verify(uploadServiceProvider, never()).getIfAvailable();
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
    when(uploadService.uploadExemption(file, "E-123", "Exemption file", "idir\\jsmith"))
        .thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileExemptionUpload(file, null, "E-123", "Exemption file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(documentUploadMutationPolicy).requireExemptionMutable("E-123");
    verify(applicationEditLockService)
        .acquireExemption("E-123", "idir\\jsmith", "idir\\jsmith", false);
    verify(uploadService).uploadExemption(file, "E-123", "Exemption file", "idir\\jsmith");
  }

  @Test
  void fileExemptionUploadShouldRejectWhenExemptionLockedByAnotherUser() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("exemption.pdf");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(applicationEditLockService.acquireExemption(
            "E-123", "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This exemption is currently locked for editing by another user.",
                null));

    ResponseEntity<LexisUploadResultDto> response =
        controller.fileExemptionUpload(
            file, null, "E-123", "Exemption file", null, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("This exemption is currently locked for editing by another user.");
    verify(uploadServiceProvider, never()).getIfAvailable();
  }

  @Test
  void fileExemptionUploadShouldRejectExpiredCanonicalTargetBeforeLock() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("exemption.pdf");
    doThrow(new AccessDeniedException("Expired exemptions are read-only."))
        .when(documentUploadMutationPolicy)
        .requireExemptionMutable("E-123");

    assertThatThrownBy(
            () ->
                controller.fileExemptionUpload(
                    file, null, "E-123", "Exemption file", null, null))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired exemptions are read-only.");

    verify(provincialAuthorizationService, times(2)).requireExemption(null, "E-123");
    verify(applicationEditLockService, never())
        .acquireExemption(any(), any(), any(), anyBoolean());
    verify(uploadServiceProvider, never()).getIfAvailable();
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
                "idir\\jsmith"))
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
    verify(documentUploadMutationPolicy).requireInvoicePermitActive(7000123L);
    verify(applicationEditLockService)
        .acquirePermit(7000123L, "idir\\jsmith", "idir\\jsmith", false);
    verify(uploadService)
        .uploadInvoice(
            file,
            7000123L,
            "INV-1001",
            "Invoice INV-1001",
            BigDecimal.valueOf(1234.56),
            BigDecimal.valueOf(1.25),
            BigDecimal.valueOf(55.0),
            "idir\\jsmith");
  }

  @Test
  void fileInvoiceUploadShouldRejectWhenPermitLockedByAnotherUser() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("invoice.pdf");
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    when(applicationEditLockService.acquirePermit(
            7000123L, "idir\\jsmith", "idir\\jsmith", false))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                null,
                "This permit is currently locked for editing by another user.",
                null));

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

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("This permit is currently locked for editing by another user.");
    verify(uploadServiceProvider, never()).getIfAvailable();
  }

  @Test
  void fileInvoiceUploadShouldRejectNonActivePermitBeforeLock() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleFile("invoice.pdf");
    doThrow(new AccessDeniedException("Invoices can only be added to active permits."))
        .when(documentUploadMutationPolicy)
        .requireInvoicePermitActive(7000123L);

    assertThatThrownBy(
            () ->
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
                    null))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Invoices can only be added to active permits.");

    verify(applicationEditLockService, never())
        .acquirePermit(any(), any(), any(), anyBoolean());
    verify(uploadServiceProvider, never()).getIfAvailable();
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
    when(provincialAuthorizationService.scopedForestClientNumber(any()))
        .thenReturn("00001234");
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    OrgUnitConstraint orgUnitConstraint = new OrgUnitConstraint(true, List.of(1909L));
    when(
            provincialAuthorizationService.resolveOrgUnitConstraint(
                authentication, OrgUnitSurface.APPLICATION_WRITE))
        .thenReturn(orgUnitConstraint);
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
    when(
            applicationSubmissionImportService.importApplicationSubmission(
                file,
                "idir\\jsmith",
                "CLIENT-REF-1",
                "00001234",
                orgUnitConstraint))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionUpload(file, null, "CLIENT-REF-1", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(applicationSubmissionImportService)
        .importApplicationSubmission(
            file,
            "idir\\jsmith",
            "CLIENT-REF-1",
            "00001234",
            orgUnitConstraint);
  }

  @Test
  void federalApplicationSubmissionUploadShouldDelegateRawXmlToImportService() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("bceid\\federal-user", "n/a");
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getHeaders().getLocation())
        .isEqualTo(URI.create("/api/lexis/federal/applications/9001"));
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", "IDEMP-1", submissionData, "lexis-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldAcceptSourceSystemParameterWhenRequired() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            null,
            "FEDERAL-SYSTEM",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                submissionData,
                "FEDERAL-SYSTEM",
                "lexis-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldPreferSourceSystemHeaderOverParameter() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-HEADER",
            "FEDERAL-PARAMETER",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                submissionData,
                "FEDERAL-HEADER",
                "lexis-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldNotSetLocationWhenAcceptedResultHasNoApplicationNumber() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "created",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getHeaders().getLocation()).isNull();
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", "IDEMP-1", submissionData, "lexis-submission"));
  }

  @Test
  void federalApplicationSubmissionUploadShouldNotSetLocationWhenImportRejectsResult() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "rejected",
            "Federal submission endpoint only accepts jurisdictionCode=F.",
            9001L,
            "FED-1",
            1,
            List.of("Federal submission endpoint only accepts jurisdictionCode=F."),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getHeaders().getLocation()).isNull();
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", "IDEMP-1", submissionData, "lexis-submission"));
  }

  @Test
  void federalApplicationSubmissionUploadShouldReplayCompletedResponseForNormalizedKey() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        acceptedFederalPayload("federal-direct.xml", submissionData.length);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("nexcol-service-client", "n/a");
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData,
                "federal-direct.xml",
                "nexcol-service-client",
                "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> first =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "  IDEMP-1  ",
            authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> replay =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-2",
            "IDEMP-1",
            authentication);

    assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(first.getHeaders().getLocation())
        .isEqualTo(URI.create("/api/lexis/federal/applications/9001"));
    assertThat(replay.getStatusCode()).isEqualTo(first.getStatusCode());
    assertThat(replay.getHeaders()).isEqualTo(first.getHeaders());
    assertThat(replay.getBody()).isEqualTo(first.getBody());
    assertThat(replay.getBody()).isNotNull();
    assertThat(replay.getBody().requestId()).isEqualTo("REQ-1");
    verify(applicationSubmissionImportService, times(1))
        .importDedicatedFederalApplicationSubmission(
            submissionData,
            "federal-direct.xml",
            "nexcol-service-client",
            "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectKeyReusedForDifferentPayload() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] firstPayload =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    byte[] differentPayload =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\" version=\"2\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        acceptedFederalPayload("federal-direct.xml", firstPayload.length);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("nexcol-service-client", "n/a");
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                firstPayload,
                "federal-direct.xml",
                "nexcol-service-client",
                "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> first =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            firstPayload,
            "REQ-1",
            "IDEMP-1",
            authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> conflict =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            differentPayload,
            "REQ-2",
            "IDEMP-1",
            authentication);

    assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    assertThat(conflict.getBody()).isNotNull();
    assertThat(conflict.getBody().errors())
        .containsExactly(
            "X-Idempotency-Key has already been used by this caller for a different payload. Use a new idempotency key for a different submission; do not retry it with this key.");
    assertThat(conflict.getBody().payloadSha256()).isEqualTo(sha256Hex(differentPayload));
    verify(applicationSubmissionImportService, times(1))
        .importDedicatedFederalApplicationSubmission(
            firstPayload,
            "federal-direct.xml",
            "nexcol-service-client",
            "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldReleaseClaimAfterTransientFailure() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        acceptedFederalPayload("federal-direct.xml", submissionData.length);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("nexcol-service-client", "n/a");
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData,
                "federal-direct.xml",
                "nexcol-service-client",
                "FED-REF-1"))
        .thenThrow(new IllegalStateException("database unavailable"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> unavailable =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            authentication);
    ResponseEntity<ApplicationSubmissionImportResultDto> retry =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-2",
            "IDEMP-1",
            authentication);

    assertThat(unavailable.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(retry.getBody()).isNotNull();
    assertThat(retry.getBody().requestId()).isEqualTo("REQ-2");
    verify(applicationSubmissionImportService, times(2))
        .importDedicatedFederalApplicationSubmission(
            submissionData,
            "federal-direct.xml",
            "nexcol-service-client",
            "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldNamespaceKeyByAuthenticatedCaller() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        acceptedFederalPayload("federal-direct.xml", submissionData.length);
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "client-a", "FED-REF-1"))
        .thenReturn(payload);
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "client-b", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> firstCaller =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("client-a", "n/a"));
    ResponseEntity<ApplicationSubmissionImportResultDto> secondCaller =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-2",
            "IDEMP-1",
            new TestingAuthenticationToken("client-b", "n/a"));

    assertThat(firstCaller.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(secondCaller.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "client-a", "FED-REF-1");
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "client-b", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldReturnServiceUnavailableWhenImportServiceMissing() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-SYSTEM",
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "dependency_unavailable")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldUseConfiguredRetryAfterForUnavailableImportService() {
    LexisUploadController controller = controller();
    controller.setFederalSubmissionRetryAfterSeconds(120L);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("120");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldReturnServiceUnavailableWhenImportThrows() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenThrow(new IllegalStateException("database unavailable"));

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-SYSTEM",
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("rejected");
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().idempotencyKey()).isEqualTo("IDEMP-1");
    assertThat(response.getBody().payloadSha256()).isEqualTo(sha256Hex(submissionData));
    assertThat(response.getBody().sourceSystem()).isEqualTo("FEDERAL-SYSTEM");
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "dependency_unavailable")
                .counter()
                .count())
        .isEqualTo(1.0d);
  }

  @Test
  void federalApplicationSubmissionUploadShouldUseJwtClientIdAsEntryUserForServiceClient() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "accepted",
            10427665L,
            "AT-90L_01_07-03-26",
            7,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "nexcol-service-client", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "NEXCOL",
            null,
            new JwtAuthenticationToken(
                jwt(
                    "opaque-service-subject",
                    Map.of(
                        "client_id",
                        "nexcol-service-client",
                        "scope",
                        "lexis:federal-submission:submit"))));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                submissionData,
                "NEXCOL",
                "lexis-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "nexcol-service-client", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldUseJwtAzpAsEntryUserForKeycloakServiceClient() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "accepted",
            10427665L,
            "AT-90L_01_07-03-26",
            7,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "nexcol-service-client", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "NEXCOL",
            null,
            new JwtAuthenticationToken(
                jwt(
                    "service-account-nexcol-service-client",
                    Map.of(
                        "azp",
                        "nexcol-service-client",
                        "scope",
                        "lexis:federal-submission:submit"))));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "nexcol-service-client", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionValidationShouldAllowApprovedJwtClientId() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "accepted",
            null,
            null,
            0,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            null,
            new JwtAuthenticationToken(
                jwt(
                    "opaque-service-subject",
                    Map.of(
                        "client_id",
                        "nexcol-service-client",
                        "scope",
                        "lexis:federal-submission:submit"))));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", null, submissionData, "lexis-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldReturnServiceUnavailableWhenImportReturnsNull() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("rejected");
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().idempotencyKey()).isEqualTo("IDEMP-1");
    assertThat(response.getBody().payloadSha256()).isEqualTo(sha256Hex(submissionData));
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldRequireIdempotencyKeyWheneverCreateIsEnabled() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            null,
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors())
        .containsExactly("X-Idempotency-Key header is required for federal create submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectMissingIdempotencyKeyWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalCreateIdempotencyKey(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            null,
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("X-Idempotency-Key header is required for federal create submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectOverlongIdempotencyKey() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "I".repeat(201),
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors())
        .containsExactly("X-Idempotency-Key header must be 200 characters or fewer.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "invalid_metadata")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectOverlongSourceSystem() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "S".repeat(201),
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter must be 200 characters or fewer.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "invalid_metadata")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectMissingSourceSystemWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectMissingRequestIdWhenRequired() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    controller.setRequireFederalRequestId(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            null,
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("X-Request-ID header is required for federal submissions.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "missing_request_id")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectOverlongRequestId() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", null, submissionData, "R".repeat(201), null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("X-Request-ID header must be 200 characters or fewer.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectOverlongSourceSystemParameter() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            null,
            "S".repeat(201),
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter must be 200 characters or fewer.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectMissingSourceSystemWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectMissingUserReferenceWhenRequired() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    controller.setRequireFederalCreateUserReference(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            null,
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("userReference is required for federal create submissions.");
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "missing_user_reference")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectOverlongUserReference() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "R".repeat(51),
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-SYSTEM",
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("userReference must be 50 characters or fewer.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRecordMetrics() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-SYSTEM",
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_requests_total")
                .tag("operation", "create-raw")
                .counter()
                .count())
        .isEqualTo(1.0d);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_results_total")
                .tag("operation", "create-raw")
                .tag("status", "accepted")
                .counter()
                .count())
        .isEqualTo(1.0d);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_bytes_total")
                .tag("operation", "create-raw")
                .counter()
                .count())
        .isEqualTo((double) submissionData.length);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_duration_seconds")
                .tag("operation", "create-raw")
                .tag("status", "accepted")
                .timer()
                .count())
        .isEqualTo(1L);
    assertThat(meterRegistry.find("lexis_federal_submission_failures_total").counter()).isNull();
  }

  @Test
  void federalApplicationSubmissionUploadShouldRecordFailureTypeForRejectedResult() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "rejected",
            "Package already exists.",
            null,
            "FED-1",
            0,
            List.of("Package FED-1 already exists."),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "duplicate_or_replay")
                .counter()
                .count())
        .isEqualTo(1.0d);
  }

  @Test
  void federalApplicationSubmissionUploadShouldUseDefaultFileNameForRawXml() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-submission.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-submission.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", null, submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", null, submissionData, "lexis-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-submission.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionValidationShouldAcceptSourceSystemParameterWhenRequired() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            null,
            "FEDERAL-SYSTEM",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", "IDEMP-1", submissionData, "FEDERAL-SYSTEM", "lexis-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionValidationShouldPreferSourceSystemHeaderOverParameter() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1",
            "federal-direct.xml",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-HEADER",
            "FEDERAL-PARAMETER",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                submissionData,
                "FEDERAL-HEADER",
                "lexis-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionValidationShouldTraceEsfSubmissionContentModes() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();

    assertFederalValidationPayloadRootType(
        controller,
        esfSubmissionWithContent("<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"),
        "esf-submission:lexis-child");
    assertFederalValidationPayloadRootType(
        controller,
        esfSubmissionWithContent(
            "<![CDATA[<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>]]>"),
        "esf-submission:cdata-lexis");
    assertFederalValidationPayloadRootType(
        controller,
        esfSubmissionWithContent(
            "&lt;lexis:LexisSubmission xmlns:lexis=&quot;http://www.for.gov.bc.ca/schema/lexis&quot;/&gt;"),
        "esf-submission:escaped-lexis");
  }

  @Test
  void federalApplicationSubmissionValidationShouldTraceSoapEnvelopePayloads() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        """
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
          <soapenv:Body/>
        </soapenv:Envelope>
        """
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", "federal-direct.xml", submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("soap-envelope");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldDelegateFileToFederalImportService() {
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
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                file, "idir\\jsmith", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1", file, null, "REQ-1", "IDEMP-1", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getHeaders().getLocation())
        .isEqualTo(URI.create("/api/lexis/federal/applications/9001"));
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", "IDEMP-1", file, "esf-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(file, "idir\\jsmith", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectInFlightDuplicateAndThenReplay()
      throws Exception {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        acceptedFederalPayload("submission.xml", file.getSize());
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("nexcol-service-client", "n/a");
    CountDownLatch serviceStarted = new CountDownLatch(1);
    CountDownLatch releaseService = new CountDownLatch(1);
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                file, "nexcol-service-client", "FED-REF-1"))
        .thenAnswer(
            invocation -> {
              serviceStarted.countDown();
              if (!releaseService.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release test import.");
              }
              return payload;
            });

    ExecutorService executor = Executors.newSingleThreadExecutor();
    try {
      Future<ResponseEntity<ApplicationSubmissionImportResultDto>> firstFuture =
          executor.submit(
              () ->
                  controller.federalApplicationSubmissionMultipartUpload(
                      "FED-REF-1", file, null, "REQ-1", "IDEMP-1", authentication));
      assertThat(serviceStarted.await(5, TimeUnit.SECONDS)).isTrue();

      ResponseEntity<ApplicationSubmissionImportResultDto> inFlight =
          controller.federalApplicationSubmissionMultipartUpload(
              "FED-REF-1", file, null, "REQ-2", "IDEMP-1", authentication);
      assertThat(inFlight.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
      assertThat(inFlight.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("60");
      assertThat(inFlight.getBody()).isNotNull();
      assertThat(inFlight.getBody().errors())
          .containsExactly(
              "X-Idempotency-Key has already been used for a federal submission that is still processing. Retry with the same key and identical payload after the Retry-After interval.");

      releaseService.countDown();
      ResponseEntity<ApplicationSubmissionImportResultDto> first =
          firstFuture.get(5, TimeUnit.SECONDS);
      ResponseEntity<ApplicationSubmissionImportResultDto> replay =
          controller.federalApplicationSubmissionMultipartUpload(
              "FED-REF-1", file, null, "REQ-3", "IDEMP-1", authentication);

      assertThat(first.getStatusCode()).isEqualTo(HttpStatus.CREATED);
      assertThat(replay.getStatusCode()).isEqualTo(first.getStatusCode());
      assertThat(replay.getHeaders()).isEqualTo(first.getHeaders());
      assertThat(replay.getBody()).isEqualTo(first.getBody());
      verify(applicationSubmissionImportService, times(1))
          .importDedicatedFederalApplicationSubmission(
              file, "nexcol-service-client", "FED-REF-1");
    } finally {
      releaseService.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldAcceptSourceSystemParameterWhenRequired() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                file, "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            null,
            "FEDERAL-SYSTEM",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                file,
                "FEDERAL-SYSTEM",
                "esf-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(file, "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldPreferSourceSystemHeaderOverParameter() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            file.getSize(),
            "accepted",
            "created",
            9001L,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.importDedicatedFederalApplicationSubmission(
                file, "bceid\\federal-user", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-HEADER",
            "FEDERAL-PARAMETER",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                file,
                "FEDERAL-HEADER",
                "esf-submission"));
    verify(applicationSubmissionImportService)
        .importDedicatedFederalApplicationSubmission(file, "bceid\\federal-user", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectMissingIdempotencyKeyWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalCreateIdempotencyKey(true);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            null,
            new TestingAuthenticationToken("idir\\jsmith", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().errors())
        .containsExactly("X-Idempotency-Key header is required for federal create submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectMissingRequestIdWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalRequestId(true);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            null,
            "IDEMP-1",
            new TestingAuthenticationToken("idir\\jsmith", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().errors())
        .containsExactly("X-Request-ID header is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectMissingUserReferenceWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalCreateUserReference(true);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            null,
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("idir\\jsmith", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().errors())
        .containsExactly("userReference is required for federal create submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectOverlongSourceSystem() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            "S".repeat(201),
            null,
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("esf-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter must be 200 characters or fewer.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectMissingSourceSystemWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("esf-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldDelegateFileToFederalValidationService() {
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
            "FED-1",
            1,
            List.of(),
            List.of());
    when(applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(file, "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1", file, null, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(withTrace(payload, "REQ-1", null, file, "esf-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(file, "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldPreferSourceSystemHeaderOverParameter() {
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
            "FED-1",
            1,
            List.of(),
            List.of());
    when(applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(file, "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            "FEDERAL-HEADER",
            "FEDERAL-PARAMETER",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            withTrace(
                payload,
                "REQ-1",
                "IDEMP-1",
                file,
                "FEDERAL-HEADER",
                "esf-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(file, "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldRejectOverlongSourceSystemParameter() {
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            null,
            "S".repeat(201),
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("esf-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter must be 200 characters or fewer.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldRejectMissingSourceSystemWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalSourceSystem(true);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken(
                "bceid\\federal-user", "n/a", "SCOPE_lexis:federal-submission:submit"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().sourceSystem()).isNull();
    assertThat(response.getBody().payloadRootType()).isEqualTo("esf-submission");
    assertThat(response.getBody().errors())
        .containsExactly("X-Source-System header or sourceSystem parameter is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldAllowMissingUserReferenceWhenCreateReferenceRequired() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    controller.setRequireFederalCreateUserReference(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-submission.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-submission.xml", null))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            null, null, submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", null, submissionData, "lexis-submission"));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-submission.xml", null);
  }

  @Test
  void federalApplicationSubmissionValidationShouldReturnServiceUnavailableWhenImportServiceMissing() {
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", "federal-direct.xml", submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldReturnServiceUnavailableWhenValidationThrows() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenThrow(new IllegalStateException("database unavailable"));

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", "federal-direct.xml", submissionData, "REQ-1", "IDEMP-1", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("rejected");
    assertThat(response.getBody().fileName()).isEqualTo("federal-direct.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().idempotencyKey()).isEqualTo("IDEMP-1");
    assertThat(response.getBody().payloadSha256()).isEqualTo(sha256Hex(submissionData));
    assertThat(response.getBody().payloadRootType()).isEqualTo("lexis-submission");
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldReturnServiceUnavailableWhenValidationReturnsNull()
      throws Exception {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1", file, null, "REQ-1", "IDEMP-1", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("rejected");
    assertThat(response.getBody().fileName()).isEqualTo("submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(file.getSize());
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().idempotencyKey()).isEqualTo("IDEMP-1");
    assertThat(response.getBody().payloadSha256()).isEqualTo(sha256Hex(file.getBytes()));
    assertThat(response.getBody().payloadRootType()).isEqualTo("esf-submission");
    assertThat(response.getBody().errors())
        .containsExactly("Federal LEXIS submission service is unavailable. Try again later.");
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(file, "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectMissingRequestIdWhenRequired() {
    LexisUploadController controller = controller();
    controller.setRequireFederalRequestId(true);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", null, submissionData, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.xml");
    assertThat(response.getBody().fileSize()).isEqualTo(submissionData.length);
    assertThat(response.getBody().errors())
        .containsExactly("X-Request-ID header is required for federal submissions.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionRawUploadShouldFailClosedWhenCreateIsDisabled() {
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService);
    controller.setFederalSubmissionRetryAfterSeconds(120L);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionRawUpload(
            "FED-REF-1",
            "federal-direct.xml",
            httpServletRequest,
            "REQ-1",
            "IDEMP-1",
            "NEXCOL",
            null,
            new TestingAuthenticationToken("nexcol-service-client", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("120");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors())
        .containsExactly(
            "Federal LEXIS submission creation is disabled. Retry only after the integration has been explicitly enabled.");
    verifyNoInteractions(httpServletRequest, applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldFailClosedWhenCreateIsDisabled() {
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService);
    MultipartFile file = sampleXmlFile();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1",
            file,
            null,
            "REQ-1",
            "IDEMP-1",
            null,
            null,
            new TestingAuthenticationToken("nexcol-service-client", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("60");
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors())
        .containsExactly(
            "Federal LEXIS submission creation is disabled. Retry only after the integration has been explicitly enabled.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldRemainAvailableWhenCreateIsDisabled() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable())
        .thenReturn(applicationSubmissionImportService);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService);
    byte[] submissionData =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", "federal-direct.xml", submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectMissingRawXml() {
    LexisUploadController controller = controller();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload("FED-REF-1", null, null, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.xml");
    assertThat(response.getBody().fileSize()).isZero();
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().payloadSha256()).isNull();
    assertThat(response.getBody().payloadRootType()).isNull();
    assertThat(response.getBody().errors()).containsExactly("Submission data is required.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void rawFederalRoutesShouldRejectDeclaredOversizedBodiesBeforeReadingThem() throws Exception {
    when(httpServletRequest.getContentLengthLong())
        .thenReturn(ApplicationSubmissionImportService.MAX_IMPORT_BYTES + 1L);
    LexisUploadController controller = controller();

    ResponseEntity<ApplicationSubmissionImportResultDto> createResponse =
        controller.federalApplicationSubmissionRawUpload(
            "FED-REF-1",
            "oversized.xml",
            httpServletRequest,
            "REQ-1",
            "IDEMPOTENCY-1",
            null,
            null,
            null);
    ResponseEntity<ApplicationSubmissionImportResultDto> validateResponse =
        controller.federalApplicationSubmissionRawValidation(
            "FED-REF-1",
            "oversized.xml",
            httpServletRequest,
            "REQ-1",
            null,
            null,
            null,
            null);

    assertThat(createResponse.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    assertThat(validateResponse.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    assertThat(createResponse.getBody()).isNotNull();
    assertThat(createResponse.getBody().errors())
        .containsExactly("The LEXIS application submission file must be 20 MiB or smaller.");
    verify(httpServletRequest, never()).getInputStream();
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionValidationShouldRejectMissingRawXmlWithDefaultFileName() {
    LexisUploadController controller = controller();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation("FED-REF-1", null, null, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.xml");
    assertThat(response.getBody().fileSize()).isZero();
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().payloadSha256()).isNull();
    assertThat(response.getBody().payloadRootType()).isNull();
    assertThat(response.getBody().errors()).containsExactly("Submission data is required.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRejectNonXmlRawPayload() {
    LexisUploadController controller = controller();

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-submission.json",
            "{\"type\":\"FeatureCollection\"}".getBytes(StandardCharsets.UTF_8),
            "REQ-1",
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.json");
    assertThat(response.getBody().requestId()).isEqualTo("REQ-1");
    assertThat(response.getBody().payloadSha256())
        .isEqualTo(sha256Hex("{\"type\":\"FeatureCollection\"}".getBytes(StandardCharsets.UTF_8)));
    assertThat(response.getBody().payloadRootType()).isNull();
    assertThat(response.getBody().errors())
        .containsExactly("Federal submission endpoint only accepts XML payloads.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionUploadShouldRecordMetricsForEarlyRawRejection() {
    SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
    when(meterRegistryProvider.getIfAvailable()).thenReturn(meterRegistry);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService,
            meterRegistryProvider);
    controller.setFederalCreateEnabled(true);
    byte[] submissionData = "{\"type\":\"FeatureCollection\"}".getBytes(StandardCharsets.UTF_8);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionUpload(
            "FED-REF-1",
            "federal-submission.json",
            submissionData,
            "REQ-1",
            "IDEMP-1",
            new TestingAuthenticationToken("bceid\\federal-user", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_requests_total")
                .tag("operation", "create-raw")
                .counter()
                .count())
        .isEqualTo(1.0d);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_results_total")
                .tag("operation", "create-raw")
                .tag("status", "rejected")
                .counter()
                .count())
        .isEqualTo(1.0d);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_bytes_total")
                .tag("operation", "create-raw")
                .counter()
                .count())
        .isEqualTo((double) submissionData.length);
    assertThat(
            meterRegistry
                .get("lexis_federal_submission_failures_total")
                .tag("operation", "create-raw")
                .tag("failure_type", "unsupported_content")
                .counter()
                .count())
        .isEqualTo(1.0d);
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartUploadShouldRejectNonXmlFile() {
    LexisUploadController controller = controller();
    MultipartFile file =
        new MockMultipartFile(
            "file", "federal-submission.zip", "application/zip", new byte[] {'P', 'K', 3, 4});

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartUpload(
            "FED-REF-1", file, null, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.zip");
    assertThat(response.getBody().errors())
        .containsExactly("Federal submission endpoint only accepts XML files.");
    verifyNoInteractions(applicationSubmissionImportService);
  }

  @Test
  void federalApplicationSubmissionMultipartValidationShouldRejectNonXmlFile() {
    LexisUploadController controller = controller();
    MultipartFile file =
        new MockMultipartFile(
            "file",
            "federal-submission.geojson",
            "application/geo+json",
            "{\"type\":\"FeatureCollection\"}".getBytes(StandardCharsets.UTF_8));

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionMultipartValidation(
            "FED-REF-1", file, null, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().fileName()).isEqualTo("federal-submission.geojson");
    assertThat(response.getBody().errors())
        .containsExactly("Federal submission endpoint only accepts XML files.");
    verifyNoInteractions(applicationSubmissionImportService);
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
    when(
            applicationSubmissionImportService.importApplicationSubmission(
                file, null, null, null, UNRESTRICTED_ORG_UNITS))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionUpload(file, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isEqualTo(payload);
  }

  @Test
  void applicationSubmissionValidationShouldDelegateToValidationService() {
    when(applicationSubmissionImportServiceProvider.getIfAvailable()).thenReturn(applicationSubmissionImportService);
    when(provincialAuthorizationService.scopedForestClientNumber(any()))
        .thenReturn("00001234");
    LexisUploadController controller = controller();
    MultipartFile file = sampleXmlFile();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a");
    OrgUnitConstraint orgUnitConstraint = new OrgUnitConstraint(true, List.of(1909L));
    when(
            provincialAuthorizationService.resolveOrgUnitConstraint(
                authentication, OrgUnitSurface.APPLICATION_WRITE))
        .thenReturn(orgUnitConstraint);
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
    when(
            applicationSubmissionImportService.validateApplicationSubmission(
                file, "CLIENT-REF-1", "00001234", orgUnitConstraint))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.applicationSubmissionValidation(
            file, null, "CLIENT-REF-1", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(provincialAuthorizationService).scopedForestClientNumber(authentication);
    verify(provincialAuthorizationService)
        .resolveOrgUnitConstraint(authentication, OrgUnitSurface.APPLICATION_WRITE);
    verify(applicationSubmissionImportService)
        .validateApplicationSubmission(
            file, "CLIENT-REF-1", "00001234", orgUnitConstraint);
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
    when(
            applicationSubmissionImportService.validateApplicationSubmission(
                file, null, null, UNRESTRICTED_ORG_UNITS))
        .thenReturn(payload);

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

  private ApplicationSubmissionImportResultDto acceptedFederalPayload(
      String fileName, long fileSize) {
    return new ApplicationSubmissionImportResultDto(
        "applicationSubmission",
        fileName,
        fileSize,
        "accepted",
        "created",
        9001L,
        "FED-1",
        1,
        List.of(),
        List.of());
  }

  private MultipartFile sampleXmlFile() {
    return new MockMultipartFile(
        "formFile",
        "submission.xml",
        "application/xml",
        "<esf:ESFSubmission xmlns:esf=\"http://www.for.gov.bc.ca/schema/esf\"/>"
            .getBytes(StandardCharsets.UTF_8));
  }

  private String esfSubmissionWithContent(String submissionContent) {
    return """
        <esf:ESFSubmission xmlns:esf="http://www.for.gov.bc.ca/schema/esf">
          <esf:submissionContent>%s</esf:submissionContent>
        </esf:ESFSubmission>
        """
        .formatted(submissionContent);
  }

  private void assertFederalValidationPayloadRootType(
      LexisUploadController controller, String payloadXml, String expectedPayloadRootType) {
    byte[] submissionData = payloadXml.getBytes(StandardCharsets.UTF_8);
    ApplicationSubmissionImportResultDto payload =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "federal-direct.xml",
            submissionData.length,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());
    when(
            applicationSubmissionImportService.validateDedicatedFederalApplicationSubmission(
                submissionData, "federal-direct.xml", "FED-REF-1"))
        .thenReturn(payload);

    ResponseEntity<ApplicationSubmissionImportResultDto> response =
        controller.federalApplicationSubmissionValidation(
            "FED-REF-1", "federal-direct.xml", submissionData, "REQ-1", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(withTrace(payload, "REQ-1", null, submissionData, expectedPayloadRootType));
    verify(applicationSubmissionImportService)
        .validateDedicatedFederalApplicationSubmission(
            submissionData, "federal-direct.xml", "FED-REF-1");
  }

  private LexisUploadController controller() {
    lenient()
        .when(
            provincialAuthorizationService.resolveOrgUnitConstraint(
                any(), eq(OrgUnitSurface.APPLICATION_WRITE)))
        .thenReturn(UNRESTRICTED_ORG_UNITS);
    lenient()
        .when(applicationEditLockService.acquire(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(applicationEditLockService.acquirePermit(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(applicationEditLockService.acquireExemption(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider,
            applicationSubmissionImportServiceProvider,
            applicationEditLockService);
    controller.setFederalCreateEnabled(true);
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    controller.setDocumentUploadMutationPolicy(documentUploadMutationPolicy);
    return controller;
  }

  private ApplicationSubmissionImportResultDto withTrace(
      ApplicationSubmissionImportResultDto result,
      String requestId,
      String idempotencyKey,
      byte[] payload,
      String payloadRootType) {
    return withTrace(result, requestId, idempotencyKey, payload, null, payloadRootType);
  }

  private ApplicationSubmissionImportResultDto withTrace(
      ApplicationSubmissionImportResultDto result,
      String requestId,
      String idempotencyKey,
      byte[] payload,
      String sourceSystem,
      String payloadRootType) {
    return result.withTraceMetadata(
        requestId,
        idempotencyKey,
        payload == null || payload.length == 0 ? null : sha256Hex(payload),
        sourceSystem,
        payloadRootType);
  }

  private ApplicationSubmissionImportResultDto withTrace(
      ApplicationSubmissionImportResultDto result,
      String requestId,
      String idempotencyKey,
      MultipartFile payload,
      String payloadRootType) {
    return withTrace(result, requestId, idempotencyKey, payload, null, payloadRootType);
  }

  private ApplicationSubmissionImportResultDto withTrace(
      ApplicationSubmissionImportResultDto result,
      String requestId,
      String idempotencyKey,
      MultipartFile payload,
      String sourceSystem,
      String payloadRootType) {
    try {
      return result.withTraceMetadata(
          requestId,
          idempotencyKey,
          payload == null || payload.isEmpty() ? null : sha256Hex(payload.getBytes()),
          sourceSystem,
          payloadRootType);
    } catch (java.io.IOException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private Jwt jwt(String subject, Map<String, Object> additionalClaims) {
    Instant issuedAt = Instant.parse("2026-07-06T19:00:00Z");
    Map<String, Object> claims = new java.util.HashMap<>(additionalClaims);
    claims.put("sub", subject);
    claims.put("token_use", "access");
    return new Jwt(
        "token",
        issuedAt,
        issuedAt.plusSeconds(300),
        Map.of("alg", "RS256"),
        claims);
  }

  private String sha256Hex(byte[] payload) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(payload));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
  }
}

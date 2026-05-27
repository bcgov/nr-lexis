package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.nio.charset.StandardCharsets;
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
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisUploadController")
class LexisUploadControllerTest {

  @Mock private ObjectProvider<LexisUploadService> uploadServiceProvider;
  @Mock private LexisUploadService uploadService;

  @Test
  void uploadShouldReturnBadRequestForEmptyFile() {
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = new MockMultipartFile("file", "empty.csv", "text/csv", new byte[0]);

    ResponseEntity<LexisUploadResultDto> response = controller.fileApplicationUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    verifyNoInteractions(uploadService);
  }

  @Test
  void uploadShouldReturnNoContentWhenServiceMissing() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(null);
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = sampleFile("application.csv");

    ResponseEntity<LexisUploadResultDto> response = controller.fileApplicationUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(uploadService);
  }

  @Test
  void fileApplicationUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = sampleFile("application.csv");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("application", "application.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadApplication(file)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response = controller.fileApplicationUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadApplication(file);
  }

  @Test
  void filePermitUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = sampleFile("permit.csv");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("permit", "permit.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadPermit(file)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response = controller.filePermitUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadPermit(file);
  }

  @Test
  void fileExemptionUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = sampleFile("exemption.csv");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("exemption", "exemption.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadExemption(file)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response = controller.fileExemptionUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadExemption(file);
  }

  @Test
  void fileInvoiceUploadShouldDelegateToService() {
    when(uploadServiceProvider.getIfAvailable()).thenReturn(uploadService);
    LexisUploadController controller = new LexisUploadController(uploadServiceProvider);
    MultipartFile file = sampleFile("invoice.csv");
    LexisUploadResultDto payload =
        new LexisUploadResultDto("invoice", "invoice.csv", file.getSize(), "accepted", "queued");
    when(uploadService.uploadInvoice(file)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisUploadResultDto> response = controller.fileInvoiceUpload(file);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(uploadService).uploadInvoice(file);
  }

  private MultipartFile sampleFile(String fileName) {
    return new MockMultipartFile(
        "file",
        fileName,
        "text/csv",
        "col1,col2\nvalue1,value2\n".getBytes(StandardCharsets.UTF_8));
  }
}


package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.repository.upload.UploadRepository;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleLexisUploadService")
class OracleLexisUploadServiceTest {

  @Mock private UploadRepository uploadRepository;

  @Test
  void uploadApplicationShouldUppercaseFileExtensionBeforePersisting() {
    OracleLexisUploadService service = new OracleLexisUploadService(uploadRepository);
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(true);

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

  @Test
  void uploadApplicationShouldRejectFilesWithoutExtensionBeforeCallingOracle() {
    OracleLexisUploadService service = new OracleLexisUploadService(uploadRepository);
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application", "application/octet-stream", "bytes".getBytes(StandardCharsets.UTF_8));

    assertThat(service.uploadApplication(file, 7000123L, "App file", "jsmith")).isEmpty();
    verifyNoInteractions(uploadRepository);
  }

  @Test
  void uploadApplicationShouldReturnRejectedResultWhenOracleDoesNotPersist() {
    OracleLexisUploadService service = new OracleLexisUploadService(uploadRepository);
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "application.pdf", "application/pdf", "pdf-bytes".getBytes(StandardCharsets.UTF_8));
    when(
            uploadRepository.insertApplicationFile(
                eq(7000123L),
                eq("application.pdf"),
                eq("App file"),
                eq("INS"),
                eq("PDF"),
                eq("jsmith"),
                any(byte[].class)))
        .thenReturn(false);

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "App file", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message())
        .isEqualTo(
            "Could not attach file to application 7000123. Confirm the application exists before uploading.");
  }
}

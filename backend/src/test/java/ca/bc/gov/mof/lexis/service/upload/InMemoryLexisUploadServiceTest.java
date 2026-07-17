package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("Unit Test | InMemoryLexisUploadService")
class InMemoryLexisUploadServiceTest {

  @Test
  void shouldReturnAcceptedUploadResultForNonEmptyFile() {
    InMemoryLexisUploadService service = new InMemoryLexisUploadService();
    MockMultipartFile file =
        new MockMultipartFile(
            "file", "invoice.csv", "text/csv", "id,value\n1,123\n".getBytes(StandardCharsets.UTF_8));

    LexisUploadResultDto result =
        service
            .uploadInvoice(
                file,
                7000123L,
                "INV-1001",
                "Invoice INV-1001",
                null,
                null,
                null,
                "jsmith")
            .orElseThrow();

    assertThat(result.uploadType()).isEqualTo("invoice");
    assertThat(result.fileName()).isEqualTo("invoice.csv");
    assertThat(result.fileSize()).isEqualTo(file.getSize());
    assertThat(result.status()).isEqualTo("accepted");
  }

  @Test
  void shouldReturnEmptyResultForEmptyFile() {
    InMemoryLexisUploadService service = new InMemoryLexisUploadService();
    MockMultipartFile file = new MockMultipartFile("file", "empty.csv", "text/csv", new byte[0]);

    Optional<LexisUploadResultDto> result =
        service.uploadApplication(file, 7000123L, "test", "jsmith");

    assertThat(result).isEmpty();
  }

  @Test
  void validationShouldNotClaimVirusScanningWhenItIsDisabled() {
    InMemoryLexisUploadService service = new InMemoryLexisUploadService();
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "application.pdf",
            "application/pdf",
            "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII));

    LexisUploadResultDto result =
        service.validateDocument(file, "application").orElseThrow();

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.message()).isEqualTo("File passed validation.");
  }

  @Test
  void shouldApplyContentValidationBeforeVirusScanInLocalProfile() {
    VirusScanService virusScanService = mock(VirusScanService.class);
    InMemoryLexisUploadService service =
        new InMemoryLexisUploadService(virusScanService, new AttachmentUploadValidator());
    MockMultipartFile file =
        new MockMultipartFile(
            "file", "renamed.pdf", "application/pdf", new byte[] {'M', 'Z', 0, 0});

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "description", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).contains("does not match");
    verifyNoInteractions(virusScanService);
  }

  @Test
  void shouldApplyMetadataValidationBeforeVirusScanInLocalProfile() {
    VirusScanService virusScanService = mock(VirusScanService.class);
    InMemoryLexisUploadService service =
        new InMemoryLexisUploadService(virusScanService, new AttachmentUploadValidator());
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "application.pdf",
            "application/pdf",
            "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII));

    LexisUploadResultDto result =
        service.uploadApplication(file, 7000123L, "café", "jsmith").orElseThrow();

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.message()).contains("US-ASCII");
    verifyNoInteractions(virusScanService);
  }
}

package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
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
}

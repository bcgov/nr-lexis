package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(OutputCaptureExtension.class)
class ApplicationSubmissionImportLoggingTest {

  @Test
  void rejectionLogShouldOmitFilenameReferenceAndXmlValues(CapturedOutput output) {
    @SuppressWarnings("unchecked")
    ObjectProvider<ApplicationDetailsRpcService> applicationServiceProvider =
        mock(ObjectProvider.class);
    @SuppressWarnings("unchecked")
    ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider =
        mock(ObjectProvider.class);
    ApplicationSubmissionImportService service =
        new ApplicationSubmissionImportService(
            applicationServiceProvider,
            Clock.systemUTC(),
            new ObjectMapper(),
            mock(VirusScanService.class),
            scheduleRepositoryProvider);
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "private-recipient@example.com\r\nforged=true\u2028unicode=true.xml",
            "application/xml",
            "<private>xml-private@example.com</private>".getBytes(StandardCharsets.UTF_8));

    var result = service.validateApplicationSubmission(file, "PRIVATE-CLIENT-REFERENCE");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(output)
        .contains("event=lexis_submission_import")
        .contains("outcome=rejected")
        .contains("fileSize=" + file.getSize())
        .contains("errorCount=")
        .doesNotContain("private-recipient@example.com")
        .doesNotContain("xml-private@example.com")
        .doesNotContain("PRIVATE-CLIENT-REFERENCE")
        .doesNotContain(file.getOriginalFilename(), "forged=true", "unicode=true", "\u2028");
  }

  @Test
  void parseFailureLogShouldOmitExceptionMessageAndFilename(CapturedOutput output)
      throws IOException {
    @SuppressWarnings("unchecked")
    ObjectProvider<ApplicationDetailsRpcService> applicationServiceProvider =
        mock(ObjectProvider.class);
    @SuppressWarnings("unchecked")
    ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider =
        mock(ObjectProvider.class);
    ApplicationSubmissionImportService service =
        new ApplicationSubmissionImportService(
            applicationServiceProvider,
            Clock.systemUTC(),
            new ObjectMapper(),
            mock(VirusScanService.class),
            scheduleRepositoryProvider);
    MultipartFile file = mock(MultipartFile.class);
    String fileName = "private-parse@example.com\r\nforged_file=true.xml";
    String exceptionDetail =
        "XML contained xml-private@example.com\r\nforged_exception=true\u2028unicode=true";
    when(file.isEmpty()).thenReturn(false);
    when(file.getSize()).thenReturn(1024L);
    when(file.getOriginalFilename()).thenReturn(fileName);
    when(file.getInputStream()).thenThrow(new IOException(exceptionDetail));

    var result = service.validateApplicationSubmission(file, "PRIVATE-PARSE-REFERENCE");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(output)
        .contains("event=lexis_submission_import outcome=parse_failed failureType=IOException")
        .contains("event=lexis_submission_import outcome=rejected")
        .doesNotContain(fileName)
        .doesNotContain(exceptionDetail)
        .doesNotContain("PRIVATE-PARSE-REFERENCE")
        .doesNotContain(
            "private-parse@example.com",
            "xml-private@example.com",
            "forged_file=true",
            "forged_exception=true",
            "unicode=true",
            "\u2028");
  }
}

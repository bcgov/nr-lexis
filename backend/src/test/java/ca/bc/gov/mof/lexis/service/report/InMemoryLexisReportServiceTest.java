package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | InMemoryLexisReportService")
class InMemoryLexisReportServiceTest {

  @Test
  void shouldGenerateCsvReportStubWithSortedParameters() {
    InMemoryLexisReportService service = new InMemoryLexisReportService();
    LexisReportRequestDto request =
        new LexisReportRequestDto(Map.of("toDate", "2026-05-01", "fromDate", "2026-01-01"), "csv");

    LexisGeneratedReport report = service.generateReport("offerReport", request).orElseThrow();
    String content = new String(report.content(), StandardCharsets.UTF_8);

    assertThat(report.filename()).isEqualTo("offerReport.csv");
    assertThat(report.mediaType()).isEqualTo("application/vnd.ms-excel");
    assertThat(content).contains("reportAction=offerReport");
    assertThat(content).contains("parameter.fromDate=2026-01-01");
    assertThat(content).contains("parameter.toDate=2026-05-01");
  }

  @Test
  void shouldDefaultNullRequestToPdfReportStub() {
    InMemoryLexisReportService service = new InMemoryLexisReportService();

    LexisGeneratedReport report = service.generateReport("biweeklyListing", null).orElseThrow();
    String content = new String(report.content(), StandardCharsets.UTF_8);

    assertThat(report.filename()).isEqualTo("biweeklyListing.pdf");
    assertThat(report.mediaType()).isEqualTo("application/pdf");
    assertThat(content).contains("format=PDF");
    assertThat(content).contains("parameters=<none>");
  }
}

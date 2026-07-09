package ca.bc.gov.mof.lexis.dto.upload;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class ApplicationSubmissionImportResultDtoTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void shouldOmitNullTraceMetadataFromJson() throws Exception {
    ApplicationSubmissionImportResultDto result =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            42L,
            "validated",
            "validated",
            null,
            "FED-1",
            1,
            List.of(),
            List.of());

    JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(result));

    assertThat(json.has("requestId")).isFalse();
    assertThat(json.has("idempotencyKey")).isFalse();
    assertThat(json.has("payloadSha256")).isFalse();
    assertThat(json.has("sourceSystem")).isFalse();
    assertThat(json.has("payloadRootType")).isFalse();
    assertThat(json.has("federalPermitNumber")).isFalse();
  }

  @Test
  void shouldIncludeTraceMetadataInJsonWhenPresent() throws Exception {
    ApplicationSubmissionImportResultDto result =
        new ApplicationSubmissionImportResultDto(
                "applicationSubmission",
                "submission.xml",
                42L,
                "accepted",
                "created",
                9001L,
                "FED-1",
                1,
                List.of(),
                List.of())
            .withTraceMetadata(
                "REQ-1",
                "IDEMP-1",
                "87ca9b6ede5b7bec708d349d06985035dd489609c95d7de939926c03e798b54e",
                "FEDERAL-SYSTEM",
                "lexis-submission")
            .withFederalPermitNumber(7000123L);

    JsonNode json = objectMapper.readTree(objectMapper.writeValueAsString(result));

    assertThat(json.get("requestId").asText()).isEqualTo("REQ-1");
    assertThat(json.get("idempotencyKey").asText()).isEqualTo("IDEMP-1");
    assertThat(json.get("payloadSha256").asText())
        .isEqualTo("87ca9b6ede5b7bec708d349d06985035dd489609c95d7de939926c03e798b54e");
    assertThat(json.get("sourceSystem").asText()).isEqualTo("FEDERAL-SYSTEM");
    assertThat(json.get("payloadRootType").asText()).isEqualTo("lexis-submission");
    assertThat(json.get("federalPermitNumber").asLong()).isEqualTo(7000123L);
  }
}

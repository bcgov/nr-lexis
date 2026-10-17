package ca.bc.gov.mof.lexis.dto.review;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ApplicationReviewStatusEmailRequestDtoTest {

  private final ObjectMapper objectMapper = new ObjectMapper();

  @Test
  void ownerAndAgentAddressesShouldSelectTheContactRecipients() throws Exception {
    ApplicationReviewStatusEmailRequestDto request =
        objectMapper.readValue(
            """
            {"statusCode":"REJ","remark":"Missing docs","ownerEmail":"","agentEmail":"agent@example.test"}
            """,
            ApplicationReviewStatusEmailRequestDto.class);

    assertThat(request.ownerEmail()).isEmpty();
    assertThat(request.agentEmail()).isEqualTo("agent@example.test");
    assertThat(request.hasContactRecipients()).isTrue();
  }

  @Test
  void aSingleClientAddressShouldKeepTheApplicantRecipient() throws Exception {
    ApplicationReviewStatusEmailRequestDto request =
        objectMapper.readValue(
            """
            {"statusCode":"REJ","remark":"Missing docs","clientEmailAddress":"client@example.test"}
            """,
            ApplicationReviewStatusEmailRequestDto.class);

    assertThat(request.clientEmailAddress()).isEqualTo("client@example.test");
    assertThat(request.hasContactRecipients()).isFalse();
  }
}

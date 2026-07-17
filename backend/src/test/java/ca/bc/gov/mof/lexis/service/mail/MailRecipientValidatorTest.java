package ca.bc.gov.mof.lexis.service.mail;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MailRecipientValidatorTest {

  @Test
  void shouldNormalizeOneValidAddress() {
    assertThat(MailRecipientValidator.normalize(" Applicant <applicant@example.ca> "))
        .contains("applicant@example.ca");
  }

  @Test
  void shouldRejectMissingMalformedAndMultipleAddresses() {
    assertThat(MailRecipientValidator.normalize(null)).isEmpty();
    assertThat(MailRecipientValidator.normalize("not-an-email")).isEmpty();
    assertThat(MailRecipientValidator.normalize("one@example.ca,two@example.ca")).isEmpty();
  }
}

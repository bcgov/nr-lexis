package ca.bc.gov.mof.lexis.service.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class ApplicationReviewStatusEmailSenderTest {

  @Test
  void sendStatusEmailShouldUseConfiguredFromAddressAndLegacyRejectedTemplate() {
    JavaMailSender mailSender = org.mockito.Mockito.mock(JavaMailSender.class);
    ApplicationReviewStatusEmailSender sender =
        new ApplicationReviewStatusEmailSender(mailSender, "Provincial.Log.Export.Analyst@gov.bc.ca");

    sender.sendStatusEmail(108511L, "REJ", "client@example.test", "test");

    ArgumentCaptor<SimpleMailMessage> messageCaptor =
        ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(mailSender).send(messageCaptor.capture());
    SimpleMailMessage message = messageCaptor.getValue();

    assertThat(message.getFrom()).isEqualTo("Provincial.Log.Export.Analyst@gov.bc.ca");
    assertThat(message.getTo()).containsExactly("client@example.test");
    assertThat(message.getSubject()).isEqualTo("Application #108511 status to REJECTED");
    assertThat(message.getText())
        .isEqualTo(
            "Application #108511 status was changed to REJECTED with the following reason:\n\n"
                + "test");
  }

  @Test
  void sendStatusEmailShouldFallbackFromAddressAndRenderWithdrawnStatus() {
    JavaMailSender mailSender = org.mockito.Mockito.mock(JavaMailSender.class);
    ApplicationReviewStatusEmailSender sender = new ApplicationReviewStatusEmailSender(mailSender, " ");

    sender.sendStatusEmail(108512L, "WDN", "client@example.test", "Withdrawn by client");

    ArgumentCaptor<SimpleMailMessage> messageCaptor =
        ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(mailSender).send(messageCaptor.capture());
    SimpleMailMessage message = messageCaptor.getValue();

    assertThat(message.getFrom()).isEqualTo("Provincial.Log.Export.Analyst@gov.bc.ca");
    assertThat(message.getSubject()).isEqualTo("Application #108512 status to WITHDRAWN");
    assertThat(message.getText())
        .contains("Application #108512 status was changed to WITHDRAWN")
        .contains("Withdrawn by client");
  }

  @Test
  void sendStatusEmailShouldUseOneTrimmedFromAddressWithoutReplyHeaders() {
    JavaMailSender mailSender = org.mockito.Mockito.mock(JavaMailSender.class);
    ApplicationReviewStatusEmailSender sender =
        new ApplicationReviewStatusEmailSender(
            mailSender, "  Provincial.Log.Export.Analyst@gov.bc.ca  ");

    sender.sendStatusEmail(108513L, "REJ", "client@example.test", "Missing documents");

    ArgumentCaptor<SimpleMailMessage> messageCaptor =
        ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(mailSender).send(messageCaptor.capture());
    SimpleMailMessage message = messageCaptor.getValue();

    assertThat(message.getFrom()).isEqualTo("Provincial.Log.Export.Analyst@gov.bc.ca");
    assertThat(message.getReplyTo()).isNull();
    assertThat(message.getTo()).containsExactly("client@example.test");
    assertThat(message.getCc()).isNull();
    assertThat(message.getBcc()).isNull();
  }
}

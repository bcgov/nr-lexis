package ca.bc.gov.mof.lexis.service.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

class LexisMailServiceTest {

  @Test
  void nonProductionShouldRouteAllMailToConfiguredAdmins() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            true,
            true,
            "Provincial.Log.Export.Analyst@gov.bc.ca",
            "admin.one@gov.bc.ca;admin.two@gov.bc.ca");

    boolean sent =
        service.send(
            "Permit approved",
            "Permit body",
            List.of("real.client@example.com"),
            List.of("regional.office@gov.bc.ca"));

    assertThat(sent).isTrue();
    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo())
        .containsExactly("admin.one@gov.bc.ca", "admin.two@gov.bc.ca");
    assertThat(captor.getValue().getSubject()).isEqualTo("[NON-PROD] Permit approved");
    assertThat(captor.getValue().getText())
        .contains("Original To: real.client@example.com")
        .contains("Original Cc: regional.office@gov.bc.ca")
        .contains("Permit body");
  }

  @Test
  void nonProductionShouldFailClosedWithoutOverrideRecipients() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, true, "Provincial.Log.Export.Analyst@gov.bc.ca", "");

    assertThat(service.send("Subject", "Body", List.of("client@example.com"))).isFalse();

    verify(sender, never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
  }

  @Test
  void productionShouldPreserveRecipients() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, false, "Provincial.Log.Export.Analyst@gov.bc.ca", "");

    assertThat(service.send("Subject", "Body", List.of("client@example.com"))).isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo()).containsExactly("client@example.com");
    assertThat(captor.getValue().getSubject()).isEqualTo("Subject");
  }

  @Test
  void disabledDeliveryShouldNotCallTransport() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, false, false, "Provincial.Log.Export.Analyst@gov.bc.ca", "");

    assertThat(service.send("Subject", "Body", List.of("client@example.com"))).isFalse();

    verify(sender, never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
  }

  @Test
  void productionShouldDeduplicateRecipientsAndPreserveCopies() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, false, "Provincial.Log.Export.Analyst@gov.bc.ca", "");

    assertThat(
            service.send(
                "Subject",
                "Body",
                List.of("client@example.com", "client@example.com", "invalid"),
                List.of("copy@gov.bc.ca")))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo()).containsExactly("client@example.com");
    assertThat(captor.getValue().getCc()).containsExactly("copy@gov.bc.ca");
  }

  @Test
  void transportFailureShouldRemainBestEffort() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    org.mockito.Mockito.doThrow(new MailSendException("SMTP unavailable"))
        .when(sender)
        .send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
    LexisMailService service =
        new LexisMailService(
            sender, true, false, "Provincial.Log.Export.Analyst@gov.bc.ca", "");

    assertThat(service.send("Subject", "Body", List.of("client@example.com"))).isFalse();
  }
}

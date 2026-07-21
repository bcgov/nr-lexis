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
            "sender@example.com",
            "admin.one@gov.bc.ca;admin.two@gov.bc.ca",
            "test");

    boolean sent =
        service.send(
            "Permit approved",
            "Permit body",
            List.of("real.client@example.com"),
            List.of("regional.office@gov.bc.ca"),
            "real.client@example.com",
            "REGION_RCO");

    assertThat(sent).isTrue();
    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo())
        .containsExactly("admin.one@gov.bc.ca", "admin.two@gov.bc.ca");
    assertThat(captor.getValue().getFrom()).isEqualTo("sender@example.com");
    assertThat(captor.getValue().getSubject())
        .isEqualTo(
            "[TEST - Intended From: GENERAL <sender@example.com> - Intended To: real.client@example.com; "
                + "Intended Cc: REGION_RCO: regional.office@gov.bc.ca] Permit approved");
    assertThat(captor.getValue().getText())
        .contains("TEST delivery was redirected to the configured override recipient(s).")
        .contains("Intended From: GENERAL <sender@example.com>")
        .contains("Intended To: real.client@example.com")
        .contains("Intended Cc: REGION_RCO: regional.office@gov.bc.ca")
        .contains("Permit body");
  }

  @Test
  void nonProductionShouldExposeTheIntendedRegionalSender() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            true,
            "sender@example.com",
            "test.admin@gov.bc.ca",
            "test",
            new RegionalMailRecipientResolver(
                "rco.positional@gov.bc.ca", "rni.positional@gov.bc.ca", "rsi.positional@gov.bc.ca"));

    assertThat(
            service.send(
                "Regional review",
                "Body",
                List.of("regional.office@gov.bc.ca"),
                List.of(),
                "REGION_RCO",
                null,
                RegionalMailRoute.RCO))
        .isTrue();
    assertThat(
            service.send(
                "Northern review",
                "Body",
                List.of("northern.office@gov.bc.ca"),
                List.of(),
                "REGION_RNI",
                null,
                RegionalMailRoute.RNI))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender, org.mockito.Mockito.times(2)).send(captor.capture());
    assertThat(captor.getAllValues())
        .extracting(SimpleMailMessage::getSubject)
        .containsExactly(
            "[TEST - Intended From: REGION_RCO <rco.positional@gov.bc.ca> - Intended To: "
                + "REGION_RCO: regional.office@gov.bc.ca] Regional review",
            "[TEST - Intended From: REGION_RNI <rni.positional@gov.bc.ca> - Intended To: "
                + "REGION_RNI: northern.office@gov.bc.ca] Northern review");
    assertThat(captor.getAllValues())
        .extracting(SimpleMailMessage::getFrom)
        .containsExactly("rco.positional@gov.bc.ca", "rni.positional@gov.bc.ca");
    assertThat(captor.getAllValues().getFirst().getText())
        .contains("Intended From: REGION_RCO <rco.positional@gov.bc.ca>");
  }

  @Test
  void nonProductionShouldLabelDirectApplicantRoute() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            true,
            "sender@example.com",
            "test.admin@gov.bc.ca",
            "dev");

    assertThat(
            service.send(
                "Application updated",
                "Body",
                List.of("client@example.com"),
                List.of(),
                "client@example.com",
                null))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getSubject())
        .isEqualTo(
            "[DEV - Intended From: GENERAL <sender@example.com> - Intended To: client@example.com]"
                + " Application updated");
    assertThat(captor.getValue().getText())
        .startsWith("DEV delivery was redirected to the configured override recipient(s).\n");
  }

  @Test
  void nonProductionWithoutOverrideShouldUseIntendedRecipients() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(sender, true, "sender@example.com", "", "test");

    assertThat(
            service.send(
                "Subject",
                "Body",
                List.of("client@example.com"),
                List.of("regional@gov.bc.ca")))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo()).containsExactly("client@example.com");
    assertThat(captor.getValue().getCc()).containsExactly("regional@gov.bc.ca");
    assertThat(captor.getValue().getSubject()).isEqualTo("Subject");
    assertThat(captor.getValue().getText()).isEqualTo("Body");
  }

  @Test
  void nonProductionOverrideShouldAllowControlledRoutesWithoutConfiguredAddresses() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, "sender@example.com", "test.admin@gov.bc.ca", "test");

    for (String route : List.of("REGION_RCO", "REGION_RNI", "REGION_RSI")) {
      assertThat(service.send("Review", "Body", List.of(), List.of(), route, null)).isTrue();
    }

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender, org.mockito.Mockito.times(3)).send(captor.capture());
    assertThat(captor.getAllValues())
        .extracting(SimpleMailMessage::getSubject)
        .containsExactly(
            "[TEST - Intended From: GENERAL <sender@example.com> - Intended To: "
                + "REGION_RCO (not configured)] Review",
            "[TEST - Intended From: GENERAL <sender@example.com> - Intended To: "
                + "REGION_RNI (not configured)] Review",
            "[TEST - Intended From: GENERAL <sender@example.com> - Intended To: "
                + "REGION_RSI (not configured)] Review");
    assertThat(captor.getAllValues().getFirst().getText())
        .startsWith(
            "TEST delivery was redirected to the configured override recipient(s).\n"
                + "Intended From: GENERAL <sender@example.com>\n"
                + "Intended To: REGION_RCO (not configured)");
  }

  @Test
  void nonProductionOverrideShouldRejectUncontrolledRouteWithoutAnAddress() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, "sender@example.com", "test.admin@gov.bc.ca", "test");

    for (String route : List.of("APPLICANT", "PERMIT_REQUEST")) {
      assertThat(service.send("Subject", "Body", List.of(), List.of(), route, null)).isFalse();
    }

    verify(sender, never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
  }

  @Test
  void nonProductionOverrideShouldIncludeControlledUnconfiguredCopyRoute() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, true, "sender@example.com", "test.admin@gov.bc.ca", "test");

    assertThat(
            service.send(
                "Offer created",
                "Body",
                List.of("client@example.com"),
                List.of(),
                "client@example.com",
                "REGION_RCO"))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getSubject())
        .isEqualTo(
            "[TEST - Intended From: GENERAL <sender@example.com> - Intended To: client@example.com; "
                + "Intended Cc: REGION_RCO (not configured)] Offer created");
    assertThat(captor.getValue().getText())
        .contains("Intended Cc: REGION_RCO (not configured)");
  }

  @Test
  void nonProductionShouldShowEveryIntendedPermitReviewRecipient() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            true,
            "sender@example.com",
            "test.admin@gov.bc.ca",
            "test");

    assertThat(
            service.send(
                "Permit review",
                "Body",
                List.of("regional.office@gov.bc.ca", "additional.requester@example.com"),
                List.of(),
                "REGION_RCO",
                null))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getSubject())
        .contains("Intended To: REGION_RCO: regional.office@gov.bc.ca, additional.requester@example.com")
        .doesNotContain("Intended Cc:");
    assertThat(captor.getValue().getText())
        .contains("Intended To: REGION_RCO: regional.office@gov.bc.ca, additional.requester@example.com")
        .doesNotContain("Intended Cc:");
  }

  @Test
  void shouldFailClosedWhenTheSelectedRegionalSenderIsNotConfigured() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            false,
            "sender@example.com",
            "",
            "prod",
            new RegionalMailRecipientResolver("", "rni.positional@gov.bc.ca", ""));

    assertThat(
            service.send(
                "Subject",
                "Body",
                List.of("client@example.com"),
                List.of(),
                "client@example.com",
                null,
                RegionalMailRoute.RCO))
        .isFalse();

    verify(sender, never()).send(org.mockito.ArgumentMatchers.any(SimpleMailMessage.class));
  }

  @Test
  void productionShouldPreserveRecipients() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender,
            false,
            "sender@example.com",
            "test.admin@gov.bc.ca",
            "prod");

    assertThat(
            service.send(
                "Subject",
                "Body",
                List.of("client@example.com"),
                List.of("regional@gov.bc.ca"),
                "client@example.com",
                "REGION_RCO"))
        .isTrue();

    ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    assertThat(captor.getValue().getTo()).containsExactly("client@example.com");
    assertThat(captor.getValue().getCc()).containsExactly("regional@gov.bc.ca");
    assertThat(captor.getValue().getSubject()).isEqualTo("Subject");
    assertThat(captor.getValue().getText()).isEqualTo("Body");
  }

  @Test
  void productionShouldDeduplicateRecipientsAndPreserveCopies() {
    JavaMailSender sender = org.mockito.Mockito.mock(JavaMailSender.class);
    LexisMailService service =
        new LexisMailService(
            sender, false, "sender@example.com", "", "prod");

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
            sender, false, "sender@example.com", "", "prod");

    assertThat(service.send("Subject", "Body", List.of("client@example.com"))).isFalse();
  }
}

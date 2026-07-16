package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.List;
import org.junit.jupiter.api.Test;

class PermitNotificationEmailServiceTest {

  @Test
  void shouldSendReviewRequestOnlyToConfiguredRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver(
                "review.one@gov.bc.ca; review.two@gov.bc.ca", "", "", ""),
            false,
            "");

    assertThat(service.sendRequest(123L, 1835L)).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L,
                List.of("review.one@gov.bc.ca", "review.two@gov.bc.ca"),
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void shouldLabelFallbackPermitRequestRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", "fallback@gov.bc.ca"),
            false,
            "");

    assertThat(service.sendRequest(123L, 9999L)).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L,
                List.of("fallback@gov.bc.ca"),
                List.of(),
                "PERMIT_REQUEST"));
  }

  @Test
  void shouldSendPaymentPendingApprovalToApplicant() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", ""),
            false,
            "");

    assertThat(
            service.sendApproval(
                123L, "PPD", List.of("PKG-1", "PKG-2"), "applicant@example.com"))
        .isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitApproval(
                123L,
                true,
                "PKG-1, PKG-2",
                "applicant@example.com"));
  }

  @Test
  void shouldPublishKnownRegionalRouteWithoutConfiguredRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", ""),
            true,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 1835L)).isTrue();

    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L, List.of(), List.of(), "REGION_RCO"));
  }

  @Test
  void shouldNotAttemptReviewEmailForUnknownRouteWithoutConfiguredRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", ""),
            true,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 9999L)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void shouldNotPublishKnownRegionalRouteWithoutRecipientsOrOverride() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", ""),
            true,
            "");

    assertThat(service.sendRequest(123L, 1835L)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void shouldNotPublishRouteOnlyRequestInProductionEvenWithOverrideConfigured() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", "", ""),
            false,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 1835L)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }
}

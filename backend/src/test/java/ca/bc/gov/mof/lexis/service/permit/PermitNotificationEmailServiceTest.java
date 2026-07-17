package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.List;
import org.junit.jupiter.api.Test;

class PermitNotificationEmailServiceTest {

  @Test
  void shouldSendReviewRequestToTheRegionalPositionalMailbox() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("review.office@gov.bc.ca", "", ""),
            false,
            "");

    assertThat(service.sendRequest(123L, 1835L, null)).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L,
                List.of("review.office@gov.bc.ca"),
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void shouldPlaceTheOptionalPermitReviewRecipientSecondInToRatherThanCc() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("review.office@gov.bc.ca", "", ""),
            false,
            "");

    assertThat(service.sendRequest(123L, 1835L, "applicant@example.com")).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L,
                List.of("review.office@gov.bc.ca", "applicant@example.com"),
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void shouldSendPaymentPendingApprovalToApplicant() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", ""),
            false,
            "");

    assertThat(
            service.sendApproval(
                123L,
                "PPD",
                List.of("PKG-1", "PKG-2"),
                "applicant@example.com",
                RegionalMailRoute.RCO))
        .isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitApproval(
                123L,
                true,
                "PKG-1, PKG-2",
                "applicant@example.com",
                RegionalMailRoute.RCO));
  }

  @Test
  void shouldPublishKnownRegionalRouteWithoutConfiguredRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", ""),
            true,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 1835L, null)).isTrue();

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
            new RegionalMailRecipientResolver("", "", ""),
            true,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 9999L, null)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void shouldNotPublishKnownRegionalRouteWithoutRecipientsOrOverride() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", ""),
            true,
            "");

    assertThat(service.sendRequest(123L, 1835L, null)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }

  @Test
  void shouldNotPublishRouteOnlyRequestInProductionEvenWithOverrideConfigured() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService,
            new RegionalMailRecipientResolver("", "", ""),
            false,
            "test.admin@gov.bc.ca");

    assertThat(service.sendRequest(123L, 1835L, null)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }
}

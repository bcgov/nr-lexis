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
                "review.one@gov.bc.ca; review.two@gov.bc.ca", "", "", ""));

    assertThat(service.sendRequest(123L, 1835L)).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PermitReview(
                123L,
                List.of("review.one@gov.bc.ca", "review.two@gov.bc.ca"),
                List.of()));
  }

  @Test
  void shouldSendPaymentPendingApprovalToApplicant() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService, new RegionalMailRecipientResolver("", "", "", ""));

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
  void shouldNotAttemptReviewEmailWithoutConfiguredRecipients() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    PermitNotificationEmailService service =
        new PermitNotificationEmailService(
            notificationService, new RegionalMailRecipientResolver("", "", "", ""));

    assertThat(service.sendRequest(123L, 1835L)).isFalse();

    verify(notificationService, never()).publish(org.mockito.ArgumentMatchers.any());
  }
}

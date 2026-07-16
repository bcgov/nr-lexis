package ca.bc.gov.mof.lexis.service.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ApplicationReviewStatusEmailSenderTest {

  @Test
  void sendStatusEmailShouldUseLegacyRejectedTemplate() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    ApplicationReviewStatusEmailSender sender =
        new ApplicationReviewStatusEmailSender(notificationService);

    sender.sendStatusEmail(999000001L, "REJ", "client@example.test", "test");

    ArgumentCaptor<WorkflowEmailEvent> eventCaptor =
        ArgumentCaptor.forClass(WorkflowEmailEvent.class);
    verify(notificationService).publish(eventCaptor.capture());
    assertThat(eventCaptor.getValue())
        .isEqualTo(
            new WorkflowEmailEvent.ApplicationStatus(
                999000001L,
                "REJECTED",
                "test",
                "client@example.test"));
  }

  @Test
  void sendStatusEmailShouldRenderWithdrawnStatus() {
    EmailNotificationService notificationService =
        org.mockito.Mockito.mock(EmailNotificationService.class);
    ApplicationReviewStatusEmailSender sender =
        new ApplicationReviewStatusEmailSender(notificationService);

    sender.sendStatusEmail(999000002L, "WDN", "client@example.test", "Withdrawn by client");

    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.ApplicationStatus(
                999000002L,
                "WITHDRAWN",
                "Withdrawn by client",
                "client@example.test"));
  }
}

package ca.bc.gov.mof.lexis.service.mail;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EmailEventDispatcherTest {

  private LexisMailService mailService;
  private EmailEventDispatcher dispatcher;
  private SimpleMeterRegistry meterRegistry;

  @BeforeEach
  void setUp() {
    mailService = org.mockito.Mockito.mock(LexisMailService.class);
    when(mailService.send(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any()))
        .thenReturn(true);
    meterRegistry = new SimpleMeterRegistry();
    dispatcher = new EmailEventDispatcher(mailService, new EmailTemplateRenderer(), meterRegistry);
  }

  @Test
  void shouldDispatchApplicationStatusSnapshot() {
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.ApplicationStatus(
            999000001L,
            "REJECTED",
            "Missing documents",
            "client@example.com"));

    verify(mailService)
        .send(
            "Application #999000001 status to REJECTED",
            "Application #999000001 status was changed to REJECTED with the following reason:\n\n"
                + "Missing documents\n",
            List.of("client@example.com"),
            List.of(),
            "client@example.com",
            null);
    assertThatCount("ApplicationStatus", "attempted", 1.0);
    assertThatCount("ApplicationStatus", "delivered", 1.0);
  }

  @Test
  void shouldDispatchExemptionAndOfferSnapshots() {
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.ExemptionApproval(
            "EX-205",
            "1000456\n1000457",
            "client@example.com"));
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PurchaseOffer(
            1000456L,
            81001L,
            WorkflowEmailEvent.OfferAction.NEW,
            "client@example.com",
            List.of("regional.reviewers@gov.bc.ca"),
            "REGION_RCO"));
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PurchaseOffer(
            1000456L,
            81002L,
            WorkflowEmailEvent.OfferAction.UPDATED,
            "client@example.com"));
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PurchaseOffer(
            1000456L,
            81003L,
            WorkflowEmailEvent.OfferAction.WITHDRAWN,
            "client@example.com"));

    verify(mailService)
        .send(
            "LEXIS exemption #EX-205 approved",
            "Exemption #EX-205 has been approved.\n\nApplication number(s):\n"
                + "1000456\n1000457\n\nThis is an automated notification; do not reply.\n",
            List.of("client@example.com"),
            List.of(),
            "client@example.com",
            null);
    verify(mailService)
        .send(
            "New LEXIS offer to purchase",
            "Please be advised an Offer to Purchase #81001 has been made on Application #1000456."
                + " Details can be found in LEXIS.\n",
            List.of("client@example.com"),
            List.of("regional.reviewers@gov.bc.ca"),
            "client@example.com",
            "REGION_RCO");
    verify(mailService)
        .send(
            "Updated LEXIS offer to purchase",
            "Please be advised there is an update on Offer to Purchase #81002."
                + " Details can be found in LEXIS.\n",
            List.of("client@example.com"),
            List.of(),
            "client@example.com",
            null);
    verify(mailService)
        .send(
            "Withdrawn LEXIS offer to purchase",
            "Please be advised that Offer to Purchase #81003 on Application #1000456"
                + " has been withdrawn. Details can be found in LEXIS.\n",
            List.of("client@example.com"),
            List.of(),
            "client@example.com",
            null);
    assertThatCount("ExemptionApproval", "attempted", 1.0);
    assertThatCount("ExemptionApproval", "delivered", 1.0);
    assertThatCount("PurchaseOffer", "attempted", 3.0);
    assertThatCount("PurchaseOffer", "delivered", 3.0);
  }

  @Test
  void shouldDispatchPermitReviewAndApprovalSnapshots() {
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PermitReview(
            7000123L,
            List.of("reviewers@gov.bc.ca"),
            List.of("applicant@example.com"),
            "REGION_RCO"));
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PermitApproval(
            7000123L,
            true,
            "PKG-1, PKG-2",
            "applicant@example.com"));
    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PermitApproval(
            7000124L,
            false,
            "PKG-3",
            "applicant@example.com"));

    verify(mailService)
        .send(
            "LEXIS permit #7000123 ready for review",
            "Permit #7000123 is ready for review.\n",
            List.of("reviewers@gov.bc.ca"),
            List.of("applicant@example.com"),
            "REGION_RCO",
            null);
    verify(mailService)
        .send(
            "LEXIS permit #7000123 payment pending",
            "Permit #7000123 has been approved as Payment Pending.\n\n"
                + "Package(s): PKG-1, PKG-2\n\n"
                + "This is an automated notification; do not reply.\n",
            List.of("applicant@example.com"),
            List.of(),
            "applicant@example.com",
            null);
    verify(mailService)
        .send(
            "LEXIS permit #7000124 approved",
            "Permit #7000124 has been approved.\n\n"
                + "Package(s): PKG-3\n\n"
                + "This is an automated notification; do not reply.\n",
            List.of("applicant@example.com"),
            List.of(),
            "applicant@example.com",
            null);
    assertThatCount("PermitReview", "attempted", 1.0);
    assertThatCount("PermitReview", "delivered", 1.0);
    assertThatCount("PermitApproval", "attempted", 2.0);
    assertThatCount("PermitApproval", "delivered", 2.0);
  }

  @Test
  void shouldMeterARejectedDelivery() {
    when(mailService.send(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any()))
        .thenReturn(false);

    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PermitReview(
            7000123L,
            List.of("reviewers@gov.bc.ca"),
            List.of(),
            "PERMIT_REQUEST"));

    assertThatCount("PermitReview", "attempted", 1.0);
    assertThatCount("PermitReview", "not_delivered", 1.0);
  }

  @Test
  void shouldMeterAnUnexpectedDispatchFailure() {
    when(mailService.send(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.anyList(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any()))
        .thenThrow(new IllegalStateException("test failure"));

    dispatcher.onWorkflowEmailEvent(
        new WorkflowEmailEvent.PermitReview(
            7000123L,
            List.of("reviewers@gov.bc.ca"),
            List.of(),
            "PERMIT_REQUEST"));

    assertThatCount("PermitReview", "attempted", 1.0);
    assertThatCount("PermitReview", "dispatch_failed", 1.0);
  }

  private void assertThatCount(String eventType, String outcome, double expected) {
    org.assertj.core.api.Assertions.assertThat(
            meterRegistry
                .get(EmailEventDispatcher.DELIVERY_METRIC)
                .tags("event_type", eventType, "outcome", outcome)
                .counter()
                .count())
        .isEqualTo(expected);
  }
}

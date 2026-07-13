package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Dispatches workflow email events asynchronously after the publishing transaction commits. */
@Component
public class EmailEventDispatcher {

  private static final Logger LOGGER = LoggerFactory.getLogger(EmailEventDispatcher.class);
  static final String DELIVERY_METRIC = "lexis.email.workflow";

  private final LexisMailService mailService;
  private final EmailTemplateRenderer renderer;
  private final MeterRegistry meterRegistry;

  public EmailEventDispatcher(
      LexisMailService mailService, EmailTemplateRenderer renderer, MeterRegistry meterRegistry) {
    this.mailService = mailService;
    this.renderer = renderer;
    this.meterRegistry = meterRegistry;
  }

  @Async("emailExecutor")
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
  public void onWorkflowEmailEvent(WorkflowEmailEvent event) {
    String eventType = event.getClass().getSimpleName();
    count(eventType, "attempted");
    try {
      String body = renderer.render(event.templateName(), context(event));
      boolean sent =
          mailService.send(event.subject(), body, event.recipients(), event.copyRecipients());
      if (sent) {
        count(eventType, "delivered");
        LOGGER.info(
            "event=lexis_workflow_email outcome=delivered eventType={} referenceFingerprint={}",
            eventType,
            fingerprint(event.reference()));
      } else {
        count(eventType, "not_delivered");
        LOGGER.warn(
            "event=lexis_workflow_email outcome=not_delivered eventType={} referenceFingerprint={}",
            eventType,
            fingerprint(event.reference()));
      }
    } catch (RuntimeException ex) {
      count(eventType, "dispatch_failed");
      LOGGER.error(
          "event=lexis_workflow_email outcome=dispatch_failed eventType={} referenceFingerprint={} failureType={}",
          eventType,
          fingerprint(event.reference()),
          exceptionType(ex));
    }
  }

  private void count(String eventType, String outcome) {
    meterRegistry
        .counter(DELIVERY_METRIC, "event_type", eventType, "outcome", outcome)
        .increment();
  }

  private Map<String, String> context(WorkflowEmailEvent event) {
    Map<String, String> context = new HashMap<>();
    if (event instanceof WorkflowEmailEvent.ApplicationStatus status) {
      context.put("applicationNumber", Long.toString(status.applicationNumber()));
      context.put("statusDescription", safe(status.statusDescription()));
      context.put("remark", safe(status.remark()));
    } else if (event instanceof WorkflowEmailEvent.ExemptionApproval exemption) {
      context.put("exemptionNumber", safe(exemption.exemptionNumber()));
      context.put("applicationNumbers", safe(exemption.applicationNumbers()));
    } else if (event instanceof WorkflowEmailEvent.PurchaseOffer offer) {
      context.put("applicationNumber", Long.toString(offer.applicationNumber()));
      context.put("offerNumber", Long.toString(offer.offerNumber()));
    } else if (event instanceof WorkflowEmailEvent.PermitReview review) {
      context.put("permitNumber", Long.toString(review.permitNumber()));
    } else if (event instanceof WorkflowEmailEvent.PermitApproval approval) {
      context.put("permitNumber", Long.toString(approval.permitNumber()));
      context.put(
          "approvalDescription",
          approval.paymentPending()
              ? "has been approved as Payment Pending."
              : "has been approved.");
      context.put("packageNumbers", safe(approval.packageNumbers()));
    }
    return context;
  }

  private String safe(String value) {
    return value == null ? "" : value;
  }
}

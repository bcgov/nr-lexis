package ca.bc.gov.mof.lexis.service.mail;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

/** Publishes immutable workflow email snapshots for after-commit dispatch. */
@Service
public class EmailNotificationService {

  private final ApplicationEventPublisher publisher;

  public EmailNotificationService(ApplicationEventPublisher publisher) {
    this.publisher = publisher;
  }

  public void publish(WorkflowEmailEvent event) {
    publisher.publishEvent(event);
  }
}

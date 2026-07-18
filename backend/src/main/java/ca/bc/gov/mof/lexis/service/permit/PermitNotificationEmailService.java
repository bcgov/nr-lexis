package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver.RecipientGroup;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class PermitNotificationEmailService {

  private final EmailNotificationService notificationService;
  private final RegionalMailRecipientResolver regionalRecipientResolver;
  private final boolean routeOnlyDeliveryAvailable;

  public PermitNotificationEmailService(
      EmailNotificationService notificationService,
      RegionalMailRecipientResolver regionalRecipientResolver,
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients) {
    this.notificationService = notificationService;
    this.regionalRecipientResolver = regionalRecipientResolver;
    this.routeOnlyDeliveryAvailable = nonProduction && trimToNull(overrideRecipients) != null;
  }

  public boolean sendRequest(Long permitNumber, Long orgUnitNumber, String additionalRecipient) {
    RecipientGroup recipientGroup = regionalRecipientResolver.resolveGroup(orgUnitNumber);
    if (permitNumber == null
        || permitNumber < 1
        || (recipientGroup.recipients().isEmpty()
            && (!routeOnlyDeliveryAvailable || trimToNull(recipientGroup.label()) == null))) {
      return false;
    }
    List<String> recipients = new ArrayList<>(recipientGroup.recipients());
    if (trimToNull(additionalRecipient) != null && !recipients.contains(additionalRecipient.trim())) {
      recipients.add(additionalRecipient.trim());
    }
    notificationService.publish(
        new WorkflowEmailEvent.PermitReview(
            permitNumber,
            recipients,
            List.of(),
            recipientGroup.label()));
    return true;
  }

  public boolean sendApproval(
      Long permitNumber,
      String permitStatusCode,
      List<String> packageNumbers,
      String recipient,
      RegionalMailRoute senderRoute) {
    if (permitNumber == null
        || permitNumber < 1
        || trimToNull(recipient) == null
        || senderRoute == null) {
      return false;
    }
    String packages = packageNumbers == null ? "" : String.join(", ", packageNumbers);
    boolean paymentPending = "PPD".equalsIgnoreCase(trimToNull(permitStatusCode));
    notificationService.publish(
        new WorkflowEmailEvent.PermitApproval(
            permitNumber,
            paymentPending,
            packages,
            recipient.trim(),
            senderRoute));
    return true;
  }

}

package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver.RecipientGroup;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
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

  public boolean sendRequest(Long permitNumber, Long orgUnitNumber) {
    RecipientGroup recipientGroup = regionalRecipientResolver.resolveGroup(orgUnitNumber);
    if (permitNumber == null
        || permitNumber < 1
        || (recipientGroup.recipients().isEmpty()
            && (!routeOnlyDeliveryAvailable || trimToNull(recipientGroup.label()) == null))) {
      return false;
    }
    notificationService.publish(
        new WorkflowEmailEvent.PermitReview(
            permitNumber,
            recipientGroup.recipients(),
            List.of(),
            recipientGroup.label()));
    return true;
  }

  public boolean sendApproval(
      Long permitNumber, String permitStatusCode, List<String> packageNumbers, String recipient) {
    if (permitNumber == null || permitNumber < 1 || trimToNull(recipient) == null) {
      return false;
    }
    String packages = packageNumbers == null ? "" : String.join(", ", packageNumbers);
    boolean paymentPending = "PPD".equalsIgnoreCase(trimToNull(permitStatusCode));
    notificationService.publish(
        new WorkflowEmailEvent.PermitApproval(
            permitNumber,
            paymentPending,
            packages,
            recipient.trim()));
    return true;
  }
}

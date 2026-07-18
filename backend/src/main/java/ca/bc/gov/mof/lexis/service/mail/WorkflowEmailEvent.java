package ca.bc.gov.mof.lexis.service.mail;

import java.util.List;

/** Immutable workflow snapshots consumed by the asynchronous email dispatcher. */
public sealed interface WorkflowEmailEvent {

  String subject();

  String templateName();

  List<String> recipients();

  default List<String> copyRecipients() {
    return List.of();
  }

  default String recipientRouteLabel() {
    return String.join(", ", recipients());
  }

  default String copyRecipientRouteLabel() {
    return null;
  }

  /** Defaults to the configured provincial/system sender. */
  default RegionalMailRoute senderRoute() {
    return RegionalMailRoute.GENERAL;
  }

  String reference();

  record ApplicationStatus(
      long applicationNumber,
      String statusDescription,
      String remark,
      String recipient,
      RegionalMailRoute senderRoute)
      implements WorkflowEmailEvent {

    public ApplicationStatus {
      senderRoute = senderRoute == null ? RegionalMailRoute.GENERAL : senderRoute;
    }

    public ApplicationStatus(
        long applicationNumber, String statusDescription, String remark, String recipient) {
      this(applicationNumber, statusDescription, remark, recipient, RegionalMailRoute.GENERAL);
    }

    @Override
    public String subject() {
      return "Application #" + applicationNumber + " status to " + statusDescription;
    }

    @Override
    public String templateName() {
      return "application_status";
    }

    @Override
    public List<String> recipients() {
      return List.of(recipient);
    }

    @Override
    public String reference() {
      return "application " + applicationNumber;
    }
  }

  record ExemptionApproval(
      String exemptionNumber,
      String applicationNumbers,
      String recipient,
      RegionalMailRoute senderRoute)
      implements WorkflowEmailEvent {

    public ExemptionApproval {
      senderRoute = senderRoute == null ? RegionalMailRoute.GENERAL : senderRoute;
    }

    public ExemptionApproval(String exemptionNumber, String applicationNumbers, String recipient) {
      this(exemptionNumber, applicationNumbers, recipient, RegionalMailRoute.GENERAL);
    }

    @Override
    public String subject() {
      return "LEXIS exemption #" + exemptionNumber + " approved";
    }

    @Override
    public String templateName() {
      return "exemption_approval";
    }

    @Override
    public List<String> recipients() {
      return List.of(recipient);
    }

    @Override
    public String reference() {
      return "exemption " + exemptionNumber;
    }
  }

  enum OfferAction {
    NEW,
    UPDATED,
    WITHDRAWN
  }

  record PurchaseOffer(
      long applicationNumber,
      long offerNumber,
      OfferAction action,
      String recipient,
      List<String> copyRecipients,
      String copyRecipientRouteLabel)
      implements WorkflowEmailEvent {

    public PurchaseOffer {
      copyRecipients = copyRecipients == null ? List.of() : List.copyOf(copyRecipients);
    }

    public PurchaseOffer(
        long applicationNumber,
        long offerNumber,
        OfferAction action,
        String recipient,
        List<String> copyRecipients) {
      this(applicationNumber, offerNumber, action, recipient, copyRecipients, null);
    }

    public PurchaseOffer(
        long applicationNumber,
        long offerNumber,
        OfferAction action,
        String recipient) {
      this(applicationNumber, offerNumber, action, recipient, List.of(), null);
    }

    @Override
    public String subject() {
      return switch (action) {
        case NEW -> "New LEXIS offer to purchase";
        case UPDATED -> "Updated LEXIS offer to purchase";
        case WITHDRAWN -> "Withdrawn LEXIS offer to purchase";
      };
    }

    @Override
    public String templateName() {
      return switch (action) {
        case NEW -> "offer_new";
        case UPDATED -> "offer_updated";
        case WITHDRAWN -> "offer_withdrawn";
      };
    }

    @Override
    public List<String> recipients() {
      return List.of(recipient);
    }

    @Override
    public String reference() {
      return "offer " + offerNumber;
    }
  }

  record PermitReview(
      long permitNumber,
      List<String> recipients,
      List<String> copyRecipients,
      String recipientRouteLabel)
      implements WorkflowEmailEvent {

    public PermitReview {
      recipients = recipients == null ? List.of() : List.copyOf(recipients);
      copyRecipients = copyRecipients == null ? List.of() : List.copyOf(copyRecipients);
    }

    public PermitReview(
        long permitNumber,
        List<String> recipients,
        List<String> copyRecipients) {
      this(permitNumber, recipients, copyRecipients, null);
    }

    @Override
    public String subject() {
      return "LEXIS permit #" + permitNumber + " ready for review";
    }

    @Override
    public String templateName() {
      return "permit_review";
    }

    @Override
    public String reference() {
      return "permit " + permitNumber;
    }
  }

  record PermitApproval(
      long permitNumber,
      boolean paymentPending,
      String packageNumbers,
      String recipient,
      RegionalMailRoute senderRoute)
      implements WorkflowEmailEvent {

    public PermitApproval {
      senderRoute = senderRoute == null ? RegionalMailRoute.GENERAL : senderRoute;
    }

    public PermitApproval(
        long permitNumber, boolean paymentPending, String packageNumbers, String recipient) {
      this(permitNumber, paymentPending, packageNumbers, recipient, RegionalMailRoute.GENERAL);
    }

    @Override
    public String subject() {
      return "LEXIS permit #" + permitNumber + (paymentPending ? " payment pending" : " approved");
    }

    @Override
    public String templateName() {
      return "permit_approval";
    }

    @Override
    public List<String> recipients() {
      return List.of(recipient);
    }

    @Override
    public String reference() {
      return "permit " + permitNumber;
    }
  }
}

package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class ApplicationNotificationRecipientResolver {

  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String APPLICANT_TYPE_MINISTERIAL = "M";
  private static final String APPLICANT_TYPE_AGENT = "A";
  private final AuthoritativeClientEmailResolver clientEmailResolver;

  public ApplicationNotificationRecipientResolver(
      AuthoritativeClientEmailResolver clientEmailResolver) {
    this.clientEmailResolver = clientEmailResolver;
  }

  /**
   * Resolves the applicant recipient for status and approval emails: an agent applicant goes to
   * the agent location, owner and Ministerial applicants go to the owner location, and any other
   * applicant type has no recipient.
   */
  public Optional<String> resolve(
      Long applicationNumber,
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode) {
    String applicantType = trimToNull(applicantTypeCode);
    if (APPLICANT_TYPE_OWNER.equalsIgnoreCase(applicantType)
        || APPLICANT_TYPE_MINISTERIAL.equalsIgnoreCase(applicantType)) {
      return clientEmailResolver.resolve(ownerClientNumber, ownerClientLocationCode);
    }
    if (APPLICANT_TYPE_AGENT.equalsIgnoreCase(applicantType)) {
      return clientEmailResolver.resolve(agentClientNumber, agentClientLocationCode);
    }
    return Optional.empty();
  }

  /**
   * Resolves the recipient for a new offer, which is emailed only for owner and agent
   * applicants.
   */
  public Optional<String> resolveOwnerOrAgent(
      Long applicationNumber,
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode) {
    String applicantType = trimToNull(applicantTypeCode);
    if (APPLICANT_TYPE_OWNER.equalsIgnoreCase(applicantType)
        || APPLICANT_TYPE_AGENT.equalsIgnoreCase(applicantType)) {
      return resolve(
          applicationNumber,
          applicantType,
          ownerClientNumber,
          ownerClientLocationCode,
          agentClientNumber,
          agentClientLocationCode);
    }
    return Optional.empty();
  }

  /**
   * Resolves the recipient for an offer update or withdrawal: an agent applicant goes to the
   * agent location and every other applicant type goes to the owner location.
   */
  public Optional<String> resolveAgentOrOwner(
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode) {
    if (APPLICANT_TYPE_AGENT.equalsIgnoreCase(trimToNull(applicantTypeCode))) {
      return clientEmailResolver.resolve(agentClientNumber, agentClientLocationCode);
    }
    return clientEmailResolver.resolve(ownerClientNumber, ownerClientLocationCode);
  }

  public Optional<String> resolveClientLocation(String clientNumber, String clientLocationCode) {
    return clientEmailResolver.resolve(clientNumber, clientLocationCode);
  }
}

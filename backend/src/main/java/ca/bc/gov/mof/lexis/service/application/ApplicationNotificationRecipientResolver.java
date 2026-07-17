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
  private static final String APPLICANT_TYPE_AGENT = "A";
  private final AuthoritativeClientEmailResolver clientEmailResolver;

  public ApplicationNotificationRecipientResolver(
      AuthoritativeClientEmailResolver clientEmailResolver) {
    this.clientEmailResolver = clientEmailResolver;
  }

  public Optional<String> resolve(
      Long applicationNumber,
      String applicantTypeCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode) {
    String applicantType = trimToNull(applicantTypeCode);
    if (APPLICANT_TYPE_OWNER.equalsIgnoreCase(applicantType)) {
      return clientEmailResolver.resolve(ownerClientNumber, ownerClientLocationCode);
    }
    if (APPLICANT_TYPE_AGENT.equalsIgnoreCase(applicantType)) {
      return clientEmailResolver.resolve(agentClientNumber, agentClientLocationCode);
    }
    return Optional.empty();
  }

  public Optional<String> resolveClientLocation(String clientNumber, String clientLocationCode) {
    return clientEmailResolver.resolve(clientNumber, clientLocationCode);
  }
}

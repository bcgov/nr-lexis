package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisAdminService implements LexisAdminService {

  @Override
  public Optional<LexisAdminPageDto> agentAdminPage() {
    return Optional.of(
        new LexisAdminPageDto(
            "agent",
            "/lexisAgentAdmin.do?actionMapping=view",
            Map.of("section", "agent", "mode", "oracle")));
  }

  @Override
  public Optional<LexisAdminPageDto> feePolicyAdminPage() {
    return Optional.of(
        new LexisAdminPageDto(
            "policy",
            "/lexisPolicyAdmin.do?actionMapping=view",
            Map.of("section", "policy", "mode", "oracle")));
  }

  @Override
  public Optional<LexisAdminPageDto> filPolicyAdminPage() {
    return Optional.of(
        new LexisAdminPageDto(
            "filPolicy",
            "/lexisFILAdmin.do?actionMapping=view",
            Map.of("section", "filPolicy", "mode", "oracle")));
  }
}

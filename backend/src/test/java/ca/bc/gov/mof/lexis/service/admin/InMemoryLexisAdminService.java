package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("stub-services & !oracle")
public class InMemoryLexisAdminService implements LexisAdminService {

  @Override
  public Optional<LexisAdminPageDto> feePolicyAdminPage() {
    return Optional.of(
        new LexisAdminPageDto(
            "policy",
            "/lexisPolicyAdmin.do?actionMapping=view",
            Map.of("section", "policy", "mode", "in-memory")));
  }

  @Override
  public Optional<LexisAdminPageDto> filPolicyAdminPage() {
    return Optional.of(
        new LexisAdminPageDto(
            "filPolicy",
            "/lexisFILAdmin.do?actionMapping=view",
            Map.of("section", "filPolicy", "mode", "in-memory")));
  }
}

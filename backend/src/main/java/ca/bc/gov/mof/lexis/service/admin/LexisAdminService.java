package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import java.util.Optional;

public interface LexisAdminService {

  Optional<LexisAdminPageDto> agentAdminPage();

  Optional<LexisAdminPageDto> feePolicyAdminPage();

  Optional<LexisAdminPageDto> filPolicyAdminPage();
}


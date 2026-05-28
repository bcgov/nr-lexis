package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import java.util.Optional;

public interface LexisAdminRpcService {

  Optional<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request);

  Optional<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request);
}

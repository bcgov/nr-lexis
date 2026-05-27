package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcResponseDto;
import java.util.Optional;

public interface LexisAdminRpcService {

  Optional<LexisAdminRpcResponseDto> executeFeePolicyRpc(LexisAdminRpcRequestDto request);

  Optional<LexisAdminRpcResponseDto> executeFilPolicyRpc(LexisAdminRpcRequestDto request);
}


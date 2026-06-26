package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import java.util.Map;
import java.util.Optional;

public interface LexisAdminRpcService {

  Optional<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request);

  Optional<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request);

  Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFeePolicies(
      int page, int size, String sortField, String sortDirection);

  Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFilPolicies(
      int page, int size, String sortField, String sortDirection);
}

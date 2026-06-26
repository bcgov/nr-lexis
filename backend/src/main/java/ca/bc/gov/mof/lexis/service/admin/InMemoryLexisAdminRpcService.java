package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("!oracle")
public class InMemoryLexisAdminRpcService implements LexisAdminRpcService {

  @Override
  public Optional<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(buildResponse("fee-policy", request));
  }

  @Override
  public Optional<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(buildResponse("fil-policy", request));
  }

  @Override
  public Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFeePolicies(
      int page, int size, String sortField, String sortDirection) {
    return Optional.of(emptyPage(page, size));
  }

  @Override
  public Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFilPolicies(
      int page, int size, String sortField, String sortDirection) {
    return Optional.of(emptyPage(page, size));
  }

  private LexisAdminPagedResponseDto<Map<String, Object>> emptyPage(int page, int size) {
    return new LexisAdminPagedResponseDto<>(
        List.of(), 0, Math.max(0, page), Math.max(1, size));
  }

  private Map<String, Object> buildResponse(String scope, LexisAdminRpcRequestDto request) {
    String action = normalizeAction(request);
    Map<String, String> parameters = normalizeParameters(request);

    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("success", true);
    payload.put("scope", scope);
    payload.put("action", action);
    payload.put("mode", "in-memory");
    payload.put("parameterCount", parameters.size());
    payload.putAll(parameters);

    return Map.copyOf(payload);
  }

  private String normalizeAction(LexisAdminRpcRequestDto request) {
    if (request == null || request.action() == null || request.action().isBlank()) {
      return "view";
    }
    return request.action().trim();
  }

  private Map<String, String> normalizeParameters(LexisAdminRpcRequestDto request) {
    if (request == null || request.parameters() == null || request.parameters().isEmpty()) {
      return Map.of();
    }
    return Map.copyOf(request.parameters());
  }
}

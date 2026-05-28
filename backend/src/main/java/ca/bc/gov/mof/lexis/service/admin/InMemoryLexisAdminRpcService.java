package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import java.util.LinkedHashMap;
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

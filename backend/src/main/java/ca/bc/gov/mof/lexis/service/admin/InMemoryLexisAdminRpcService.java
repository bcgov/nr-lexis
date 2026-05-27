package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcResponseDto;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("!oracle")
public class InMemoryLexisAdminRpcService implements LexisAdminRpcService {

  @Override
  public Optional<LexisAdminRpcResponseDto> executeFeePolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(buildResponse("fee-policy", request));
  }

  @Override
  public Optional<LexisAdminRpcResponseDto> executeFilPolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(buildResponse("fil-policy", request));
  }

  private LexisAdminRpcResponseDto buildResponse(String scope, LexisAdminRpcRequestDto request) {
    String action = normalizeAction(request);
    Map<String, String> parameters = normalizeParameters(request);

    LinkedHashMap<String, String> payload = new LinkedHashMap<>();
    payload.put("scope", scope);
    payload.put("action", action);
    payload.put("mode", "in-memory");
    payload.put("parameterCount", Integer.toString(parameters.size()));
    payload.putAll(parameters);

    return new LexisAdminRpcResponseDto(
        true,
        "Accepted in local profile; persistence-backed policy mutation is not enabled.",
        Map.copyOf(payload));
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

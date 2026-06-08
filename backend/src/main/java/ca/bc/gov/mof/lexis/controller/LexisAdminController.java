package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/admin")
@Validated
public class LexisAdminController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisAdminController.class);

  private final ObjectProvider<LexisAdminService> adminServiceProvider;
  private final ObjectProvider<LexisAdminRpcService> adminRpcServiceProvider;

  public LexisAdminController(
      ObjectProvider<LexisAdminService> adminServiceProvider,
      ObjectProvider<LexisAdminRpcService> adminRpcServiceProvider) {
    this.adminServiceProvider = adminServiceProvider;
    this.adminRpcServiceProvider = adminRpcServiceProvider;
  }

  @GetMapping({"/agent", "/lexisAgentAdmin"})
  public ResponseEntity<LexisAdminPageDto> agentAdmin() {
    LexisAdminService service = adminServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin service unavailable - returning no content for lexisAgentAdmin");
      return ResponseEntity.noContent().build();
    }
    return service.agentAdminPage().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @GetMapping({"/policy", "/lexisPolicyAdmin"})
  public ResponseEntity<LexisAdminPageDto> feePolicyAdmin() {
    LexisAdminService service = adminServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin service unavailable - returning no content for lexisPolicyAdmin");
      return ResponseEntity.noContent().build();
    }
    return service.feePolicyAdminPage().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @GetMapping({"/fil-policy", "/lexisFILAdmin"})
  public ResponseEntity<LexisAdminPageDto> filPolicyAdmin() {
    LexisAdminService service = adminServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin service unavailable - returning no content for lexisFILAdmin");
      return ResponseEntity.noContent().build();
    }
    return service.filPolicyAdminPage().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping({"/policy/rpc", "/lexisPolicyAdminRPC"})
  public ResponseEntity<Object> feePolicyRpc(
      @RequestBody(required = false) LexisAdminRpcRequestDto request) {
    return executeFeePolicyRpc(normalizeRpcRequest(request));
  }

  @GetMapping("/policies/fee")
  public ResponseEntity<Object> feePolicies() {
    return executeFeePolicyRpc(new LexisAdminRpcRequestDto("view", Map.of("actionMapping", "view")));
  }

  @PostMapping("/policies/fee")
  public ResponseEntity<Object> addFeePolicy(
      @RequestBody(required = false) Map<String, String> request) {
    return executeFeePolicyRpc(new LexisAdminRpcRequestDto("addPolicy", feePolicyParameters(null, request)));
  }

  @PutMapping("/policies/fee/{policyId}")
  public ResponseEntity<Object> updateFeePolicy(
      @PathVariable String policyId,
      @RequestBody(required = false) Map<String, String> request) {
    return executeFeePolicyRpc(new LexisAdminRpcRequestDto("updatePolicy", feePolicyParameters(policyId, request)));
  }

  @DeleteMapping("/policies/fee/{policyId}")
  public ResponseEntity<Object> deleteFeePolicy(@PathVariable String policyId) {
    return executeFeePolicyRpc(
        new LexisAdminRpcRequestDto(
            "deletePolicy",
            Map.of("actionMapping", "deletePolicy", "feePolicyId", policyId)));
  }

  @PostMapping(
      value = {"/policy/rpc", "/lexisPolicyAdminRPC"},
      consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  public ResponseEntity<Object> feePolicyRpcForm(
      @RequestParam(required = false) Map<String, String> requestParameters) {
    return executeFeePolicyRpc(normalizeRpcRequest(fromFormPost(requestParameters)));
  }

  @PostMapping({"/fil-policy/rpc", "/lexisFILAdminRPC"})
  public ResponseEntity<Object> filPolicyRpc(
      @RequestBody(required = false) LexisAdminRpcRequestDto request) {
    return executeFilPolicyRpc(normalizeRpcRequest(request));
  }

  @GetMapping("/policies/fil")
  public ResponseEntity<Object> filPolicies() {
    return executeFilPolicyRpc(new LexisAdminRpcRequestDto("view", Map.of("actionMapping", "view")));
  }

  @PostMapping("/policies/fil")
  public ResponseEntity<Object> addFilPolicy(
      @RequestBody(required = false) Map<String, String> request) {
    return executeFilPolicyRpc(new LexisAdminRpcRequestDto("addFilPolicy", filPolicyParameters(null, request)));
  }

  @PutMapping("/policies/fil/{policyId}")
  public ResponseEntity<Object> updateFilPolicy(
      @PathVariable String policyId,
      @RequestBody(required = false) Map<String, String> request) {
    return executeFilPolicyRpc(
        new LexisAdminRpcRequestDto("updateFilPolicy", filPolicyParameters(policyId, request)));
  }

  @DeleteMapping("/policies/fil/{policyId}")
  public ResponseEntity<Object> deleteFilPolicy(@PathVariable String policyId) {
    return executeFilPolicyRpc(
        new LexisAdminRpcRequestDto(
            "deleteFilPolicy",
            Map.of("actionMapping", "deleteFilPolicy", "filPolicyId", policyId)));
  }

  @PostMapping(
      value = {"/fil-policy/rpc", "/lexisFILAdminRPC"},
      consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
  public ResponseEntity<Object> filPolicyRpcForm(
      @RequestParam(required = false) Map<String, String> requestParameters) {
    return executeFilPolicyRpc(normalizeRpcRequest(fromFormPost(requestParameters)));
  }

  private ResponseEntity<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request) {
    LexisAdminRpcService service = adminRpcServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin RPC service unavailable - returning no content for lexisPolicyAdminRPC");
      return ResponseEntity.noContent().build();
    }
    return service.executeFeePolicyRpc(normalizeRpcRequest(request))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  private ResponseEntity<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request) {
    LexisAdminRpcService service = adminRpcServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin RPC service unavailable - returning no content for lexisFILAdminRPC");
      return ResponseEntity.noContent().build();
    }
    return service.executeFilPolicyRpc(normalizeRpcRequest(request))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  private LexisAdminRpcRequestDto normalizeRpcRequest(LexisAdminRpcRequestDto request) {
    if (request == null) {
      return new LexisAdminRpcRequestDto("view", Map.of("actionMapping", "view"));
    }

    Map<String, String> parameters =
        request.parameters() == null ? new LinkedHashMap<>() : new LinkedHashMap<>(request.parameters());
    String action = trimToNull(request.action());
    if (action == null) {
      action = trimToNull(parameters.get("actionMapping"));
    }
    if (action == null) {
      action = "view";
    }
    parameters.putIfAbsent("actionMapping", action);
    return new LexisAdminRpcRequestDto(action, parameters);
  }

  private LexisAdminRpcRequestDto fromFormPost(Map<String, String> requestParameters) {
    if (requestParameters == null || requestParameters.isEmpty()) {
      return new LexisAdminRpcRequestDto("view", Map.of("actionMapping", "view"));
    }

    LinkedHashMap<String, String> parameters = new LinkedHashMap<>(requestParameters);
    String action = trimToNull(parameters.get("actionMapping"));
    if (action == null) {
      action = trimToNull(parameters.get("action"));
    }
    if (action == null) {
      action = "view";
    }
    parameters.put("actionMapping", action);
    return new LexisAdminRpcRequestDto(action, parameters);
  }

  private Map<String, String> feePolicyParameters(String policyId, Map<String, String> request) {
    LinkedHashMap<String, String> parameters = new LinkedHashMap<>();
    String action = policyId == null ? "addPolicy" : "updatePolicy";
    parameters.put("actionMapping", action);
    if (policyId != null) {
      parameters.put("feePolicyId", policyId);
    }
    parameters.put("effectiveDate", first(request, "effectiveDate", "policyEffectiveDate"));
    parameters.put("orgUnitNo", first(request, "orgUnitNo", "orgUnitCode", "regionCode"));
    parameters.put(
        "feeIncrease",
        first(request, "feeIncrease", "policyPercentage", "feeIncreasePercentage", "percentIncrease"));
    return parameters;
  }

  private Map<String, String> filPolicyParameters(String policyId, Map<String, String> request) {
    LinkedHashMap<String, String> parameters = new LinkedHashMap<>();
    String action = policyId == null ? "addFilPolicy" : "updateFilPolicy";
    parameters.put("actionMapping", action);
    if (policyId != null) {
      parameters.put("filPolicyId", policyId);
    }
    parameters.put("effectiveDate", first(request, "effectiveDate", "policyEffectiveDate"));
    parameters.put(
        "filPolicyPercentage",
        first(request, "filPolicyPercentage", "filPercentage", "policyPercentage", "filPercent"));
    return parameters;
  }

  private String first(Map<String, String> values, String... keys) {
    if (values == null) {
      return "";
    }
    for (String key : keys) {
      String value = values.get(key);
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return "";
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}

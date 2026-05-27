package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcResponseDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminService;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
  public ResponseEntity<LexisAdminRpcResponseDto> feePolicyRpc(
      @RequestBody(required = false) LexisAdminRpcRequestDto request) {
    LexisAdminRpcService service = adminRpcServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Admin RPC service unavailable - returning no content for lexisPolicyAdminRPC");
      return ResponseEntity.noContent().build();
    }
    return service.executeFeePolicyRpc(normalizeRpcRequest(request))
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @PostMapping({"/fil-policy/rpc", "/lexisFILAdminRPC"})
  public ResponseEntity<LexisAdminRpcResponseDto> filPolicyRpc(
      @RequestBody(required = false) LexisAdminRpcRequestDto request) {
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
      return new LexisAdminRpcRequestDto("view", Map.of());
    }

    String action = request.action() == null || request.action().isBlank() ? "view" : request.action().trim();
    Map<String, String> parameters =
        request.parameters() == null ? Map.of() : Map.copyOf(request.parameters());
    return new LexisAdminRpcRequestDto(action, parameters);
  }
}


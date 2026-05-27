package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcResponseDto;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | InMemoryLexisAdminRpcService")
class InMemoryLexisAdminRpcServiceTest {

  @Test
  void shouldEchoFeePolicyRpcRequestWithInMemoryMetadata() {
    InMemoryLexisAdminRpcService service = new InMemoryLexisAdminRpcService();
    LexisAdminRpcRequestDto request = new LexisAdminRpcRequestDto("save", Map.of("code", "FEE01"));

    LexisAdminRpcResponseDto response = service.executeFeePolicyRpc(request).orElseThrow();

    assertThat(response.success()).isTrue();
    assertThat(response.payload())
        .containsEntry("scope", "fee-policy")
        .containsEntry("action", "save")
        .containsEntry("mode", "in-memory")
        .containsEntry("code", "FEE01");
  }

  @Test
  void shouldDefaultNullFilPolicyRpcRequestToViewAction() {
    InMemoryLexisAdminRpcService service = new InMemoryLexisAdminRpcService();

    LexisAdminRpcResponseDto response = service.executeFilPolicyRpc(null).orElseThrow();

    assertThat(response.success()).isTrue();
    assertThat(response.payload())
        .containsEntry("scope", "fil-policy")
        .containsEntry("action", "view")
        .containsEntry("parameterCount", "0");
  }
}

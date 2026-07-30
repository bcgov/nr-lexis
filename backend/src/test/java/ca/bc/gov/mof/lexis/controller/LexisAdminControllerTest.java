package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisAdminController")
class LexisAdminControllerTest {

  @Mock private ObjectProvider<LexisAdminService> adminServiceProvider;
  @Mock private ObjectProvider<LexisAdminRpcService> adminRpcServiceProvider;
  @Mock private LexisAdminService adminService;
  @Mock private LexisAdminRpcService adminRpcService;

  @Test
  void feePolicyAdminShouldDelegateToService() {
    when(adminServiceProvider.getIfAvailable()).thenReturn(adminService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    LexisAdminPageDto payload =
        new LexisAdminPageDto("policy", "/lexisPolicyAdmin.do?actionMapping=view", Map.of("section", "policy"));
    when(adminService.feePolicyAdminPage()).thenReturn(Optional.of(payload));

    ResponseEntity<LexisAdminPageDto> response = controller.feePolicyAdmin();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminService).feePolicyAdminPage();
  }

  @Test
  void filPolicyAdminShouldDelegateToService() {
    when(adminServiceProvider.getIfAvailable()).thenReturn(adminService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    LexisAdminPageDto payload =
        new LexisAdminPageDto("filPolicy", "/lexisFILAdmin.do?actionMapping=view", Map.of("section", "fil"));
    when(adminService.filPolicyAdminPage()).thenReturn(Optional.of(payload));

    ResponseEntity<LexisAdminPageDto> response = controller.filPolicyAdmin();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminService).filPolicyAdminPage();
  }

  @Test
  void adminRpcShouldReturnNoContentWhenServiceMissing() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(null);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);

    ResponseEntity<Object> response = controller.feePolicyRpc(null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(adminRpcService);
  }

  @Test
  void feePolicyRpcShouldDefaultRequestAndDelegateToService() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    Map<String, Object> payload = Map.of("success", true, "policy", "fee");
    when(adminRpcService.executeFeePolicyRpc(any(LexisAdminRpcRequestDto.class)))
        .thenReturn(Optional.of(payload));

    ResponseEntity<Object> response = controller.feePolicyRpc(null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminRpcService)
        .executeFeePolicyRpc(new LexisAdminRpcRequestDto("view", Map.of("actionMapping", "view")));
  }

  @Test
  void feePoliciesShouldDelegateModernListRouteToRpcView() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    LexisAdminPagedResponseDto<Map<String, Object>> payload =
        new LexisAdminPagedResponseDto<>(List.of(Map.of("rows", "ok")), 1, 0, 100);
    when(adminRpcService.listFeePolicies(0, 100, null, null)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisAdminPagedResponseDto<Map<String, Object>>> response =
        controller.feePolicies(0, 100, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminRpcService).listFeePolicies(0, 100, null, null);
  }

  @Test
  void addFeePolicyShouldTranslateModernPayloadToLegacyRpc() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    when(adminRpcService.executeFeePolicyRpc(any(LexisAdminRpcRequestDto.class)))
        .thenReturn(Optional.of(Map.of("success", true)));

    ResponseEntity<Object> response =
        controller.addFeePolicy(
            Map.of(
                "effectiveDate", "2026-07-01",
                "orgUnitCode", "1904",
                "policyPercentage", "5"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(adminRpcService)
        .executeFeePolicyRpc(
            new LexisAdminRpcRequestDto(
                "addPolicy",
                Map.of(
                    "actionMapping", "addPolicy",
                    "effectiveDate", "2026-07-01",
                    "orgUnitNo", "1904",
                    "feeIncrease", "5")));
  }

  @Test
  void filPolicyRpcShouldDelegateToService() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    LexisAdminRpcRequestDto request = new LexisAdminRpcRequestDto("save", Map.of("code", "F1"));
    Map<String, Object> payload = Map.of("success", true, "result", "ok");
    when(adminRpcService.executeFilPolicyRpc(any(LexisAdminRpcRequestDto.class)))
        .thenReturn(Optional.of(payload));

    ResponseEntity<Object> response = controller.filPolicyRpc(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminRpcService)
        .executeFilPolicyRpc(
            new LexisAdminRpcRequestDto("save", Map.of("code", "F1", "actionMapping", "save")));
  }

  @Test
  void filPoliciesShouldDelegateModernListRouteToRpcView() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    LexisAdminPagedResponseDto<Map<String, Object>> payload =
        new LexisAdminPagedResponseDto<>(List.of(Map.of("rows", "ok")), 1, 0, 100);
    when(adminRpcService.listFilPolicies(0, 100, null, null)).thenReturn(Optional.of(payload));

    ResponseEntity<LexisAdminPagedResponseDto<Map<String, Object>>> response =
        controller.filPolicies(0, 100, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(adminRpcService).listFilPolicies(0, 100, null, null);
  }

  @Test
  void feePolicyRpcFormShouldUseActionMappingParameter() {
    when(adminRpcServiceProvider.getIfAvailable()).thenReturn(adminRpcService);
    LexisAdminController controller =
        new LexisAdminController(adminServiceProvider, adminRpcServiceProvider);
    when(adminRpcService.executeFeePolicyRpc(any(LexisAdminRpcRequestDto.class)))
        .thenReturn(Optional.of(Map.of("success", true)));

    ResponseEntity<Object> response =
        controller.feePolicyRpcForm(Map.of("actionMapping", "updatePaging", "page", "2"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(adminRpcService)
        .executeFeePolicyRpc(
            new LexisAdminRpcRequestDto(
                "updatePaging", Map.of("actionMapping", "updatePaging", "page", "2")));
  }
}

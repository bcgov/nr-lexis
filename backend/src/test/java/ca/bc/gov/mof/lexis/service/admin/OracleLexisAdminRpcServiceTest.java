package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleLexisAdminRpcService")
class OracleLexisAdminRpcServiceTest {

  @Mock private LexisAdminPolicyRepository repository;

  @Test
  void shouldReturnLegacyFeePolicyListPayload() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    LexisAdminPolicyRepository.FeePolicyRow row =
        new LexisAdminPolicyRepository.FeePolicyRow(
            15L,
            LocalDate.of(2026, 7, 10),
            10L,
            8L,
            "idir\\approver",
            LocalDate.of(2026, 7, 1),
            "idir\\editor",
            LocalDate.of(2026, 7, 2));

    when(repository.findFeePolicies("effective_date desc", 0)).thenReturn(List.of(row));
    when(repository.findOrgUnitByNumber(10L))
        .thenReturn(Optional.of(new LexisAdminPolicyRepository.OrgUnitRow(10L, "RCO", "Coast Region")));

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "viewPolicies",
                    Map.of("columnName", "effective_date", "sortOrder", "desc", "page", "0")))
            .orElseThrow();

    assertThat(response).isInstanceOf(List.class);
    assertThat((List<?>) response).hasSize(1);
    Object first = ((List<?>) response).get(0);
    @SuppressWarnings("unchecked")
    Map<String, Object> firstItem = (Map<String, Object>) first;
    assertThat(first).isInstanceOf(Map.class);
    assertThat(firstItem)
        .containsEntry("lexisFeePolicyId", 15L)
        .containsEntry("effectiveDate", "2026-07-10")
        .containsEntry("orgUnitNo", "10")
        .containsEntry("orgUnitCode", "RCO")
        .containsEntry("orgUnitName", "Coast Region")
        .containsEntry("percentIncrease", "8");
  }

  @Test
  void shouldReturnLegacyPaginationHtmlForFeePolicyPaging() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    when(repository.countFeePolicies()).thenReturn(23L);

    Object response =
        service
            .executeFeePolicyRpc(new LexisAdminRpcRequestDto("updatePaging", Map.of("page", "1")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    String paginationHtml = (String) payload.get("paginationHTML");
    assertThat(paginationHtml).contains("setPage(");
    assertThat(paginationHtml).contains("23 fee policies found");
  }

  @Test
  void shouldReturnValidationErrorsForInvalidFeePolicyCreatePayload() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    Object response = service.executeFeePolicyRpc(new LexisAdminRpcRequestDto("addPolicy", Map.of())).orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload).containsEntry("success", false);
    assertThat((List<String>) payload.get("errors")).isNotEmpty();
  }

  @Test
  void shouldPersistValidFeePolicyCreatePayload() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    LocalDate effectiveDate = LocalDate.now().plusDays(3);
    LexisAdminPolicyRepository.FeePolicyRow insertedRow =
        new LexisAdminPolicyRepository.FeePolicyRow(
            21L,
            effectiveDate,
            30L,
            12L,
            "idir\\approver",
            effectiveDate,
            "",
            null);

    when(repository.findFeePolicy(effectiveDate, 30L)).thenReturn(Optional.empty());
    when(repository.insertFeePolicy(eq(effectiveDate), eq(30L), eq(12), nullable(String.class)))
        .thenReturn(Optional.of(insertedRow));
    when(repository.findOrgUnitByNumber(30L))
        .thenReturn(Optional.of(new LexisAdminPolicyRepository.OrgUnitRow(30L, "RSC", "Sunshine Coast")));

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addPolicy",
                    Map.of(
                        "effectiveDate", effectiveDate.toString(),
                        "orgUnitNo", "30",
                        "feeIncrease", "12")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload)
        .containsEntry("success", true)
        .containsEntry("lexisFeePolicyId", 21L)
        .containsEntry("orgUnitCode", "RSC");
  }

  @Test
  void shouldRejectDuplicateFilPolicyEffectiveDate() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    LocalDate effectiveDate = LocalDate.now().plusDays(5);
    when(repository.findFilPolicy(effectiveDate))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    3L, effectiveDate, 20L, "idir\\approver", effectiveDate, "", null)));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addFILPolicy",
                    Map.of("effectiveDate", effectiveDate.toString(), "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload).containsEntry("success", false);
    assertThat((List<String>) payload.get("errors"))
        .contains("Effective Date and region combination already exists.");
  }
}

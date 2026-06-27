package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
  void shouldComposeModernFeePolicyPagesFromLegacyPages() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    List<LexisAdminPolicyRepository.FeePolicyRow> firstLegacyPage =
        java.util.stream.LongStream.rangeClosed(1, 10)
            .mapToObj(
                id ->
                    new LexisAdminPolicyRepository.FeePolicyRow(
                        id,
                        LocalDate.of(2026, 7, 1).plusDays(id),
                        1903L,
                        id,
                        "idir\\admin",
                        LocalDate.of(2026, 7, 1),
                        "idir\\admin",
                        LocalDate.of(2026, 7, 1)))
            .toList();
    List<LexisAdminPolicyRepository.FeePolicyRow> secondLegacyPage =
        java.util.stream.LongStream.rangeClosed(11, 20)
            .mapToObj(
                id ->
                    new LexisAdminPolicyRepository.FeePolicyRow(
                        id,
                        LocalDate.of(2026, 7, 1).plusDays(id),
                        1903L,
                        id,
                        "idir\\admin",
                        LocalDate.of(2026, 7, 1),
                        "idir\\admin",
                        LocalDate.of(2026, 7, 1)))
            .toList();

    when(repository.countFeePolicies()).thenReturn(23L);
    when(repository.findFeePolicies("effective_date desc", 0)).thenReturn(firstLegacyPage);
    when(repository.findFeePolicies("effective_date desc", 1)).thenReturn(secondLegacyPage);
    when(repository.findOrgUnitByNumber(1903L))
        .thenReturn(Optional.of(new LexisAdminPolicyRepository.OrgUnitRow(1903L, "RCO", "Cariboo")));

    var response = service.listFeePolicies(0, 15, null, null).orElseThrow();

    assertThat(response.total()).isEqualTo(23);
    assertThat(response.page()).isZero();
    assertThat(response.size()).isEqualTo(15);
    assertThat(response.results()).hasSize(15);
  }

  @Test
  void shouldNormalizeInvalidModernFeePolicyPagination() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    when(repository.countFeePolicies()).thenReturn(0L);

    var response = service.listFeePolicies(-3, 0, "effective_date;drop", "sideways").orElseThrow();

    assertThat(response.total()).isZero();
    assertThat(response.page()).isZero();
    assertThat(response.size()).isEqualTo(100);
    assertThat(response.results()).isEmpty();
    verify(repository, never()).findFeePolicies(anyString(), anyInt());
  }

  @Test
  void shouldCapModernFilPolicyPaginationAndSkipOutOfRangeLegacyFetches() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    when(repository.countFilPolicies()).thenReturn(250L);

    var response = service.listFilPolicies(9, 500, null, null).orElseThrow();

    assertThat(response.total()).isEqualTo(250);
    assertThat(response.page()).isEqualTo(9);
    assertThat(response.size()).isEqualTo(200);
    assertThat(response.results()).isEmpty();
    verify(repository, never()).findFilPolicies(anyString(), anyInt());
  }

  @Test
  void shouldComposeModernFilPolicyPagesFromLegacyPages() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);

    List<LexisAdminPolicyRepository.FilPolicyRow> firstLegacyPage =
        java.util.stream.LongStream.rangeClosed(1, 10)
            .mapToObj(
                id ->
                    new LexisAdminPolicyRepository.FilPolicyRow(
                        id,
                        LocalDate.of(2026, 8, 1).plusDays(id),
                        id,
                        "idir\\admin",
                        LocalDate.of(2026, 8, 1),
                        "idir\\admin",
                        LocalDate.of(2026, 8, 1)))
            .toList();
    List<LexisAdminPolicyRepository.FilPolicyRow> secondLegacyPage =
        java.util.stream.LongStream.rangeClosed(11, 20)
            .mapToObj(
                id ->
                    new LexisAdminPolicyRepository.FilPolicyRow(
                        id,
                        LocalDate.of(2026, 8, 1).plusDays(id),
                        id,
                        "idir\\admin",
                        LocalDate.of(2026, 8, 1),
                        "idir\\admin",
                        LocalDate.of(2026, 8, 1)))
            .toList();

    when(repository.countFilPolicies()).thenReturn(30L);
    when(repository.findFilPolicies("fil_percent asc", 0)).thenReturn(firstLegacyPage);
    when(repository.findFilPolicies("fil_percent asc", 1)).thenReturn(secondLegacyPage);

    var response = service.listFilPolicies(0, 15, "fil_percent", "asc").orElseThrow();

    assertThat(response.total()).isEqualTo(30);
    assertThat(response.page()).isZero();
    assertThat(response.size()).isEqualTo(15);
    assertThat(response.results()).hasSize(15);
    assertThat(response.results().get(0))
        .containsEntry("lexisFeePolicyId", 1L)
        .containsEntry("filPercent", "1");
    assertThat(response.results().get(14))
        .containsEntry("lexisFeePolicyId", 15L)
        .containsEntry("filPercent", "15");
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

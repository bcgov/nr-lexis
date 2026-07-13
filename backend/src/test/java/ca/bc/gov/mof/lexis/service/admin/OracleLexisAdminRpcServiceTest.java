package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionOperations;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleLexisAdminRpcService")
class OracleLexisAdminRpcServiceTest {

  @Mock private LexisAdminPolicyRepository repository;
  @Mock private LexisPrincipalService principalService;

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

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
  void shouldIgnoreClientSuppliedAuditUserAndResolveAuthenticatedPrincipal() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("token-subject", "n/a", "LEXIS_ADMIN");
    SecurityContextHolder.getContext().setAuthentication(authentication);
    when(principalService.resolvePrincipalName(authentication)).thenReturn("IDIR\\real-user");
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(3);
    when(repository.findFeePolicy(effectiveDate, 30L)).thenReturn(Optional.empty());
    when(repository.insertFeePolicy(effectiveDate, 30L, 12, "IDIR\\real-user"))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    21L,
                    effectiveDate,
                    30L,
                    12L,
                    "IDIR\\real-user",
                    effectiveDate,
                    "",
                    null)));
    when(repository.findOrgUnitByNumber(30L))
        .thenReturn(Optional.of(new LexisAdminPolicyRepository.OrgUnitRow(30L, "RSC", "Coast")));

    service.executeFeePolicyRpc(
        new LexisAdminRpcRequestDto(
            "addPolicy",
            Map.of(
                "effectiveDate", effectiveDate.toString(),
                "orgUnitNo", "30",
                "feeIncrease", "12",
                "currentUserId", "spoofed-user")));

    verify(repository).insertFeePolicy(effectiveDate, 30L, 12, "IDIR\\real-user");
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
        .contains("Effective Date already exists.");
  }

  @Test
  void shouldRejectFeePolicyUpdateWhenBusinessKeyBelongsToAnotherRecord() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFeePolicy(effectiveDate, 30L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    7L, effectiveDate, 30L, 12L, "idir\\owner", effectiveDate, "", null)));

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updatePolicy",
                    Map.of(
                        "feePolicyId", "8",
                        "effectiveDate", effectiveDate.toString(),
                        "orgUnitNo", "30",
                        "feeIncrease", "12")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload).containsEntry("success", false);
    assertThat((List<String>) payload.get("errors"))
        .contains("Effective Date and region combination already exists.");
    verify(repository, never())
        .updateFeePolicy(eq(8L), eq(effectiveDate), eq(30L), eq(12), nullable(String.class));
  }

  @Test
  void shouldRejectFilPolicyUpdateWhenBusinessKeyBelongsToAnotherRecord() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    7L, effectiveDate, 20L, "idir\\owner", effectiveDate, "", null)));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updateFilPolicy",
                    Map.of(
                        "filPolicyId", "8",
                        "effectiveDate", effectiveDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload).containsEntry("success", false);
    assertThat((List<String>) payload.get("errors"))
        .contains("Effective Date already exists.");
    verify(repository, never())
        .updateFilPolicy(eq(8L), eq(effectiveDate), eq(20), nullable(String.class));
  }

  @Test
  void shouldAllowPolicyUpdatesWhenBusinessKeysBelongToSameRecords() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate feeDate = LexisBusinessTime.today().plusDays(5);
    LocalDate filDate = LexisBusinessTime.today().plusDays(6);
    when(repository.findFeePolicy(feeDate, 30L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    8L, feeDate, 30L, 12L, "idir\\owner", feeDate, "", null)));
    when(repository.updateFeePolicy(8L, feeDate, 30L, 12, null)).thenReturn(true);
    when(repository.findFeePolicyById(8L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    8L, feeDate, 30L, 12L, "idir\\owner", feeDate, "", null)));
    when(repository.findFilPolicy(filDate))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    9L, filDate, 20L, "idir\\owner", filDate, "", null)));
    when(repository.updateFilPolicy(9L, filDate, 20, null)).thenReturn(true);
    when(repository.findFilPolicyById(9L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    9L, filDate, 20L, "idir\\owner", filDate, "", null)));

    Object feeResponse =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updatePolicy",
                    Map.of(
                        "feePolicyId", "8",
                        "effectiveDate", feeDate.toString(),
                        "orgUnitNo", "30",
                        "feeIncrease", "12")))
            .orElseThrow();
    Object filResponse =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updateFilPolicy",
                    Map.of(
                        "filPolicyId", "9",
                        "effectiveDate", filDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(feeResponse).isInstanceOf(Map.class);
    assertThat(filResponse).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) feeResponse).get("success")).isEqualTo(true);
    assertThat(((Map<?, ?>) filResponse).get("success")).isEqualTo(true);
    verify(repository).updateFeePolicy(8L, feeDate, 30L, 12, null);
    verify(repository).updateFilPolicy(9L, filDate, 20, null);
  }

  @Test
  void shouldDeleteExistingFeePolicyAndVerifyItsRemovalInOneTransaction() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LexisAdminPolicyRepository.FeePolicyRow existing = feePolicyRow(8L);
    when(repository.findFeePolicyById(8L))
        .thenReturn(Optional.of(existing), Optional.empty());
    when(repository.deleteFeePolicy(8L)).thenReturn(true);

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto("deletePolicy", Map.of("feePolicyId", "8")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(true);
    assertThat(transactions.executionCount()).isEqualTo(1);
    assertThat(transactions.rollbackOnly()).isFalse();
    verify(repository, times(2)).findFeePolicyById(8L);
    verify(repository).deleteFeePolicy(8L);
  }

  @Test
  void shouldRejectAndRollBackMissingFeePolicyDelete() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    when(repository.findFeePolicyById(8L)).thenReturn(Optional.empty());

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto("deletePolicy", Map.of("feePolicyId", "8")))
            .orElseThrow();

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(((Map<?, ?>) response).get("errors"))
        .isEqualTo(List.of("Fee policy does not exist."));
    assertThat(transactions.rollbackOnly()).isTrue();
    verify(repository, never()).deleteFeePolicy(8L);
  }

  @Test
  void shouldRollBackWhenDeletedFeePolicyRemainsVisible() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LexisAdminPolicyRepository.FeePolicyRow existing = feePolicyRow(8L);
    when(repository.findFeePolicyById(8L)).thenReturn(Optional.of(existing));
    when(repository.deleteFeePolicy(8L)).thenReturn(true);

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto("deletePolicy", Map.of("feePolicyId", "8")))
            .orElseThrow();

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(((Map<?, ?>) response).get("errors"))
        .isEqualTo(List.of("Unable to verify the deleted fee policy."));
    assertThat(transactions.rollbackOnly()).isTrue();
    verify(repository, times(2)).findFeePolicyById(8L);
  }

  @Test
  void shouldDeleteExistingFilPolicyAndVerifyItsRemovalInOneTransaction() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LexisAdminPolicyRepository.FilPolicyRow existing = filPolicyRow(9L);
    when(repository.findFilPolicyById(9L))
        .thenReturn(Optional.of(existing), Optional.empty());
    when(repository.deleteFilPolicy(9L)).thenReturn(true);

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto("deleteFilPolicy", Map.of("filPolicyId", "9")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(true);
    assertThat(transactions.executionCount()).isEqualTo(1);
    assertThat(transactions.rollbackOnly()).isFalse();
    verify(repository, times(2)).findFilPolicyById(9L);
    verify(repository).deleteFilPolicy(9L);
  }

  @Test
  void shouldRejectAndRollBackMissingFilPolicyDelete() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    when(repository.findFilPolicyById(9L)).thenReturn(Optional.empty());

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto("deleteFilPolicy", Map.of("filPolicyId", "9")))
            .orElseThrow();

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(((Map<?, ?>) response).get("errors"))
        .isEqualTo(List.of("Fee in lieu policy does not exist."));
    assertThat(transactions.rollbackOnly()).isTrue();
    verify(repository, never()).deleteFilPolicy(9L);
  }

  @Test
  void shouldRollBackWhenDeletedFilPolicyRemainsVisible() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LexisAdminPolicyRepository.FilPolicyRow existing = filPolicyRow(9L);
    when(repository.findFilPolicyById(9L)).thenReturn(Optional.of(existing));
    when(repository.deleteFilPolicy(9L)).thenReturn(true);

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto("deleteFilPolicy", Map.of("filPolicyId", "9")))
            .orElseThrow();

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(((Map<?, ?>) response).get("errors"))
        .isEqualTo(List.of("Unable to verify the deleted fee in lieu policy."));
    assertThat(transactions.rollbackOnly()).isTrue();
    verify(repository, times(2)).findFilPolicyById(9L);
  }

  @Test
  void shouldRollBackWhenUpdatedPolicyCannotBeVerified() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate feeDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFeePolicy(feeDate, 30L)).thenReturn(Optional.empty());
    when(repository.updateFeePolicy(8L, feeDate, 30L, 12, null)).thenReturn(true);
    when(repository.findFeePolicyById(8L)).thenReturn(Optional.empty());

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updatePolicy",
                    Map.of(
                        "feePolicyId", "8",
                        "effectiveDate", feeDate.toString(),
                        "orgUnitNo", "30",
                        "feeIncrease", "12")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldRollBackWhenUpdatedPolicyReadbackHasDifferentId() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate feeDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFeePolicy(feeDate, 30L)).thenReturn(Optional.empty());
    when(repository.updateFeePolicy(8L, feeDate, 30L, 12, null)).thenReturn(true);
    when(repository.findFeePolicyById(8L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    7L, feeDate, 30L, 12L, "idir\\owner", feeDate, "", null)));

    Object response =
        service
            .executeFeePolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updatePolicy",
                    Map.of(
                        "feePolicyId", "8",
                        "effectiveDate", feeDate.toString(),
                        "orgUnitNo", "30",
                        "feeIncrease", "12")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldRollBackWhenUpdatedFilPolicyDoesNotMatchRequestedValues() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate filDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(filDate)).thenReturn(Optional.empty());
    when(repository.updateFilPolicy(9L, filDate, 20, null)).thenReturn(true);
    when(repository.findFilPolicyById(9L))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    9L, filDate, 21L, "idir\\owner", filDate, "", null)));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "updateFilPolicy",
                    Map.of(
                        "filPolicyId", "9",
                        "effectiveDate", filDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldFailClosedWhenFilPolicyBusinessKeyLookupFails() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    LexisAdminRpcRequestDto request =
        new LexisAdminRpcRequestDto(
            "addFilPolicy",
            Map.of(
                "effectiveDate", effectiveDate.toString(),
                "filPolicyPercentage", "20"));

    assertThatThrownBy(() -> service.executeFilPolicyRpc(request))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    verify(repository, never())
        .insertFilPolicy(eq(effectiveDate), eq(20), nullable(String.class));
  }

  @Test
  void shouldConvertOracleDuplicateKeysToPolicyCollisionErrors() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null))
        .thenThrow(new DuplicateKeyException("unique constraint"));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addFilPolicy",
                    Map.of(
                        "effectiveDate", effectiveDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    @SuppressWarnings("unchecked")
    Map<String, Object> payload = (Map<String, Object>) response;
    assertThat(payload).containsEntry("success", false);
    assertThat((List<String>) payload.get("errors"))
        .containsExactly("Effective Date already exists.");
  }

  @Test
  void shouldPropagateNonDuplicateIntegrityFailures() {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null))
        .thenThrow(new DataIntegrityViolationException("invalid foreign key"));

    LexisAdminRpcRequestDto request =
        new LexisAdminRpcRequestDto(
            "addFilPolicy",
            Map.of(
                "effectiveDate", effectiveDate.toString(),
                "filPolicyPercentage", "20"));

    assertThatThrownBy(() -> service.executeFilPolicyRpc(request))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessage("invalid foreign key");
  }

  @Test
  void shouldRollBackWhenFeePolicyInsertReturnsNoRow() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFeePolicy(effectiveDate, 30L)).thenReturn(Optional.empty());
    when(repository.insertFeePolicy(effectiveDate, 30L, 12, null)).thenReturn(Optional.empty());

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
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.executionCount()).isEqualTo(1);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldRollBackWhenFeePolicyInsertReturnsMapperZeroId() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFeePolicy(effectiveDate, 30L)).thenReturn(Optional.empty());
    when(repository.insertFeePolicy(effectiveDate, 30L, 12, null))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FeePolicyRow(
                    0L,
                    effectiveDate,
                    30L,
                    12L,
                    "idir\\admin",
                    effectiveDate,
                    "",
                    null)));

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

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldRollBackWhenFilPolicyInsertReturnsNoRow() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null)).thenReturn(Optional.empty());

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addFilPolicy",
                    Map.of(
                        "effectiveDate", effectiveDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.executionCount()).isEqualTo(1);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldRollBackWhenFilPolicyInsertReturnsMismatchedBusinessValues() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null))
        .thenReturn(
            Optional.of(
                new LexisAdminPolicyRepository.FilPolicyRow(
                    41L,
                    effectiveDate.plusDays(1),
                    21L,
                    "idir\\admin",
                    effectiveDate,
                    "",
                    null)));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addFilPolicy",
                    Map.of(
                        "effectiveDate", effectiveDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(false);
    assertThat(transactions.rollbackOnly()).isTrue();
  }

  @Test
  void shouldNotMarkRollbackWhenPolicyInsertSucceeds() {
    RecordingTransactionOperations transactions = new RecordingTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    LexisAdminPolicyRepository.FilPolicyRow insertedRow =
        new LexisAdminPolicyRepository.FilPolicyRow(
            40L, effectiveDate, 20L, "idir\\admin", effectiveDate, "", null);
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null)).thenReturn(Optional.of(insertedRow));

    Object response =
        service
            .executeFilPolicyRpc(
                new LexisAdminRpcRequestDto(
                    "addFilPolicy",
                    Map.of(
                        "effectiveDate", effectiveDate.toString(),
                        "filPolicyPercentage", "20")))
            .orElseThrow();

    assertThat(response).isInstanceOf(Map.class);
    assertThat(((Map<?, ?>) response).get("success")).isEqualTo(true);
    assertThat(transactions.executionCount()).isEqualTo(1);
    assertThat(transactions.rollbackOnly()).isFalse();
  }

  @Test
  void shouldCompleteTransactionBeforeReleasingJvmGuard() throws Exception {
    BlockingCompletionTransactionOperations transactions =
        new BlockingCompletionTransactionOperations();
    OracleLexisAdminRpcService service =
        new OracleLexisAdminRpcService(repository, principalService, transactions);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    AtomicInteger insertSequence = new AtomicInteger();
    when(repository.findFilPolicy(effectiveDate)).thenReturn(Optional.empty());
    when(repository.insertFilPolicy(effectiveDate, 20, null))
        .thenAnswer(
            invocation -> {
              long id = 40L + insertSequence.incrementAndGet();
              return Optional.of(
                  new LexisAdminPolicyRepository.FilPolicyRow(
                      id, effectiveDate, 20L, "idir\\admin", effectiveDate, "", null));
            });
    LexisAdminRpcRequestDto request =
        new LexisAdminRpcRequestDto(
            "addFilPolicy",
            Map.of(
                "effectiveDate", effectiveDate.toString(),
                "filPolicyPercentage", "20"));
    CountDownLatch secondTaskStarted = new CountDownLatch(1);
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<Object> first =
          executor.submit(() -> service.executeFilPolicyRpc(request).orElseThrow());
      assertThat(transactions.firstCallbackCompleted.await(5, TimeUnit.SECONDS)).isTrue();

      Future<Object> second =
          executor.submit(
              () -> {
                secondTaskStarted.countDown();
                return service.executeFilPolicyRpc(request).orElseThrow();
              });
      assertThat(secondTaskStarted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(transactions.secondTransactionEntered.await(250, TimeUnit.MILLISECONDS)).isFalse();

      transactions.allowFirstCompletion.countDown();
      assertThat(first.get(5, TimeUnit.SECONDS)).isInstanceOf(Map.class);
      assertThat(second.get(5, TimeUnit.SECONDS)).isInstanceOf(Map.class);
      assertThat(transactions.secondTransactionEntered.getCount()).isZero();
    } finally {
      transactions.allowFirstCompletion.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void shouldSerializeConcurrentSameKeyFilPolicyAdds() throws Exception {
    OracleLexisAdminRpcService service = new OracleLexisAdminRpcService(repository);
    LocalDate effectiveDate = LexisBusinessTime.today().plusDays(5);
    AtomicReference<LexisAdminPolicyRepository.FilPolicyRow> stored = new AtomicReference<>();
    AtomicInteger lookupCount = new AtomicInteger();
    AtomicInteger insertCount = new AtomicInteger();
    CountDownLatch firstLookupEntered = new CountDownLatch(1);
    CountDownLatch releaseFirstLookup = new CountDownLatch(1);
    CountDownLatch secondLookupEntered = new CountDownLatch(1);
    CountDownLatch secondTaskStarted = new CountDownLatch(1);

    when(repository.findFilPolicy(effectiveDate))
        .thenAnswer(
            invocation -> {
              Optional<LexisAdminPolicyRepository.FilPolicyRow> snapshot =
                  Optional.ofNullable(stored.get());
              if (lookupCount.incrementAndGet() == 1) {
                firstLookupEntered.countDown();
                if (!releaseFirstLookup.await(5, TimeUnit.SECONDS)) {
                  throw new AssertionError("Timed out waiting to release the first FIL lookup");
                }
              } else {
                secondLookupEntered.countDown();
              }
              return snapshot;
            });
    when(repository.insertFilPolicy(eq(effectiveDate), eq(20), nullable(String.class)))
        .thenAnswer(
            invocation -> {
              int sequence = insertCount.incrementAndGet();
              LexisAdminPolicyRepository.FilPolicyRow row =
                  new LexisAdminPolicyRepository.FilPolicyRow(
                      40L + sequence,
                      effectiveDate,
                      20L,
                      "idir\\admin",
                      effectiveDate,
                      "",
                      null);
              stored.set(row);
              return Optional.of(row);
            });

    LexisAdminRpcRequestDto request =
        new LexisAdminRpcRequestDto(
            "addFilPolicy",
            Map.of(
                "effectiveDate", effectiveDate.toString(),
                "filPolicyPercentage", "20"));
    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<Object> first =
          executor.submit(() -> service.executeFilPolicyRpc(request).orElseThrow());
      assertThat(firstLookupEntered.await(5, TimeUnit.SECONDS)).isTrue();

      Future<Object> second =
          executor.submit(
              () -> {
                secondTaskStarted.countDown();
                return service.executeFilPolicyRpc(request).orElseThrow();
              });
      assertThat(secondTaskStarted.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(secondLookupEntered.await(250, TimeUnit.MILLISECONDS)).isFalse();

      releaseFirstLookup.countDown();
      Object firstResponse = first.get(5, TimeUnit.SECONDS);
      Object secondResponse = second.get(5, TimeUnit.SECONDS);

      assertThat(insertCount).hasValue(1);
      assertThat(firstResponse).isInstanceOf(Map.class);
      assertThat(secondResponse).isInstanceOf(Map.class);
      assertThat(
              List.of(
                  (Boolean) ((Map<?, ?>) firstResponse).get("success"),
                  (Boolean) ((Map<?, ?>) secondResponse).get("success")))
          .containsExactlyInAnyOrder(true, false);
      verify(repository, times(1))
          .insertFilPolicy(eq(effectiveDate), eq(20), nullable(String.class));
    } finally {
      releaseFirstLookup.countDown();
      executor.shutdownNow();
    }
  }

  private static LexisAdminPolicyRepository.FeePolicyRow feePolicyRow(long id) {
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    return new LexisAdminPolicyRepository.FeePolicyRow(
        id,
        effectiveDate,
        1903L,
        12L,
        "idir\\owner",
        effectiveDate,
        "idir\\editor",
        effectiveDate);
  }

  private static LexisAdminPolicyRepository.FilPolicyRow filPolicyRow(long id) {
    LocalDate effectiveDate = LocalDate.of(2026, 8, 1);
    return new LexisAdminPolicyRepository.FilPolicyRow(
        id,
        effectiveDate,
        20L,
        "idir\\owner",
        effectiveDate,
        "idir\\editor",
        effectiveDate);
  }

  private static final class RecordingTransactionOperations implements TransactionOperations {
    private int executionCount;
    private boolean rollbackOnly;

    @Override
    public <T> T execute(TransactionCallback<T> action) {
      executionCount++;
      SimpleTransactionStatus status = new SimpleTransactionStatus();
      T result = action.doInTransaction(status);
      rollbackOnly = status.isRollbackOnly();
      return result;
    }

    int executionCount() {
      return executionCount;
    }

    boolean rollbackOnly() {
      return rollbackOnly;
    }
  }

  private static final class BlockingCompletionTransactionOperations
      implements TransactionOperations {
    private final AtomicInteger executionCount = new AtomicInteger();
    private final CountDownLatch firstCallbackCompleted = new CountDownLatch(1);
    private final CountDownLatch allowFirstCompletion = new CountDownLatch(1);
    private final CountDownLatch secondTransactionEntered = new CountDownLatch(1);

    @Override
    public <T> T execute(TransactionCallback<T> action) {
      int execution = executionCount.incrementAndGet();
      if (execution == 2) {
        secondTransactionEntered.countDown();
      }
      T result = action.doInTransaction(new SimpleTransactionStatus());
      if (execution == 1) {
        firstCallbackCompleted.countDown();
        try {
          if (!allowFirstCompletion.await(5, TimeUnit.SECONDS)) {
            throw new AssertionError("Timed out waiting to complete the first transaction");
          }
        } catch (InterruptedException exception) {
          Thread.currentThread().interrupt();
          throw new IllegalStateException("Interrupted while completing the first transaction", exception);
        }
      }
      return result;
    }
  }
}

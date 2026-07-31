package ca.bc.gov.mof.lexis.service.admin;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPagedResponseDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.IntFunction;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

@Service
@Profile("oracle")
public class OracleLexisAdminRpcService implements LexisAdminRpcService {

  private static final DateTimeFormatter DISPLAY_DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final long MAX_RESULTS_PER_PAGE = 10L;
  private static final int LEGACY_RESULTS_PER_PAGE = 10;
  private static final int DEFAULT_MODERN_PAGE_SIZE = 100;
  private static final int MAX_MODERN_PAGE_SIZE = 200;
  private static final String FEE_POLICY_KEY_EXISTS_MESSAGE =
      "Effective Date and region combination already exists.";
  private static final String FIL_POLICY_KEY_EXISTS_MESSAGE = "Effective Date already exists.";
  private static final String FEE_POLICY_DELETE_FUTURE_ONLY_MESSAGE =
      "Only future-dated fee policies can be deleted.";
  private static final String FIL_POLICY_DELETE_FUTURE_ONLY_MESSAGE =
      "Only future-dated fee in lieu policies can be deleted.";

  private static final Set<String> FEE_SORT_COLUMNS =
      Set.of("effective_date", "org_unit_no", "percent_increase");
  private static final Set<String> FIL_SORT_COLUMNS = Set.of("effective_date", "fil_percent");

  private final LexisAdminPolicyRepository repository;
  private final LexisPrincipalService principalService;
  private final TransactionOperations transactionOperations;

  /* Serializes same-pod policy writes; Oracle constraints remain the cross-pod boundary. */
  private final ReentrantLock policyMutationGuard = new ReentrantLock(true);

  public OracleLexisAdminRpcService(LexisAdminPolicyRepository repository) {
    this(repository, null, TransactionOperations.withoutTransaction());
  }

  public OracleLexisAdminRpcService(
      LexisAdminPolicyRepository repository, LexisPrincipalService principalService) {
    this(repository, principalService, TransactionOperations.withoutTransaction());
  }

  @Autowired
  public OracleLexisAdminRpcService(
      LexisAdminPolicyRepository repository,
      LexisPrincipalService principalService,
      PlatformTransactionManager transactionManager) {
    this(repository, principalService, policyTransactionOperations(transactionManager));
  }

  OracleLexisAdminRpcService(
      LexisAdminPolicyRepository repository,
      LexisPrincipalService principalService,
      TransactionOperations transactionOperations) {
    this.repository = repository;
    this.principalService = principalService;
    this.transactionOperations = transactionOperations;
  }

  @Override
  public Optional<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(handleFeePolicyRpc(request));
  }

  @Override
  public Optional<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(handleFilPolicyRpc(request));
  }

  @Override
  public Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFeePolicies(
      int page, int size, String sortField, String sortDirection) {
    int normalizedPage = normalizeModernPage(page);
    int normalizedSize = normalizeModernSize(size);
    String sortOrder =
        buildSortOrder(
            sortParameters(sortField, sortDirection),
            FEE_SORT_COLUMNS,
            "effective_date",
            "desc");
    long total = repository.countFeePolicies();
    List<Map<String, Object>> rows =
        fetchLegacyWindow(
            normalizedPage,
            normalizedSize,
            total,
            legacyPage ->
                repository.findFeePolicies(sortOrder, legacyPage).stream()
                    .map(this::toFeePolicyListItem)
                    .toList());
    return Optional.of(
        new LexisAdminPagedResponseDto<>(
            rows, safeTotal(total), normalizedPage, normalizedSize));
  }

  @Override
  public Optional<LexisAdminPagedResponseDto<Map<String, Object>>> listFilPolicies(
      int page, int size, String sortField, String sortDirection) {
    int normalizedPage = normalizeModernPage(page);
    int normalizedSize = normalizeModernSize(size);
    String sortOrder =
        buildSortOrder(
            sortParameters(sortField, sortDirection),
            FIL_SORT_COLUMNS,
            "effective_date",
            "desc");
    long total = repository.countFilPolicies();
    List<Map<String, Object>> rows =
        fetchLegacyWindow(
            normalizedPage,
            normalizedSize,
            total,
            legacyPage ->
                repository.findFilPolicies(sortOrder, legacyPage).stream()
                    .map(this::toFilPolicyListItem)
                    .toList());
    return Optional.of(
        new LexisAdminPagedResponseDto<>(
            rows, safeTotal(total), normalizedPage, normalizedSize));
  }

  private Object handleFeePolicyRpc(LexisAdminRpcRequestDto request) {
    String action = normalizeAction(request);
    Map<String, String> parameters = normalizeParameters(request);

    return switch (action) {
      case "view", "viewpolicies" -> viewFeePolicies(parameters);
      case "updatepaging" ->
          Map.of(
              "paginationHTML",
              renderPaginationHtml(
                  repository.countFeePolicies(), parsePage(parameters.get("page"), 0), "fee policy", "fee policies"));
      case "addpolicy", "add" -> guardedPolicyMutation(() -> addFeePolicy(parameters));
      case "updatepolicy", "update" -> guardedPolicyMutation(() -> updateFeePolicy(parameters));
      case "deletepolicy", "delete" -> guardedPolicyMutation(() -> deleteFeePolicy(parameters));
      case "checkformchanges" -> Map.of("policyChanged", false);
      case "releaselock" -> Map.of("releaseLock", "ok");
      default -> viewFeePolicies(parameters);
    };
  }

  private Object handleFilPolicyRpc(LexisAdminRpcRequestDto request) {
    String action = normalizeAction(request);
    Map<String, String> parameters = normalizeParameters(request);

    return switch (action) {
      case "view", "viewpolicies" -> viewFilPolicies(parameters);
      case "updatepaging" ->
          Map.of(
              "paginationHTML",
              renderPaginationHtml(
                  repository.countFilPolicies(), parsePage(parameters.get("page"), 0), "fil policy", "fil policies"));
      case "addfilpolicy", "add" -> guardedPolicyMutation(() -> addFilPolicy(parameters));
      case "updatefilpolicy", "update" -> guardedPolicyMutation(() -> updateFilPolicy(parameters));
      case "deletefilpolicy", "delete" -> guardedPolicyMutation(() -> deleteFilPolicy(parameters));
      case "checkformchanges" -> Map.of("filPolicyChanged", false);
      case "releaselock" -> Map.of("releaseLock", "ok");
      default -> viewFilPolicies(parameters);
    };
  }

  private List<Map<String, Object>> viewFeePolicies(Map<String, String> parameters) {
    int page = parsePage(parameters.get("page"), 0);
    String sortOrder = buildSortOrder(parameters, FEE_SORT_COLUMNS, "effective_date", "desc");

    return repository.findFeePolicies(sortOrder, page).stream().map(this::toFeePolicyListItem).toList();
  }

  private List<Map<String, Object>> viewFilPolicies(Map<String, String> parameters) {
    int page = parsePage(parameters.get("page"), 0);
    String sortOrder = buildSortOrder(parameters, FIL_SORT_COLUMNS, "effective_date", "desc");

    return repository.findFilPolicies(sortOrder, page).stream().map(this::toFilPolicyListItem).toList();
  }

  private Map<String, Object> addFeePolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();

    LocalDate effectiveDate = parseFutureDate(parameters.get("effectiveDate"), errors);
    Long orgUnitNo = parseRequiredPositiveLong(parameters.get("orgUnitNo"), "Region is required.", errors);
    Integer percentIncrease = parseRequiredInteger(parameters.get("feeIncrease"), "Fee Increase Percentage", errors);

    if (percentIncrease != null) {
      if (percentIncrease < 0) {
        errors.add("Fee Increase Percentage must be greater than or equal to 0.");
      } else if (percentIncrease > 100) {
        errors.add("Fee Increase Percentage must be less than or equal to 100.");
      }
    }

    if (effectiveDate != null
        && orgUnitNo != null
        && repository.findFeePolicy(effectiveDate, orgUnitNo).isPresent()) {
      errors.add(FEE_POLICY_KEY_EXISTS_MESSAGE);
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    try {
      return repository
          .insertFeePolicy(effectiveDate, orgUnitNo, percentIncrease, resolveUserId())
          .filter(
              row ->
                  matchesFeePolicy(
                      row, null, effectiveDate, orgUnitNo, percentIncrease))
          .<Map<String, Object>>map(this::successFeePolicyResponse)
          .orElseGet(() -> failureResponse(List.of("Unable to save fee policy.")));
    } catch (DuplicateKeyException ex) {
      return failureResponse(List.of(FEE_POLICY_KEY_EXISTS_MESSAGE));
    }
  }

  private Map<String, Object> updateFeePolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();

    Long feePolicyId =
        parseRequiredPositiveLong(parameters.get("feePolicyId"), "Fee policy id is required.", errors);
    LocalDate effectiveDate = parseFutureDate(parameters.get("effectiveDate"), errors);
    Long orgUnitNo = parseRequiredPositiveLong(parameters.get("orgUnitNo"), "Region is required.", errors);
    Integer percentIncrease = parseRequiredInteger(parameters.get("feeIncrease"), "Fee Increase Percentage", errors);

    if (percentIncrease != null) {
      if (percentIncrease < 0) {
        errors.add("Fee Increase Percentage must be greater than or equal to 0.");
      } else if (percentIncrease > 100) {
        errors.add("Fee Increase Percentage must be less than or equal to 100.");
      }
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    Optional<LexisAdminPolicyRepository.FeePolicyRow> matchingPolicy =
        repository.findFeePolicy(effectiveDate, orgUnitNo);
    if (matchingPolicy.isPresent()
        && !feePolicyId.equals(matchingPolicy.get().feePolicyId())) {
      return failureResponse(List.of(FEE_POLICY_KEY_EXISTS_MESSAGE));
    }

    boolean updated;
    try {
      updated =
          repository.updateFeePolicy(
              feePolicyId, effectiveDate, orgUnitNo, percentIncrease, resolveUserId());
    } catch (DuplicateKeyException ex) {
      return failureResponse(List.of(FEE_POLICY_KEY_EXISTS_MESSAGE));
    }
    if (!updated) {
      return failureResponse(List.of("Unable to update fee policy."));
    }

    return repository
        .findFeePolicyById(feePolicyId)
        .filter(
            row ->
                matchesFeePolicy(
                    row, feePolicyId, effectiveDate, orgUnitNo, percentIncrease))
        .<Map<String, Object>>map(this::successFeePolicyResponse)
        .orElseGet(() -> failureResponse(List.of("Unable to verify the updated fee policy.")));
  }

  private Map<String, Object> deleteFeePolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();
    Long feePolicyId =
        parseRequiredPositiveLong(parameters.get("feePolicyId"), "Fee policy id is required.", errors);
    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }
    Optional<LexisAdminPolicyRepository.FeePolicyRow> existingPolicy =
        repository.findFeePolicyById(feePolicyId);
    if (existingPolicy.isEmpty()) {
      return failureResponse(List.of("Fee policy does not exist."));
    }
    if (!existingPolicy.get().effectiveDate().isAfter(LexisBusinessTime.today())) {
      return failureResponse(List.of(FEE_POLICY_DELETE_FUTURE_ONLY_MESSAGE));
    }

    boolean deleted = repository.deleteFeePolicy(feePolicyId);
    if (!deleted) {
      return failureResponse(List.of("Unable to delete fee policy."));
    }
    if (repository.findFeePolicyById(feePolicyId).isPresent()) {
      return failureResponse(List.of("Unable to verify the deleted fee policy."));
    }

    return Map.of("success", true);
  }

  private Map<String, Object> addFilPolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();

    LocalDate effectiveDate = parseFutureDate(parameters.get("effectiveDate"), errors);
    Integer filPercent =
        parseRequiredInteger(parameters.get("filPolicyPercentage"), "Fee in Lieu Percent", errors);

    if (filPercent != null) {
      if (filPercent <= 0) {
        errors.add("Fee in Lieu Percent must be more than 0.");
      } else if (filPercent >= 100) {
        errors.add("Fee in Lieu Percent must be less than 100.");
      }
    }

    if (effectiveDate != null && repository.findFilPolicy(effectiveDate).isPresent()) {
      errors.add(FIL_POLICY_KEY_EXISTS_MESSAGE);
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    try {
      return repository
          .insertFilPolicy(effectiveDate, filPercent, resolveUserId())
          .filter(row -> matchesFilPolicy(row, null, effectiveDate, filPercent))
          .<Map<String, Object>>map(this::successFilPolicyResponse)
          .orElseGet(() -> failureResponse(List.of("Unable to save fee in lieu policy.")));
    } catch (DuplicateKeyException ex) {
      return failureResponse(List.of(FIL_POLICY_KEY_EXISTS_MESSAGE));
    }
  }

  private Map<String, Object> updateFilPolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();

    Long filPolicyId =
        parseRequiredPositiveLong(parameters.get("filPolicyId"), "FIL policy id is required.", errors);
    LocalDate effectiveDate = parseFutureDate(parameters.get("effectiveDate"), errors);
    Integer filPercent =
        parseRequiredInteger(parameters.get("filPolicyPercentage"), "Fee in Lieu Percent", errors);

    if (filPercent != null) {
      if (filPercent <= 0) {
        errors.add("Fee in Lieu Percent must be more than 0.");
      } else if (filPercent >= 100) {
        errors.add("Fee in Lieu Percent must be less than 100.");
      }
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    boolean updated;
    try {
      updated =
          repository.updateFilPolicy(filPolicyId, effectiveDate, filPercent, resolveUserId());
    } catch (DuplicateKeyException ex) {
      return failureResponse(List.of(FIL_POLICY_KEY_EXISTS_MESSAGE));
    }
    if (!updated) {
      return failureResponse(List.of("Unable to update fee in lieu policy."));
    }

    return repository
        .findFilPolicyById(filPolicyId)
        .filter(row -> matchesFilPolicy(row, filPolicyId, effectiveDate, filPercent))
        .<Map<String, Object>>map(this::successFilPolicyResponse)
        .orElseGet(
            () -> failureResponse(List.of("Unable to verify the updated fee in lieu policy.")));
  }

  private Map<String, Object> deleteFilPolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();
    Long filPolicyId =
        parseRequiredPositiveLong(parameters.get("filPolicyId"), "FIL policy id is required.", errors);
    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }
    Optional<LexisAdminPolicyRepository.FilPolicyRow> existingPolicy =
        repository.findFilPolicyById(filPolicyId);
    if (existingPolicy.isEmpty()) {
      return failureResponse(List.of("Fee in lieu policy does not exist."));
    }
    if (!existingPolicy.get().effectiveDate().isAfter(LexisBusinessTime.today())) {
      return failureResponse(List.of(FIL_POLICY_DELETE_FUTURE_ONLY_MESSAGE));
    }

    boolean deleted = repository.deleteFilPolicy(filPolicyId);
    if (!deleted) {
      return failureResponse(List.of("Unable to delete fee in lieu policy."));
    }
    if (repository.findFilPolicyById(filPolicyId).isPresent()) {
      return failureResponse(List.of("Unable to verify the deleted fee in lieu policy."));
    }

    return Map.of("success", true);
  }

  private Map<String, Object> toFeePolicyListItem(LexisAdminPolicyRepository.FeePolicyRow row) {
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("lexisFeePolicyId", row.feePolicyId());
    payload.put("effectiveDate", formatDate(row.effectiveDate()));
    payload.put("percentIncrease", Long.toString(row.percentIncrease()));
    payload.put("orgUnitNo", Long.toString(row.orgUnitNo()));

    repository
        .findOrgUnitByNumber(row.orgUnitNo())
        .ifPresentOrElse(
            orgUnit -> {
              payload.put("orgUnitCode", orgUnit.orgUnitCode());
              payload.put("orgUnitName", orgUnit.orgUnitName());
            },
            () -> {
              payload.put("orgUnitCode", "");
              payload.put("orgUnitName", "");
            });

    payload.put("entryUserId", row.entryUserId());
    payload.put("entryTimestamp", formatDate(row.entryTimestamp()));
    payload.put("updateUserId", row.updateUserId());
    payload.put("updateTimestamp", formatDate(row.updateTimestamp()));
    return Map.copyOf(payload);
  }

  private Map<String, Object> successFeePolicyResponse(LexisAdminPolicyRepository.FeePolicyRow row) {
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>(toFeePolicyListItem(row));
    payload.put("success", true);
    return Map.copyOf(payload);
  }

  private Map<String, Object> toFilPolicyListItem(LexisAdminPolicyRepository.FilPolicyRow row) {
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("lexisFeePolicyId", row.filPolicyId());
    payload.put("effectiveDate", formatDate(row.effectiveDate()));
    payload.put("filPercent", Long.toString(row.filPercent()));
    payload.put("entryUserId", row.entryUserId());
    payload.put("entryTimestamp", formatDate(row.entryTimestamp()));
    payload.put("updateUserId", row.updateUserId());
    payload.put("updateTimestamp", formatDate(row.updateTimestamp()));
    return Map.copyOf(payload);
  }

  private Map<String, Object> successFilPolicyResponse(LexisAdminPolicyRepository.FilPolicyRow row) {
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("success", true);
    payload.put("lexisFILPolicyId", row.filPolicyId());
    payload.put("effectiveDate", formatDate(row.effectiveDate()));
    payload.put("filPercent", Long.toString(row.filPercent()));
    payload.put("entryUserId", row.entryUserId());
    payload.put("entryTimestamp", formatDate(row.entryTimestamp()));
    payload.put("updateUserId", row.updateUserId());
    payload.put("updateTimestamp", formatDate(row.updateTimestamp()));
    return Map.copyOf(payload);
  }

  private boolean matchesFeePolicy(
      LexisAdminPolicyRepository.FeePolicyRow row,
      Long expectedPolicyId,
      LocalDate effectiveDate,
      Long orgUnitNo,
      Integer percentIncrease) {
    return row != null
        && row.feePolicyId() > 0
        && (expectedPolicyId == null || row.feePolicyId() == expectedPolicyId)
        && java.util.Objects.equals(row.effectiveDate(), effectiveDate)
        && orgUnitNo != null
        && row.orgUnitNo() == orgUnitNo
        && percentIncrease != null
        && row.percentIncrease() == percentIncrease;
  }

  private boolean matchesFilPolicy(
      LexisAdminPolicyRepository.FilPolicyRow row,
      Long expectedPolicyId,
      LocalDate effectiveDate,
      Integer filPercent) {
    return row != null
        && row.filPolicyId() > 0
        && (expectedPolicyId == null || row.filPolicyId() == expectedPolicyId)
        && java.util.Objects.equals(row.effectiveDate(), effectiveDate)
        && filPercent != null
        && row.filPercent() == filPercent;
  }

  private Map<String, Object> guardedPolicyMutation(
      Supplier<Map<String, Object>> mutation) {
    policyMutationGuard.lock();
    try {
      Map<String, Object> result =
          transactionOperations.execute(
              status -> {
                Map<String, Object> response = mutation.get();
                if (!Boolean.TRUE.equals(response.get("success"))) {
                  status.setRollbackOnly();
                }
                return response;
              });
      if (result == null) {
        throw new IllegalStateException("Policy transaction returned no result.");
      }
      return result;
    } finally {
      policyMutationGuard.unlock();
    }
  }

  private static TransactionOperations policyTransactionOperations(
      PlatformTransactionManager transactionManager) {
    TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
    transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    return transactionTemplate;
  }

  private String normalizeAction(LexisAdminRpcRequestDto request) {
    Map<String, String> parameters = normalizeParameters(request);
    String action = trimToNull(request == null ? null : request.action());
    if (action == null) {
      action = trimToNull(parameters.get("actionMapping"));
    }
    if (action == null) {
      action = "view";
    }
    return action.toLowerCase(Locale.ROOT);
  }

  private Map<String, String> normalizeParameters(LexisAdminRpcRequestDto request) {
    if (request == null || request.parameters() == null || request.parameters().isEmpty()) {
      return Map.of();
    }
    return Map.copyOf(request.parameters());
  }

  private String buildSortOrder(
      Map<String, String> parameters,
      Set<String> allowedColumns,
      String defaultColumn,
      String defaultDirection) {
    String column = trimToNull(parameters.get("columnName"));
    if (column == null || !allowedColumns.contains(column.toLowerCase(Locale.ROOT))) {
      column = defaultColumn;
    }

    String direction = trimToNull(parameters.get("sortOrder"));
    if (!"asc".equalsIgnoreCase(direction) && !"desc".equalsIgnoreCase(direction)) {
      direction = defaultDirection;
    }

    return column + " " + direction.toLowerCase(Locale.ROOT);
  }

  private int parsePage(String rawValue, int fallback) {
    if (rawValue == null || rawValue.isBlank()) {
      return fallback;
    }
    try {
      return Math.max(0, Integer.parseInt(rawValue.trim()));
    } catch (NumberFormatException ex) {
      return fallback;
    }
  }

  private Map<String, String> sortParameters(String sortField, String sortDirection) {
    LinkedHashMap<String, String> parameters = new LinkedHashMap<>();
    if (trimToNull(sortField) != null) {
      parameters.put("columnName", trimToNull(sortField));
    }
    if (trimToNull(sortDirection) != null) {
      parameters.put("sortOrder", trimToNull(sortDirection));
    }
    return Map.copyOf(parameters);
  }

  private int normalizeModernPage(int page) {
    return Math.max(0, page);
  }

  private int normalizeModernSize(int size) {
    if (size < 1) {
      return DEFAULT_MODERN_PAGE_SIZE;
    }
    return Math.min(size, MAX_MODERN_PAGE_SIZE);
  }

  private int safeTotal(long total) {
    if (total < 0L) {
      return 0;
    }
    return total > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) total;
  }

  private <T> List<T> fetchLegacyWindow(
      int page, int size, long total, IntFunction<List<T>> legacyPageFetcher) {
    long offset = (long) page * size;
    if (offset >= total || offset > Integer.MAX_VALUE) {
      return List.of();
    }

    int firstLegacyPage = (int) (offset / LEGACY_RESULTS_PER_PAGE);
    int firstLegacyOffset = (int) (offset % LEGACY_RESULTS_PER_PAGE);
    ArrayList<T> rows = new ArrayList<>(size);
    for (int legacyPage = firstLegacyPage; rows.size() < size; legacyPage++) {
      List<T> legacyRows = legacyPageFetcher.apply(legacyPage);
      if (legacyRows.isEmpty()) {
        break;
      }

      int fromIndex = legacyPage == firstLegacyPage ? firstLegacyOffset : 0;
      for (int index = fromIndex; index < legacyRows.size() && rows.size() < size; index++) {
        rows.add(legacyRows.get(index));
      }

      if (legacyRows.size() < LEGACY_RESULTS_PER_PAGE) {
        break;
      }
    }
    return List.copyOf(rows);
  }

  private LocalDate parseFutureDate(String rawValue, List<String> errors) {
    String normalized = trimToNull(rawValue);
    if (normalized == null) {
      errors.add("Effective Date is required.");
      return null;
    }

    LocalDate parsed = parseDate(normalized);
    if (parsed == null) {
      errors.add("Effective Date is an invalid date format, must use yyyy-mm-dd.");
      return null;
    }

    if (!parsed.isAfter(LexisBusinessTime.today())) {
      errors.add("Effective Date must be greater than the current date.");
    }

    return parsed;
  }

  private LocalDate parseDate(String rawValue) {
    return parseIsoOrLegacyDate(rawValue);
  }

  private Long parseRequiredPositiveLong(String rawValue, String requiredMessage, List<String> errors) {
    String normalized = trimToNull(rawValue);
    if (normalized == null) {
      errors.add(requiredMessage);
      return null;
    }

    try {
      long parsed = Long.parseLong(normalized);
      if (parsed < 1) {
        errors.add(requiredMessage);
        return null;
      }
      return parsed;
    } catch (NumberFormatException ex) {
      errors.add(requiredMessage);
      return null;
    }
  }

  private Integer parseRequiredInteger(String rawValue, String fieldName, List<String> errors) {
    String normalized = trimToNull(rawValue);
    if (normalized == null) {
      errors.add("A valid " + fieldName + " is required with no decimal points.");
      return null;
    }

    try {
      return Integer.valueOf(normalized);
    } catch (NumberFormatException ex) {
      errors.add("A valid " + fieldName + " is required with no decimal points.");
      return null;
    }
  }

  private Map<String, Object> failureResponse(List<String> errors) {
    LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
    payload.put("success", false);
    payload.put("errors", List.copyOf(errors));
    payload.put("warnings", List.of());
    return Map.copyOf(payload);
  }

  private String resolveUserId() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null) {
      return null;
    }
    if (principalService != null) {
      return trimToNull(principalService.resolvePrincipalName(authentication));
    }
    return trimToNull(authentication.getName());
  }

  private String formatDate(LocalDate value) {
    return value == null ? "" : value.format(DISPLAY_DATE_FORMATTER);
  }

  private String renderPaginationHtml(
      long recordCount, int currentPage, String singularItemDescription, String pluralItemDescription) {
    StringBuilder paginationHtml = new StringBuilder();

    long totalPages = recordCount / MAX_RESULTS_PER_PAGE;
    if (recordCount % MAX_RESULTS_PER_PAGE != 0) {
      totalPages++;
    }

    long previousPage = currentPage - 1L;
    if (previousPage < 0) {
      previousPage = 0;
    }

    long nextPage = currentPage + 1L;
    if (nextPage > totalPages - 1) {
      nextPage = totalPages - 1;
    }

    TreeSet<Integer> displayPages = new TreeSet<>();
    displayPages.add(Integer.valueOf(0));

    for (int i = currentPage; i < totalPages && i < currentPage + 6; i++) {
      displayPages.add(Integer.valueOf(i));
    }

    for (int i = currentPage; i > 0 && i > currentPage - 6; i--) {
      displayPages.add(Integer.valueOf(i));
    }

    String divider = "<div class=\"paginatedUnlinked\">|</div>";

    if (recordCount > MAX_RESULTS_PER_PAGE) {
      paginationHtml.append("<div onclick=\"setPage(0);getItems()\" class=\"paginated\">First</div>");
      paginationHtml.append(divider);
      paginationHtml
          .append("<div onclick=\"setPage(")
          .append(previousPage)
          .append(");getItems()\" class=\"paginated\">Previous</div>");
      paginationHtml.append(divider);

      for (Integer pageValue : displayPages) {
        int renderedPage = pageValue.intValue();
        if (renderedPage == currentPage) {
          paginationHtml
              .append("<div class=\"paginatedUnlinked\" style='font-weight: bolder;'>[")
              .append(renderedPage + 1)
              .append("]</div>");
        } else {
          paginationHtml
              .append("<div onclick=\"setPage(")
              .append(renderedPage)
              .append(");getItems()\" class=\"paginated\">")
              .append(renderedPage + 1)
              .append("</div>");
        }
      }

      paginationHtml.append(divider);
      paginationHtml
          .append("<div onclick=\"setPage(")
          .append(nextPage)
          .append(");getItems()\" class=\"paginated\">Next</div> ");
      paginationHtml.append(divider);
      paginationHtml
          .append("<div onclick=\"setPage(")
          .append(totalPages - 1)
          .append(");getItems()\" class=\"paginated\">Last</div>");
    }

    String itemDescription = recordCount == 1 ? singularItemDescription : pluralItemDescription;
    paginationHtml
        .append("<div style='clear: both;'>")
        .append(recordCount)
        .append(" ")
        .append(itemDescription)
        .append(" found</div>");

    return paginationHtml.toString();
  }
}

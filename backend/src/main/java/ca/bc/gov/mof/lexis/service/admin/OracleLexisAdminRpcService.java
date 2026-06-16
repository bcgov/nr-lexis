package ca.bc.gov.mof.lexis.service.admin;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminRpcRequestDto;
import ca.bc.gov.mof.lexis.repository.admin.LexisAdminPolicyRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisAdminRpcService implements LexisAdminRpcService {

  private static final DateTimeFormatter DISPLAY_DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final long MAX_RESULTS_PER_PAGE = 10L;

  private static final Set<String> FEE_SORT_COLUMNS =
      Set.of("effective_date", "org_unit_no", "percent_increase");
  private static final Set<String> FIL_SORT_COLUMNS = Set.of("effective_date", "fil_percent");

  private final LexisAdminPolicyRepository repository;

  public OracleLexisAdminRpcService(LexisAdminPolicyRepository repository) {
    this.repository = repository;
  }

  @Override
  public Optional<Object> executeFeePolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(handleFeePolicyRpc(request));
  }

  @Override
  public Optional<Object> executeFilPolicyRpc(LexisAdminRpcRequestDto request) {
    return Optional.of(handleFilPolicyRpc(request));
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
      case "addpolicy", "add" -> addFeePolicy(parameters);
      case "updatepolicy", "update" -> updateFeePolicy(parameters);
      case "deletepolicy", "delete" -> deleteFeePolicy(parameters);
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
      case "addfilpolicy", "add" -> addFilPolicy(parameters);
      case "updatefilpolicy", "update" -> updateFilPolicy(parameters);
      case "deletefilpolicy", "delete" -> deleteFilPolicy(parameters);
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
      errors.add("Effective Date and region combination already exists.");
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    return repository
        .insertFeePolicy(effectiveDate, orgUnitNo, percentIncrease, resolveUserId(parameters))
        .<Map<String, Object>>map(this::successFeePolicyResponse)
        .orElseGet(() -> failureResponse(List.of("Unable to save fee policy.")));
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

    boolean updated =
        repository.updateFeePolicy(
            feePolicyId, effectiveDate, orgUnitNo, percentIncrease, resolveUserId(parameters));
    if (!updated) {
      return failureResponse(List.of("Unable to update fee policy."));
    }

    return repository
        .findFeePolicyById(feePolicyId)
        .<Map<String, Object>>map(this::successFeePolicyResponse)
        .orElseGet(
            () -> {
              LinkedHashMap<String, Object> response = new LinkedHashMap<>();
              response.put("success", true);
              response.put("lexisFeePolicyId", feePolicyId);
              return Map.copyOf(response);
            });
  }

  private Map<String, Object> deleteFeePolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();
    Long feePolicyId =
        parseRequiredPositiveLong(parameters.get("feePolicyId"), "Fee policy id is required.", errors);
    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    boolean deleted = repository.deleteFeePolicy(feePolicyId);
    if (!deleted) {
      return failureResponse(List.of("Unable to delete fee policy."));
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
      errors.add("Effective Date and region combination already exists.");
    }

    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    return repository
        .insertFilPolicy(effectiveDate, filPercent, resolveUserId(parameters))
        .<Map<String, Object>>map(this::successFilPolicyResponse)
        .orElseGet(() -> failureResponse(List.of("Unable to save fee in lieu policy.")));
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

    boolean updated =
        repository.updateFilPolicy(filPolicyId, effectiveDate, filPercent, resolveUserId(parameters));
    if (!updated) {
      return failureResponse(List.of("Unable to update fee in lieu policy."));
    }

    return repository
        .findFilPolicyById(filPolicyId)
        .<Map<String, Object>>map(this::successFilPolicyResponse)
        .orElseGet(
            () -> {
              LinkedHashMap<String, Object> response = new LinkedHashMap<>();
              response.put("success", true);
              response.put("lexisFILPolicyId", filPolicyId);
              return Map.copyOf(response);
            });
  }

  private Map<String, Object> deleteFilPolicy(Map<String, String> parameters) {
    ArrayList<String> errors = new ArrayList<>();
    Long filPolicyId =
        parseRequiredPositiveLong(parameters.get("filPolicyId"), "FIL policy id is required.", errors);
    if (!errors.isEmpty()) {
      return failureResponse(errors);
    }

    boolean deleted = repository.deleteFilPolicy(filPolicyId);
    if (!deleted) {
      return failureResponse(List.of("Unable to delete fee in lieu policy."));
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

    if (!parsed.isAfter(LocalDate.now())) {
      errors.add("Effective Date must be greater than the current date.");
    }

    return parsed;
  }

  private LocalDate parseDate(String rawValue) {
    try {
      return LocalDate.parse(rawValue, DISPLAY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      // Fall through to legacy format.
    }

    try {
      return LocalDate.parse(rawValue, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      return null;
    }
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

  private String resolveUserId(Map<String, String> parameters) {
    String explicit = trimToNull(parameters.get("currentUserId"));
    if (explicit != null) {
      return explicit;
    }

    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null) {
      return null;
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

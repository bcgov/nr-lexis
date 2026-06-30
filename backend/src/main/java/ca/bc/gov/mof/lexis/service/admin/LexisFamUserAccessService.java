package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import java.net.URI;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

@Service
public class LexisFamUserAccessService {

  private static final String USER_ROLE_ASSIGNMENT_PATH =
      "/fam-applications/{applicationId}/user-role-assignment";
  private static final int MIN_SEARCH_LENGTH = 3;
  private static final int MIN_PAGE_SIZE = 10;
  private static final int DEFAULT_PAGE_SIZE = 10;
  private static final int MAX_PAGE_SIZE = 100;

  private final RestClient restClient;
  private final Long applicationId;
  private final boolean configured;

  @Autowired
  public LexisFamUserAccessService(
      @Value("${lexis.fam.admin.base-url:}") String baseUrl,
      @Value("${lexis.fam.admin.application-id:}") String applicationId,
      @Value("${lexis.fam.admin.connect-timeout:5s}") Duration connectTimeout,
      @Value("${lexis.fam.admin.read-timeout:10s}") Duration readTimeout) {
    this(buildRestClient(baseUrl, connectTimeout, readTimeout), parseApplicationId(applicationId), baseUrl);
  }

  LexisFamUserAccessService(RestClient restClient, Long applicationId, String baseUrl) {
    this.restClient = restClient;
    this.applicationId = applicationId;
    this.configured = StringUtils.hasText(baseUrl) && applicationId != null;
  }

  public LexisFamUserRoleAssignmentSearchResponseDto searchRoleAssignments(
      String search, int pageNumber, int pageSize, String sortBy, String sortOrder) {
    String normalizedSearch = normalizeSearch(search);
    int normalizedPageNumber = Math.max(pageNumber, 1);
    int normalizedPageSize = normalizePageSize(pageSize);
    String normalizedSortBy = normalizeSortBy(sortBy);
    String normalizedSortOrder = normalizeSortOrder(sortOrder);

    if (!configured) {
      return new LexisFamUserRoleAssignmentSearchResponseDto(
          List.of(),
          0,
          normalizedPageNumber,
          normalizedPageSize,
          0,
          false,
          "FAM user access lookup is not configured.");
    }

    FamPagedRoleAssignments response =
        restClient
            .get()
            .uri(
                uriBuilder -> {
                  uriBuilder
                      .path(USER_ROLE_ASSIGNMENT_PATH)
                      .queryParam("pageNumber", normalizedPageNumber)
                      .queryParam("pageSize", normalizedPageSize)
                      .queryParam("sortBy", normalizedSortBy)
                      .queryParam("sortOrder", normalizedSortOrder);
                  if (normalizedSearch != null) {
                    uriBuilder.queryParam("search", normalizedSearch);
                  }
                  URI uri = uriBuilder.build(applicationId);
                  return uri;
                })
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + extractBearerToken())
            .retrieve()
            .body(FamPagedRoleAssignments.class);

    if (response == null) {
      return new LexisFamUserRoleAssignmentSearchResponseDto(
          List.of(), 0, normalizedPageNumber, normalizedPageSize, 0, true, null);
    }

    FamPageMeta meta = response.meta();
    int total = meta == null ? 0 : meta.total();
    int returnedPage = meta == null ? normalizedPageNumber : Math.max(meta.page_number(), 1);
    int returnedPageSize = meta == null ? normalizedPageSize : Math.max(meta.page_size(), MIN_PAGE_SIZE);
    int pageCount = meta == null ? 0 : Math.max(meta.number_of_pages(), 0);
    List<LexisFamUserRoleAssignmentDto> results =
        response.results().stream()
            .filter(Objects::nonNull)
            .map(LexisFamUserAccessService::toDto)
            .filter(Objects::nonNull)
            .toList();

    return new LexisFamUserRoleAssignmentSearchResponseDto(
        results, total, returnedPage, returnedPageSize, pageCount, true, null);
  }

  private static RestClient buildRestClient(String baseUrl, Duration connectTimeout, Duration readTimeout) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Math.toIntExact(connectTimeout.toMillis()));
    factory.setReadTimeout(Math.toIntExact(readTimeout.toMillis()));

    RestClient.Builder builder =
        RestClient.builder()
            .requestFactory(factory)
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE);
    if (StringUtils.hasText(baseUrl)) {
      builder.baseUrl(baseUrl.trim());
    }
    return builder.build();
  }

  private static Long parseApplicationId(String applicationId) {
    if (!StringUtils.hasText(applicationId)) {
      return null;
    }
    try {
      return Long.parseLong(applicationId.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private static String normalizeSearch(String search) {
    if (!StringUtils.hasText(search)) {
      return null;
    }
    String normalized = search.trim();
    if (normalized.length() < MIN_SEARCH_LENGTH) {
      throw new IllegalArgumentException("Enter at least 3 characters to search FAM users.");
    }
    return normalized;
  }

  private static int normalizePageSize(int pageSize) {
    if (pageSize <= 0) {
      return DEFAULT_PAGE_SIZE;
    }
    return Math.min(Math.max(pageSize, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
  }

  private static String normalizeSortBy(String sortBy) {
    if (!StringUtils.hasText(sortBy)) {
      return "user_name";
    }
    return switch (sortBy.trim()) {
      case "create_date", "user_name", "user_type_code", "email", "full_name", "role_display_name",
          "forest_client_number" -> sortBy.trim();
      default -> "user_name";
    };
  }

  private static String normalizeSortOrder(String sortOrder) {
    if (!StringUtils.hasText(sortOrder)) {
      return "asc";
    }
    return "desc".equalsIgnoreCase(sortOrder.trim()) ? "desc" : "asc";
  }

  private static String extractBearerToken() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication instanceof JwtAuthenticationToken jwtAuth) {
      return jwtAuth.getToken().getTokenValue();
    }
    throw new IllegalStateException("No valid JWT bearer token in security context");
  }

  private static LexisFamUserRoleAssignmentDto toDto(FamRoleAssignment assignment) {
    FamUser user = assignment.user();
    FamRole role = assignment.role();
    if (user == null || role == null) {
      return null;
    }
    FamUserType userType = user.user_type();
    FamForestClient forestClient = role.forest_client();
    FamForestClientStatus forestClientStatus = forestClient == null ? null : forestClient.status();
    String firstName = trim(user.first_name());
    String lastName = trim(user.last_name());

    return new LexisFamUserRoleAssignmentDto(
        assignment.user_role_xref_id(),
        assignment.user_id(),
        trim(user.user_name()),
        userType == null ? null : trim(userType.code()),
        userType == null ? null : trim(userType.description()),
        firstName,
        lastName,
        buildFullName(firstName, lastName, user.user_name()),
        trim(user.email()),
        assignment.role_id(),
        trim(role.role_name()),
        trim(role.display_name()),
        trim(role.role_type_code()),
        forestClient == null ? null : trim(forestClient.forest_client_number()),
        forestClient == null ? null : trim(forestClient.client_name()),
        forestClientStatus == null ? null : trim(forestClientStatus.status_code()),
        forestClientStatus == null ? null : trim(forestClientStatus.description()),
        trim(assignment.create_date()),
        trim(assignment.expiry_date()));
  }

  private static String buildFullName(String firstName, String lastName, String fallback) {
    if (StringUtils.hasText(firstName) && StringUtils.hasText(lastName)) {
      return firstName + " " + lastName;
    }
    if (StringUtils.hasText(firstName)) {
      return firstName;
    }
    if (StringUtils.hasText(lastName)) {
      return lastName;
    }
    return trim(fallback);
  }

  private static String trim(String value) {
    return value == null ? null : value.trim();
  }

  private record FamPagedRoleAssignments(FamPageMeta meta, List<FamRoleAssignment> results) {
    FamPagedRoleAssignments {
      if (results == null) {
        results = Collections.emptyList();
      }
    }
  }

  private record FamPageMeta(int total, int number_of_pages, int page_number, int page_size) {}

  private record FamRoleAssignment(
      Long user_role_xref_id,
      Long user_id,
      Long role_id,
      FamUser user,
      FamRole role,
      String create_date,
      String expiry_date) {}

  private record FamUser(
      String user_name,
      FamUserType user_type,
      String first_name,
      String last_name,
      String email) {}

  private record FamUserType(String code, String description) {}

  private record FamRole(
      String role_name,
      String role_type_code,
      Long role_id,
      String display_name,
      String description,
      FamForestClient forest_client) {}

  private record FamForestClient(
      String forest_client_number, String client_name, FamForestClientStatus status) {}

  private record FamForestClientStatus(String status_code, String description) {}
}

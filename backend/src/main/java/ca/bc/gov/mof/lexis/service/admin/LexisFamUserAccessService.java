package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
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

  private static final String USER_SEARCH_PATH = "/external/v1/users";
  private static final int MIN_SEARCH_LENGTH = 3;
  private static final int MIN_PAGE_SIZE = 10;
  private static final int DEFAULT_PAGE_SIZE = 10;
  private static final int MAX_PAGE_SIZE = 100;

  private final RestClient restClient;
  private final boolean configured;

  @Autowired
  public LexisFamUserAccessService(
      @Value("${ca.bc.gov.nrs.identity-lookup.base-url:}") String baseUrl,
      @Value("${ca.bc.gov.nrs.identity-lookup.connect-timeout:5s}") Duration connectTimeout,
      @Value("${ca.bc.gov.nrs.identity-lookup.read-timeout:10s}") Duration readTimeout) {
    this(buildRestClient(baseUrl, connectTimeout, readTimeout), baseUrl);
  }

  LexisFamUserAccessService(RestClient restClient, String baseUrl) {
    this.restClient = restClient;
    this.configured = StringUtils.hasText(baseUrl);
  }

  public LexisFamUserRoleAssignmentSearchResponseDto searchRoleAssignments(
      String search, int pageNumber, int pageSize, String sortBy, String sortOrder) {
    String normalizedSearch = normalizeSearch(search);
    int normalizedPageNumber = Math.max(pageNumber, 1);
    int normalizedPageSize = normalizePageSize(pageSize);

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

    FamExternalUserSearchResponse response =
        restClient
            .get()
            .uri(
                uriBuilder -> {
                  uriBuilder
                      .path(USER_SEARCH_PATH)
                      .queryParam("page", normalizedPageNumber)
                      .queryParam("size", normalizedPageSize);
                  if (normalizedSearch != null) {
                    uriBuilder.queryParam("idpUsername", normalizedSearch);
                  }
                  return uriBuilder.build();
                })
            .header(HttpHeaders.AUTHORIZATION, "Bearer " + extractBearerToken())
            .retrieve()
            .body(FamExternalUserSearchResponse.class);

    if (response == null) {
      return new LexisFamUserRoleAssignmentSearchResponseDto(
          List.of(), 0, normalizedPageNumber, normalizedPageSize, 0, true, null);
    }

    FamPageMeta meta = response.meta();
    int total = meta == null ? 0 : meta.total();
    int returnedPage = meta == null ? normalizedPageNumber : Math.max(meta.page(), 1);
    int returnedPageSize = meta == null ? normalizedPageSize : Math.max(meta.size(), MIN_PAGE_SIZE);
    int pageCount = meta == null ? 0 : Math.max(meta.pageCount(), 0);
    List<LexisFamUserRoleAssignmentDto> results =
        response.users().stream()
            .filter(Objects::nonNull)
            .flatMap(user -> toDtos(user).stream())
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

  private static String extractBearerToken() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication instanceof JwtAuthenticationToken jwtAuth) {
      return jwtAuth.getToken().getTokenValue();
    }
    throw new IllegalStateException("No valid JWT bearer token in security context");
  }

  private static List<LexisFamUserRoleAssignmentDto> toDtos(FamExternalUser user) {
    if (user.roles().isEmpty()) {
      return List.of(toDto(user, null));
    }
    return user.roles().stream().filter(Objects::nonNull).map(role -> toDto(user, role)).toList();
  }

  private static LexisFamUserRoleAssignmentDto toDto(FamExternalUser user, FamExternalRole role) {
    String firstName = trim(user.firstName());
    String lastName = trim(user.lastName());
    String userName = trim(user.idpUsername());
    String idpType = trim(user.idpType());
    String roleName = role == null ? null : trim(role.roleName());
    String roleDisplayName = role == null ? null : trim(role.roleDisplayName());
    String scopeType = role == null ? null : trim(role.scopeType());
    String scopeValue = role == null ? null : joinValues(role.value());
    boolean forestClientScope = "FOREST_CLIENT".equalsIgnoreCase(scopeType);
    return new LexisFamUserRoleAssignmentDto(
        null,
        null,
        userName,
        idpType,
        userTypeDescription(idpType),
        firstName,
        lastName,
        buildFullName(firstName, lastName, userName),
        null,
        null,
        roleName,
        roleDisplayName,
        null,
        forestClientScope ? scopeValue : null,
        null,
        null,
        null,
        scopeType,
        scopeValue,
        null,
        null);
  }

  private static String userTypeDescription(String idpType) {
    if (!StringUtils.hasText(idpType)) {
      return null;
    }
    return switch (idpType.trim().toUpperCase()) {
      case "BCEID" -> "Business BCeID";
      case "BCSC" -> "BC Services Card";
      case "IDIR" -> "IDIR";
      default -> idpType.trim();
    };
  }

  private static String joinValues(List<String> values) {
    if (values == null || values.isEmpty()) {
      return null;
    }
    String joined =
        values.stream()
            .map(LexisFamUserAccessService::trim)
            .filter(StringUtils::hasText)
            .distinct()
            .reduce((left, right) -> left + ", " + right)
            .orElse(null);
    return StringUtils.hasText(joined) ? joined : null;
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

  private record FamExternalUserSearchResponse(FamPageMeta meta, List<FamExternalUser> users) {
    FamExternalUserSearchResponse {
      if (users == null) {
        users = Collections.emptyList();
      }
    }
  }

  private record FamPageMeta(int total, int pageCount, int page, int size) {}

  private record FamExternalUser(
      String firstName,
      String lastName,
      String idpUsername,
      String idpUserGuid,
      String idpType,
      List<FamExternalRole> roles) {
    FamExternalUser {
      if (roles == null) {
        roles = Collections.emptyList();
      }
    }
  }

  private record FamExternalRole(
      String applicationName,
      String roleName,
      String roleDisplayName,
      String scopeType,
      List<String> value) {
    FamExternalRole {
      if (value == null) {
        value = Collections.emptyList();
      }
    }
  }
}

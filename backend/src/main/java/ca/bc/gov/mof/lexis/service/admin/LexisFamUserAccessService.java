package ca.bc.gov.mof.lexis.service.admin;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentDto;
import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import java.time.Duration;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Service
public class LexisFamUserAccessService {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisFamUserAccessService.class);

  private static final String USER_SEARCH_PATH = "/external/v1/users/identity/idir/search";
  private static final int MIN_SEARCH_LENGTH = 3;
  private static final int MIN_PAGE_SIZE = 10;
  private static final int DEFAULT_PAGE_SIZE = 10;
  private static final int MAX_PAGE_SIZE = 100;
  private static final int MAX_UPSTREAM_PAGE_SIZE = 500;
  private static final String LOOKUP_FAILED_MESSAGE =
      "FAM user access lookup failed while calling the FAM identity lookup API.";
  private static final Comparator<LexisFamUserRoleAssignmentDto> USER_COMPARATOR =
      Comparator.comparing(
              LexisFamUserRoleAssignmentDto::fullName, Comparator.nullsLast(String::compareToIgnoreCase))
          .thenComparing(
              LexisFamUserRoleAssignmentDto::userName,
              Comparator.nullsLast(String::compareToIgnoreCase));

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

    IdentityLookupResponse response;
    try {
      response =
          restClient
              .get()
              .uri(
                  uriBuilder -> {
                    uriBuilder
                        .path(USER_SEARCH_PATH)
                        .queryParam(
                            "pageSize",
                            upstreamPageSize(normalizedPageNumber, normalizedPageSize));
                    if (normalizedSearch != null) {
                      String lookupValue = toIdentityLookupValue(normalizedSearch);
                      uriBuilder.queryParam("userId", lookupValue).queryParam("username", lookupValue);
                    }
                    return uriBuilder.build();
                  })
              .header(HttpHeaders.AUTHORIZATION, "Bearer " + extractBearerToken())
              .retrieve()
              .body(IdentityLookupResponse.class);
    } catch (RestClientResponseException exception) {
      LOGGER.warn(
          "FAM identity lookup failed with status {}: {}",
          exception.getStatusCode(),
          exception.getResponseBodyAsString());
      return failedLookupResponse(normalizedPageNumber, normalizedPageSize);
    } catch (RestClientException exception) {
      LOGGER.warn("FAM identity lookup failed: {}", exception.getMessage());
      return failedLookupResponse(normalizedPageNumber, normalizedPageSize);
    }

    if (response == null) {
      return new LexisFamUserRoleAssignmentSearchResponseDto(
          List.of(), 0, normalizedPageNumber, normalizedPageSize, 0, true, null);
    }

    List<LexisFamUserRoleAssignmentDto> allResults =
        response.items().stream()
            .filter(Objects::nonNull)
            .map(LexisFamUserAccessService::toDto)
            .filter(Objects::nonNull)
            .sorted(USER_COMPARATOR)
            .toList();
    int total = toIntTotal(response.totalItems(), allResults.size());
    int pageCount = total == 0 ? 0 : (int) Math.ceil((double) total / normalizedPageSize);
    List<LexisFamUserRoleAssignmentDto> pageResults =
        pageResults(allResults, normalizedPageNumber, normalizedPageSize);

    return new LexisFamUserRoleAssignmentSearchResponseDto(
        pageResults, total, normalizedPageNumber, normalizedPageSize, pageCount, true, null);
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

  private static int upstreamPageSize(int pageNumber, int pageSize) {
    long requested = (long) Math.max(pageNumber, 1) * Math.max(pageSize, MIN_PAGE_SIZE);
    return (int) Math.min(Math.max(requested, MIN_PAGE_SIZE), MAX_UPSTREAM_PAGE_SIZE);
  }

  private static String toIdentityLookupValue(String search) {
    int slashIndex = search.indexOf('\\');
    if (slashIndex >= 0 && slashIndex < search.length() - 1) {
      return search.substring(slashIndex + 1);
    }
    return search;
  }

  private static String extractBearerToken() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication instanceof JwtAuthenticationToken jwtAuth) {
      return jwtAuth.getToken().getTokenValue();
    }
    throw new IllegalStateException("No valid JWT bearer token in security context");
  }

  private static LexisFamUserRoleAssignmentDto toDto(IdentityLookupUser user) {
    String userName = trim(user.userId());
    if (!StringUtils.hasText(userName)) {
      return null;
    }
    String firstName = trim(user.firstName());
    String lastName = trim(user.lastName());
    return new LexisFamUserRoleAssignmentDto(
        null,
        null,
        userName,
        "IDIR",
        "IDIR",
        firstName,
        lastName,
        buildFullName(firstName, lastName, userName),
        trim(user.email()),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private static int toIntTotal(long upstreamTotal, int fallbackTotal) {
    if (upstreamTotal <= 0) {
      return fallbackTotal;
    }
    return upstreamTotal > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) upstreamTotal;
  }

  private static List<LexisFamUserRoleAssignmentDto> pageResults(
      List<LexisFamUserRoleAssignmentDto> results, int pageNumber, int pageSize) {
    int fromIndex = (pageNumber - 1) * pageSize;
    if (fromIndex >= results.size()) {
      return List.of();
    }
    return results.subList(fromIndex, Math.min(fromIndex + pageSize, results.size()));
  }

  private static LexisFamUserRoleAssignmentSearchResponseDto failedLookupResponse(
      int pageNumber, int pageSize) {
    return new LexisFamUserRoleAssignmentSearchResponseDto(
        List.of(), 0, pageNumber, pageSize, 0, true, LOOKUP_FAILED_MESSAGE);
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

  private record IdentityLookupResponse(long totalItems, int pageSize, List<IdentityLookupUser> items) {
    IdentityLookupResponse {
      if (items == null) {
        items = Collections.emptyList();
      }
    }
  }

  private record IdentityLookupUser(
      String userId, String guid, String firstName, String lastName, String email) {}
}

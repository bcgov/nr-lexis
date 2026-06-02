package ca.bc.gov.mof.lexis.security;

import java.time.Duration;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@Service
public class CognitoUserInfoService {

  private static final Logger LOG = LoggerFactory.getLogger(CognitoUserInfoService.class);
  private static final Duration CACHE_TTL = Duration.ofMinutes(5);
  private static final int CACHE_MAX_SIZE = 2000;

  private final String userInfoUri;
  private final RestTemplate restTemplate;
  private final ConcurrentHashMap<String, CachedEntry> cache = new ConcurrentHashMap<>();

  public CognitoUserInfoService(
      @Value("${lexis.auth.cognito.userinfo-uri:}") String userInfoUri) {
    this.userInfoUri = userInfoUri;
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());
    this.restTemplate = new RestTemplate(factory);
  }

  public Map<String, Object> getUserInfo(Jwt accessToken) {
    if (accessToken == null || accessToken.getSubject() == null || accessToken.getSubject().isBlank()) {
      return Map.of();
    }

    if (userInfoUri == null || userInfoUri.isBlank()) {
      return Map.of();
    }

    String subject = accessToken.getSubject();
    CachedEntry cached = cache.get(subject);
    if (cached != null && !cached.isExpired()) {
      return cached.claims();
    }

    try {
      HttpHeaders headers = new HttpHeaders();
      headers.setBearerAuth(accessToken.getTokenValue());
      HttpEntity<Void> entity = new HttpEntity<>(headers);

      ResponseEntity<Map<String, Object>> response =
          restTemplate.exchange(
              userInfoUri,
              HttpMethod.GET,
              entity,
              new ParameterizedTypeReference<>() {});

      Map<String, Object> claims =
          response.getBody() == null ? Map.of() : Collections.unmodifiableMap(response.getBody());

      if (cache.size() >= CACHE_MAX_SIZE) {
        evictExpired();
      }
      cache.put(subject, new CachedEntry(claims, System.currentTimeMillis()));
      return claims;
    } catch (RestClientException exception) {
      LOG.warn("Failed to call Cognito userInfo endpoint for sub={}: {}", subject, exception.getMessage());
      return cached == null ? Map.of() : cached.claims();
    }
  }

  private void evictExpired() {
    cache.entrySet().removeIf(entry -> entry.getValue().isExpired());
  }

  private record CachedEntry(Map<String, Object> claims, long insertedAt) {
    boolean isExpired() {
      return System.currentTimeMillis() - insertedAt > CACHE_TTL.toMillis();
    }
  }
}

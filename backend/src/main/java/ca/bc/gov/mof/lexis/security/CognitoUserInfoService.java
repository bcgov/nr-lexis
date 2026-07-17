package ca.bc.gov.mof.lexis.security;

import java.time.Duration;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
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
  private final Duration cacheTtl;
  private final int cacheMaxSize;
  private final LongSupplier currentTimeMillis;
  private final ConcurrentHashMap<String, CachedEntry> cache = new ConcurrentHashMap<>();

  @Autowired
  public CognitoUserInfoService(
      @Value("${lexis.auth.cognito.userinfo-uri:}") String userInfoUri) {
    this(
        userInfoUri,
        createRestTemplate(),
        CACHE_TTL,
        CACHE_MAX_SIZE,
        System::currentTimeMillis);
  }

  CognitoUserInfoService(
      String userInfoUri,
      RestTemplate restTemplate,
      Duration cacheTtl,
      int cacheMaxSize,
      LongSupplier currentTimeMillis) {
    this.userInfoUri = userInfoUri;
    this.restTemplate = restTemplate;
    this.cacheTtl = cacheTtl;
    this.cacheMaxSize = cacheMaxSize;
    this.currentTimeMillis = currentTimeMillis;
  }

  private static RestTemplate createRestTemplate() {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
    factory.setReadTimeout((int) Duration.ofSeconds(10).toMillis());
    return new RestTemplate(factory);
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
    if (cached != null && !cached.isExpired(currentTimeMillis.getAsLong(), cacheTtl)) {
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
          response.getBody() == null
              ? Map.of()
              : Collections.unmodifiableMap(new HashMap<>(response.getBody()));

      cache(subject, claims);
      return claims;
    } catch (RestClientException exception) {
      LOG.warn(
          "Cognito userInfo request failed; using cached identity data when available.");
      return cached == null ? Map.of() : cached.claims();
    }
  }

  private void cache(String subject, Map<String, Object> claims) {
    synchronized (cache) {
      long now = currentTimeMillis.getAsLong();
      cache.put(subject, new CachedEntry(claims, now));
      cache.entrySet().removeIf(entry -> entry.getValue().isExpired(now, cacheTtl));
      while (cache.size() > cacheMaxSize) {
        cache.entrySet().stream()
            .min(
                Comparator.<Map.Entry<String, CachedEntry>>comparingLong(
                        entry -> entry.getValue().insertedAt())
                    .thenComparing(Map.Entry::getKey))
            .ifPresent(entry -> cache.remove(entry.getKey(), entry.getValue()));
      }
    }
  }

  private record CachedEntry(Map<String, Object> claims, long insertedAt) {
    boolean isExpired(long now, Duration ttl) {
      return now - insertedAt > ttl.toMillis();
    }
  }
}

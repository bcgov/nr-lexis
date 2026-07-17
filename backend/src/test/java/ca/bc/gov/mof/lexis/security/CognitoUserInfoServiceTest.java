package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

@ExtendWith(MockitoExtension.class)
class CognitoUserInfoServiceTest {

  private static final String USER_INFO_URI = "https://identity.example.test/oauth2/userInfo";

  @Mock private RestTemplate restTemplate;

  @Test
  void shouldReturnExpiredCachedUserInfoWhenRefreshFails() {
    AtomicLong now = new AtomicLong(1_000L);
    CognitoUserInfoService service =
        new CognitoUserInfoService(
            USER_INFO_URI,
            restTemplate,
            Duration.ofMillis(100),
            2_000,
            now::get);
    Jwt accessToken = jwt("human-subject", "human-token");
    Map<String, Object> stableClaims =
        Map.of(
            "custom:idp_name", "idir",
            "custom:idp_username", "cached-user");
    when(exchange())
        .thenReturn(ResponseEntity.ok(stableClaims))
        .thenThrow(new RestClientException("userinfo unavailable"));

    assertThat(service.getUserInfo(accessToken)).isEqualTo(stableClaims);
    now.addAndGet(101L);
    assertThat(service.getUserInfo(accessToken)).isEqualTo(stableClaims);
    verify(restTemplate, times(2))
        .exchange(
            eq(USER_INFO_URI),
            eq(HttpMethod.GET),
            any(HttpEntity.class),
            any(ParameterizedTypeReference.class));
  }

  @Test
  void shouldEvictOldestEntryWhenCacheReachesTwoThousandWithoutExpiredEntries() {
    AtomicLong now = new AtomicLong();
    AtomicBoolean remoteUnavailable = new AtomicBoolean();
    CognitoUserInfoService service =
        new CognitoUserInfoService(
            USER_INFO_URI,
            restTemplate,
            Duration.ofDays(1),
            2_000,
            now::get);
    when(exchange())
        .thenAnswer(
            invocation -> {
              if (remoteUnavailable.get()) {
                throw new RestClientException("userinfo unavailable");
              }
              return ResponseEntity.ok(Map.of("custom:idp_username", "cached-user"));
            });

    for (int index = 0; index <= 2_000; index++) {
      now.set(index);
      assertThat(service.getUserInfo(jwt(subject(index), "token-" + index))).isNotEmpty();
    }

    Object cacheField = ReflectionTestUtils.getField(service, "cache");
    assertThat(cacheField).isInstanceOf(ConcurrentHashMap.class);
    assertThat((ConcurrentHashMap<?, ?>) cacheField).hasSize(2_000);

    remoteUnavailable.set(true);
    assertThat(service.getUserInfo(jwt(subject(0), "evicted-token"))).isEmpty();
    assertThat(service.getUserInfo(jwt(subject(1), "cached-token"))).isNotEmpty();
    verify(restTemplate, times(2_002))
        .exchange(
            eq(USER_INFO_URI),
            eq(HttpMethod.GET),
            any(HttpEntity.class),
            any(ParameterizedTypeReference.class));
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private ResponseEntity<Map<String, Object>> exchange() {
    return restTemplate.exchange(
        eq(USER_INFO_URI),
        eq(HttpMethod.GET),
        any(HttpEntity.class),
        any(ParameterizedTypeReference.class));
  }

  private String subject(int index) {
    return "subject-" + String.format("%04d", index);
  }

  private Jwt jwt(String subject, String tokenValue) {
    Instant now = Instant.now();
    return new Jwt(
        tokenValue,
        now,
        now.plusSeconds(3_600),
        Map.of("alg", "none"),
        Map.of(
            "sub", subject,
            "token_use", "access"));
  }
}

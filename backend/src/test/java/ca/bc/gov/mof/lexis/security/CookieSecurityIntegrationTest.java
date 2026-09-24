package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "server.address=127.0.0.1",
      "lexis.auth.oidc.client-id=lexis-test",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://loginproxy.example.test/auth/realms/standard",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://loginproxy.example.test/auth/realms/standard/protocol/openid-connect/certs",
      "spring.profiles.active=stub-reports,stub-services"
    })
@AutoConfigureMockMvc
@Import(CookieSecurityIntegrationTest.SessionFixtureConfiguration.class)
class CookieSecurityIntegrationTest {

  private static final String CAPABILITIES = "/api/lexis/session/capabilities";
  private static final String LOGOFF = "/api/lexis/session/logoff";

  @Autowired private MockMvc mvc;
  @LocalServerPort private int port;

  @Test
  void unauthorizedApiNavigationDoesNotCreateASavedRequestSession() throws Exception {
    var result =
        mvc.perform(get(CAPABILITIES).accept(MediaType.TEXT_HTML).secure(true))
            .andExpect(status().isUnauthorized())
            .andReturn();

    assertThat(result.getRequest().getSession(false)).isNull();
    assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
        .noneMatch(value -> value.startsWith("JSESSIONID="));
  }

  @Test
  void csrfCookieIsSecureOnHttpsLaxAndStillReadableByTheSpa() throws Exception {
    var response = getFromServer(CAPABILITIES, true);

    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE))
        .anySatisfy(
            value ->
                assertThat(value)
                    .startsWith("XSRF-TOKEN=")
                    .contains("Path=/", "Secure", "SameSite=Lax")
                    .doesNotContain("HttpOnly"));
  }

  @Test
  void csrfCookieRemainsUsableForLocalHttpDevelopment() throws Exception {
    var response = getFromServer(CAPABILITIES, false);

    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE))
        .anySatisfy(
            value ->
                assertThat(value)
                    .startsWith("XSRF-TOKEN=")
                    .contains("SameSite=Lax")
                    .doesNotContain("Secure", "HttpOnly"));
  }

  @Test
  void nonBearerRequestsRequireTheRealCsrfCookieAndHeaderAndStillInvalidateSessions() throws Exception {
    Cookie csrfCookie =
        mvc.perform(get(CAPABILITIES).secure(true))
            .andReturn()
            .getResponse()
            .getCookie("XSRF-TOKEN");
    assertThat(csrfCookie).isNotNull();
    // jwt() deliberately skips CSRF. Inject only Authentication here to exercise non-bearer CSRF.
    var token = Jwt.withTokenValue("test-only").header("alg", "RS256").subject("test-reader").build();
    var reader =
        authentication(
            new JwtAuthenticationToken(
                token, List.of(new SimpleGrantedAuthority("LEXIS_READ_ONLY"))));

    mvc.perform(post(LOGOFF).secure(true).with(reader)).andExpect(status().isForbidden());
    mvc.perform(
            post(LOGOFF)
                .secure(true)
                .with(reader)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", "incorrect-token"))
        .andExpect(status().isForbidden());

    MockHttpSession existingSession = new MockHttpSession();
    mvc.perform(
            post(LOGOFF)
                .secure(true)
                .with(reader)
                .session(existingSession)
                .cookie(csrfCookie)
                .header("X-XSRF-TOKEN", csrfCookie.getValue()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.sessionInvalidated").value(true));
    assertThat(existingSession.isInvalid()).isTrue();
  }

  @Test
  void retainedServletSessionsHaveSecureHttpOnlyLaxCookiesOnTheRealServer() throws Exception {
    var response = getFromServer("/test/session-cookie", false);
    assertThat(response.statusCode()).isEqualTo(200);
    assertThat(response.headers().allValues(HttpHeaders.SET_COOKIE))
        .anySatisfy(
            value ->
                assertThat(value)
                    .startsWith("JSESSIONID=")
                    .containsIgnoringCase("secure")
                    .containsIgnoringCase("httponly")
                    .containsIgnoringCase("samesite=lax"));
    assertThat(response.body()).doesNotContain("jsessionid");
  }

  private HttpResponse<String> getFromServer(String path, boolean forwardedHttps) throws Exception {
    try (HttpClient client = HttpClient.newHttpClient()) {
      var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
      if (forwardedHttps) {
        request.header("X-Forwarded-Proto", "https");
      }
      return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class SessionFixtureConfiguration {
    @Bean
    @Order(-1)
    SecurityFilterChain sessionFixtureChain(HttpSecurity http) throws Exception {
      return http
          .securityMatcher("/test/session-cookie")
          .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
          .build();
    }

    @Bean
    SessionFixtureController sessionFixtureController() {
      return new SessionFixtureController();
    }
  }

  @RestController
  static class SessionFixtureController {
    @GetMapping("/test/session-cookie")
    String createSession(HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
      request.getSession();
      return response.encodeURL("/session-target");
    }
  }
}

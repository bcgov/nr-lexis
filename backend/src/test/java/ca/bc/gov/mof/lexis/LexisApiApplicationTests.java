package ca.bc.gov.mof.lexis;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "lexis.auth.oidc.client-id=lexis-test",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://loginproxy.example.test/auth/realms/standard",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://loginproxy.example.test/auth/realms/standard/protocol/openid-connect/certs"
    })
class LexisApiApplicationTests {

  @Test
  void contextLoads() {
  }
}

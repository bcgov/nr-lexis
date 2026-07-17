package ca.bc.gov.mof.lexis;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    properties = {
      "spring.profiles.active=stub-reports,stub-services",
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
    })
class LexisApiApplicationTests {

  @Test
  void contextLoads() {
  }
}

package ca.bc.gov.mof.lexis.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

class InteractiveJwtDeploymentConfigTest {

  private static final String ISSUER = "https://loginproxy.example.test/auth/realms/standard";

  /**
   * The OpenShift template supplies only the issuer. Boot still builds its own JWK-set decoder
   * whenever the jwk-set-uri property exists, and an empty value fails startup.
   */
  @Test
  void deployedIssuerAloneShouldStartTheResourceServer() {
    new WebApplicationContextRunner()
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withConfiguration(
            AutoConfigurations.of(
                SecurityAutoConfiguration.class, OAuth2ResourceServerAutoConfiguration.class))
        .withPropertyValues("LEXIS_OIDC_ISSUER_URI=" + ISSUER)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(
                      context
                          .getEnvironment()
                          .getProperty("spring.security.oauth2.resourceserver.jwt.jwk-set-uri"))
                  .isEqualTo(ISSUER + "/protocol/openid-connect/certs");
            });
  }
}

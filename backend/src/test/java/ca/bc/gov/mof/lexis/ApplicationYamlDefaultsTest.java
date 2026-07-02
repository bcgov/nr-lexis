package ca.bc.gov.mof.lexis;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

class ApplicationYamlDefaultsTest {

  @Test
  void applicationYamlShouldKeepFsptsAlignedSmtpDefaults() {
    Properties properties = loadApplicationYaml();

    assertThat(properties)
        .containsEntry("spring.mail.host", "${SMTP_HOST:apps.smtp.gov.bc.ca}")
        .containsEntry("spring.mail.port", "${SMTP_PORT:25}")
        .containsEntry("spring.mail.properties.mail.smtp.auth", false)
        .containsEntry("spring.mail.properties.mail.smtp.starttls.enable", false)
        .containsEntry(
            "lexis.mail.from", "${LEXIS_MAIL_FROM:Provincial.Log.Export.Analyst@gov.bc.ca}");
  }

  @Test
  void applicationYamlShouldNotRequireSmtpCredentialsOrReplyAddress() {
    Properties properties = loadApplicationYaml();

    assertThat(properties)
        .doesNotContainKeys(
            "spring.mail.username",
            "spring.mail.password",
            "spring.mail.properties.mail.smtp.user",
            "spring.mail.properties.mail.smtp.password",
            "spring.mail.properties.mail.smtp.reply-to",
            "spring.mail.properties.mail.smtp.replyTo",
            "lexis.mail.reply-to",
            "lexis.mail.replyTo");
  }

  @Test
  void applicationYamlShouldKeepFamUserAccessLookupOptional() {
    Properties properties = loadApplicationYaml();

    assertThat(properties)
        .containsEntry("lexis.fam.admin.base-url", "${LEXIS_FAM_ADMIN_BASE_URL:${FAM_ADMIN_BASE_URL:}}")
        .containsEntry("lexis.fam.admin.application-id", "${LEXIS_FAM_APPLICATION_ID:}");
  }

  private static Properties loadApplicationYaml() {
    YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
    factory.setResources(new ClassPathResource("application.yml"));
    Properties properties = factory.getObject();
    assertThat(properties).isNotNull();
    return properties;
  }
}

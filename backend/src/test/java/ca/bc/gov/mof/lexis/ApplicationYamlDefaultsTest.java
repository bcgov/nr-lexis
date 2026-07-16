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
        .containsEntry(
            "spring.mail.properties.mail.smtp.connectiontimeout",
            "${SMTP_CONNECTION_TIMEOUT_MS:10000}")
        .containsEntry(
            "spring.mail.properties.mail.smtp.timeout", "${SMTP_READ_TIMEOUT_MS:10000}")
        .containsEntry(
            "spring.mail.properties.mail.smtp.writetimeout", "${SMTP_WRITE_TIMEOUT_MS:10000}")
        .containsEntry("spring.mail.properties.mail.smtp.starttls.enable", false)
        .containsEntry("spring.servlet.multipart.max-file-size", "20MB")
        .containsEntry("spring.servlet.multipart.max-request-size", "21MB")
        .containsEntry(
            "lexis.permit-invoice.gbms-timeout-seconds",
            "${LEXIS_PERMIT_INVOICE_GBMS_TIMEOUT_SECONDS:60}")
        .containsEntry(
            "lexis.permit-invoice.mode", "${LEXIS_PERMIT_INVOICE_MODE:legacy-best-effort}")
        .containsEntry("lexis.mail.from", "${LEXIS_MAIL_FROM:}")
        .containsEntry(
            "lexis.mail.applicant-email-capture-enabled",
            "${LEXIS_MAIL_APPLICANT_EMAIL_CAPTURE_ENABLED:false}")
        .containsEntry("lexis.mail.environment", "${LEXIS_MAIL_ENVIRONMENT:non-prod}")
        .containsEntry(
            "lexis.mail.region-rco-recipients", "${LEXIS_MAIL_REGION_RCO_RECIPIENTS:}")
        .containsEntry(
            "lexis.mail.region-rni-recipients", "${LEXIS_MAIL_REGION_RNI_RECIPIENTS:}")
        .containsEntry(
            "lexis.mail.region-rsi-recipients", "${LEXIS_MAIL_REGION_RSI_RECIPIENTS:}")
        .containsEntry(
            "lexis.mail.permit-request-recipients",
            "${LEXIS_MAIL_PERMIT_REQUEST_RECIPIENTS:}")
        .containsEntry(
            "logging.level.ca.bc.gov.mof.lexis.audit.report",
            "${LEXIS_REPORT_STATISTICS_LOG_LEVEL:INFO}")
        .containsEntry(
            "logging.level.ca.bc.gov.mof.lexis.service.report.OracleLexisReportService",
            "${LEXIS_REPORT_STATISTICS_LOG_LEVEL:INFO}");
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
        .containsEntry("ca.bc.gov.nrs.identity-lookup.base-url", "${IDENTITY_LOOKUP_BASE_URL:}")
        .doesNotContainKeys(
            "lexis.fam.admin.base-url",
            "lexis.fam.admin.application-id",
            "lexis.fam.admin.connect-timeout",
            "lexis.fam.admin.read-timeout");
  }

  private static Properties loadApplicationYaml() {
    YamlPropertiesFactoryBean factory = new YamlPropertiesFactoryBean();
    factory.setResources(new ClassPathResource("application.yml"));
    Properties properties = factory.getObject();
    assertThat(properties).isNotNull();
    return properties;
  }
}

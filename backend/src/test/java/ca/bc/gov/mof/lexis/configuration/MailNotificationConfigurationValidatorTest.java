package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

class MailNotificationConfigurationValidatorTest {

  @Test
  void validatorShouldOnlyRunWithTheOracleProfile() {
    assertThat(MailNotificationConfigurationValidator.class.getAnnotation(Profile.class).value())
        .containsExactly("oracle");
  }

  @Test
  void nonProductionMailShouldAllowNoOverrideOrRegionalRecipients() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true, "sender@example.com", "", "", "", "", ""))
        .doesNotThrowAnyException();
  }

  @Test
  void nonProductionMailShouldAcceptOptionalOverrideAndRegionalRecipients() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    "sender@example.com",
                    "admin.one@gov.bc.ca;admin.two@gov.bc.ca",
                    "",
                    "coast.reviewers@gov.bc.ca",
                    "north.reviewers@gov.bc.ca",
                    "south.reviewers@gov.bc.ca"))
        .doesNotThrowAnyException();
  }

  @Test
  void productionMailShouldAcceptFallbackWithoutAnOverride() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
                    "sender@example.com",
                    "",
                    "reviewers@gov.bc.ca",
                    "",
                    "",
                    ""))
        .doesNotThrowAnyException();
  }

  @Test
  void productionMailShouldAcceptAllRegionalRecipientsWithoutFallback() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
                    "sender@example.com",
                    "",
                    "",
                    "coast.reviewers@gov.bc.ca",
                    "north.reviewers@gov.bc.ca",
                    "south.reviewers@gov.bc.ca"))
        .doesNotThrowAnyException();
  }

  @Test
  void productionMailShouldRejectAnOverride() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
                    "sender@example.com",
                    "test-recipient@gov.bc.ca",
                    "",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Production mail must not configure override recipients.");
  }

  @Test
  void mailShouldRejectAnInvalidFromAddress() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true, "invalid", "", "", "", "", ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid from address.");
  }

  @Test
  void mailShouldRejectMissingFromAddress() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true, "", "", "", "", "", ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid from address.");
  }

  @Test
  void nonProductionMailShouldRejectAnInvalidConfiguredOverride() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    "sender@example.com",
                    "admin@gov.bc.ca;invalid",
                    "reviewers@gov.bc.ca",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Non-production mail override recipients must be valid when configured.");
  }

  @Test
  void productionMailShouldRejectMissingRegionalAndFallbackRecipients() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
                    "sender@example.com",
                    "",
                    "",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage(
            "Production mail requires all regional recipient lists or fallback permit-review recipients.");
  }

  @Test
  void mailShouldRejectBlankEntriesInConfiguredRecipientLists() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    "sender@example.com",
                    "",
                    "review.one@gov.bc.ca,,review.two@gov.bc.ca",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires valid fallback permit-review recipients when configured.");
  }

  @Test
  void productionMailShouldAllowRegionalMigrationThroughFallback() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
                    "sender@example.com",
                    "",
                    "reviewers@gov.bc.ca",
                    "coast.reviewers@gov.bc.ca",
                    "",
                    ""))
        .doesNotThrowAnyException();
  }

  @Test
  void mailShouldRejectAnInvalidConfiguredRegion() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    "sender@example.com",
                    "",
                    "",
                    "invalid",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires valid RCO recipients when configured.");
  }
}

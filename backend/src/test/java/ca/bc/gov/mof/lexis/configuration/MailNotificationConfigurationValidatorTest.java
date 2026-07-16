package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MailNotificationConfigurationValidatorTest {

  @Test
  void disabledMailShouldNotRequireRecipientConfiguration() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    false, true, "invalid", "", "", "", "", ""))
        .doesNotThrowAnyException();
  }

  @Test
  void enabledNonProductionMailShouldAcceptCompleteConfiguration() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
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
  void enabledProductionMailShouldNotRequireAnOverride() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
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
  void productionMailShouldRejectAnOverrideEvenWhenDeliveryIsDisabled() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    false,
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
  void enabledMailShouldRejectAnInvalidFromAddress() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true, false, "invalid", "", "reviewers@gov.bc.ca", "", "", ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires one valid from address.");
  }

  @Test
  void enabledMailShouldRejectMissingFromAddress() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true, false, "", "", "reviewers@gov.bc.ca", "", "", ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires one valid from address.");
  }

  @Test
  void enabledNonProductionMailShouldRejectMissingOrInvalidOverrides() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    true,
                    "sender@example.com",
                    "admin@gov.bc.ca;invalid",
                    "reviewers@gov.bc.ca",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled non-production mail requires valid override recipients.");
  }

  @Test
  void enabledMailShouldRejectMissingRegionalAndFallbackRecipients() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "sender@example.com",
                    "",
                    "",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage(
            "Enabled mail requires all regional recipient lists or fallback permit-review recipients.");
  }

  @Test
  void enabledMailShouldRejectBlankEntriesInRecipientLists() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "sender@example.com",
                    "",
                    "review.one@gov.bc.ca,,review.two@gov.bc.ca",
                    "",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires valid fallback permit-review recipients.");
  }

  @Test
  void enabledMailShouldAllowRegionalMigrationThroughFallback() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
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
  void enabledMailShouldRejectAnInvalidConfiguredRegion() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "sender@example.com",
                    "",
                    "reviewers@gov.bc.ca",
                    "invalid",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires valid RCO recipients.");
  }
}

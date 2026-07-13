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
                    false, true, "invalid", "", ""))
        .doesNotThrowAnyException();
  }

  @Test
  void enabledNonProductionMailShouldAcceptCompleteConfiguration() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    true,
                    "Provincial.Log.Export.Analyst@gov.bc.ca",
                    "admin.one@gov.bc.ca;admin.two@gov.bc.ca",
                    "reviewers@gov.bc.ca"))
        .doesNotThrowAnyException();
  }

  @Test
  void enabledProductionMailShouldNotRequireAnOverride() {
    assertThatCode(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "Provincial.Log.Export.Analyst@gov.bc.ca",
                    "",
                    "reviewers@gov.bc.ca"))
        .doesNotThrowAnyException();
  }

  @Test
  void enabledMailShouldRejectAnInvalidFromAddress() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true, false, "invalid", "", "reviewers@gov.bc.ca"))
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
                    "Provincial.Log.Export.Analyst@gov.bc.ca",
                    "admin@gov.bc.ca;invalid",
                    "reviewers@gov.bc.ca"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled non-production mail requires valid override recipients.");
  }

  @Test
  void enabledMailShouldRejectMissingPermitReviewRecipients() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "Provincial.Log.Export.Analyst@gov.bc.ca",
                    "",
                    ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires valid permit-review recipients.");
  }

  @Test
  void enabledMailShouldRejectBlankEntriesInRecipientLists() {
    assertThatThrownBy(
            () ->
                new MailNotificationConfigurationValidator(
                    true,
                    false,
                    "Provincial.Log.Export.Analyst@gov.bc.ca",
                    "",
                    "review.one@gov.bc.ca,,review.two@gov.bc.ca"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Enabled mail requires valid permit-review recipients.");
  }
}

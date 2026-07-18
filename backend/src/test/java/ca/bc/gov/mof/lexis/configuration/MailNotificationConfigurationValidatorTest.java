package ca.bc.gov.mof.lexis.configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Profile;

class MailNotificationConfigurationValidatorTest {

  private static final String PROVINCIAL = "provincial@example.com";
  private static final String RCO = "rco@example.com";
  private static final String RNI = "rni@example.com";
  private static final String RSI = "rsi@example.com";

  @Test
  void validatorShouldOnlyRunWithTheOracleProfile() {
    assertThat(MailNotificationConfigurationValidator.class.getAnnotation(Profile.class).value())
        .containsExactly("oracle");
  }

  @Test
  void nonProductionMailShouldRequireAndAcceptAllPositionalMailboxes() {
    assertThatCode(() -> validator(true, "")).doesNotThrowAnyException();
  }

  @Test
  void nonProductionMailShouldAcceptAnOptionalOverride() {
    assertThatCode(() -> validator(true, "admin.one@gov.bc.ca;admin.two@gov.bc.ca"))
        .doesNotThrowAnyException();
  }

  @Test
  void productionMailShouldAcceptAllPositionalMailboxesWithoutAnOverride() {
    assertThatCode(() -> validator(false, "")).doesNotThrowAnyException();
  }

  @Test
  void productionMailShouldRejectAnOverride() {
    assertThatThrownBy(() -> validator(false, "test-recipient@gov.bc.ca"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Production mail must not configure override recipients.");
  }

  @Test
  void mailShouldRejectAnInvalidFromAddress() {
    assertThatThrownBy(() -> new MailNotificationConfigurationValidator(true, "invalid", "", RCO, RNI, RSI))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid from address.");
  }

  @Test
  void mailShouldRejectMissingRcoMailbox() {
    assertThatThrownBy(() -> new MailNotificationConfigurationValidator(true, PROVINCIAL, "", "", RNI, RSI))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid RCO positional mailbox address.");
  }

  @Test
  void mailShouldRejectAnInvalidRniMailbox() {
    assertThatThrownBy(
            () -> new MailNotificationConfigurationValidator(true, PROVINCIAL, "", RCO, "invalid", RSI))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid RNI positional mailbox address.");
  }

  @Test
  void mailShouldRejectMissingRsiMailbox() {
    assertThatThrownBy(() -> new MailNotificationConfigurationValidator(true, PROVINCIAL, "", RCO, RNI, ""))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Mail requires one valid RSI positional mailbox address.");
  }

  @Test
  void nonProductionMailShouldRejectAnInvalidConfiguredOverride() {
    assertThatThrownBy(() -> validator(true, "admin@gov.bc.ca;invalid"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Non-production mail override recipients must be valid when configured.");
  }

  private static MailNotificationConfigurationValidator validator(
      boolean nonProduction, String overrideRecipients) {
    return new MailNotificationConfigurationValidator(
        nonProduction, PROVINCIAL, overrideRecipients, RCO, RNI, RSI);
  }
}

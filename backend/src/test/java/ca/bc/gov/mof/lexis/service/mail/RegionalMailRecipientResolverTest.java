package ca.bc.gov.mof.lexis.service.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RegionalMailRecipientResolverTest {

  @ParameterizedTest
  @MethodSource("regionalOrgUnits")
  void shouldResolveTheConfiguredRegionForEachLegacyOrgUnit(
      Long orgUnitNumber, String expectedLabel, String expectedRecipient) {
    RegionalMailRecipientResolver resolver = resolver("rco@test.ca", "rni@test.ca", "rsi@test.ca");

    RegionalMailRecipientResolver.RecipientGroup group = resolver.resolveGroup(orgUnitNumber);

    assertThat(group.label()).isEqualTo(expectedLabel);
    assertThat(group.recipients()).containsExactly(expectedRecipient);
  }

  @Test
  void shouldTrimConfiguredPositionalMailboxAddress() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver(" rco@test.ca ", "", "");

    List<String> recipients = resolver.resolveGroup(1835L).recipients();

    assertThat(recipients).containsExactly("rco@test.ca");
    assertThatThrownBy(() -> recipients.add("other@test.ca"))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void shouldRetainKnownRouteWhenItsMailboxIsNotConfigured() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("rco@test.ca", " ", "rsi@test.ca");

    RegionalMailRecipientResolver.RecipientGroup group = resolver.resolveGroup(1906L);

    assertThat(group.label()).isEqualTo("REGION_RNI");
    assertThat(group.recipients()).isEmpty();
  }

  @Test
  void shouldRemainUnroutableForUnknownOrMissingOrgUnit() {
    RegionalMailRecipientResolver resolver = new RegionalMailRecipientResolver("", "", "");

    assertThat(resolver.resolveGroup(9999L).label()).isNull();
    assertThat(resolver.resolveGroup(null).label()).isNull();
  }

  @Test
  void shouldResolveAnAddressByRoute() {
    RegionalMailRecipientResolver resolver = resolver("rco@test.ca", "rni@test.ca", "rsi@test.ca");

    assertThat(resolver.addressFor(RegionalMailRoute.RCO)).contains("rco@test.ca");
    assertThat(resolver.addressFor(RegionalMailRoute.RNI)).contains("rni@test.ca");
    assertThat(resolver.addressFor(RegionalMailRoute.RSI)).contains("rsi@test.ca");
    assertThat(resolver.addressFor(null)).isEmpty();
  }

  private static RegionalMailRecipientResolver resolver(String rco, String rni, String rsi) {
    return new RegionalMailRecipientResolver(rco, rni, rsi);
  }

  private static Stream<Arguments> regionalOrgUnits() {
    return Stream.of(
        Arguments.of(1835L, "REGION_RCO", "rco@test.ca"),
        Arguments.of(1909L, "REGION_RCO", "rco@test.ca"),
        Arguments.of(1910L, "REGION_RCO", "rco@test.ca"),
        Arguments.of(1833L, "REGION_RNI", "rni@test.ca"),
        Arguments.of(1905L, "REGION_RNI", "rni@test.ca"),
        Arguments.of(1906L, "REGION_RNI", "rni@test.ca"),
        Arguments.of(1908L, "REGION_RNI", "rni@test.ca"),
        Arguments.of(1834L, "REGION_RSI", "rsi@test.ca"),
        Arguments.of(1903L, "REGION_RSI", "rsi@test.ca"),
        Arguments.of(1904L, "REGION_RSI", "rsi@test.ca"),
        Arguments.of(1907L, "REGION_RSI", "rsi@test.ca"));
  }
}

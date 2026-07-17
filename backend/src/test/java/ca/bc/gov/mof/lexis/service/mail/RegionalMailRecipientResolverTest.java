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
  void shouldParseTrimAndDeduplicateRecipientLists() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver(
            " first@test.ca;second@test.ca, first@test.ca ; ; ", "", "", "fallback@test.ca");

    List<String> recipients = resolver.resolveGroup(1835L).recipients();

    assertThat(recipients).containsExactly("first@test.ca", "second@test.ca");
    assertThatThrownBy(() -> recipients.add("other@test.ca"))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void shouldUseMigrationFallbackWhenARegionIsNotConfigured() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver(
            "rco@test.ca", " ", "rsi@test.ca", " fallback@test.ca; fallback@test.ca ");

    RegionalMailRecipientResolver.RecipientGroup group = resolver.resolveGroup(1906L);

    assertThat(group.label()).isEqualTo("PERMIT_REQUEST");
    assertThat(group.recipients()).containsExactly("fallback@test.ca");
  }

  @Test
  void shouldUseMigrationFallbackWhenTheOrgUnitIsUnknownOrMissing() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("", "", "", "fallback@test.ca");

    assertThat(resolver.resolveGroup(9999L).label()).isEqualTo("PERMIT_REQUEST");
    assertThat(resolver.resolveGroup(null).label()).isEqualTo("PERMIT_REQUEST");
  }

  @Test
  void shouldRetainKnownRegionWhenNeitherRegionalNorFallbackRecipientsAreConfigured() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("", "", "", "");

    RegionalMailRecipientResolver.RecipientGroup group = resolver.resolveGroup(1835L);

    assertThat(group.label()).isEqualTo("REGION_RCO");
    assertThat(group.recipients()).isEmpty();
  }

  @Test
  void shouldRemainUnroutableForUnknownOrgUnitWithoutFallbackRecipients() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("", "", "", "");

    RegionalMailRecipientResolver.RecipientGroup group = resolver.resolveGroup(9999L);

    assertThat(group.label()).isNull();
    assertThat(group.recipients()).isEmpty();
  }

  private static RegionalMailRecipientResolver resolver(String rco, String rni, String rsi) {
    return new RegionalMailRecipientResolver(rco, rni, rsi, "fallback@test.ca");
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

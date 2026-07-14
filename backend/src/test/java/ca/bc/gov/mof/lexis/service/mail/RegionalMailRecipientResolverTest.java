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
      Long orgUnitNumber, String expectedRecipient) {
    RegionalMailRecipientResolver resolver = resolver("rco@test.ca", "rni@test.ca", "rsi@test.ca");

    assertThat(resolver.resolve(orgUnitNumber)).containsExactly(expectedRecipient);
  }

  @Test
  void shouldParseTrimAndDeduplicateRecipientLists() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver(
            " first@test.ca;second@test.ca, first@test.ca ; ; ", "", "", "fallback@test.ca");

    List<String> recipients = resolver.resolve(1835L);

    assertThat(recipients).containsExactly("first@test.ca", "second@test.ca");
    assertThatThrownBy(() -> recipients.add("other@test.ca"))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void shouldUseMigrationFallbackWhenARegionIsNotConfigured() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver(
            "rco@test.ca", " ", "rsi@test.ca", " fallback@test.ca; fallback@test.ca ");

    assertThat(resolver.resolve(1906L)).containsExactly("fallback@test.ca");
  }

  @Test
  void shouldUseMigrationFallbackWhenTheOrgUnitIsUnknownOrMissing() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("", "", "", "fallback@test.ca");

    assertThat(resolver.resolve(9999L)).containsExactly("fallback@test.ca");
    assertThat(resolver.resolve(null)).containsExactly("fallback@test.ca");
  }

  @Test
  void shouldReturnEmptyWhenNeitherRegionalNorFallbackRecipientsAreConfigured() {
    RegionalMailRecipientResolver resolver =
        new RegionalMailRecipientResolver("", "", "", "");

    assertThat(resolver.resolve(1835L)).isEmpty();
  }

  private static RegionalMailRecipientResolver resolver(String rco, String rni, String rsi) {
    return new RegionalMailRecipientResolver(rco, rni, rsi, "fallback@test.ca");
  }

  private static Stream<Arguments> regionalOrgUnits() {
    return Stream.of(
        Arguments.of(1835L, "rco@test.ca"),
        Arguments.of(1909L, "rco@test.ca"),
        Arguments.of(1910L, "rco@test.ca"),
        Arguments.of(1833L, "rni@test.ca"),
        Arguments.of(1905L, "rni@test.ca"),
        Arguments.of(1906L, "rni@test.ca"),
        Arguments.of(1908L, "rni@test.ca"),
        Arguments.of(1834L, "rsi@test.ca"),
        Arguments.of(1903L, "rsi@test.ca"),
        Arguments.of(1904L, "rsi@test.ca"),
        Arguments.of(1907L, "rsi@test.ca"));
  }
}

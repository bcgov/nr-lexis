package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LegacyApplicationRemarkCodecTest {

  @Test
  void legacyEncodedRemarksShouldBeReturnedAsPlainText() {
    assertThat(LegacyApplicationRemarkCodec.decode("A &amp; B; volume &lt; 10; owner &gt; agent"))
        .isEqualTo("A & B; volume < 10; owner > agent");
    assertThat(LegacyApplicationRemarkCodec.encode("A & B; volume < 10; owner > agent"))
        .isEqualTo("A &amp; B; volume &lt; 10; owner &gt; agent");
  }

  @ParameterizedTest
  @ValueSource(strings = {"A & B", "<b>A & B</b>", "Literal &amp; &lt; &gt;", "Plain note", "", "&copy; &#39;"})
  void enteredTextShouldSurviveExactlyOneStorageRoundTrip(String text) {
    assertThat(LegacyApplicationRemarkCodec.decode(LegacyApplicationRemarkCodec.encode(text)))
        .isEqualTo(text);
  }

  @Test
  void decodingShouldPreservePlainRecordsAndOnlyDecodeOneLegacyLayer() {
    assertThat(LegacyApplicationRemarkCodec.decode("A & B; <b>plain text</b>; &copy; &#39;"))
        .isEqualTo("A & B; <b>plain text</b>; &copy; &#39;");
    assertThat(LegacyApplicationRemarkCodec.decode("Literal &amp;amp; &amp;lt; &amp;gt;"))
        .isEqualTo("Literal &amp; &lt; &gt;");
    assertThat(LegacyApplicationRemarkCodec.decode(null)).isNull();
    assertThat(LegacyApplicationRemarkCodec.encode(null)).isNull();
  }

  @Test
  void storageLimitShouldIncludeExpandedSpecialCharacters() {
    assertThat(LegacyApplicationRemarkCodec.fitsStorage("&".repeat(50), 250)).isTrue();
    assertThat(LegacyApplicationRemarkCodec.fitsStorage("&".repeat(50) + "abcd", 254)).isTrue();
    assertThat(LegacyApplicationRemarkCodec.fitsStorage("x".repeat(254), 254)).isTrue();
    assertThat(LegacyApplicationRemarkCodec.fitsStorage("&".repeat(51), 254)).isFalse();
    assertThat(LegacyApplicationRemarkCodec.fitsStorage("&".repeat(50) + "abcde", 254)).isFalse();
  }
}

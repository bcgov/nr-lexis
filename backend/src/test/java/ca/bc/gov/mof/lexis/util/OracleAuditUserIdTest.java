package ca.bc.gov.mof.lexis.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class OracleAuditUserIdTest {

  @Test
  void shouldPreserveValidAsciiIdentitiesThatFitTheOracleColumn() {
    String thirtyBytes = "123456789012345678901234567890";

    assertThat(OracleAuditUserId.encode("  IDIR\\jsmith  ")).isEqualTo("IDIR\\jsmith");
    assertThat(OracleAuditUserId.encode("SERVICE\\lexis-api"))
        .isEqualTo("SERVICE\\lexis-api");
    assertThat(OracleAuditUserId.encode(thirtyBytes)).isEqualTo(thirtyBytes);
  }

  @Test
  void shouldRetainAbsentValueSemantics() {
    assertThat(OracleAuditUserId.encode(null)).isNull();
    assertThat(OracleAuditUserId.encode("  ")).isNull();
  }

  @Test
  void shouldDeterministicallyDistinguishLongPrincipalsWithTheSamePrefix() {
    String first = "BCEID\\shared-external-identity-prefix-alex";
    String second = "BCEID\\shared-external-identity-prefix-jamie";

    String firstEncoded = OracleAuditUserId.encode(first);
    String secondEncoded = OracleAuditUserId.encode(second);

    assertThat(firstEncoded)
        .isEqualTo(OracleAuditUserId.encode(first))
        .startsWith("BCEID\\shared-exte~")
        .hasSize(OracleAuditUserId.MAX_BYTES);
    assertThat(secondEncoded)
        .startsWith("BCEID\\shared-exte~")
        .hasSize(OracleAuditUserId.MAX_BYTES)
        .isNotEqualTo(firstEncoded);
  }

  @Test
  void shouldBoundProviderAndServicePrincipalsByAsciiBytes() {
    assertOracleSafe(OracleAuditUserId.encode("IDIR\\a-very-long-provider-user-identity"));
    assertOracleSafe(
        OracleAuditUserId.encode("SERVICE\\nr-lexis-long-machine-client-identity"));
  }

  @Test
  void shouldSanitizeNonAsciiWhileHashingTheCompleteIdentity() {
    String first = OracleAuditUserId.encode("IDIR\\josé-用户");
    String second = OracleAuditUserId.encode("IDIR\\josé-用戶");

    assertThat(first)
        .startsWith("IDIR\\jos_-_~")
        .isEqualTo(OracleAuditUserId.encode("IDIR\\josé-用户"));
    assertThat(second).startsWith("IDIR\\jos_-_~").isNotEqualTo(first);
    assertOracleSafe(first);
    assertOracleSafe(second);
  }

  @Test
  void shouldEncodeControlCharactersInsteadOfWritingThemToAuditColumns() {
    String encoded = OracleAuditUserId.encode("IDIR\\jsmith\nadmin");

    assertThat(encoded).startsWith("IDIR\\jsmith_admin~");
    assertOracleSafe(encoded);
  }

  private static void assertOracleSafe(String value) {
    assertThat(value).isNotNull().matches("[\\x20-\\x7E]+");
    assertThat(value.getBytes(StandardCharsets.US_ASCII).length)
        .isLessThanOrEqualTo(OracleAuditUserId.MAX_BYTES);
  }
}

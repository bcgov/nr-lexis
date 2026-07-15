package ca.bc.gov.mof.lexis.service.coordination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class OptimisticRecordVersionTest {

  @Test
  void tokenShouldRoundTripWithoutExposingTheExemptionIdentifierDirectly() {
    OptimisticRecordVersion version =
        new OptimisticRecordVersion(
            OptimisticRecordType.EXEMPTION,
            " ex-1 ",
            Instant.parse("2026-07-15T18:00:00Z"),
            "IDIR\\EDITOR",
            "ABC123");

    var parsed = OptimisticRecordVersion.parse('"' + version.token() + '"');

    assertThat(parsed.recordType()).isEqualTo(OptimisticRecordType.EXEMPTION);
    assertThat(parsed.recordId()).isEqualTo("EX-1");
    assertThat(parsed.savedAt()).isEqualTo(Instant.parse("2026-07-15T18:00:00Z"));
    assertThat(parsed.fingerprint()).isEqualTo("abc123");
    assertThat(parsed.token()).isEqualTo(version.token());
  }

  @Test
  void malformedTokenShouldFailClosed() {
    assertThatThrownBy(() -> OptimisticRecordVersion.parse("not-a-version"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("The record version is invalid.");
  }
}

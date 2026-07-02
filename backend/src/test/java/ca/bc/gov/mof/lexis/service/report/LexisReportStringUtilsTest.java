package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LexisReportStringUtilsTest {

  @Test
  void chompRemovesTrailingSeparator() {
    assertThat(LexisReportStringUtils.chomp("A, B, ", ", ")).isEqualTo("A, B");
  }

  @Test
  void chompLeavesValuesWithoutTrailingSeparatorUnchanged() {
    assertThat(LexisReportStringUtils.chomp("A, B", ", ")).isEqualTo("A, B");
    assertThat(LexisReportStringUtils.chomp(null, ", ")).isNull();
    assertThat(LexisReportStringUtils.chomp("A", "")).isEqualTo("A");
  }

  @Test
  void chopRemovesLastCharacterOrWindowsLineEnding() {
    assertThat(LexisReportStringUtils.chop("ABC")).isEqualTo("AB");
    assertThat(LexisReportStringUtils.chop("ABC\r\n")).isEqualTo("ABC");
  }
}

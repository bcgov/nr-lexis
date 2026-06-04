package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LexisReportStringUtilsTest {

  @Test
  void chompShouldRemoveTrailingSeparatorOnly() {
    assertThat(LexisReportStringUtils.chomp("RCB, RKB, ", ", ")).isEqualTo("RCB, RKB");
    assertThat(LexisReportStringUtils.chomp("RCB, RKB", ", ")).isEqualTo("RCB, RKB");
    assertThat(LexisReportStringUtils.chomp(null, ", ")).isNull();
  }

  @Test
  void chopShouldRemoveFinalCharacter() {
    assertThat(LexisReportStringUtils.chop("RCB,")).isEqualTo("RCB");
    assertThat(LexisReportStringUtils.chop("")).isEmpty();
    assertThat(LexisReportStringUtils.chop(null)).isNull();
  }
}

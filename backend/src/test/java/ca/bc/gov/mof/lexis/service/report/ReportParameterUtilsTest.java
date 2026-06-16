package ca.bc.gov.mof.lexis.service.report;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ReportParameterUtilsTest {

  @Test
  void firstReturnsValueForFirstPresentKeyWithoutTrimming() {
    Map<String, String> parameters = new HashMap<>();
    parameters.put("primary", null);
    parameters.put("fallback", " value ");

    assertThat(ReportParameterUtils.first(parameters, "primary", "fallback")).isNull();
    assertThat(ReportParameterUtils.first(parameters, "missing", "fallback")).isEqualTo(" value ");
  }

  @Test
  void firstReturnsNullWhenNoKeysArePresent() {
    assertThat(ReportParameterUtils.first(Map.of("region", "1"), "missing")).isNull();
  }

  @Test
  void firstNonBlankReturnsRawFirstNonblankValue() {
    Map<String, String> parameters = new HashMap<>();
    parameters.put("primary", " ");
    parameters.put("fallback", " value ");

    assertThat(ReportParameterUtils.firstNonBlank(parameters, "primary", "fallback"))
        .isEqualTo(" value ");
  }

  @Test
  void firstNonBlankReturnsNullWhenAllValuesAreBlankOrMissing() {
    assertThat(ReportParameterUtils.firstNonBlank(Map.of("primary", " "), "primary", "missing"))
        .isNull();
  }
}

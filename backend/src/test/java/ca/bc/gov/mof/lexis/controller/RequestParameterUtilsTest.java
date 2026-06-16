package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

class RequestParameterUtilsTest {

  @Test
  void firstReturnsNullForMissingInputs() {
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();

    assertThat(RequestParameterUtils.first(null, "applicationNumber")).isNull();
    assertThat(RequestParameterUtils.first(parameters, (String[]) null)).isNull();
    assertThat(RequestParameterUtils.first(parameters, "applicationNumber")).isNull();
  }

  @Test
  void firstSkipsBlankAndNullNamesBeforeReturningTrimmedValue() {
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("empty", "   ");
    parameters.add("applicationNumber", " 45963 ");

    assertThat(RequestParameterUtils.first(parameters, null, "empty", "applicationNumber"))
        .isEqualTo("45963");
  }

  @Test
  void firstUsesAliasesInOrder() {
    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("applicationNumber", "111");
    parameters.add("legacyApplicationNumber", "222");

    assertThat(
            RequestParameterUtils.first(
                parameters, "missing", "legacyApplicationNumber", "applicationNumber"))
        .isEqualTo("222");
  }

  @Test
  void parsePositiveLongRequiresPositiveNumericValue() {
    assertThat(RequestParameterUtils.parsePositiveLong(" 123 ")).isEqualTo(123L);
    assertThat(RequestParameterUtils.parsePositiveLong("0")).isNull();
    assertThat(RequestParameterUtils.parsePositiveLong("-1")).isNull();
    assertThat(RequestParameterUtils.parsePositiveLong("abc")).isNull();
    assertThat(RequestParameterUtils.parsePositiveLong(" ")).isNull();
  }

  @Test
  void parseNonNegativeLongAllowsZero() {
    assertThat(RequestParameterUtils.parseNonNegativeLong(" 0 ")).isZero();
    assertThat(RequestParameterUtils.parseNonNegativeLong("12")).isEqualTo(12L);
    assertThat(RequestParameterUtils.parseNonNegativeLong("-1")).isNull();
    assertThat(RequestParameterUtils.parseNonNegativeLong("abc")).isNull();
  }

  @Test
  void parseDoubleReturnsNullForBlankOrInvalidValues() {
    assertThat(RequestParameterUtils.parseDouble(" 12.5 ")).isEqualTo(12.5);
    assertThat(RequestParameterUtils.parseDouble(" ")).isNull();
    assertThat(RequestParameterUtils.parseDouble("abc")).isNull();
  }

  @Test
  void parseDateSupportsIsoAndLegacyDates() {
    assertThat(RequestParameterUtils.parseDate("2026-06-15"))
        .isEqualTo(LocalDate.of(2026, 6, 15));
    assertThat(RequestParameterUtils.parseDate(" 06/15/2026 "))
        .isEqualTo(LocalDate.of(2026, 6, 15));
    assertThat(RequestParameterUtils.parseDate("15/06/2026")).isNull();
    assertThat(RequestParameterUtils.parseDate(" ")).isNull();
  }

  @Test
  void sanitizeFileNameTrimsAndRemovesPathSegments() {
    assertThat(RequestParameterUtils.sanitizeFileName(" report.pdf ")).isEqualTo("report.pdf");
    assertThat(RequestParameterUtils.sanitizeFileName("/tmp/upload/report.pdf")).isEqualTo("report.pdf");
    assertThat(RequestParameterUtils.sanitizeFileName("C:\\tmp\\upload\\report.pdf")).isEqualTo("report.pdf");
  }

  @Test
  void sanitizeFileNameReturnsNullForBlankValuesAndPreservesTrailingSeparators() {
    assertThat(RequestParameterUtils.sanitizeFileName(null)).isNull();
    assertThat(RequestParameterUtils.sanitizeFileName(" ")).isNull();
    assertThat(RequestParameterUtils.sanitizeFileName("/tmp/upload/")).isEqualTo("/tmp/upload/");
  }
}

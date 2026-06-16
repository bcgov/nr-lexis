package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;

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
}

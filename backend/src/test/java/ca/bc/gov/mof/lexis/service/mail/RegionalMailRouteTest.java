package ca.bc.gov.mof.lexis.service.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RegionalMailRouteTest {

  @ParameterizedTest
  @MethodSource("regionalOrgUnits")
  void shouldResolveLegacyRegionalRoutes(Long orgUnitNumber, RegionalMailRoute expectedRoute) {
    assertThat(RegionalMailRoute.forOrgUnit(orgUnitNumber)).contains(expectedRoute);
  }

  @ParameterizedTest
  @MethodSource("nonSkeenaRoutes")
  void shouldKeepTheBaseRouteForNonSkeenaPermitAndOfferNotifications(
      Long orgUnitNumber, RegionalMailRoute expectedRoute) {
    assertThat(RegionalMailRoute.forPermitOrOffer(orgUnitNumber, List.of("Z", "123")))
        .isEqualTo(expectedRoute);
  }

  @ParameterizedTest
  @MethodSource("skeenaGradeRoutes")
  void shouldApplyTheLegacySkeenaGradeException(
      List<String> gradeCodes, RegionalMailRoute expectedRoute) {
    assertThat(RegionalMailRoute.forPermitOrOffer(1908L, gradeCodes)).isEqualTo(expectedRoute);
  }

  @ParameterizedTest
  @MethodSource("unknownOrgUnits")
  void shouldNotResolveUnknownRegionalRoutes(Long orgUnitNumber) {
    assertThat(RegionalMailRoute.forOrgUnit(orgUnitNumber)).isEmpty();
  }

  @ParameterizedTest
  @MethodSource("nonDecisiveSkeenaGrades")
  void shouldRejectSkeenaNotificationsWithoutADecisiveGrade(List<String> gradeCodes) {
    assertThatThrownBy(() -> RegionalMailRoute.forPermitOrOffer(1908L, gradeCodes))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("do not determine");
  }

  private static Stream<Arguments> regionalOrgUnits() {
    return Stream.of(
        Arguments.of(1835L, RegionalMailRoute.RCO),
        Arguments.of(1909L, RegionalMailRoute.RCO),
        Arguments.of(1910L, RegionalMailRoute.RCO),
        Arguments.of(1833L, RegionalMailRoute.RNI),
        Arguments.of(1905L, RegionalMailRoute.RNI),
        Arguments.of(1906L, RegionalMailRoute.RNI),
        Arguments.of(1908L, RegionalMailRoute.RNI),
        Arguments.of(1834L, RegionalMailRoute.RSI),
        Arguments.of(1903L, RegionalMailRoute.RSI),
        Arguments.of(1904L, RegionalMailRoute.RSI),
        Arguments.of(1907L, RegionalMailRoute.RSI));
  }

  private static Stream<Arguments> nonSkeenaRoutes() {
    return Stream.of(
        Arguments.of(1835L, RegionalMailRoute.RCO),
        Arguments.of(1906L, RegionalMailRoute.RNI),
        Arguments.of(1904L, RegionalMailRoute.RSI));
  }

  private static Stream<Arguments> skeenaGradeRoutes() {
    return Stream.of(
        Arguments.of(List.of("A"), RegionalMailRoute.RCO),
        Arguments.of(List.of("Y"), RegionalMailRoute.RCO),
        Arguments.of(List.of("1A"), RegionalMailRoute.RCO),
        Arguments.of(List.of("1"), RegionalMailRoute.RNI),
        Arguments.of(List.of("Z", "2"), RegionalMailRoute.RNI));
  }

  private static Stream<Arguments> unknownOrgUnits() {
    return Stream.of(Arguments.of((Long) null), Arguments.of(9999L));
  }

  private static Stream<Arguments> nonDecisiveSkeenaGrades() {
    return Stream.of(Arguments.of(List.of()), Arguments.of(List.of("Z", " ")));
  }
}

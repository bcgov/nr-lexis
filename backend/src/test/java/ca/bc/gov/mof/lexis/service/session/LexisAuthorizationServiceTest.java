package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LexisAuthorizationService")
class LexisAuthorizationServiceTest {

  @Test
  void shouldGrantAllKnownActionsForWildcardRoleMapping() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch")));

    List<String> granted = service.resolveGrantedActions(List.of("LEXIS_ADMIN"));

    assertThat(granted).containsExactlyElementsOf(service.getKnownActions());
  }

  @Test
  void shouldApplyCanonicalIndustryMappingsForCanonicalRolesOnly() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary"),
                "LEXIS_FEDERAL_SUBMITTER", List.of("/offersSearch")));

    List<String> canonicalIndustryScoped = service.resolveGrantedActions(List.of("LEXIS_PROVINCIAL_SUBMITTER_00005678"));
    List<String> federalConcrete = service.resolveGrantedActions(List.of("LEXIS_FEDERAL_SUBMITTER"));
    List<String> federalScoped = service.resolveGrantedActions(List.of("LEXIS_FEDERAL_SUBMITTER_00001234"));
    List<String> legacyIndustryScoped = service.resolveGrantedActions(List.of("INDUSTRY_00005678"));
    List<String> legacyScoped = service.resolveGrantedActions(List.of("LOG_EXPORT_INDUSTRY_00001234"));

    assertThat(canonicalIndustryScoped).containsExactly("/summary");
    assertThat(federalConcrete).containsExactly("/offersSearch");
    assertThat(federalScoped).isEmpty();
    assertThat(legacyIndustryScoped).isEmpty();
    assertThat(legacyScoped).isEmpty();
  }

  @Test
  void shouldNormalizeCanonicalRolesAndRejectLegacyAliases() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_ADMIN", List.of("/lexisAgentAdmin")));

    List<String> granted =
        service.resolveGrantedActions(List.of("lexis_read_only", "READ_ONLY", "lexis_admin", "LEXIS_ADMIN"));

    assertThat(granted).containsExactly("/applicationSearch", "/lexisAgentAdmin");
  }

  @Test
  void shouldResolveRolesForConfiguredAction() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_APPLICATION_APPROVER", List.of("/applicationsReview")));

    Set<String> roles = service.resolveRolesForAction("/applicationSearch");

    assertThat(roles)
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY")
        .doesNotContain("LEXIS_APPLICATION_APPROVER");
  }

  @Test
  void shouldResolveIndustryActionRoles() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary"),
                "LEXIS_FEDERAL_SUBMITTER", List.of("/summary")));

    Set<String> roles = service.resolveRolesForAction("/summary");

    assertThat(roles)
        .contains(
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_FEDERAL_SUBMITTER")
        .doesNotContain("INDUSTRY_00001234", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void shouldReturnEmptyRolesWhenActionNotConfigured() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_APPLICATION_APPROVER", List.of("/applicationsReview")));

    Set<String> roles = service.resolveRolesForAction("/notMapped");

    assertThat(roles).isEmpty();
  }

  @Test
  void shouldExposeConfiguredCanonicalRolesForRouteAuth() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary"),
                "LEXIS_FEDERAL_SUBMITTER", List.of("/summary")));

    Set<String> roles = service.getConfiguredRoles();

    assertThat(roles)
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_FEDERAL_SUBMITTER")
        .doesNotContain("ADMIN", "READ_ONLY", "PROVINCIAL_SUBMITTER", "FEDERAL_SUBMITTER", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void canPerformActionShouldSupportActionNamesWithOrWithoutLeadingSlash() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_ADMIN", List.of("*")));

    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "/applicationSearch")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "applicationSearch")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "/offersSearch")).isFalse();
  }

  @Test
  void canPerformActionShouldSupportNonRouteActionsForLegacyVisibilityChecks() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER,LEXIS_FEDERAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("viewFederalApplication", "viewOICApplication"),
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("industryListing")));

    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewFederalApplication")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewOICApplication")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "viewFederalApplication")).isFalse();
  }

  private LexisAuthorizationService createService(
      String industryRolesCsv, Map<String, List<String>> roleActions) {
    LexisAuthorizationProperties properties = new LexisAuthorizationProperties();
    Map<String, List<String>> orderedMappings = new LinkedHashMap<>(roleActions);
    properties.setRoleActions(orderedMappings);
    LexisSessionService sessionService = new LexisSessionService(industryRolesCsv);
    return new LexisAuthorizationService(properties, sessionService);
  }
}

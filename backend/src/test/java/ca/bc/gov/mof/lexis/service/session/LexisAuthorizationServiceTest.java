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
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "ADMIN", List.of("*"),
                "READ_ONLY", List.of("/applicationSearch")));

    List<String> granted = service.resolveGrantedActions(List.of("ADMIN"));

    assertThat(granted).containsExactlyElementsOf(service.getKnownActions());
  }

  @Test
  void shouldApplyCanonicalIndustryMappingsForCanonicalRolesOnly() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "PROVINCIAL_SUBMITTER", List.of("/summary"),
                "FEDERAL_SUBMITTER", List.of("/offersSearch")));

    List<String> canonicalIndustryScoped = service.resolveGrantedActions(List.of("PROVINCIAL_SUBMITTER_00005678"));
    List<String> federalConcrete = service.resolveGrantedActions(List.of("FEDERAL_SUBMITTER"));
    List<String> federalScoped = service.resolveGrantedActions(List.of("FEDERAL_SUBMITTER_00001234"));
    List<String> legacyIndustryScoped = service.resolveGrantedActions(List.of("INDUSTRY_00005678"));
    List<String> legacyScoped = service.resolveGrantedActions(List.of("LOG_EXPORT_INDUSTRY_00001234"));

    assertThat(canonicalIndustryScoped).containsExactly("/summary");
    assertThat(federalConcrete).containsExactly("/offersSearch");
    assertThat(federalScoped).isEmpty();
    assertThat(legacyIndustryScoped).isEmpty();
    assertThat(legacyScoped).isEmpty();
  }

  @Test
  void shouldNotNormalizeLegacyRoleAliases() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "READ_ONLY", List.of("/applicationSearch"),
                "ADMIN", List.of("/lexisAgentAdmin")));

    List<String> granted = service.resolveGrantedActions(List.of("lexis_read_only", "lexis_admin", "ADMIN"));

    assertThat(granted).containsExactly("/lexisAgentAdmin");
  }

  @Test
  void shouldResolveRolesForConfiguredAction() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "ADMIN", List.of("*"),
                "READ_ONLY", List.of("/applicationSearch"),
                "APPLICATION_APPROVER", List.of("/applicationsReview")));

    Set<String> roles = service.resolveRolesForAction("/applicationSearch");

    assertThat(roles)
        .contains(
            "ADMIN",
            "READ_ONLY")
        .doesNotContain("APPLICATION_APPROVER");
  }

  @Test
  void shouldResolveIndustryActionRoles() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "PROVINCIAL_SUBMITTER", List.of("/summary"),
                "FEDERAL_SUBMITTER", List.of("/summary")));

    Set<String> roles = service.resolveRolesForAction("/summary");

    assertThat(roles)
        .contains(
            "PROVINCIAL_SUBMITTER",
            "FEDERAL_SUBMITTER")
        .doesNotContain("INDUSTRY_00001234", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void shouldReturnEmptyRolesWhenActionNotConfigured() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "READ_ONLY", List.of("/applicationSearch"),
                "APPLICATION_APPROVER", List.of("/applicationsReview")));

    Set<String> roles = service.resolveRolesForAction("/notMapped");

    assertThat(roles).isEmpty();
  }

  @Test
  void shouldExposeConfiguredCanonicalRolesForRouteAuth() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "ADMIN", List.of("*"),
                "READ_ONLY", List.of("/applicationSearch"),
                "PROVINCIAL_SUBMITTER", List.of("/summary"),
                "FEDERAL_SUBMITTER", List.of("/summary")));

    Set<String> roles = service.getConfiguredRoles();

    assertThat(roles)
        .contains(
            "ADMIN",
            "READ_ONLY",
            "PROVINCIAL_SUBMITTER",
            "FEDERAL_SUBMITTER")
        .doesNotContain("LEXIS_ADMIN", "LEXIS_READ_ONLY", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void canPerformActionShouldSupportActionNamesWithOrWithoutLeadingSlash() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "READ_ONLY", List.of("/applicationSearch"),
                "ADMIN", List.of("*")));

    assertThat(service.canPerformAction(List.of("READ_ONLY"), "/applicationSearch")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "applicationSearch")).isFalse();
    assertThat(service.canPerformAction(List.of("READ_ONLY"), "/offersSearch")).isFalse();
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

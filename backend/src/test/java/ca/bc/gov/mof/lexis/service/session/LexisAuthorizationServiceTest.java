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
  void shouldApplyCanonicalIndustryMappingsForCanonicalAndLegacyScopedRoles() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "PROVINCIAL_SUBMITTER", List.of("/summary"),
                "FEDERAL_SUBMITTER", List.of("/offersSearch")));

    List<String> canonicalIndustryScoped = service.resolveGrantedActions(List.of("PROVINCIAL_SUBMITTER_00005678"));
    List<String> legacyIndustryScoped = service.resolveGrantedActions(List.of("INDUSTRY_00005678"));
    List<String> canonicalScoped = service.resolveGrantedActions(List.of("FEDERAL_SUBMITTER_00001234"));
    List<String> legacyScoped = service.resolveGrantedActions(List.of("LOG_EXPORT_INDUSTRY_00001234"));

    assertThat(canonicalIndustryScoped).containsExactly("/summary");
    assertThat(legacyIndustryScoped).containsExactly("/summary");
    assertThat(canonicalScoped).containsExactly("/offersSearch");
    assertThat(legacyScoped).containsExactly("/offersSearch");
  }

  @Test
  void shouldNormalizeLegacyRoleAliasesToCanonicalMappings() {
    LexisAuthorizationService service =
        createService(
            "PROVINCIAL_SUBMITTER,FEDERAL_SUBMITTER",
            Map.of(
                "READ_ONLY", List.of("/applicationSearch"),
                "ADMIN", List.of("/lexisAgentAdmin")));

    List<String> granted =
        service.resolveGrantedActions(List.of("lexis_read_only", "lexis_admin", "ADMIN"));

    assertThat(granted).containsExactly("/applicationSearch", "/lexisAgentAdmin");
  }

  @Test
  void shouldResolveRolesForConfiguredActionAndIncludeLegacyAliases() {
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
            "READ_ONLY",
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY")
        .doesNotContain("APPLICATION_APPROVER", "LEXIS_APPLICATION_APPROVER");
  }

  @Test
  void shouldResolveIndustryActionRolesAndIncludeLegacyIndustryAlias() {
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
            "FEDERAL_SUBMITTER",
            "LEXIS_INDUSTRY",
            "INDUSTRY",
            "LEXIS_LOG_EXPORT_INDUSTRY",
            "LOG_EXPORT_INDUSTRY")
        .doesNotContain("INDUSTRY_00001234");
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
  void shouldExposeConfiguredCanonicalRolesAndLegacyAliasesForRouteAuth() {
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
            "FEDERAL_SUBMITTER",
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_INDUSTRY",
            "INDUSTRY",
            "LEXIS_LOG_EXPORT_INDUSTRY",
            "LOG_EXPORT_INDUSTRY");
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
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "applicationSearch")).isTrue();
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

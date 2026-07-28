package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import ca.bc.gov.mof.lexis.configuration.LexisFeatureProperties;
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
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch")));

    List<String> granted = service.resolveGrantedActions(List.of("LEXIS_ADMIN"));

    assertThat(granted).containsExactlyElementsOf(service.getKnownActions());
  }

  @Test
  void prodRtmOnlyModeShouldLimitWildcardAdminGrantsToRtmAdminAction() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch")),
            true);

    List<String> granted = service.resolveGrantedActions(List.of("LEXIS_ADMIN"));

    assertThat(granted).containsExactly("/rtmEmsLogAmvAdmin");
    assertThat(service.canPerformAction(List.of("LEXIS_ADMIN"), "/rtmEmsLogAmvAdmin")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_ADMIN"), "/lexisAgentAdmin")).isFalse();
    assertThat(service.canPerformAction(List.of("LEXIS_ADMIN"), "/applicationSearch")).isFalse();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "/applicationSearch")).isFalse();
  }

  @Test
  void shouldApplyCanonicalIndustryMappingsForCanonicalRolesOnly() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of("LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary")));

    List<String> canonicalIndustryScoped = service.resolveGrantedActions(List.of("LEXIS_PROVINCIAL_SUBMITTER_00005678"));
    List<String> unknownConcrete = service.resolveGrantedActions(List.of("LEXIS_UNKNOWN_SUBMITTER"));
    List<String> unknownScoped = service.resolveGrantedActions(List.of("LEXIS_UNKNOWN_SUBMITTER_00001234"));
    List<String> legacyIndustryScoped = service.resolveGrantedActions(List.of("INDUSTRY_00005678"));
    List<String> legacyScoped = service.resolveGrantedActions(List.of("LOG_EXPORT_INDUSTRY_00001234"));

    assertThat(canonicalIndustryScoped).containsExactly("/summary");
    assertThat(unknownConcrete).isEmpty();
    assertThat(unknownScoped).isEmpty();
    assertThat(legacyIndustryScoped).isEmpty();
    assertThat(legacyScoped).isEmpty();
  }

  @Test
  void shouldNormalizeCanonicalRolesAndRejectLegacyAliases() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_ADMIN", List.of("/lexisAgentAdmin")));

    List<String> readOnlyGranted = service.resolveGrantedActions(List.of("lexis_read_only"));
    List<String> adminGranted = service.resolveGrantedActions(List.of("lexis_admin", "LEXIS_ADMIN"));
    List<String> legacyAliasGranted = service.resolveGrantedActions(List.of("READ_ONLY", "ADMIN"));

    assertThat(readOnlyGranted).containsExactly("/applicationSearch");
    assertThat(adminGranted).containsExactlyElementsOf(service.getKnownActions());
    assertThat(legacyAliasGranted).isEmpty();
  }

  @Test
  void shouldResolveRolesForConfiguredAction() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
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
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of("LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary")));

    Set<String> roles = service.resolveRolesForAction("/summary");

    assertThat(roles)
        .contains("LEXIS_PROVINCIAL_SUBMITTER")
        .doesNotContain("INDUSTRY_00001234", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void shouldReturnEmptyRolesWhenActionNotConfigured() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
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
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_ADMIN", List.of("*"),
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("/summary"),
                "LEXIS_DELEGATED_ADMIN", List.of()));

    Set<String> roles = service.getConfiguredRoles();

    assertThat(roles)
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_DELEGATED_ADMIN")
        .doesNotContain("ADMIN", "READ_ONLY", "PROVINCIAL_SUBMITTER", "LEXIS_INDUSTRY", "LOG_EXPORT_INDUSTRY");
  }

  @Test
  void emptyDelegatedAdminMappingShouldExposeKnownRoleWithoutGrantingActions() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("/applicationSearch"),
                "LEXIS_DELEGATED_ADMIN", List.of()));

    assertThat(service.getConfiguredRoles()).contains("LEXIS_DELEGATED_ADMIN");
    assertThat(service.resolveGrantedActions(List.of("LEXIS_DELEGATED_ADMIN"))).isEmpty();
    assertThat(service.canPerformAction(List.of("LEXIS_DELEGATED_ADMIN"), "/applicationSearch")).isFalse();
  }

  @Test
  void canPerformActionShouldSupportActionNamesWithOrWithoutLeadingSlash() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
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
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of(
                "LEXIS_READ_ONLY", List.of("viewFederalApplication"),
                "LEXIS_PROVINCIAL_SUBMITTER", List.of("mofrListing")));

    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewFederalApplication")).isTrue();
    assertThat(service.canPerformAction(List.of("LEXIS_READ_ONLY"), "viewOICApplication")).isFalse();
    assertThat(service.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "viewFederalApplication")).isFalse();
  }

  @Test
  void canPerformActionShouldSupportConfiguredOauthScopeWithoutGrantingKnownRole() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_PROVINCIAL_SUBMITTER",
            Map.of("LEXIS_READ_ONLY", List.of("/federalApplicationDetails")),
            Map.of("lexis:federal-submission:submit", List.of("uploadFederalSubmission")));

    List<String> authorities = List.of("SCOPE_lexis:federal-submission:submit");

    assertThat(service.resolveGrantedActions(authorities)).containsExactly("uploadFederalSubmission");
    assertThat(service.canPerformAction(authorities, "uploadFederalSubmission")).isTrue();
    assertThat(service.canPerformAction(authorities, "uploadApplicationSubmission")).isFalse();
    assertThat(service.canPerformAction(authorities, "/federalApplicationDetails")).isFalse();
    assertThat(service.hasKnownRole(authorities)).isFalse();
    assertThat(service.canPerformAction(List.of("SCOPE_lexis.federalSubmission.submit"), "uploadFederalSubmission"))
        .isFalse();
  }

  private LexisAuthorizationService createService(
      String industryRolesCsv, Map<String, List<String>> roleActions) {
    return createService(industryRolesCsv, roleActions, Map.of(), false);
  }

  private LexisAuthorizationService createService(
      String industryRolesCsv, Map<String, List<String>> roleActions, boolean prodRtmOnly) {
    return createService(industryRolesCsv, roleActions, Map.of(), prodRtmOnly);
  }

  private LexisAuthorizationService createService(
      String industryRolesCsv,
      Map<String, List<String>> roleActions,
      Map<String, List<String>> scopeActions) {
    return createService(industryRolesCsv, roleActions, scopeActions, false);
  }

  private LexisAuthorizationService createService(
      String industryRolesCsv,
      Map<String, List<String>> roleActions,
      Map<String, List<String>> scopeActions,
      boolean prodRtmOnly) {
    LexisAuthorizationProperties properties = new LexisAuthorizationProperties();
    Map<String, List<String>> orderedMappings = new LinkedHashMap<>(roleActions);
    properties.setRoleActions(orderedMappings);
    properties.setScopeActions(new LinkedHashMap<>(scopeActions));
    LexisFeatureProperties featureProperties = new LexisFeatureProperties();
    featureProperties.setProdRtmOnly(prodRtmOnly);
    LexisSessionService sessionService = new LexisSessionService(industryRolesCsv);
    return new LexisAuthorizationService(properties, featureProperties, sessionService);
  }
}

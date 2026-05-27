package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.configuration.LexisAuthorizationProperties;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LexisAuthorizationService")
class LexisAuthorizationServiceTest {

  @Test
  void shouldGrantAllKnownActionsForWildcardRoleMapping() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_INDUSTRY,LOG_EXPORT_INDUSTRY",
            Map.of(
                "ADMIN", List.of("*"),
                "READ_ONLY", List.of("/applicationSearch")));

    List<String> granted = service.resolveGrantedActions(List.of("admin"));

    assertThat(granted).containsExactlyElementsOf(service.getKnownActions());
  }

  @Test
  void shouldApplyIndustryTemplateForConfiguredIndustryRoles() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_INDUSTRY",
            Map.of(
                "READ_ONLY", List.of("/applicationSearch"),
                "INDUSTRY", List.of("/summary", "/offersSearch")));

    List<String> granted = service.resolveGrantedActions(List.of("lexis_industry"));

    assertThat(granted).containsExactly("/summary", "/offersSearch");
  }

  @Test
  void shouldGrantConfiguredActionsForForestClientScopedIndustryRoles() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_INDUSTRY",
            Map.of(
                "LEXIS_INDUSTRY", List.of("/summary"),
                "INDUSTRY", List.of("/offerDetails")));

    List<String> granted = service.resolveGrantedActions(List.of("LEXIS_INDUSTRY_00001234"));

    assertThat(granted).containsExactly("/summary", "/offerDetails");
  }

  @Test
  void shouldNotCollapseIndustryRoleWithNonForestClientSuffix() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_INDUSTRY",
            Map.of(
                "LEXIS_INDUSTRY", List.of("/summary"),
                "INDUSTRY", List.of("/offerDetails")));

    List<String> granted = service.resolveGrantedActions(List.of("LEXIS_INDUSTRY_ADMIN"));

    assertThat(granted).isEmpty();
  }

  @Test
  void shouldIgnoreUnknownActionsAndNormalizeRoleNames() {
    LexisAuthorizationService service =
        createService(
            "LEXIS_INDUSTRY",
            Map.of(
                " read_only ", List.of("/applicationSearch", "/notInLegacyCatalog"),
                "ADMIN", List.of("/lexisAgentAdmin")));

    List<String> granted = service.resolveGrantedActions(List.of(" READ_ONLY ", "admin", "admin"));

    assertThat(granted).containsExactly("/applicationSearch", "/lexisAgentAdmin");
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

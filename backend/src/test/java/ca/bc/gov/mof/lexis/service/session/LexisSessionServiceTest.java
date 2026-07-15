package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@DisplayName("Unit Test | LexisSessionService")
class LexisSessionServiceTest {

  private final LexisSessionService service =
      new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");

  @Test
  void shouldRouteReadOnlyUsersToApplicationSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_read_only"));

    assertThat(response.welcomeTarget()).isEqualTo("readOnly");
    assertThat(response.legacyPath()).isEqualTo("/provincial/application");
    assertThat(response.roles()).containsExactly("LEXIS_READ_ONLY");
  }

  @Test
  void shouldRouteAdminsToAdminLandingWhenOtherRolesArePresent() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\admin", List.of("lexis_admin", "lexis_read_only"));

    assertThat(response.welcomeTarget()).isEqualTo("adminUser");
    assertThat(response.legacyPath()).isEqualTo("/admin");
    assertThat(response.roles()).containsExactly("LEXIS_ADMIN", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldRouteProvincialSubmittersToApplicationSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_provincial_submitter"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/application");
  }

  @Test
  void shouldRouteForestClientScopedProvincialSubmittersToApplicationSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_provincial_submitter_00001234"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/application");
    assertThat(response.roles()).containsExactly("LEXIS_PROVINCIAL_SUBMITTER");
  }

  @Test
  void shouldRouteUnknownOnlyRolesToNoAccess() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_unknown_role"));

    assertThat(response.welcomeTarget()).isEqualTo("noAccess");
    assertThat(response.legacyPath()).isNull();
    assertThat(response.roles()).containsExactly("LEXIS_UNKNOWN_ROLE");
  }

  @Test
  void shouldNotRouteLegacyScopedIndustryAliasToIndustrySummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("log_export_industry_00001234"));

    assertThat(response.welcomeTarget()).isEqualTo("noAccess");
    assertThat(response.legacyPath()).isNull();
    assertThat(response.roles()).containsExactly("LOG_EXPORT_INDUSTRY_00001234");
  }

  @Test
  void shouldNotRouteLegacyIndustryScopedAliasToIndustrySummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("industry_00001234"));

    assertThat(response.welcomeTarget()).isEqualTo("noAccess");
    assertThat(response.legacyPath()).isNull();
    assertThat(response.roles()).containsExactly("INDUSTRY_00001234");
  }

  @Test
  void shouldNotTreatUnconfiguredIndustryLikeRolesAsIndustryUsers() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("industry_submitter"));

    assertThat(response.welcomeTarget()).isEqualTo("noAccess");
    assertThat(response.legacyPath()).isNull();
  }

  @Test
  void shouldRouteSingleAdminToAdminLanding() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\admin", List.of("lexis_admin"));

    assertThat(response.welcomeTarget()).isEqualTo("adminUser");
    assertThat(response.legacyPath()).isEqualTo("/admin");
    assertThat(response.roles()).containsExactly("LEXIS_ADMIN");
  }

  @Test
  void shouldRouteExemptionApproverToExemptionSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\approver", List.of("lexis_exemption_approver", "other_role"));

    assertThat(response.welcomeTarget()).isEqualTo("exemptionApprover");
    assertThat(response.legacyPath()).isEqualTo("/provincial/exemption");
    assertThat(response.roles()).containsExactly("LEXIS_EXEMPTION_APPROVER", "OTHER_ROLE");
  }

  @Test
  void shouldDefaultToMofrLanding() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\staff", List.of("lexis_application_approver"));

    assertThat(response.welcomeTarget()).isEqualTo("mofrUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/review");
    assertThat(response.roles()).containsExactly("LEXIS_APPLICATION_APPROVER");
  }

  @Test
  void shouldRecognizeDelegatedAdminWithoutRoutingToUiLanding() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\delegated", List.of("lexis_delegated_admin"));

    assertThat(response.welcomeTarget()).isEqualTo("noAccess");
    assertThat(response.legacyPath()).isNull();
    assertThat(response.roles()).containsExactly("LEXIS_DELEGATED_ADMIN");
  }

  @Test
  void shouldParseRoleHeaderIntoCanonicalDistinctRoles() {
    List<String> roles = service.parseRoleHeader(" lexis_admin, lexis_read_only,LEXIS_ADMIN ,, ");

    assertThat(roles).containsExactly("LEXIS_ADMIN", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldNotMapFamApplicationAdminGroupToLexisAdmin() {
    List<String> roles = service.parseRoleHeader("LEXIS_DEV_ADMIN");

    assertThat(roles).containsExactly("LEXIS_DEV_ADMIN");
  }

  @Test
  void shouldParseAuthoritiesIntoCanonicalDistinctRoles() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("lexis_read_only"),
                new SimpleGrantedAuthority("lexis_delegated_admin"),
                new SimpleGrantedAuthority("LEXIS_ADMIN"),
                new SimpleGrantedAuthority("lexis_admin")));

    assertThat(roles)
        .containsExactly(
            "LEXIS_READ_ONLY",
            "LEXIS_DELEGATED_ADMIN",
            "LEXIS_ADMIN");
  }

  @Test
  void shouldIgnoreOauthScopeAuthoritiesWhenParsingSessionRoles() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("SCOPE_openid"),
                new SimpleGrantedAuthority("SCOPE_lexis:federal-submission:submit"),
                new SimpleGrantedAuthority("lexis_read_only")));

    assertThat(roles).containsExactly("LEXIS_READ_ONLY");
  }

  @Test
  void shouldCollapseForestClientScopedIndustryAuthorities() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("lexis_provincial_submitter_00009999"),
                new SimpleGrantedAuthority("LEXIS_READ_ONLY")));

    assertThat(roles).containsExactly("LEXIS_PROVINCIAL_SUBMITTER", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldNotCollapseLegacyScopedIndustryAuthorities() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("log_export_industry_00009999"),
                new SimpleGrantedAuthority("LEXIS_READ_ONLY")));

    assertThat(roles).containsExactly("LOG_EXPORT_INDUSTRY_00009999", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldNotCollapseLegacyIndustryScopedAuthorities() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("industry_00009999"),
                new SimpleGrantedAuthority("LEXIS_READ_ONLY")));

    assertThat(roles).containsExactly("INDUSTRY_00009999", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldParseRolesFromAuthenticationPrincipal() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            "lexis_provincial_submitter",
            "lexis_read_only");

    List<String> roles = service.parseRolesFromPrincipal(authentication);

    assertThat(roles).containsExactly("LEXIS_PROVINCIAL_SUBMITTER", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldResolveForestClientNumberFromCanonicalScopedRole() {
    String clientNumber = service.resolveForestClientNumber(List.of("lexis_provincial_submitter_00077881"));

    assertThat(clientNumber).isEqualTo("00077881");
  }

  @Test
  void shouldNotResolveForestClientNumberFromLegacyScopedRoleAlias() {
    String clientNumber = service.resolveForestClientNumber(List.of("lexis_industry_00077881"));

    assertThat(clientNumber).isNull();
  }

  @Test
  void shouldNotResolveForestClientNumberFromLegacyIndustryScopedRoleAlias() {
    String clientNumber = service.resolveForestClientNumber(List.of("industry_00077881"));

    assertThat(clientNumber).isNull();
  }

  @Test
  void shouldResolveForestClientNumberFromAuthenticationPrincipal() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(
                new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_00055667"),
                new SimpleGrantedAuthority("LEXIS_READ_ONLY")));

    String clientNumber = service.resolveForestClientNumber(authentication);

    assertThat(clientNumber).isEqualTo("00055667");
  }

  @Test
  void shouldNotResolveForestClientNumberFromUnknownRoleSuffix() {
    String clientNumber = service.resolveForestClientNumber(List.of("LEXIS_UNKNOWN_ROLE_00055667"));

    assertThat(clientNumber).isNull();
  }

  @Test
  void shouldNotResolveForestClientNumberFromLegacyIndustrySubmitterSuffixAlias() {
    String clientNumber = service.resolveForestClientNumber(List.of("log_export_industry_00055667"));

    assertThat(clientNumber).isNull();
  }

  @Test
  void shouldReturnNullWhenNoScopedForestClientRolePresent() {
    String clientNumber = service.resolveForestClientNumber(List.of("LEXIS_ADMIN", "LEXIS_READ_ONLY"));

    assertThat(clientNumber).isNull();
  }
}

package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.access.AccessDeniedException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
  void shouldRouteAdminsToApplicationReviewWhenOtherRolesArePresent() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\admin", List.of("lexis_admin", "lexis_read_only"));

    assertThat(response.welcomeTarget()).isEqualTo("adminUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/review");
    assertThat(response.roles()).containsExactly("LEXIS_ADMIN", "LEXIS_READ_ONLY");
  }

  @Test
  void shouldRouteProvincialSubmittersToSummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_provincial_submitter"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/summary");
  }

  @Test
  void shouldRouteForestClientScopedProvincialSubmittersToSummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_provincial_submitter_00001234"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/summary");
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
  void shouldRouteSingleAdminToApplicationReview() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\admin", List.of("lexis_admin"));

    assertThat(response.welcomeTarget()).isEqualTo("adminUser");
    assertThat(response.legacyPath()).isEqualTo("/provincial/review");
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

  @Test
  void shouldKeepAdministratorsUnrestrictedWhenScopedSubmitterAuthorityIsAlsoPresent() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\admin",
            "n/a",
            "lexis_provincial_submitter_00077881",
            " lexis_admin ");

    LexisSessionService.ForestClientScope scope =
        service.resolveForestClientScope(authentication);

    assertThat(scope.scoped()).isFalse();
    assertThat(scope.invalid()).isFalse();
    assertThat(service.resolveForestClientNumber(authentication)).isNull();
  }

  @Test
  void shouldLetAdministratorAuthorityOverrideInvalidSubmitterScopes() {
    assertThat(
            service.resolveForestClientNumber(
                List.of("LEXIS_PROVINCIAL_SUBMITTER", "lexis_admin")))
        .isNull();
    assertThat(
            service.resolveForestClientNumber(
                List.of(
                    "LEXIS_PROVINCIAL_SUBMITTER_00012345",
                    "LEXIS_PROVINCIAL_SUBMITTER_00067890",
                    "LEXIS_ADMIN")))
        .isNull();
  }

  @Test
  void shouldFailClosedWhenProvincialSubmitterScopeIsMissing() {
    assertThatThrownBy(
            () -> service.resolveForestClientNumber(List.of("LEXIS_PROVINCIAL_SUBMITTER")))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("missing");
  }

  @Test
  void shouldRequireAnActiveSelectionWhenProvincialSubmitterHasMultipleScopes() {
    LexisSessionService.ForestClientScope scope =
        service.resolveForestClientScope(
            List.of(
                "LEXIS_PROVINCIAL_SUBMITTER_00067890",
                "LEXIS_PROVINCIAL_SUBMITTER_00012345"));

    assertThat(scope.clientNumber()).isNull();
    assertThat(scope.availableClientNumbers()).containsExactly("00012345", "00067890");
    assertThat(scope.selectionRequired()).isTrue();
    assertThat(scope.invalid()).isFalse();

    assertThatThrownBy(
            () ->
                service.resolveForestClientNumber(
                    List.of(
                        "LEXIS_PROVINCIAL_SUBMITTER_00012345",
                        "LEXIS_PROVINCIAL_SUBMITTER_00067890")))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessageContaining("multiple");
  }

  @Test
  void shouldResolveTheSelectedClientFromMultipleAssignedScopes() {
    LexisSessionService.ForestClientScope scope =
        service.resolveForestClientScope(
            List.of(
                "LEXIS_PROVINCIAL_SUBMITTER_00012345",
                "LEXIS_PROVINCIAL_SUBMITTER_00067890"),
            "00067890");

    assertThat(scope.clientNumber()).isEqualTo("00067890");
    assertThat(scope.availableClientNumbers()).containsExactly("00012345", "00067890");
    assertThat(scope.selectionRequired()).isFalse();
    assertThat(scope.invalid()).isFalse();
  }

  @Test
  void shouldRejectASelectedClientThatIsNotAssigned() {
    LexisSessionService.ForestClientScope scope =
        service.resolveForestClientScope(
            List.of(
                "LEXIS_PROVINCIAL_SUBMITTER_00012345",
                "LEXIS_PROVINCIAL_SUBMITTER_00067890"),
            "00099999");

    assertThat(scope.clientNumber()).isNull();
    assertThat(scope.availableClientNumbers()).containsExactly("00012345", "00067890");
    assertThat(scope.selectionRequired()).isFalse();
    assertThat(scope.invalid()).isTrue();
    assertThat(scope.failureReason()).contains("not assigned");
  }

  @Test
  void shouldRejectAConflictingSelectionForASingleAssignedClient() {
    LexisSessionService.ForestClientScope scope =
        service.resolveForestClientScope(
            List.of("LEXIS_PROVINCIAL_SUBMITTER_00012345"), "00099999");

    assertThat(scope.invalid()).isTrue();
    assertThat(scope.availableClientNumbers()).containsExactly("00012345");
  }

  @Test
  void shouldRetainConcreteAuthorityAndAddBaseAuthorityForActionChecks() {
    assertThat(
            service.parseGrantedAuthorities(
                List.of("lexis_provincial_submitter_00012345", "lexis_read_only")))
        .containsExactly(
            "LEXIS_PROVINCIAL_SUBMITTER_00012345",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_READ_ONLY");
  }
}

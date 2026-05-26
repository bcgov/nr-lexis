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
      new LexisSessionService("LEXIS_INDUSTRY,LOG_EXPORT_INDUSTRY");

  @Test
  void shouldRouteReadOnlyUsersToApplicationSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("admin", "read_only"));

    assertThat(response.welcomeTarget()).isEqualTo("readOnly");
    assertThat(response.legacyPath()).isEqualTo("/applicationSearch.do?actionMapping=view");
  }

  @Test
  void shouldRouteIndustryUsersToSummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_industry"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/summary.do?actionMapping=view");
  }

  @Test
  void shouldRouteForestClientScopedIndustryUsersToSummary() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("lexis_industry_00001234"));

    assertThat(response.welcomeTarget()).isEqualTo("industryUser");
    assertThat(response.legacyPath()).isEqualTo("/summary.do?actionMapping=view");
    assertThat(response.roles()).containsExactly("LEXIS_INDUSTRY");
  }

  @Test
  void shouldNotTreatUnconfiguredIndustryLikeRolesAsIndustryUsers() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\jsmith", List.of("industry_submitter"));

    assertThat(response.welcomeTarget()).isEqualTo("mofrUser");
    assertThat(response.legacyPath()).isEqualTo("/applicationsReview.do?actionMapping=view");
  }

  @Test
  void shouldRouteSingleAdminToAdminLanding() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\admin", List.of("admin"));

    assertThat(response.welcomeTarget()).isEqualTo("adminUser");
    assertThat(response.legacyPath()).isEqualTo("/lexisAgentAdmin.do?actionMapping=view");
  }

  @Test
  void shouldRouteExemptionApproverToExemptionSearch() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\approver", List.of("exemption_approver", "other_role"));

    assertThat(response.welcomeTarget()).isEqualTo("exemptionApprover");
    assertThat(response.legacyPath()).isEqualTo("/exemptionSearch.do?actionMapping=view");
  }

  @Test
  void shouldDefaultToMofrLanding() {
    LexisSessionWelcomeDto response =
        service.resolveWelcomeRoute("idir\\staff", List.of("application_approver"));

    assertThat(response.welcomeTarget()).isEqualTo("mofrUser");
    assertThat(response.legacyPath()).isEqualTo("/applicationsReview.do?actionMapping=view");
  }

  @Test
  void shouldParseRoleHeaderIntoNormalizedDistinctRoles() {
    List<String> roles = service.parseRoleHeader(" admin, read_only,ADMIN ,, ");

    assertThat(roles).containsExactly("ADMIN", "READ_ONLY");
  }

  @Test
  void shouldParseAuthoritiesIntoNormalizedDistinctRoles() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority(" read_only "),
                new SimpleGrantedAuthority("ADMIN"),
                new SimpleGrantedAuthority("admin")));

    assertThat(roles).containsExactly("READ_ONLY", "ADMIN");
  }

  @Test
  void shouldCollapseForestClientScopedIndustryAuthorities() {
    List<String> roles =
        service.parseAuthorities(
            List.of(
                new SimpleGrantedAuthority("log_export_industry_00009999"),
                new SimpleGrantedAuthority("READ_ONLY")));

    assertThat(roles).containsExactly("LOG_EXPORT_INDUSTRY", "READ_ONLY");
  }

  @Test
  void shouldParseRolesFromAuthenticationPrincipal() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a", "lexis_industry", "read_only");

    List<String> roles = service.parseRolesFromPrincipal(authentication);

    assertThat(roles).containsExactly("LEXIS_INDUSTRY", "READ_ONLY");
  }

  @Test
  void shouldResolveForestClientNumberFromScopedRole() {
    String clientNumber = service.resolveForestClientNumber(List.of("lexis_industry_00077881"));

    assertThat(clientNumber).isEqualTo("00077881");
  }

  @Test
  void shouldResolveForestClientNumberFromAuthenticationPrincipal() {
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(
                new SimpleGrantedAuthority("LOG_EXPORT_INDUSTRY_00055667"),
                new SimpleGrantedAuthority("READ_ONLY")));

    String clientNumber = service.resolveForestClientNumber(authentication);

    assertThat(clientNumber).isEqualTo("00055667");
  }

  @Test
  void shouldReturnNullWhenNoScopedForestClientRolePresent() {
    String clientNumber = service.resolveForestClientNumber(List.of("ADMIN", "READ_ONLY"));

    assertThat(clientNumber).isNull();
  }
}

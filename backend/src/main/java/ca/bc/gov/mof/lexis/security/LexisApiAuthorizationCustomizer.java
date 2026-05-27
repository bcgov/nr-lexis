package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.stereotype.Component;

@Component
public class LexisApiAuthorizationCustomizer
    implements
    Customizer<
        AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry> {

  private final LexisAuthorizationService authorizationService;
  private final String[] knownRoles;

  public LexisApiAuthorizationCustomizer(LexisAuthorizationService authorizationService) {
    this.authorizationService = authorizationService;
    this.knownRoles = authorizationService.getConfiguredRoles().stream().toArray(String[]::new);
  }

  @Override
  public void customize(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize) {

    authorize.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();
    authorize.requestMatchers(HttpMethod.GET, "/actuator/**").permitAll();
    authorize
        .requestMatchers("/api/lexis/session/accessDenied", "/api/lexis/session/errorPage", "/error")
        .permitAll();

    authorizeKnownRoles(authorize, "/api/lexis/session/**");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/applications/search/options",
          "/api/lexis/applications/search",
          "/api/lexis/applications/search/verify-clients",
          "/api/lexis/applications/search/has-valid-offer"
        },
        "/applicationSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/applications/*"},
        "/applicationDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/exemptions/search/options", "/api/lexis/exemptions/search"},
        "/exemptionSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/exemptions/*"},
        "/exemptionDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/federal/applications/search/options",
          "/api/lexis/federal/applications/search",
          "/api/lexis/federal/applications/search/verify-clients"
        },
        "/federalApplicationSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/federal/applications/*", "/api/lexis/federal/applications/*/permit"
        },
        "/federalApplicationDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/indian-reserve/permits/search/options", "/api/lexis/indian-reserve/permits/search"
        },
        "/indianReservePermitSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/indian-reserve/permits/*"},
        "/indianReservePermitDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/purchase-offers/search/options", "/api/lexis/purchase-offers/search"
        },
        "/offersSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/purchase-offers/*"},
        "/offerDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/permits/search/options", "/api/lexis/permits/search"},
        "/permitSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/permits/*", "/api/lexis/fee-details/permits/*/summary"},
        "/permitDetails");

    authorizeAction(authorize, HttpMethod.GET, new String[] {"/api/lexis/summary/**"}, "/summary");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/application-reviews/search/options", "/api/lexis/application-reviews/search"
        },
        "/applicationsReview");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/application-reviews/*/approve",
          "/api/lexis/application-reviews/*/status",
          "/api/lexis/application-reviews/*/status-email"
        },
        "/applicationsReview");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/admin/agent", "/api/lexis/admin/lexisAgentAdmin"},
        "/lexisAgentAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/admin/policy", "/api/lexis/admin/lexisPolicyAdmin"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/admin/fil-policy", "/api/lexis/admin/lexisFILAdmin"},
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/admin/policy/rpc", "/api/lexis/admin/lexisPolicyAdminRPC"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/admin/fil-policy/rpc", "/api/lexis/admin/lexisFILAdminRPC"},
        "/lexisFILAdmin");

    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileApplicationUpload", "/api/lexis/uploads/application"
        },
        "/fileApplicationUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/filePermitUpload", "/api/lexis/uploads/permit"
        },
        "/filePermitUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileExemptionUpload", "/api/lexis/uploads/exemption"
        },
        "/fileExemptionUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileInvoiceUpload", "/api/lexis/uploads/invoice"
        },
        "/fileInvoiceUpload");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/rpc/application-details/**", "/api/lexis/applicationDetailsRPC"},
        "/applicationDetails");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/rpc/application-details/**", "/api/lexis/applicationDetailsRPC"},
        "/applicationDetails");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/rpc/application-details/**"},
        "/applicationDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/rpc/exemption-details/**", "/api/lexis/exemptionDetailsRPC"},
        "/exemptionDetails");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/rpc/exemption-details/**", "/api/lexis/exemptionDetailsRPC"},
        "/exemptionDetails");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/rpc/exemption-details/**"},
        "/exemptionDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/rpc/offer-details/**"},
        "/offerDetails");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/rpc/permit-details/**"},
        "/permitDetails");

    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/biweeklyListing", "/api/lexis/reports/biweekly-listing"},
        "mofrListing");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/offerReport", "/api/lexis/reports/offer-report"},
        "/offerReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/speciesGradeReport", "/api/lexis/reports/species-grade-report"
        },
        "/speciesGradeReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/exemptionReport", "/api/lexis/reports/exemption-report"},
        "/exemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/applicationReport", "/api/lexis/reports/application-report"
        },
        "/applicationReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/approvedExemptionReport",
          "/api/lexis/reports/approved-exemption-report"
        },
        "/approvedExemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/permitReport", "/api/lexis/reports/permit-report"},
        "/permitReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/permitLedgerReport", "/api/lexis/reports/permit-ledger-report"
        },
        "/permitLedgerReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/feeReport", "/api/lexis/reports/fee-report"},
        "/feeReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/transportReport", "/api/lexis/reports/transport-report"
        },
        "/transportReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/teacReport", "/api/lexis/reports/teac-report"},
        "/teacReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/reports/tenureReport", "/api/lexis/reports/tenure-report"},
        "/tenureReport");

    authorize.anyRequest().denyAll();
  }

  private void authorizeKnownRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      String... paths) {
    if (knownRoles.length == 0) {
      authorize.requestMatchers(paths).denyAll();
      return;
    }
    authorize.requestMatchers(paths).hasAnyAuthority(knownRoles);
  }

  private void authorizeAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      HttpMethod method,
      String[] paths,
      String legacyAction) {
    Set<String> roles = authorizationService.resolveRolesForAction(legacyAction);
    if (roles.isEmpty()) {
      authorize.requestMatchers(method, paths).denyAll();
      return;
    }
    authorize.requestMatchers(method, paths).hasAnyAuthority(roles.toArray(String[]::new));
  }
}

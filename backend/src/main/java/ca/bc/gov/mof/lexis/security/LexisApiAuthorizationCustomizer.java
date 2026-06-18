package ca.bc.gov.mof.lexis.security;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import java.util.List;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AuthorizeHttpRequestsConfigurer;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Component;

@Component
public class LexisApiAuthorizationCustomizer
    implements
    Customizer<
        AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry> {

  private final LexisAuthorizationService authorizationService;

  public LexisApiAuthorizationCustomizer(LexisAuthorizationService authorizationService) {
    this.authorizationService = authorizationService;
  }

  @Override
  public void customize(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize) {

    authorize.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll();

    authorize.requestMatchers("/actuator/**").hasAuthority("LEXIS_ADMIN");
    authorizeKnownRoles(authorize, "/error");
    authorizeKnownRoles(authorize, "/api/lexis/session/**");
    authorizeKnownRoles(
        authorize,
        "/api/lexis/showWelcome",
        "/api/lexis/showWelcome.do",
        "/api/lexis/logoff",
        "/api/lexis/logoff.do",
        "/api/lexis/accessDenied",
        "/api/lexis/accessDenied.do",
        "/api/lexis/errorPage",
        "/api/lexis/errorPage.do");
    authorizeKnownRoles(authorize, "/api/lexis/reports/options");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/applicationSearch",
          "/api/lexis/applicationSearch.do",
          "/api/lexis/applications/search/options",
          "/api/lexis/applications/search",
          "/api/lexis/applications/search/count",
          "/api/lexis/applications/search/verify-clients",
          "/api/lexis/applications/search/has-valid-offer"
        },
        "/applicationSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/applicationDetails",
          "/api/lexis/applicationDetails.do",
          "/api/lexis/applications/*"
        },
        "/applicationDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/exemptionSearch",
          "/api/lexis/exemptionSearch.do",
          "/api/lexis/exemptions/search/options",
          "/api/lexis/exemptions/search",
          "/api/lexis/exemptions/search/count"
        },
        "/exemptionSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/exemptionDetails",
          "/api/lexis/exemptionDetails.do",
          "/api/lexis/exemptions/*"
        },
        "/exemptionDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/federalApplicationSearch",
          "/api/lexis/federalApplicationSearch.do",
          "/api/lexis/federal/applications/search/options",
          "/api/lexis/federal/applications/search",
          "/api/lexis/federal/applications/search/count",
          "/api/lexis/federal/applications/search/verify-clients"
        },
        "/federalApplicationSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/federalApplicationDetails",
          "/api/lexis/federalApplicationDetails.do",
          "/api/lexis/federal/applications/*", "/api/lexis/federal/applications/*/permit"
        },
        "/federalApplicationDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/offersSearch",
          "/api/lexis/offersSearch.do",
          "/api/lexis/purchase-offers/search/options",
          "/api/lexis/purchase-offers/search",
          "/api/lexis/purchase-offers/search/count"
        },
        "/offersSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/offerDetails",
          "/api/lexis/offerDetails.do",
          "/api/lexis/purchase-offers/*"
        },
        "/offerDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/permitSearch",
          "/api/lexis/permitSearch.do",
          "/api/lexis/permits/search/options",
          "/api/lexis/permits/search",
          "/api/lexis/permits/search/count"
        },
        "/permitSearch");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/permitDetails",
          "/api/lexis/permitDetails.do",
          "/api/lexis/feeDetails",
          "/api/lexis/feeDetails.do",
          "/api/lexis/permits/*",
          "/api/lexis/fee-details/permits/*/summary"
        },
        "/permitDetails");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/summary", "/api/lexis/summary.do", "/api/lexis/summary/**"},
        "/summary");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/summary", "/api/lexis/summary.do"},
        "/summary");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/applicationsReview",
          "/api/lexis/applicationsReview.do",
          "/api/lexis/application-reviews/search/options",
          "/api/lexis/application-reviews/search",
          "/api/lexis/application-reviews/search/count",
          "/api/lexis/application-reviews/search/preview"
        },
        "/applicationsReview");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/applicationsReview",
          "/api/lexis/applicationsReview.do",
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
        new String[] {"/api/lexis/lexisAgentAdmin", "/api/lexis/lexisAgentAdmin.do"},
        "/lexisAgentAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/admin/policy",
          "/api/lexis/admin/lexisPolicyAdmin",
          "/api/lexis/admin/policies/fee"
        },
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/lexisPolicyAdmin", "/api/lexis/lexisPolicyAdmin.do"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/admin/fil-policy",
          "/api/lexis/admin/lexisFILAdmin",
          "/api/lexis/admin/policies/fil"
        },
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/lexisFILAdmin", "/api/lexis/lexisFILAdmin.do"},
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/admin/policy/rpc",
          "/api/lexis/admin/lexisPolicyAdminRPC",
          "/api/lexis/admin/policies/fee"
        },
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.PUT,
        new String[] {"/api/lexis/admin/policies/fee/*"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/admin/policies/fee/*"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/lexisPolicyAdminRPC", "/api/lexis/lexisPolicyAdminRPC.do"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/lexisPolicyAdminRPC", "/api/lexis/lexisPolicyAdminRPC.do"},
        "/lexisPolicyAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/admin/fil-policy/rpc",
          "/api/lexis/admin/lexisFILAdminRPC",
          "/api/lexis/admin/policies/fil"
        },
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.PUT,
        new String[] {"/api/lexis/admin/policies/fil/*"},
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/admin/policies/fil/*"},
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/lexisFILAdminRPC", "/api/lexis/lexisFILAdminRPC.do"},
        "/lexisFILAdmin");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/lexisFILAdminRPC", "/api/lexis/lexisFILAdminRPC.do"},
        "/lexisFILAdmin");

    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileApplicationUpload",
          "/api/lexis/uploads/application",
          "/api/lexis/admin/uploads/applications"
        },
        "/fileApplicationUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/filePermitUpload",
          "/api/lexis/uploads/permit",
          "/api/lexis/admin/uploads/permits"
        },
        "/filePermitUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileExemptionUpload",
          "/api/lexis/uploads/exemption",
          "/api/lexis/admin/uploads/exemptions"
        },
        "/fileExemptionUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/fileInvoiceUpload",
          "/api/lexis/uploads/invoice",
          "/api/lexis/admin/uploads/invoices"
        },
        "/fileInvoiceUpload");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/application-submissions",
          "/api/lexis/uploads/lexis-xml",
          "/api/lexis/admin/uploads/lexis-xml",
          "/api/lexis/application-submissions/validation",
          "/api/lexis/uploads/lexis-xml/validation",
          "/api/lexis/admin/uploads/lexis-xml/validation"
        },
        "uploadApplicationSubmission");

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
        "saveExemption");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/rpc/exemption-details/**"},
        "saveExemption");

    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/rpc/offer-details/**", "/api/lexis/offerDetailsRPC", "/api/lexis/offerDetailsRPC.do"
        },
        "/offerDetails");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/rpc/offer-details/**"},
        "createOffer");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {"/api/lexis/offerDetailsRPC", "/api/lexis/offerDetailsRPC.do"},
        "/offerDetails");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/rpc/permit-details/**",
          "/api/lexis/permitDetailsRPC",
          "/api/lexis/permitDetailsRPC.do"
        },
        "/permitDetails");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/rpc/permit-details/**",
          "/api/lexis/permitDetailsRPC",
          "/api/lexis/permitDetailsRPC.do"
        },
        "/permitDetails");
    authorizeAction(
        authorize,
        HttpMethod.DELETE,
        new String[] {"/api/lexis/rpc/permit-details/**"},
        "/permitDetails");

    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/biweeklyListing",
          "/api/lexis/reports/biweekly-listing",
          "/api/lexis/biweeklyListing",
          "/api/lexis/biweeklyListing.do"
        },
        "mofrListing");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/biweeklyListing", "/api/lexis/biweeklyListing.do"},
        "mofrListing");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/offerReport",
          "/api/lexis/reports/offer-report",
          "/api/lexis/offerReport",
          "/api/lexis/offerReport.do"
        },
        "/offerReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/offerReport", "/api/lexis/offerReport.do"},
        "/offerReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/speciesGradeReport",
          "/api/lexis/reports/species-grade-report",
          "/api/lexis/speciesGradeReport",
          "/api/lexis/speciesGradeReport.do"
        },
        "/speciesGradeReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/speciesGradeReport", "/api/lexis/speciesGradeReport.do"},
        "/speciesGradeReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/exemptionReport",
          "/api/lexis/reports/exemption-report",
          "/api/lexis/exemptionReport",
          "/api/lexis/exemptionReport.do"
        },
        "/exemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/exemptionReport", "/api/lexis/exemptionReport.do"},
        "/exemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/applicationReport",
          "/api/lexis/reports/application-report",
          "/api/lexis/applicationReport",
          "/api/lexis/applicationReport.do"
        },
        "/applicationReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/applicationReport", "/api/lexis/applicationReport.do"},
        "/applicationReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/approvedExemptionReport",
          "/api/lexis/reports/approved-exemption-report",
          "/api/lexis/approvedExemptionReport",
          "/api/lexis/approvedExemptionReport.do"
        },
        "/approvedExemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {
          "/api/lexis/approvedExemptionReport",
          "/api/lexis/approvedExemptionReport.do"
        },
        "/approvedExemptionReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/permitReport",
          "/api/lexis/reports/permit-report",
          "/api/lexis/permitReport",
          "/api/lexis/permitReport.do"
        },
        "/permitReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/permitReport", "/api/lexis/permitReport.do"},
        "/permitReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/permitLedgerReport",
          "/api/lexis/reports/permit-ledger-report",
          "/api/lexis/permitLedgerReport",
          "/api/lexis/permitLedgerReport.do"
        },
        "/permitLedgerReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/permitLedgerReport", "/api/lexis/permitLedgerReport.do"},
        "/permitLedgerReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/feeReport",
          "/api/lexis/reports/fee-report",
          "/api/lexis/feeReport",
          "/api/lexis/feeReport.do"
        },
        "/feeReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/feeReport", "/api/lexis/feeReport.do"},
        "/feeReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/transportReport",
          "/api/lexis/reports/transport-report",
          "/api/lexis/transportReport",
          "/api/lexis/transportReport.do"
        },
        "/transportReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/transportReport", "/api/lexis/transportReport.do"},
        "/transportReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/teacReport",
          "/api/lexis/reports/teac-report",
          "/api/lexis/teacReport",
          "/api/lexis/teacReport.do"
        },
        "/teacReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/teacReport", "/api/lexis/teacReport.do"},
        "/teacReport");
    authorizeAction(
        authorize,
        HttpMethod.POST,
        new String[] {
          "/api/lexis/reports/tenureReport",
          "/api/lexis/reports/tenure-report",
          "/api/lexis/tenureReport",
          "/api/lexis/tenureReport.do"
        },
        "/tenureReport");
    authorizeAction(
        authorize,
        HttpMethod.GET,
        new String[] {"/api/lexis/tenureReport", "/api/lexis/tenureReport.do"},
        "/tenureReport");

    authorize.anyRequest().denyAll();
  }

  private void authorizeKnownRoles(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      String... paths) {
    authorize
        .requestMatchers(paths)
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.hasKnownRole(getAuthorities(authentication.get()))));
  }

  private void authorizeAction(
      AuthorizeHttpRequestsConfigurer<HttpSecurity>.AuthorizationManagerRequestMatcherRegistry
          authorize,
      HttpMethod method,
      String[] paths,
      String legacyAction) {
    authorize
        .requestMatchers(method, paths)
        .access(
            (authentication, context) ->
                new AuthorizationDecision(
                    authorizationService.canPerformAction(
                        getAuthorities(authentication.get()), legacyAction)));
  }

  private List<String> getAuthorities(Authentication authentication) {
    if (authentication == null || authentication.getAuthorities() == null) {
      return List.of();
    }
    return authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).toList();
  }
}

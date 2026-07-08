package ca.bc.gov.mof.lexis.security;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.http.HttpMethod;
import org.springframework.util.AntPathMatcher;

final class LexisApiAuthorizationRules {

  enum RuleType {
    PERMIT_ALL,
    ADMIN_AUTHORITY,
    KNOWN_ROLE,
    ACTION
  }

  private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();

  private static final String ACTION_APPLICATION_DETAILS = "/applicationDetails";
  private static final String ACTION_APPLICATION_REMARKS = "/applicationRemarks";
  private static final String ACTION_APPLICATIONS_REVIEW = "/applicationsReview";
  private static final String ACTION_CREATE_APPLICATION = "createApplication";
  private static final String ACTION_CREATE_EXEMPTION = "/createExemption";
  private static final String ACTION_CREATE_OFFER = "createOffer";
  private static final String ACTION_EXEMPTION_DETAILS = "/exemptionDetails";
  private static final String ACTION_FILE_APPLICATION_UPLOAD = "/fileApplicationUpload";
  private static final String ACTION_LEXIS_AGENT_ADMIN = "/lexisAgentAdmin";
  private static final String ACTION_LEXIS_FIL_ADMIN = "/lexisFILAdmin";
  private static final String ACTION_LEXIS_POLICY_ADMIN = "/lexisPolicyAdmin";
  private static final String ACTION_MOFR_LISTING = "mofrListing";
  private static final String ACTION_OFFER_DETAILS = "/offerDetails";
  private static final String ACTION_PERMIT_DETAILS = "/permitDetails";
  private static final String ACTION_SAVE_EXEMPTION = "saveExemption";
  private static final String ACTION_APPROVE_EXEMPTION = "approveExemption";
  private static final String ACTION_SAVE_PERMIT = "savePermit";
  private static final String ACTION_UPLOAD_APPLICATION_SUBMISSION = "uploadApplicationSubmission";
  private static final String ACTION_UPLOAD_FEDERAL_SUBMISSION = "uploadFederalSubmission";

  /*
   * Keep both modern REST paths and legacy .do/RPC aliases here.
   *
   * The nr-lexis frontend uses the REST-ish /api/lexis/... routes. Legacy aliases remain because
   * nr-lexis-main used those Struts/JSP entry points and this backend still exposes compatibility
   * controllers for the migrated workflows.
   */
  private static final Map<String, String> APPLICATION_DETAILS_RPC_ACTIONS =
      actionMap(
          Map.entry("getDocumentDetails", ACTION_APPLICATION_DETAILS),
          Map.entry("getDocument", ACTION_APPLICATION_DETAILS),
          Map.entry("removeDocument", ACTION_FILE_APPLICATION_UPLOAD),
          Map.entry("getRemark", ACTION_APPLICATION_DETAILS),
          Map.entry("persistRemark", ACTION_APPLICATION_REMARKS),
          Map.entry("checkFormChanges", ACTION_APPLICATION_DETAILS),
          Map.entry("checkUnusedVolume", ACTION_APPLICATION_DETAILS),
          Map.entry("releaseLock", ACTION_APPLICATION_DETAILS),
          Map.entry("sendApplRejectEmail", ACTION_APPLICATIONS_REVIEW),
          Map.entry("sendApplWithdrawnEmail", ACTION_APPLICATIONS_REVIEW),
          Map.entry("sendApplicationWithdrawnEmail", ACTION_APPLICATIONS_REVIEW),
          Map.entry("addApplication", ACTION_CREATE_APPLICATION),
          Map.entry("updateApplication", ACTION_CREATE_APPLICATION),
          Map.entry("getClientData", ACTION_APPLICATION_DETAILS),
          Map.entry("getClientLocations", ACTION_APPLICATION_DETAILS),
          Map.entry("getContactsForLocation", ACTION_APPLICATION_DETAILS),
          Map.entry("getSpeciesCodes", ACTION_APPLICATION_DETAILS),
          Map.entry("getPackageStatusCodes", ACTION_APPLICATION_DETAILS),
          Map.entry("getGradeCodes", ACTION_APPLICATION_DETAILS),
          Map.entry("getEndUseForSpeciesRegion", ACTION_APPLICATION_DETAILS),
          Map.entry("getRemainingSpecies", ACTION_APPLICATION_DETAILS),
          Map.entry("getSelectedEndUse", ACTION_APPLICATION_DETAILS),
          Map.entry("getPackageSelectedEndUse", ACTION_APPLICATION_DETAILS),
          Map.entry("getSpeciesForApplication", ACTION_APPLICATION_DETAILS),
          Map.entry("getSpeciesForPackage", ACTION_APPLICATION_DETAILS),
          Map.entry("getUniqueScalesForApplication", ACTION_APPLICATION_DETAILS),
          Map.entry("findPermit", ACTION_APPLICATION_DETAILS),
          Map.entry("getScalesForPackage", ACTION_APPLICATION_DETAILS),
          Map.entry("getPackageDetails", ACTION_APPLICATION_DETAILS),
          Map.entry("getScaleById", ACTION_APPLICATION_DETAILS),
          Map.entry("isPackageValid", ACTION_APPLICATION_DETAILS),
          Map.entry("addPackageToApplication", ACTION_CREATE_APPLICATION),
          Map.entry("updatePackage", ACTION_CREATE_APPLICATION),
          Map.entry("addScaleToPackage", ACTION_CREATE_APPLICATION),
          Map.entry("deleteScaleById", ACTION_CREATE_APPLICATION),
          Map.entry("deletePackageById", ACTION_CREATE_APPLICATION));

  private static final Map<String, String> EXEMPTION_DETAILS_RPC_ACTIONS =
      actionMap(
          Map.entry("getApplications", ACTION_EXEMPTION_DETAILS),
          Map.entry("getPermits", ACTION_EXEMPTION_DETAILS),
          Map.entry("getBlanketOICTotals", ACTION_EXEMPTION_DETAILS),
          Map.entry("getDocumentDetails", ACTION_EXEMPTION_DETAILS),
          Map.entry("getDocument", ACTION_EXEMPTION_DETAILS),
          Map.entry("removeDocument", ACTION_SAVE_EXEMPTION),
          Map.entry("checkExemptionNumber", ACTION_EXEMPTION_DETAILS),
          Map.entry("addApplicationToExemption", ACTION_SAVE_EXEMPTION),
          Map.entry("removeApplicationFromExemption", ACTION_SAVE_EXEMPTION),
          Map.entry("addExemption", ACTION_SAVE_EXEMPTION),
          Map.entry("updateExemption", ACTION_SAVE_EXEMPTION),
          Map.entry("approveExemptions", ACTION_APPROVE_EXEMPTION),
          Map.entry("sendExemptionApprovalEmail", ACTION_APPROVE_EXEMPTION),
          Map.entry("sendExemptionApprovalEmails", ACTION_APPROVE_EXEMPTION),
          Map.entry("getClientData", ACTION_EXEMPTION_DETAILS),
          Map.entry("getClientLocations", ACTION_EXEMPTION_DETAILS),
          Map.entry("getContactsForLocation", ACTION_EXEMPTION_DETAILS));

  private static final Map<String, String> OFFER_DETAILS_RPC_ACTIONS =
      actionMap(
          Map.entry("validateApplicationNumber", ACTION_OFFER_DETAILS),
          Map.entry("getApplicationDetails", ACTION_OFFER_DETAILS),
          Map.entry("getPackageList", ACTION_OFFER_DETAILS),
          Map.entry("getPackageVolume", ACTION_OFFER_DETAILS),
          Map.entry("getApplicationVolume", ACTION_OFFER_DETAILS),
          Map.entry("getClientData", ACTION_OFFER_DETAILS),
          Map.entry("getClientLocations", ACTION_OFFER_DETAILS),
          Map.entry("addOffer", ACTION_CREATE_OFFER),
          Map.entry("updateOffer", ACTION_OFFER_DETAILS));

  private static final Map<String, String> PERMIT_DETAILS_RPC_ACTIONS =
      actionMap(
          Map.entry("getPermitSummary", ACTION_PERMIT_DETAILS),
          Map.entry("getTotalFeesForPermit", ACTION_PERMIT_DETAILS),
          Map.entry("getScaleFeesForPackage", ACTION_PERMIT_DETAILS),
          Map.entry("getPermitDataAfterScaleUpdate", ACTION_PERMIT_DETAILS),
          Map.entry("getPackageVolumeSum", ACTION_PERMIT_DETAILS),
          Map.entry("getPackageList", ACTION_PERMIT_DETAILS),
          Map.entry("getOICPackageList", ACTION_PERMIT_DETAILS),
          Map.entry("getPackageInfo", ACTION_PERMIT_DETAILS),
          Map.entry("getPackageDetails", ACTION_PERMIT_DETAILS),
          Map.entry("getScalesForPackage", ACTION_PERMIT_DETAILS),
          Map.entry("checkPermitNumber", ACTION_PERMIT_DETAILS),
          Map.entry("addPermit", ACTION_SAVE_PERMIT),
          Map.entry("updatePermit", ACTION_SAVE_PERMIT),
          Map.entry("updateShipping", ACTION_SAVE_PERMIT),
          Map.entry("updateScale", ACTION_SAVE_PERMIT),
          Map.entry("addApplicationsToPermit", ACTION_SAVE_PERMIT),
          Map.entry("removeApplicationFromPermit", ACTION_SAVE_PERMIT),
          Map.entry("getApplicationList", ACTION_PERMIT_DETAILS),
          Map.entry("getAvailableApplicationList", ACTION_PERMIT_DETAILS),
          Map.entry("getAvailablePackageList", ACTION_PERMIT_DETAILS),
          Map.entry("getApprovedExemptionVolume", ACTION_PERMIT_DETAILS),
          Map.entry("getExemptionVolumeRemaining", ACTION_PERMIT_DETAILS),
          Map.entry("getPermitHasApplications", ACTION_PERMIT_DETAILS),
          Map.entry("addInvoice", ACTION_SAVE_PERMIT),
          Map.entry("checkFormChanges", ACTION_PERMIT_DETAILS),
          Map.entry("releaseLock", ACTION_PERMIT_DETAILS),
          Map.entry("getInvoicesForPermit", ACTION_PERMIT_DETAILS),
          Map.entry("getInvoiceDetails", ACTION_PERMIT_DETAILS),
          Map.entry("getGBMSInvoiceHistory", ACTION_PERMIT_DETAILS),
          Map.entry("getConversionRate", ACTION_PERMIT_DETAILS),
          Map.entry("getCountryList", ACTION_PERMIT_DETAILS),
          Map.entry("getFileTypes", ACTION_PERMIT_DETAILS),
          Map.entry("getDocument", ACTION_PERMIT_DETAILS),
          Map.entry("getDocumentDetails", ACTION_PERMIT_DETAILS),
          Map.entry("removePermitDocument", ACTION_SAVE_PERMIT),
          Map.entry("removeApplicationDocument", ACTION_SAVE_PERMIT),
          Map.entry("removeInvoiceDocument", ACTION_SAVE_PERMIT));

  private static final List<Rule> RULES =
      List.of(
          permitAll(HttpMethod.OPTIONS, "/**"),
          adminAuthority("/actuator/**"),
          knownRole("/error"),
          knownRole("/api/lexis/session/**"),
          knownRole(
              "/api/lexis/showWelcome",
              "/api/lexis/showWelcome.do",
              "/api/lexis/logoff",
              "/api/lexis/logoff.do",
              "/api/lexis/accessDenied",
              "/api/lexis/accessDenied.do",
              "/api/lexis/errorPage",
              "/api/lexis/errorPage.do"),
          knownRole("/api/lexis/reports/options"),
          action(
              HttpMethod.GET,
              "/applicationSearch",
              "/api/lexis/applicationSearch",
              "/api/lexis/applicationSearch.do",
              "/api/lexis/applications/search/options",
              "/api/lexis/applications/search",
              "/api/lexis/applications/search/count",
              "/api/lexis/applications/search/verify-clients",
              "/api/lexis/applications/search/has-valid-offer"),
          action(
              HttpMethod.GET,
              ACTION_APPLICATION_DETAILS,
              "/api/lexis/applicationDetails",
              "/api/lexis/applicationDetails.do",
              "/api/lexis/applications/*"),
          action(
              HttpMethod.GET,
              "/exemptionSearch",
              "/api/lexis/exemptionSearch",
              "/api/lexis/exemptionSearch.do",
              "/api/lexis/exemptions/search/options",
              "/api/lexis/exemptions/search",
              "/api/lexis/exemptions/search/count"),
          action(
              HttpMethod.GET,
              ACTION_EXEMPTION_DETAILS,
              "/api/lexis/exemptionDetails",
              "/api/lexis/exemptionDetails.do",
              "/api/lexis/exemptions/*"),
          action(
              HttpMethod.GET,
              "/federalApplicationSearch",
              "/api/lexis/federal/applications/search/options",
              "/api/lexis/federal/applications/search",
              "/api/lexis/federal/applications/search/count",
              "/api/lexis/federal/applications/search/verify-clients"),
          action(
              HttpMethod.GET,
              "/federalApplicationDetails",
              "/api/lexis/federal/applications/*",
              "/api/lexis/federal/applications/*/permit"),
          action(
              HttpMethod.GET,
              "/offersSearch",
              "/api/lexis/offersSearch",
              "/api/lexis/offersSearch.do",
              "/api/lexis/purchase-offers/search/options",
              "/api/lexis/purchase-offers/search",
              "/api/lexis/purchase-offers/search/count"),
          action(
              HttpMethod.GET,
              ACTION_OFFER_DETAILS,
              "/api/lexis/offerDetails",
              "/api/lexis/offerDetails.do",
              "/api/lexis/purchase-offers/*"),
          action(
              HttpMethod.GET,
              "/permitSearch",
              "/api/lexis/permitSearch",
              "/api/lexis/permitSearch.do",
              "/api/lexis/permits/search/options",
              "/api/lexis/permits/search",
              "/api/lexis/permits/search/count"),
          action(
              HttpMethod.GET,
              ACTION_PERMIT_DETAILS,
              "/api/lexis/permitDetails",
              "/api/lexis/permitDetails.do",
              "/api/lexis/feeDetails",
              "/api/lexis/feeDetails.do",
              "/api/lexis/permits/*",
              "/api/lexis/fee-details/permits/*/summary"),
          action(
              HttpMethod.GET,
              "/summary",
              "/api/lexis/summary",
              "/api/lexis/summary.do",
              "/api/lexis/summary/**"),
          action(HttpMethod.POST, "/summary", "/api/lexis/summary", "/api/lexis/summary.do"),
          action(
              HttpMethod.GET,
              "/applicationsReview",
              "/api/lexis/applicationsReview",
              "/api/lexis/applicationsReview.do",
              "/api/lexis/application-reviews/search/options",
              "/api/lexis/application-reviews/search",
              "/api/lexis/application-reviews/search/count",
              "/api/lexis/application-reviews/search/preview"),
          action(
              HttpMethod.POST,
              "/applicationsReview",
              "/api/lexis/applicationsReview",
              "/api/lexis/applicationsReview.do",
              "/api/lexis/application-reviews/*/approve",
              "/api/lexis/application-reviews/*/status",
              "/api/lexis/application-reviews/*/status-email"),
          adminAuthority("/api/lexis/admin/fam-users"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_AGENT_ADMIN,
              "/api/lexis/admin/agent",
              "/api/lexis/admin/lexisAgentAdmin"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_AGENT_ADMIN,
              "/api/lexis/lexisAgentAdmin",
              "/api/lexis/lexisAgentAdmin.do"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/admin/policy",
              "/api/lexis/admin/lexisPolicyAdmin",
              "/api/lexis/admin/policies/fee",
              "/api/lexis/admin/schedules"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/lexisPolicyAdmin",
              "/api/lexis/lexisPolicyAdmin.do"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_FIL_ADMIN,
              "/api/lexis/admin/fil-policy",
              "/api/lexis/admin/lexisFILAdmin",
              "/api/lexis/admin/policies/fil"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_FIL_ADMIN,
              "/api/lexis/lexisFILAdmin",
              "/api/lexis/lexisFILAdmin.do"),
          action(
              HttpMethod.POST,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/admin/policy/rpc",
              "/api/lexis/admin/lexisPolicyAdminRPC",
              "/api/lexis/admin/policies/fee",
              "/api/lexis/admin/schedules"),
          action(
              HttpMethod.PUT,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/admin/policies/fee/*",
              "/api/lexis/admin/schedules/*"),
          action(
              HttpMethod.DELETE,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/admin/policies/fee/*",
              "/api/lexis/admin/schedules/*"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/lexisPolicyAdminRPC",
              "/api/lexis/lexisPolicyAdminRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_LEXIS_POLICY_ADMIN,
              "/api/lexis/lexisPolicyAdminRPC",
              "/api/lexis/lexisPolicyAdminRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_LEXIS_FIL_ADMIN,
              "/api/lexis/admin/fil-policy/rpc",
              "/api/lexis/admin/lexisFILAdminRPC",
              "/api/lexis/admin/policies/fil"),
          action(HttpMethod.PUT, ACTION_LEXIS_FIL_ADMIN, "/api/lexis/admin/policies/fil/*"),
          action(HttpMethod.DELETE, ACTION_LEXIS_FIL_ADMIN, "/api/lexis/admin/policies/fil/*"),
          action(
              HttpMethod.GET,
              ACTION_LEXIS_FIL_ADMIN,
              "/api/lexis/lexisFILAdminRPC",
              "/api/lexis/lexisFILAdminRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_LEXIS_FIL_ADMIN,
              "/api/lexis/lexisFILAdminRPC",
              "/api/lexis/lexisFILAdminRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_FILE_APPLICATION_UPLOAD,
              "/api/lexis/fileApplicationUpload",
              "/api/lexis/uploads/application",
              "/api/lexis/uploads/application/validation",
              "/api/lexis/admin/uploads/applications",
              "/api/lexis/admin/uploads/applications/validation"),
          action(
              HttpMethod.POST,
              "/filePermitUpload",
              "/api/lexis/filePermitUpload",
              "/api/lexis/uploads/permit",
              "/api/lexis/uploads/permit/validation",
              "/api/lexis/admin/uploads/permits",
              "/api/lexis/admin/uploads/permits/validation"),
          action(
              HttpMethod.POST,
              "/fileExemptionUpload",
              "/api/lexis/fileExemptionUpload",
              "/api/lexis/uploads/exemption",
              "/api/lexis/uploads/exemption/validation",
              "/api/lexis/admin/uploads/exemptions",
              "/api/lexis/admin/uploads/exemptions/validation"),
          action(
              HttpMethod.POST,
              "/fileInvoiceUpload",
              "/api/lexis/fileInvoiceUpload",
              "/api/lexis/uploads/invoice",
              "/api/lexis/uploads/invoice/validation",
              "/api/lexis/admin/uploads/invoices",
              "/api/lexis/admin/uploads/invoices/validation"),
          action(
              HttpMethod.POST,
              ACTION_UPLOAD_APPLICATION_SUBMISSION,
              "/api/lexis/application-submissions",
              "/api/lexis/uploads/lexis-xml",
              "/api/lexis/admin/uploads/lexis-xml",
              "/api/lexis/application-submissions/validation",
              "/api/lexis/uploads/lexis-xml/validation",
              "/api/lexis/admin/uploads/lexis-xml/validation"),
          action(
              HttpMethod.POST,
              ACTION_UPLOAD_FEDERAL_SUBMISSION,
              "/api/lexis/federal/submissions",
              "/api/lexis/federal/submissions/validation"),
          action(HttpMethod.GET, ACTION_LEXIS_AGENT_ADMIN, "/api/lexis/rtm/emslogamv"),
          action(HttpMethod.POST, ACTION_LEXIS_AGENT_ADMIN, "/api/lexis/rtm/emslogamv"),
          action(HttpMethod.POST, ACTION_LEXIS_AGENT_ADMIN, "/api/lexis/rtm/emslogamv/preview"),
          action(HttpMethod.POST, ACTION_LEXIS_AGENT_ADMIN, "/api/lexis/rtm/emslogamv/upload"),
          action(
              HttpMethod.GET,
              ACTION_CREATE_APPLICATION,
              "/api/lexis/rpc/application-details/application-summary"),
          action(
              HttpMethod.GET,
              ACTION_APPLICATION_DETAILS,
              "/api/lexis/rpc/application-details/**",
              "/api/lexis/applicationDetailsRPC",
              "/api/lexis/applicationDetailsRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_APPLICATION_REMARKS,
              "/api/lexis/rpc/application-details/remark"),
          action(
              HttpMethod.POST,
              ACTION_CREATE_APPLICATION,
              "/api/lexis/rpc/application-details/application",
              "/api/lexis/rpc/application-details/application-summary",
              "/api/lexis/rpc/application-details/package",
              "/api/lexis/rpc/application-details/package-update",
              "/api/lexis/rpc/application-details/package-scale"),
          action(
              HttpMethod.POST,
              ACTION_APPLICATION_DETAILS,
              "/api/lexis/rpc/application-details/release-lock"),
          legacyAction(
              HttpMethod.POST,
              ACTION_APPLICATION_DETAILS,
              APPLICATION_DETAILS_RPC_ACTIONS,
              "/api/lexis/applicationDetailsRPC",
              "/api/lexis/applicationDetailsRPC.do"),
          action(
              HttpMethod.DELETE,
              ACTION_FILE_APPLICATION_UPLOAD,
              "/api/lexis/rpc/application-details/document"),
          action(
              HttpMethod.DELETE,
              ACTION_CREATE_APPLICATION,
              "/api/lexis/rpc/application-details/scale",
              "/api/lexis/rpc/application-details/package"),
          action(
              HttpMethod.GET,
              ACTION_EXEMPTION_DETAILS,
              "/api/lexis/rpc/exemption-details/**",
              "/api/lexis/exemptionDetailsRPC"),
          action(
              HttpMethod.POST,
              ACTION_APPROVE_EXEMPTION,
              "/api/lexis/rpc/exemption-details/approve-exemptions",
              "/api/lexis/rpc/exemption-details/approval-email",
              "/api/lexis/rpc/exemption-details/approval-emails"),
          action(
              HttpMethod.POST,
              ACTION_SAVE_EXEMPTION,
              "/api/lexis/rpc/exemption-details/**"),
          legacyAction(
              HttpMethod.POST,
              ACTION_EXEMPTION_DETAILS,
              EXEMPTION_DETAILS_RPC_ACTIONS,
              "/api/lexis/exemptionDetailsRPC"),
          action(
              HttpMethod.DELETE,
              ACTION_SAVE_EXEMPTION,
              "/api/lexis/rpc/exemption-details/**"),
          action(
              HttpMethod.GET,
              ACTION_OFFER_DETAILS,
              "/api/lexis/rpc/offer-details/**",
              "/api/lexis/offerDetailsRPC",
              "/api/lexis/offerDetailsRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_CREATE_OFFER,
              "/api/lexis/rpc/offer-details/offer"),
          action(
              HttpMethod.POST,
              ACTION_OFFER_DETAILS,
              "/api/lexis/rpc/offer-details/offer/update"),
          legacyAction(
              HttpMethod.POST,
              ACTION_OFFER_DETAILS,
              OFFER_DETAILS_RPC_ACTIONS,
              "/api/lexis/offerDetailsRPC",
              "/api/lexis/offerDetailsRPC.do"),
          action(
              HttpMethod.GET,
              ACTION_PERMIT_DETAILS,
              "/api/lexis/rpc/permit-details/**",
              "/api/lexis/permitDetailsRPC",
              "/api/lexis/permitDetailsRPC.do"),
          action(
              HttpMethod.POST,
              ACTION_SAVE_PERMIT,
              "/api/lexis/rpc/permit-details/add-permit",
              "/api/lexis/rpc/permit-details/update-permit",
              "/api/lexis/rpc/permit-details/update-shipping",
              "/api/lexis/rpc/permit-details/update-scale-attachment",
              "/api/lexis/rpc/permit-details/add-applications-to-permit",
              "/api/lexis/rpc/permit-details/remove-application-from-permit",
              "/api/lexis/rpc/permit-details/add-boic-scale",
              "/api/lexis/rpc/permit-details/delete-boic-scale",
              "/api/lexis/rpc/permit-details/add-invoice"),
          action(
              HttpMethod.POST,
              ACTION_PERMIT_DETAILS,
              "/api/lexis/rpc/permit-details/release-lock"),
          legacyAction(
              HttpMethod.POST,
              ACTION_PERMIT_DETAILS,
              PERMIT_DETAILS_RPC_ACTIONS,
              "/api/lexis/permitDetailsRPC",
              "/api/lexis/permitDetailsRPC.do"),
          action(
              HttpMethod.DELETE,
              ACTION_SAVE_PERMIT,
              "/api/lexis/rpc/permit-details/document/permit",
              "/api/lexis/rpc/permit-details/document/application",
              "/api/lexis/rpc/permit-details/document/invoice"),
          action(
              HttpMethod.POST,
              ACTION_MOFR_LISTING,
              "/api/lexis/reports/biweeklyListing",
              "/api/lexis/reports/biweekly-listing"),
          action(
              HttpMethod.POST,
              "/offerReport",
              "/api/lexis/reports/offerReport",
              "/api/lexis/reports/offer-report",
              "/api/lexis/offerReport",
              "/api/lexis/offerReport.do"),
          action(HttpMethod.GET, "/offerReport", "/api/lexis/offerReport", "/api/lexis/offerReport.do"),
          action(
              HttpMethod.POST,
              "/speciesGradeReport",
              "/api/lexis/reports/speciesGradeReport",
              "/api/lexis/reports/species-grade-report",
              "/api/lexis/speciesGradeReport",
              "/api/lexis/speciesGradeReport.do"),
          action(
              HttpMethod.GET,
              "/speciesGradeReport",
              "/api/lexis/speciesGradeReport",
              "/api/lexis/speciesGradeReport.do"),
          action(
              HttpMethod.POST,
              "/exemptionReport",
              "/api/lexis/reports/exemptionReport",
              "/api/lexis/reports/exemption-report",
              "/api/lexis/exemptionReport",
              "/api/lexis/exemptionReport.do"),
          action(
              HttpMethod.GET,
              "/exemptionReport",
              "/api/lexis/exemptionReport",
              "/api/lexis/exemptionReport.do"),
          action(
              HttpMethod.POST,
              "/applicationReport",
              "/api/lexis/reports/applicationReport",
              "/api/lexis/reports/application-report",
              "/api/lexis/applicationReport",
              "/api/lexis/applicationReport.do"),
          action(
              HttpMethod.GET,
              "/applicationReport",
              "/api/lexis/applicationReport",
              "/api/lexis/applicationReport.do"),
          action(
              HttpMethod.POST,
              "/approvedExemptionReport",
              "/api/lexis/reports/approvedExemptionReport",
              "/api/lexis/reports/approved-exemption-report",
              "/api/lexis/approvedExemptionReport",
              "/api/lexis/approvedExemptionReport.do"),
          action(
              HttpMethod.GET,
              "/approvedExemptionReport",
              "/api/lexis/approvedExemptionReport",
              "/api/lexis/approvedExemptionReport.do"),
          action(
              HttpMethod.POST,
              "/permitReport",
              "/api/lexis/reports/permitReport",
              "/api/lexis/reports/permit-report",
              "/api/lexis/permitReport",
              "/api/lexis/permitReport.do"),
          action(
              HttpMethod.GET,
              "/permitReport",
              "/api/lexis/permitReport",
              "/api/lexis/permitReport.do"),
          action(
              HttpMethod.POST,
              "/permitLedgerReport",
              "/api/lexis/reports/permitLedgerReport",
              "/api/lexis/reports/permit-ledger-report",
              "/api/lexis/permitLedgerReport",
              "/api/lexis/permitLedgerReport.do"),
          action(
              HttpMethod.GET,
              "/permitLedgerReport",
              "/api/lexis/permitLedgerReport",
              "/api/lexis/permitLedgerReport.do"),
          action(
              HttpMethod.POST,
              "/feeReport",
              "/api/lexis/reports/feeReport",
              "/api/lexis/reports/fee-report",
              "/api/lexis/feeReport",
              "/api/lexis/feeReport.do"),
          action(HttpMethod.GET, "/feeReport", "/api/lexis/feeReport", "/api/lexis/feeReport.do"),
          action(
              HttpMethod.POST,
              "/transportReport",
              "/api/lexis/reports/transportReport",
              "/api/lexis/reports/transport-report",
              "/api/lexis/transportReport",
              "/api/lexis/transportReport.do"),
          action(
              HttpMethod.GET,
              "/transportReport",
              "/api/lexis/transportReport",
              "/api/lexis/transportReport.do"),
          action(
              HttpMethod.POST,
              "/teacReport",
              "/api/lexis/reports/teacReport",
              "/api/lexis/reports/teac-report",
              "/api/lexis/teacReport",
              "/api/lexis/teacReport.do"),
          action(HttpMethod.GET, "/teacReport", "/api/lexis/teacReport", "/api/lexis/teacReport.do"),
          action(
              HttpMethod.POST,
              "/tenureReport",
              "/api/lexis/reports/tenureReport",
              "/api/lexis/reports/tenure-report",
              "/api/lexis/tenureReport",
              "/api/lexis/tenureReport.do"),
          action(
              HttpMethod.GET,
              "/tenureReport",
              "/api/lexis/tenureReport",
              "/api/lexis/tenureReport.do"));

  private LexisApiAuthorizationRules() {}

  static List<Rule> rules() {
    return RULES;
  }

  static Optional<Rule> findRule(HttpMethod method, String path, String actionMapping) {
    return RULES.stream()
        .filter(rule -> rule.matches(method, path))
        .filter(rule -> rule.coversActionMapping(actionMapping))
        .findFirst();
  }

  static String normalizeActionMapping(String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank()) {
      return "";
    }
    return actionMapping.trim().toLowerCase(Locale.ROOT);
  }

  private static Rule permitAll(HttpMethod method, String... paths) {
    return new Rule(RuleType.PERMIT_ALL, method, List.of(paths), null, Map.of());
  }

  private static Rule adminAuthority(String... paths) {
    return new Rule(RuleType.ADMIN_AUTHORITY, null, List.of(paths), null, Map.of());
  }

  private static Rule knownRole(String... paths) {
    return new Rule(RuleType.KNOWN_ROLE, null, List.of(paths), null, Map.of());
  }

  private static Rule action(HttpMethod method, String legacyAction, String... paths) {
    return new Rule(RuleType.ACTION, method, List.of(paths), legacyAction, Map.of());
  }

  private static Rule legacyAction(
      HttpMethod method, String defaultAction, Map<String, String> actionMappings, String... paths) {
    return new Rule(RuleType.ACTION, method, List.of(paths), defaultAction, actionMappings);
  }

  @SafeVarargs
  private static Map<String, String> actionMap(Map.Entry<String, String>... entries) {
    Map<String, String> normalized = new TreeMap<>();
    for (Map.Entry<String, String> entry : entries) {
      normalized.put(normalizeActionMapping(entry.getKey()), entry.getValue());
    }
    return Map.copyOf(normalized);
  }

  record Rule(
      RuleType type,
      HttpMethod method,
      List<String> patterns,
      String defaultAction,
      Map<String, String> actionMappings) {

    String requiredAction(String actionMapping) {
      return actionMappings.getOrDefault(normalizeActionMapping(actionMapping), defaultAction);
    }

    boolean matches(HttpMethod requestMethod, String path) {
      if (method != null && method != requestMethod) {
        return false;
      }
      return patterns.stream().anyMatch(pattern -> PATH_MATCHER.match(pattern, path));
    }

    boolean coversActionMapping(String actionMapping) {
      if (actionMapping == null || actionMapping.isBlank() || actionMappings.isEmpty()) {
        return true;
      }
      return actionMappings.containsKey(normalizeActionMapping(actionMapping));
    }

    String[] patternsArray() {
      return patterns.toArray(String[]::new);
    }
  }
}

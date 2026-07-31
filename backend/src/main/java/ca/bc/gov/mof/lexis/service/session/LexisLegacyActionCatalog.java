package ca.bc.gov.mof.lexis.service.session;

import java.util.List;

final class LexisLegacyActionCatalog {

  private LexisLegacyActionCatalog() {}

  // INTENTIONAL_LEGACY_DIVERGENCE(INDIGENOUS_RESERVE_MODULE_RETIREMENT):
  // Retired Indian Reserve search/detail actions are deliberately absent from this catalog.
  static final List<String> ACTIONS =
      List.of(
          "/applicationDetails",
          "/applicationRemarks",
          "/applicationReport",
          "/applicationSearch",
          "/applicationsReview",
          "/approvedExemptionReport",
          "/changeApplicantType",
          "/createExemption",
          "/editCompletedApplications",
          "/exemptionDetails",
          "/exemptionReport",
          "/exemptionSearch",
          "/federalApplicationDetails",
          "/federalApplicationSearch",
          "/feeReport",
          "/fileApplicationUpload",
          "/fileExemptionUpload",
          "/fileInvoiceUpload",
          "/filePermitUpload",
          "/lexisAgentAdmin",
          "/lexisFILAdmin",
          "/lexisPolicyAdmin",
          "/offerDetails",
          "/offerReport",
          "/offersSearch",
          "/permitDetails",
          "/permitLedgerReport",
          "/permitReport",
          "/permitSearch",
          "/permitsReview",
          "/speciesGradeReport",
          "/summary",
          "/teacReport",
          "/tenureReport",
          "/transportReport",
          "approveExemption",
          "createApplication",
          "createOffer",
          "createPermit",
          "manageFederalApplication",
          "mofrListing",
          "saveExemption",
          "savePermit",
          "uploadApplicationSubmission",
          "viewFederalApplication");
}

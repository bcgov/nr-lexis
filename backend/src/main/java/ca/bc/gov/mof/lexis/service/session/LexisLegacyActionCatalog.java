package ca.bc.gov.mof.lexis.service.session;

import java.util.List;

final class LexisLegacyActionCatalog {

  private LexisLegacyActionCatalog() {}

  static final List<String> ACTIONS =
      List.of(
          "/applicationDetails",
          "/applicationRemarks",
          "/applicationReport",
          "/applicationSearch",
          "/applicationsReview",
          "/approvedExemptionReport",
          "/blankListing",
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
          "/indianReservePermitDetails",
          "/indianReservePermitSearch",
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
          "industryListing",
          "mofrListing",
          "saveExemption",
          "savePermit",
          "viewFederalApplication",
          "viewOICApplication");
}

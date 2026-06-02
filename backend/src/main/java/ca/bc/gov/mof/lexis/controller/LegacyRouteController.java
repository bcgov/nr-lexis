package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class LegacyRouteController {

  private static final String ACTION_VIEW = "view";
  private static final String ACTION_ADD = "add";
  private static final String ACTION_CREATE = "create";
  private static final String ACTION_VERIFY_APPLICATION_CLIENTS = "verifyApplicationClients";
  private static final String ACTION_HAS_VALID_OFFER = "hasValidOffer";
  private static final String ACTION_GET_APPLICATIONS = "getApplications";
  private static final String ACTION_GET_EXEMPTIONS = "getExemptions";
  private static final String ACTION_GET_OFFERS = "getOffers";
  private static final String ACTION_GET_PERMITS = "getPermits";
  private static final String ACTION_GET_FEES = "getFees";
  private static final String ACTION_GET_OFFER_PLACED = "getOfferPlaced";
  private static final String ACTION_UPDATE_APPLICATION_PAGING = "updateApplicationPaging";
  private static final String ACTION_UPDATE_EXEMPTION_PAGING = "updateExemptionPaging";
  private static final String ACTION_UPDATE_OFFER_PAGING = "updateOfferPaging";
  private static final String ACTION_UPDATE_PERMIT_PAGING = "updatePermitPaging";
  private static final String ACTION_UPDATE_FEE_PAGING = "updateFeePaging";
  private static final String ACTION_UPDATE_OFFER_PLACED_PAGING = "updateOfferPlacedPaging";
  private static final String ACTION_VALIDATE_APPLICATION_NUMBER = "validateApplicationNumber";
  private static final String ACTION_GET_APPLICATION_DETAILS = "getApplicationDetails";
  private static final String ACTION_GET_PACKAGE_LIST = "getPackageList";
  private static final String ACTION_GET_PACKAGE_VOLUME = "getPackageVolume";
  private static final String ACTION_GET_APPLICATION_VOLUME = "getApplicationVolume";
  private static final String ACTION_GET_CLIENT_DATA = "getClientData";
  private static final String ACTION_GET_CLIENT_LOCATIONS = "getClientLocations";
  private static final String ACTION_ADD_OFFER = "addOffer";
  private static final String ACTION_GET_PERMIT_SUMMARY = "getPermitSummary";
  private static final String ACTION_GET_TOTAL_FEES_FOR_PERMIT = "getTotalFeesForPermit";
  private static final String ACTION_GET_SCALE_FEES_FOR_PACKAGE = "getScaleFeesForPackage";
  private static final String ACTION_GET_PERMIT_DATA_AFTER_SCALE_UPDATE = "getPermitDataAfterScaleUpdate";
  private static final String ACTION_GET_PACKAGE_VOLUME_SUM = "getPackageVolumeSum";
  private static final String ACTION_GET_PACKAGE_INFO = "getPackageInfo";
  private static final String ACTION_GET_PACKAGE_DETAILS = "getPackageDetails";
  private static final String ACTION_GET_OIC_PACKAGE_LIST = "getOICPackageList";
  private static final String ACTION_GET_SCALES_FOR_PACKAGE = "getScalesForPackage";
  private static final String ACTION_CHECK_PERMIT_NUMBER = "checkPermitNumber";
  private static final String ACTION_ADD_PERMIT = "addPermit";
  private static final String ACTION_UPDATE_PERMIT = "updatePermit";
  private static final String ACTION_UPDATE_SHIPPING = "updateShipping";
  private static final String ACTION_GET_APPLICATION_LIST = "getApplicationList";
  private static final String ACTION_GET_AVAILABLE_APPLICATION_LIST = "getAvailableApplicationList";
  private static final String ACTION_GET_AVAILABLE_PACKAGE_LIST = "getAvailablePackageList";
  private static final String ACTION_GET_APPROVED_EXEMPTION_VOLUME = "getApprovedExemptionVolume";
  private static final String ACTION_GET_EXEMPTION_VOLUME_REMAINING = "getExemptionVolumeRemaining";
  private static final String ACTION_GET_PERMIT_HAS_APPLICATIONS = "getPermitHasApplications";
  private static final String ACTION_ADD_INVOICE = "addInvoice";
  private static final String ACTION_GET_INVOICES_FOR_PERMIT = "getInvoicesForPermit";
  private static final String ACTION_GET_INVOICE_DETAILS = "getInvoiceDetails";
  private static final String ACTION_GET_GBMS_INVOICE_HISTORY = "getGBMSInvoiceHistory";
  private static final String ACTION_GET_CONVERSION_RATE = "getConversionRate";
  private static final String ACTION_GET_COUNTRY_LIST = "getCountryList";
  private static final String ACTION_GET_FILE_TYPES = "getFileTypes";
  private static final String ACTION_CHECK_FORM_CHANGES = "checkFormChanges";
  private static final String ACTION_RELEASE_LOCK = "releaseLock";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_REMOVE_PERMIT_DOCUMENT = "removePermitDocument";
  private static final String ACTION_REMOVE_APPLICATION_DOCUMENT = "removeApplicationDocument";
  private static final String ACTION_REMOVE_INVOICE_DOCUMENT = "removeInvoiceDocument";
  private static final String LEGACY_ACTION_SAVE_PERMIT = "savePermit";
  private static final String LEGACY_ACTION_CREATE_APPLICATION = "createApplication";
  private static final String LEGACY_ACTION_CREATE_EXEMPTION = "/createExemption";
  private static final String LEGACY_ACTION_CREATE_OFFER = "createOffer";
  private static final String LEGACY_ACTION_CREATE_PERMIT = "createPermit";

  private final LexisApplicationController applicationController;
  private final ExemptionController exemptionController;
  private final FederalApplicationController federalApplicationController;
  private final IndianReservePermitController indianReservePermitController;
  private final PurchaseOfferController purchaseOfferController;
  private final PermitController permitController;
  private final ApplicationReviewController applicationReviewController;
  private final FeeDetailsController feeDetailsController;
  private final LexisAdminController adminController;
  private final LexisSummaryController summaryController;
  private final OfferDetailsRpcController offerDetailsRpcController;
  private final PermitDetailsRpcController permitDetailsRpcController;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public LegacyRouteController(
      LexisApplicationController applicationController,
      ExemptionController exemptionController,
      FederalApplicationController federalApplicationController,
      IndianReservePermitController indianReservePermitController,
      PurchaseOfferController purchaseOfferController,
      PermitController permitController,
      ApplicationReviewController applicationReviewController,
      FeeDetailsController feeDetailsController,
      LexisAdminController adminController,
      LexisSummaryController summaryController,
      OfferDetailsRpcController offerDetailsRpcController,
      PermitDetailsRpcController permitDetailsRpcController,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.applicationController = applicationController;
    this.exemptionController = exemptionController;
    this.federalApplicationController = federalApplicationController;
    this.indianReservePermitController = indianReservePermitController;
    this.purchaseOfferController = purchaseOfferController;
    this.permitController = permitController;
    this.applicationReviewController = applicationReviewController;
    this.feeDetailsController = feeDetailsController;
    this.adminController = adminController;
    this.summaryController = summaryController;
    this.offerDetailsRpcController = offerDetailsRpcController;
    this.permitDetailsRpcController = permitDetailsRpcController;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping({"/applicationSearch", "/applicationSearch.do"})
  public ResponseEntity<?> applicationSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "applications", required = false) String applications,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return applicationController.searchOptions();
    }
    if (ACTION_VERIFY_APPLICATION_CLIENTS.equalsIgnoreCase(actionMapping)) {
      return applicationController.verifyClients(applications);
    }
    if (ACTION_HAS_VALID_OFFER.equalsIgnoreCase(actionMapping)) {
      return applicationController.hasValidOffer(applications);
    }
    return applicationController.search(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        exemptionType,
        applicationStatus,
        ownerClientNumber,
        agentClientNumber,
        productTypeCode,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        regionNumbers,
        sortField,
        page,
        size);
  }

  @GetMapping({"/applicationDetails", "/applicationDetails.do"})
  public ResponseEntity<?> applicationDetails(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) @Positive Long applicationNumber,
      Authentication authentication) {
    if (isLegacyAddOrCreateAction(actionMapping)) {
      return authorizeLegacyAction(authentication, LEGACY_ACTION_CREATE_APPLICATION);
    }
    if (applicationNumber == null) {
      return ResponseEntity.noContent().build();
    }
    return applicationController.getByApplicationNumber(applicationNumber);
  }

  @GetMapping({"/applicationsReview", "/applicationsReview.do"})
  public ResponseEntity<?> applicationsReview(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return applicationReviewController.searchOptions();
    }
    return applicationReviewController.search(
        applicationNumber,
        productTypeCode,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        regionNumbers,
        sortField,
        page,
        size);
  }

  @GetMapping({"/exemptionSearch", "/exemptionSearch.do"})
  public ResponseEntity<?> exemptionSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "exemptionType", required = false) String exemptionType,
      @RequestParam(name = "exemptionTypeCode", required = false) String exemptionTypeCode,
      @RequestParam(name = "exemptionStatus", required = false) String exemptionStatus,
      @RequestParam(name = "exemptionStatusCode", required = false) String exemptionStatusCode,
      @RequestParam(name = "approvalFromDate", required = false) String approvalFromDate,
      @RequestParam(name = "approvalToDate", required = false) String approvalToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return exemptionController.searchOptions();
    }
    return exemptionController.search(
        applicationNumber,
        packageNumber,
        exemptionNumber,
        exemptionType,
        exemptionTypeCode,
        exemptionStatus,
        exemptionStatusCode,
        approvalFromDate,
        approvalToDate,
        listingFromDate,
        listFromDate,
        listingToDate,
        listToDate,
        applicantClientNumber,
        ownerClientNumber,
        regionNumbers,
        page,
        size);
  }

  @GetMapping({"/exemptionDetails", "/exemptionDetails.do"})
  public ResponseEntity<?> exemptionDetails(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    if (isLegacyAddOrCreateAction(actionMapping)) {
      return authorizeLegacyAction(authentication, LEGACY_ACTION_CREATE_EXEMPTION);
    }
    if (exemptionNumber == null || exemptionNumber.isBlank()) {
      return ResponseEntity.noContent().build();
    }
    return exemptionController.getByExemptionNumber(exemptionNumber);
  }

  @GetMapping({"/federalApplicationSearch", "/federalApplicationSearch.do"})
  public ResponseEntity<?> federalApplicationSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String federalApplicationNumber,
      @RequestParam(name = "federalApplicationNumber", required = false)
          String federalApplicationNumberAlias,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "applicationStatus", required = false) String applicationStatus,
      @RequestParam(name = "receivedFromDate", required = false) String receivedFromDate,
      @RequestParam(name = "receivedToDate", required = false) String receivedToDate,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "agentClientNumber", required = false) String agentClientNumber,
      @RequestParam(name = "applications", required = false) String applications,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return federalApplicationController.searchOptions();
    }
    if (ACTION_VERIFY_APPLICATION_CLIENTS.equalsIgnoreCase(actionMapping)) {
      return federalApplicationController.verifyClients(applications);
    }
    return federalApplicationController.search(
        federalApplicationNumber,
        federalApplicationNumberAlias,
        packageNumber,
        exemptionNumber,
        applicationStatus,
        receivedFromDate,
        receivedToDate,
        listingFromDate,
        listingToDate,
        ownerClientNumber,
        agentClientNumber,
        page,
        size);
  }

  @GetMapping({"/federalApplicationDetails", "/federalApplicationDetails.do"})
  public ResponseEntity<?> federalApplicationDetails(
      @RequestParam(name = "applicationNumber", required = false) @Positive Long applicationNumber) {
    if (applicationNumber == null) {
      return ResponseEntity.noContent().build();
    }
    return federalApplicationController.getByApplicationNumber(applicationNumber);
  }

  @GetMapping({"/indianReservePermitSearch", "/indianReservePermitSearch.do"})
  public ResponseEntity<?> indianReservePermitSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "fromPermitIssueDate", required = false) String issuedFromDate,
      @RequestParam(name = "toPermitIssueDate", required = false) String issuedToDate,
      @RequestParam(name = "fromEstimatedShippingDate", required = false) String shippingFromDate,
      @RequestParam(name = "toEstimatedShippingDate", required = false) String shippingToDate,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return indianReservePermitController.searchOptions();
    }
    return indianReservePermitController.search(
        permitNumber, packageNumber, issuedFromDate, issuedToDate, shippingFromDate, shippingToDate, page, size);
  }

  @GetMapping({"/indianReservePermitDetails", "/indianReservePermitDetails.do"})
  public ResponseEntity<?> indianReservePermitDetails(
      @RequestParam(name = "permitNumber", required = false) String permitNumber) {
    if (permitNumber == null || permitNumber.isBlank()) {
      return ResponseEntity.noContent().build();
    }
    return indianReservePermitController.getByPermitNumber(permitNumber);
  }

  @GetMapping({"/offersSearch", "/offersSearch.do"})
  public ResponseEntity<?> offersSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "listingFromDate", required = false) String listingFromDate,
      @RequestParam(name = "listFromDate", required = false) String listFromDate,
      @RequestParam(name = "listingToDate", required = false) String listingToDate,
      @RequestParam(name = "listToDate", required = false) String listToDate,
      @RequestParam(name = "withdrawalFromDate", required = false) String withdrawalFromDate,
      @RequestParam(name = "withdrawalToDate", required = false) String withdrawalToDate,
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return purchaseOfferController.searchOptions();
    }
    return purchaseOfferController.search(
        applicationNumber,
        packageNumber,
        listingFromDate,
        listFromDate,
        listingToDate,
        listToDate,
        withdrawalFromDate,
        withdrawalToDate,
        clientNumber,
        regionNumbers,
        sortField,
        page,
        size);
  }

  @GetMapping({"/offerDetails", "/offerDetails.do"})
  public ResponseEntity<?> offerDetails(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "offerNumber", required = false) @Positive Long offerNumber,
      Authentication authentication) {
    if (isLegacyAddOrCreateAction(actionMapping)) {
      return authorizeLegacyAction(authentication, LEGACY_ACTION_CREATE_OFFER);
    }
    if (offerNumber == null) {
      return ResponseEntity.noContent().build();
    }
    return purchaseOfferController.getByOfferNumber(offerNumber);
  }

  @GetMapping({"/permitSearch", "/permitSearch.do"})
  public ResponseEntity<?> permitSearch(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "issuedFromDate", required = false) String issuedFromDate,
      @RequestParam(name = "issuedToDate", required = false) String issuedToDate,
      @RequestParam(name = "permitStatus", required = false) String permitStatus,
      @RequestParam(name = "invoiceNumber", required = false) String invoiceNumber,
      @RequestParam(name = "applicantClientNumber", required = false) String applicantClientNumber,
      @RequestParam(name = "ownerClientNumber", required = false) String ownerClientNumber,
      @RequestParam(name = "region", required = false) List<Long> regionNumbers,
      @RequestParam(name = "sortField", required = false) String sortField,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    if (ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return permitController.searchOptions();
    }
    return permitController.search(
        applicationNumber,
        packageNumber,
        permitNumber,
        issuedFromDate,
        issuedToDate,
        permitStatus,
        invoiceNumber,
        applicantClientNumber,
        ownerClientNumber,
        regionNumbers,
        sortField,
        page,
        size);
  }

  @GetMapping({"/permitDetails", "/permitDetails.do"})
  public ResponseEntity<?> permitDetails(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "permitNumber", required = false) @Positive Long permitNumber,
      Authentication authentication) {
    if (isLegacyAddOrCreateAction(actionMapping)) {
      return authorizeLegacyAction(authentication, LEGACY_ACTION_CREATE_PERMIT);
    }
    if (permitNumber == null) {
      return ResponseEntity.noContent().build();
    }
    return permitController.getByPermitNumber(permitNumber);
  }

  @GetMapping({"/feeDetails", "/feeDetails.do"})
  public ResponseEntity<?> feeDetails(
      @RequestParam(name = "permitNumber", required = false) @Positive Long permitNumber) {
    if (permitNumber == null) {
      return ResponseEntity.noContent().build();
    }
    return feeDetailsController.permitSummary(permitNumber);
  }

  @GetMapping({"/lexisAgentAdmin", "/lexisAgentAdmin.do"})
  public ResponseEntity<?> lexisAgentAdmin(
      @RequestParam(name = "actionMapping", required = false) String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank() || ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return adminController.agentAdmin();
    }
    return ResponseEntity.noContent().build();
  }

  @GetMapping({"/lexisPolicyAdmin", "/lexisPolicyAdmin.do"})
  public ResponseEntity<?> lexisPolicyAdmin(
      @RequestParam(name = "actionMapping", required = false) String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank() || ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return adminController.feePolicyAdmin();
    }
    return ResponseEntity.noContent().build();
  }

  @RequestMapping(
      path = {"/lexisPolicyAdminRPC", "/lexisPolicyAdminRPC.do"},
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<?> lexisPolicyAdminRpc(
      @RequestParam(required = false) Map<String, String> requestParameters) {
    return adminController.feePolicyRpcForm(requestParameters);
  }

  @GetMapping({"/lexisFILAdmin", "/lexisFILAdmin.do"})
  public ResponseEntity<?> lexisFilAdmin(
      @RequestParam(name = "actionMapping", required = false) String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank() || ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return adminController.filPolicyAdmin();
    }
    return ResponseEntity.noContent().build();
  }

  @RequestMapping(
      path = {"/lexisFILAdminRPC", "/lexisFILAdminRPC.do"},
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<?> lexisFilAdminRpc(
      @RequestParam(required = false) Map<String, String> requestParameters) {
    return adminController.filPolicyRpcForm(requestParameters);
  }

  @RequestMapping(
      path = {"/offerDetailsRPC", "/offerDetailsRPC.do"},
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<?> offerDetailsRpc(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam MultiValueMap<String, String> requestParameters,
      Authentication authentication) {
    String applicationNumber = first(requestParameters, "applicationNumber");
    String packageNumber = first(requestParameters, "packageNumber");
    String clientNumber = first(requestParameters, "clientNumber");
    String clientLocationCode = first(requestParameters, "clientLocationCode");

    if (ACTION_VALIDATE_APPLICATION_NUMBER.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.validateApplicationNumber(applicationNumber);
    }
    if (ACTION_GET_APPLICATION_DETAILS.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getApplicationDetails(applicationNumber);
    }
    if (ACTION_GET_PACKAGE_LIST.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getPackageList(applicationNumber);
    }
    if (ACTION_GET_PACKAGE_VOLUME.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getPackageVolume(packageNumber);
    }
    if (ACTION_GET_APPLICATION_VOLUME.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getApplicationVolume(applicationNumber);
    }
    if (ACTION_GET_CLIENT_DATA.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getClientData(clientNumber, clientLocationCode);
    }
    if (ACTION_GET_CLIENT_LOCATIONS.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.getClientLocations(clientNumber);
    }
    if (ACTION_ADD_OFFER.equalsIgnoreCase(actionMapping)) {
      return offerDetailsRpcController.addOfferLegacy(requestParameters, authentication);
    }
    return ResponseEntity.noContent().build();
  }

  @RequestMapping(
      path = {"/permitDetailsRPC", "/permitDetailsRPC.do"},
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<?> permitDetailsRpc(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "permitNumber", required = false) Long permitNumber,
      @RequestParam(name = "countryCode", required = false) String countryCode,
      @RequestParam(name = "applicationDate", required = false) String applicationDate,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "selectedApplications", required = false) String selectedApplications,
      @RequestParam(name = "selectedPackages", required = false) String selectedPackages,
      @RequestParam(name = "salesInvoiceNumber", required = false) String salesInvoiceNumber,
      @RequestParam(name = "invoiceExportValue", required = false) String invoiceExportValue,
      @RequestParam(name = "invoiceConversionRate", required = false) String invoiceConversionRate,
      @RequestParam(name = "invoiceFeeInLieu", required = false) String invoiceFeeInLieu,
      @RequestParam(name = "receiptNumber", required = false) String receiptNumber,
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "documentId", required = false) String documentId,
      HttpServletRequest request,
      Authentication authentication) {
    if (requiresSavePermitAuthorization(actionMapping)
        && !authorizationService.canPerformAction(
            sessionService.parseRolesFromPrincipal(authentication), LEGACY_ACTION_SAVE_PERMIT)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    if (ACTION_GET_PERMIT_SUMMARY.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPermitSummary(
          permitNumber, countryCode, applicationDate, packageNumber, authentication);
    }
    if (ACTION_GET_TOTAL_FEES_FOR_PERMIT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getTotalFeesForPermit(
          permitNumber, countryCode, applicationDate);
    }
    if (ACTION_GET_SCALE_FEES_FOR_PACKAGE.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getScaleFeesForPackage(
          packageNumber, permitNumber, authentication);
    }
    if (ACTION_GET_PERMIT_DATA_AFTER_SCALE_UPDATE.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPermitDataAfterScaleUpdate(permitNumber);
    }
    if (ACTION_GET_PACKAGE_VOLUME_SUM.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPackageVolumeSum(permitNumber, packageNumber);
    }
    if (ACTION_GET_PACKAGE_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPackageList(permitNumber);
    }
    if (ACTION_GET_OIC_PACKAGE_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getOicPackageList(permitNumber);
    }
    if (ACTION_GET_PACKAGE_INFO.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPackageInfo(packageNumber);
    }
    if (ACTION_GET_PACKAGE_DETAILS.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPackageDetails(packageNumber);
    }
    if (ACTION_GET_SCALES_FOR_PACKAGE.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getScalesForPackage(packageNumber);
    }
    if (ACTION_CHECK_PERMIT_NUMBER.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.checkPermitNumber(permitNumber);
    }
    if (ACTION_ADD_PERMIT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.addPermit(request, authentication);
    }
    if (ACTION_UPDATE_PERMIT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.updatePermit(request, authentication);
    }
    if (ACTION_UPDATE_SHIPPING.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.updateShipping(request, authentication);
    }
    if (ACTION_GET_APPLICATION_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getApplicationList(permitNumber);
    }
    if (ACTION_GET_AVAILABLE_APPLICATION_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getAvailableApplicationList(
          exemptionNumber, selectedApplications);
    }
    if (ACTION_GET_AVAILABLE_PACKAGE_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getAvailablePackageList(exemptionNumber, selectedPackages);
    }
    if (ACTION_GET_APPROVED_EXEMPTION_VOLUME.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getApprovedExemptionVolume(exemptionNumber);
    }
    if (ACTION_GET_EXEMPTION_VOLUME_REMAINING.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getExemptionVolumeRemaining(exemptionNumber);
    }
    if (ACTION_GET_PERMIT_HAS_APPLICATIONS.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getPermitHasApplications(permitNumber);
    }
    if (ACTION_ADD_INVOICE.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.addInvoice(
          permitNumber,
          salesInvoiceNumber,
          invoiceExportValue,
          invoiceConversionRate,
          invoiceFeeInLieu,
          authentication);
    }
    if (ACTION_CHECK_FORM_CHANGES.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.checkFormChanges(request);
    }
    if (ACTION_RELEASE_LOCK.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.releaseLock(request);
    }
    if (ACTION_GET_INVOICES_FOR_PERMIT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getInvoicesForPermit(permitNumber);
    }
    if (ACTION_GET_INVOICE_DETAILS.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getInvoiceDetails(permitNumber, salesInvoiceNumber);
    }
    if (ACTION_GET_GBMS_INVOICE_HISTORY.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getGbmsInvoiceHistory(
          receiptNumber, permitNumber, authentication);
    }
    if (ACTION_GET_CONVERSION_RATE.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getConversionRate();
    }
    if (ACTION_GET_COUNTRY_LIST.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getCountryList();
    }
    if (ACTION_GET_FILE_TYPES.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getFileTypes();
    }
    if (ACTION_GET_DOCUMENT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getDocument(fileId, fileName);
    }
    if (ACTION_GET_DOCUMENT_DETAILS.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.getDocumentDetails(
          permitNumber == null ? null : permitNumber.toString());
    }
    if (ACTION_REMOVE_PERMIT_DOCUMENT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.removePermitDocument(documentId);
    }
    if (ACTION_REMOVE_APPLICATION_DOCUMENT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.removeApplicationDocument(documentId);
    }
    if (ACTION_REMOVE_INVOICE_DOCUMENT.equalsIgnoreCase(actionMapping)) {
      return permitDetailsRpcController.removeInvoiceDocument(documentId);
    }
    return ResponseEntity.noContent().build();
  }

  @RequestMapping(
      path = {"/summary", "/summary.do"},
      method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<?> summary(
      @RequestParam(name = "actionMapping", required = false) String actionMapping,
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "applicationPage", required = false) @PositiveOrZero Integer applicationPage,
      @RequestParam(name = "offerPage", required = false) @PositiveOrZero Integer offerPage,
      @RequestParam(name = "exemptionPage", required = false) @PositiveOrZero Integer exemptionPage,
      @RequestParam(name = "permitPage", required = false) @PositiveOrZero Integer permitPage,
      @RequestParam(name = "feePage", required = false) @PositiveOrZero Integer feePage,
      @RequestParam(name = "offerPlacedPage", required = false) @PositiveOrZero Integer offerPlacedPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    if (actionMapping == null || actionMapping.isBlank() || ACTION_VIEW.equalsIgnoreCase(actionMapping)) {
      return ResponseEntity.noContent().build();
    }

    return switch (actionMapping) {
      case ACTION_GET_APPLICATIONS ->
          summaryController.applications(page, applicationPage, size, sortField, authentication);
      case ACTION_GET_EXEMPTIONS ->
          summaryController.exemptions(page, exemptionPage, size, sortField, authentication);
      case ACTION_GET_OFFERS ->
          summaryController.offers(page, offerPage, size, sortField, authentication);
      case ACTION_GET_PERMITS ->
          summaryController.permits(page, permitPage, size, sortField, authentication);
      case ACTION_GET_FEES -> summaryController.fees(page, feePage, size, sortField, authentication);
      case ACTION_GET_OFFER_PLACED ->
          summaryController.offersPlaced(page, offerPlacedPage, size, sortField, authentication);
      case ACTION_UPDATE_APPLICATION_PAGING ->
          summaryController.applicationsPagination(defaultPage(page, applicationPage), authentication);
      case ACTION_UPDATE_EXEMPTION_PAGING ->
          summaryController.exemptionsPagination(defaultPage(page, exemptionPage), authentication);
      case ACTION_UPDATE_OFFER_PAGING ->
          summaryController.offersPagination(defaultPage(page, offerPage), authentication);
      case ACTION_UPDATE_PERMIT_PAGING ->
          summaryController.permitsPagination(defaultPage(page, permitPage), authentication);
      case ACTION_UPDATE_FEE_PAGING ->
          summaryController.feesPagination(defaultPage(page, feePage), authentication);
      case ACTION_UPDATE_OFFER_PLACED_PAGING ->
          summaryController.offersPlacedPagination(defaultPage(page, offerPlacedPage), authentication);
      default -> ResponseEntity.noContent().build();
    };
  }

  private Integer defaultPage(Integer page, Integer legacyPage) {
    if (page != null) {
      return page;
    }
    if (legacyPage != null) {
      return legacyPage;
    }
    return 0;
  }

  private boolean requiresSavePermitAuthorization(String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank()) {
      return false;
    }
    return ACTION_ADD_PERMIT.equalsIgnoreCase(actionMapping)
        || ACTION_UPDATE_PERMIT.equalsIgnoreCase(actionMapping)
        || ACTION_UPDATE_SHIPPING.equalsIgnoreCase(actionMapping)
        || ACTION_ADD_INVOICE.equalsIgnoreCase(actionMapping)
        || ACTION_REMOVE_PERMIT_DOCUMENT.equalsIgnoreCase(actionMapping)
        || ACTION_REMOVE_APPLICATION_DOCUMENT.equalsIgnoreCase(actionMapping)
        || ACTION_REMOVE_INVOICE_DOCUMENT.equalsIgnoreCase(actionMapping);
  }

  private boolean isLegacyAddOrCreateAction(String actionMapping) {
    if (actionMapping == null || actionMapping.isBlank()) {
      return false;
    }
    return ACTION_ADD.equalsIgnoreCase(actionMapping) || ACTION_CREATE.equalsIgnoreCase(actionMapping);
  }

  private ResponseEntity<?> authorizeLegacyAction(Authentication authentication, String action) {
    boolean authorized =
        authorizationService.canPerformAction(
            sessionService.parseRolesFromPrincipal(authentication), action);
    if (!authorized) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    // Legacy "add/create" loaded JSP pages; REST shim preserves only authorization semantics.
    return ResponseEntity.noContent().build();
  }

  private String first(MultiValueMap<String, String> parameters, String name) {
    if (parameters == null || name == null) {
      return null;
    }
    String value = parameters.getFirst(name);
    return value == null || value.isBlank() ? null : value.trim();
  }
}

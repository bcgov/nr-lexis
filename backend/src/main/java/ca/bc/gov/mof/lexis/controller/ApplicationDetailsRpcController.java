package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDate;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDouble;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseNonNegativeLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.sanitizeFileName;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.firstTrimmedNonBlank;
import static ca.bc.gov.mof.lexis.util.TextUtils.normalizeClientNumber;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditPolicyService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.TextUtils;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class ApplicationDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationDetailsRpcController.class);
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_REMOVE_DOCUMENT = "removeDocument";
  private static final String ACTION_GET_REMARK = "getRemark";
  private static final String ACTION_PERSIST_REMARK = "persistRemark";
  private static final String ACTION_CHECK_FORM_CHANGES = "checkFormChanges";
  private static final String ACTION_CHECK_UNUSED_VOLUME = "checkUnusedVolume";
  private static final String ACTION_RELEASE_LOCK = "releaseLock";
  private static final String ACTION_SEND_APPLICATION_REJECT_EMAIL = "sendApplRejectEmail";
  private static final String ACTION_SEND_APPLICATION_WITHDRAWN_EMAIL = "sendApplWithdrawnEmail";
  private static final String ACTION_ADD_APPLICATION = "addApplication";
  private static final String ACTION_UPDATE_APPLICATION = "updateApplication";
  private static final String ACTION_GET_CLIENT_DATA = "getClientData";
  private static final String ACTION_GET_CLIENT_LOCATIONS = "getClientLocations";
  private static final String ACTION_GET_CONTACTS_FOR_LOCATION = "getContactsForLocation";
  private static final String ACTION_GET_SPECIES_CODES = "getSpeciesCodes";
  private static final String ACTION_GET_PACKAGE_STATUS_CODES = "getPackageStatusCodes";
  private static final String ACTION_GET_GRADE_CODES = "getGradeCodes";
  private static final String ACTION_GET_END_USE_FOR_SPECIES_REGION = "getEndUseForSpeciesRegion";
  private static final String ACTION_GET_REMAINING_SPECIES = "getRemainingSpecies";
  private static final String ACTION_GET_SELECTED_END_USE = "getSelectedEndUse";
  private static final String ACTION_GET_PACKAGE_SELECTED_END_USE = "getPackageSelectedEndUse";
  private static final String ACTION_GET_SPECIES_FOR_APPLICATION = "getSpeciesForApplication";
  private static final String ACTION_GET_SPECIES_FOR_PACKAGE = "getSpeciesForPackage";
  private static final String ACTION_GET_UNIQUE_SCALES_FOR_APPLICATION = "getUniqueScalesForApplication";
  private static final String ACTION_FIND_PERMIT = "findPermit";
  private static final String ACTION_GET_SCALES_FOR_PACKAGE = "getScalesForPackage";
  private static final String ACTION_GET_SCALE_BY_ID = "getScaleById";
  private static final String ACTION_GET_PACKAGE_DETAILS = "getPackageDetails";
  private static final String ACTION_IS_PACKAGE_VALID = "isPackageValid";
  private static final String ACTION_ADD_PACKAGE_TO_APPLICATION = "addPackageToApplication";
  private static final String ACTION_UPDATE_PACKAGE = "updatePackage";
  private static final String ACTION_ADD_SCALE_TO_PACKAGE = "addScaleToPackage";
  private static final String ACTION_DELETE_SCALE_BY_ID = "deleteScaleById";
  private static final String ACTION_DELETE_PACKAGE_BY_ID = "deletePackageById";
  private static final String LEGACY_ACTION_CREATE_APPLICATION = "createApplication";
  private static final String LEGACY_ACTION_APPLICATION_DETAILS = "/applicationDetails";
  private static final String LEGACY_ACTION_CHANGE_APPLICANT_TYPE = "/changeApplicantType";
  private static final String LEGACY_ACTION_APPLICATION_REMARKS = "/applicationRemarks";
  private static final String LEGACY_ACTION_APPLICATIONS_REVIEW = "/applicationsReview";
  private static final String LEGACY_ACTION_PERMIT_DETAILS = "/permitDetails";
  private static final String LEGACY_APPLICATION_LOCK_SESSION_KEY = "exemptionApplication";
  private static final String LEGACY_APPLICATION_NUMBER_SESSION_KEY = "applicationNumber";
  private static final String APPLICATION_STATUS_EXPIRED = "EXP";
  private static final String APPLICATION_STATUS_PERMITTED = "PMT";
  private static final Set<String> APPLICATION_DOCUMENT_DELETE_ROLES =
      Set.of("LEXIS_ADMIN", "LEXIS_APPLICATION_APPROVER");
  private static final Set<String> APPLICATION_DOCUMENT_INDUSTRY_ROLES =
      Set.of("LEXIS_PROVINCIAL_SUBMITTER");
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

  private final ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final ObjectProvider<ApplicationReviewService> applicationReviewServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final ApplicationEditLockService editLockService;
  private final ProvincialAuthorizationService provincialAuthorizationService;
  private final ApplicationEditPolicyService applicationEditPolicyService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private LexisPrincipalService principalService;

  public ApplicationDetailsRpcController(
      ObjectProvider<ApplicationDetailsRpcService> serviceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      ObjectProvider<ApplicationReviewService> applicationReviewServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      ApplicationEditLockService editLockService,
      ProvincialAuthorizationService provincialAuthorizationService,
      ApplicationEditPolicyService applicationEditPolicyService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.applicationReviewServiceProvider = applicationReviewServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.editLockService = editLockService;
    this.provincialAuthorizationService = provincialAuthorizationService;
    this.applicationEditPolicyService = applicationEditPolicyService;
    this.operationCoordinator = operationCoordinator;
  }

  @Autowired
  void setLexisPrincipalService(LexisPrincipalService principalService) {
    this.principalService = principalService;
  }

  @GetMapping("/rpc/application-details/document-details")
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetails(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    Authentication authentication = currentAuthentication();
    requireApplicationAccess(parsedApplicationNumber, authentication);

    List<DocumentDetailsResponseDto> response =
        service.getDocumentDetails(parsedApplicationNumber).stream()
            .filter(
                item ->
                    canAccessApplicationDocument(
                        item, parsedApplicationNumber, authentication))
            .map(
                item ->
                    new DocumentDetailsResponseDto(
                        item.name(),
                        item.description(),
                        item.type(),
                        item.id(),
                        item.source(),
                        item.deletable()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getDocumentDetails(applicationNumber);
  }

  @GetMapping("/rpc/application-details/document")
  public ResponseEntity<StreamingResponseBody> streamDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get document");
      return ResponseEntity.noContent().build();
    }

    Long parsedFileId = parsePositiveLong(fileId);
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    Authentication authentication = currentAuthentication();
    requireApplicationAccess(parsedApplicationNumber, authentication);
    ApplicationDetailsRpcService.DocumentItem document =
        service
            .findDocumentForApplication(parsedFileId, parsedApplicationNumber)
            .filter(
                item ->
                    canAccessApplicationDocument(
                        item, parsedApplicationNumber, authentication))
            .orElseThrow(
                () ->
                    new AccessDeniedException(
                        "Document does not belong to an accessible source for the supplied application."));

    return service
        .streamDocument(document.id())
        .map(
            content -> {
              HttpHeaders headers = new HttpHeaders();
              String normalizedFileName = sanitizeFileName(fileName);
              if (normalizedFileName != null && !normalizedFileName.isBlank()) {
                headers.setContentDisposition(
                    ContentDisposition.attachment()
                        .filename(normalizedFileName, StandardCharsets.UTF_8)
                        .build());
              }
              headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
              StreamingResponseBody body = content::writeTo;
              return ResponseEntity.ok().headers(headers).body(body);
            })
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<StreamingResponseBody> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return streamDocument(fileId, fileName, applicationNumber);
  }

  @DeleteMapping("/rpc/application-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!hasApplicationDocumentDeleteRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - rejecting remove document");
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    Long parsedDocumentId = parsePositiveLong(documentId);
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    if (!applicationDocumentCanBeRemovedFromApplication(
        service, parsedDocumentId, parsedApplicationNumber)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    ApplicationEditLockDto lock = requireEditable(parsedApplicationNumber, authentication);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(new RemoveDocumentResponseDto("false"));
    }
    if (!canRemoveApplicationDocumentWithCurrentStatus(
        service, parsedApplicationNumber, roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    return operationCoordinator.executeApplicationLocalMutation(
        parsedApplicationNumber,
        () -> {
          requireApplicationAccess(parsedApplicationNumber, authentication);
          if (!applicationDocumentCanBeRemovedFromApplication(
              service, parsedDocumentId, parsedApplicationNumber)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          ApplicationEditLockDto currentLock =
              requireEditable(parsedApplicationNumber, authentication);
          if (currentLock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new RemoveDocumentResponseDto("false"));
          }
          if (!canRemoveApplicationDocumentWithCurrentStatus(
              service, parsedApplicationNumber, roles)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          boolean removed = service.removeDocument(parsedDocumentId);
          return ResponseEntity.ok(
              new RemoveDocumentResponseDto(Boolean.toString(removed)));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    return removeDocument(documentId, applicationNumber, authentication);
  }

  @GetMapping("/rpc/application-details/remark")
  public ResponseEntity<GetRemarkResponseDto> getRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPLICATION_REMARKS)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get remark");
      return ResponseEntity.noContent().build();
    }

    requireRemarkAccess(service, parsePositiveLong(remarkId), null, authentication);

    return service
        .getRemark(parsePositiveLong(remarkId))
        .map(remark -> ResponseEntity.ok(new GetRemarkResponseDto(remark, false)))
        .orElseGet(() -> ResponseEntity.ok(new GetRemarkResponseDto(null, true)));
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_REMARK)
  public ResponseEntity<GetRemarkResponseDto> getRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      Authentication authentication) {
    return getRemark(remarkId, authentication);
  }

  @PostMapping("/rpc/application-details/remark")
  public ResponseEntity<PersistRemarkResponseDto> persistRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPLICATION_REMARKS)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for persist remark");
      return ResponseEntity.noContent().build();
    }

    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    Long parsedRemarkId = parsePositiveLong(remarkId);
    if (parsedRemarkId != null) {
      requireRemarkAccess(service, parsedRemarkId, parsedApplicationNumber, authentication);
    }
    ApplicationEditLockDto lock = requireEditable(parsedApplicationNumber, authentication);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT)
          .body(new PersistRemarkResponseDto("locked", null, null, lock.message(), lock.message(), null));
    }

    String userId = userId(authentication);
    return operationCoordinator.executeApplicationLocalMutation(
        parsedApplicationNumber,
        () -> {
          requireApplicationAccess(parsedApplicationNumber, authentication);
          if (parsedRemarkId != null) {
            requireRemarkAccess(
                service, parsedRemarkId, parsedApplicationNumber, authentication);
          }
          ApplicationEditLockDto currentLock =
              requireEditable(parsedApplicationNumber, authentication);
          if (currentLock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                    new PersistRemarkResponseDto(
                        "locked",
                        null,
                        null,
                        currentLock.message(),
                        currentLock.message(),
                        null));
          }
          return service
              .persistRemark(remarkId, parsedApplicationNumber, remarkBody, userId)
              .map(
                  persisted ->
                      ResponseEntity.ok(
                          new PersistRemarkResponseDto(
                              "ok",
                              persisted.date(),
                              persisted.user(),
                              persisted.displayRemark(),
                              persisted.remark(),
                              persisted.remarkId())))
              .orElseGet(
                  () ->
                      ResponseEntity.ok(
                          new PersistRemarkResponseDto(
                              "error", null, null, null, null, null)));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_PERSIST_REMARK)
  public ResponseEntity<PersistRemarkResponseDto> persistRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    return persistRemark(remarkId, applicationNumber, remarkBody, authentication);
  }

  @GetMapping("/rpc/application-details/check-form-changes")
  public ResponseEntity<CheckFormChangesResponseDto> checkFormChanges(
      @RequestParam MultiValueMap<String, String> parameters) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning default check-form-changes payload");
      return ResponseEntity.ok(new CheckFormChangesResponseDto(false));
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    requireApplicationAccess(applicationNumber);
    boolean applicationChanged =
        service
            .getApplicationSummarySnapshot(applicationNumber)
            .map(snapshot -> hasApplicationFormChanges(parameters, snapshot))
            .orElse(false);
    return ResponseEntity.ok(new CheckFormChangesResponseDto(applicationChanged));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_CHECK_FORM_CHANGES)
  public ResponseEntity<CheckFormChangesResponseDto> checkFormChangesLegacy(
      @RequestParam MultiValueMap<String, String> parameters) {
    return checkFormChanges(parameters);
  }

  @GetMapping("/rpc/application-details/check-unused-volume")
  public ResponseEntity<CheckUnusedVolumeResponseDto> checkUnusedVolume(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning default check-unused-volume payload");
      return ResponseEntity.ok(new CheckUnusedVolumeResponseDto(true));
    }

    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber);
    boolean volumeUsedInd = service.isApplicationVolumeUsed(parsedApplicationNumber);
    return ResponseEntity.ok(new CheckUnusedVolumeResponseDto(volumeUsedInd));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_CHECK_UNUSED_VOLUME)
  public ResponseEntity<CheckUnusedVolumeResponseDto> checkUnusedVolumeLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return checkUnusedVolume(applicationNumber);
  }

  @PostMapping("/rpc/application-details/release-lock")
  public ResponseEntity<ReleaseLockResponseDto> releaseLock(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      HttpServletRequest request,
      Authentication authentication) {
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    editLockService.release(parsedApplicationNumber, userId(authentication));
    if (request != null) {
      var session = request.getSession(false);
      if (session != null) {
        session.removeAttribute(LEGACY_APPLICATION_LOCK_SESSION_KEY);
        session.removeAttribute(LEGACY_APPLICATION_NUMBER_SESSION_KEY);
      }
    }
    return ResponseEntity.ok(new ReleaseLockResponseDto("ok"));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_RELEASE_LOCK)
  public ResponseEntity<ReleaseLockResponseDto> releaseLockLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      HttpServletRequest request,
      Authentication authentication) {
    return releaseLock(applicationNumber, request, authentication);
  }

  @PostMapping(
      value = "/applicationDetailsRPC",
      params = "actionMapping=" + ACTION_SEND_APPLICATION_REJECT_EMAIL)
  public ResponseEntity<ApplicationStatusEmailResponseDto> sendApplicationRejectEmailLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return sendApplicationStatusEmail(parameters, "REJ", authentication);
  }

  @PostMapping(
      value = "/applicationDetailsRPC",
      params = "actionMapping=" + ACTION_SEND_APPLICATION_WITHDRAWN_EMAIL)
  public ResponseEntity<ApplicationStatusEmailResponseDto> sendApplicationWithdrawnEmailLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return sendApplicationStatusEmail(parameters, "WDN", authentication);
  }

  @PostMapping("/rpc/application-details/application")
  public ResponseEntity<ApplicationPersistenceResponseDto> addApplication(
      HttpServletRequest request,
      Authentication authentication) {
    return addApplication(fromRequest(request), authentication);
  }

  private ResponseEntity<ApplicationPersistenceResponseDto> addApplication(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for add application");
      return ResponseEntity.noContent().build();
    }

    String userId = userId(authentication);
    ApplicationDetailsRpcService.CreateApplicationRequest createRequest =
        withScopedSubmitterOwnerIdentity(
            toCreateApplicationRequest(parameters), authentication);
    provincialAuthorizationService.requireOrgUnit(
        authentication, createRequest.orgUnitNumber(), OrgUnitSurface.APPLICATION_WRITE);
    String exemptionNumber = createRequest.exemptionNumber();
    if (exemptionNumber != null) {
      provincialAuthorizationService.requireExemption(authentication, exemptionNumber);
    }
    if (!provincialAuthorizationService.canCreateForClient(
        authentication, createRequest.ownerClientNumber(), createRequest.agentClientNumber())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    if (exemptionNumber == null) {
      return persistNewApplication(service, createRequest, userId);
    }

    return operationCoordinator.executeKnownAggregate(
        List.of(exemptionNumber),
        List.of(),
        List.of(),
        () -> {
          if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          provincialAuthorizationService.requireOrgUnit(
              authentication,
              createRequest.orgUnitNumber(),
              OrgUnitSurface.APPLICATION_WRITE);
          provincialAuthorizationService.requireExemption(
              authentication, exemptionNumber);
          if (!provincialAuthorizationService.canCreateForClient(
              authentication,
              createRequest.ownerClientNumber(),
              createRequest.agentClientNumber())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          boolean releaseExemptionLock =
              acquireExemptionLockForMutation(exemptionNumber, authentication);
          try {
            return persistNewApplication(service, createRequest, userId);
          } finally {
            if (releaseExemptionLock) {
              editLockService.releaseExemption(exemptionNumber, userId);
            }
          }
        });
  }

  private boolean acquireExemptionLockForMutation(
      String exemptionNumber, Authentication authentication) {
    String currentUser = userId(authentication);
    ApplicationEditLockDto previous =
        editLockService.snapshotExemption(exemptionNumber, currentUser, false);
    ApplicationEditLockDto acquired =
        editLockService.acquireExemption(
            exemptionNumber, currentUser, currentUser, false);
    if (acquired == null || acquired.locked()) {
      throw new EditLockConflictException(
          acquired == null
              ? "The exemption edit lock could not be acquired."
              : acquired.message());
    }
    return previous == null || !previous.heldByCurrentUser();
  }

  private ResponseEntity<ApplicationPersistenceResponseDto> persistNewApplication(
      ApplicationDetailsRpcService service,
      ApplicationDetailsRpcService.CreateApplicationRequest createRequest,
      String userId) {
    ApplicationDetailsRpcService.CreateApplicationResult result =
        service.addApplication(createRequest, userId);
    return ResponseEntity.ok(
        new ApplicationPersistenceResponseDto(
            result.valid(),
            result.message(),
            result.applicationNumber(),
            result.errors(),
            result.warnings()));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_ADD_APPLICATION)
  public ResponseEntity<ApplicationPersistenceResponseDto> addApplicationLegacy(
      HttpServletRequest request,
      Authentication authentication) {
    return addApplication(fromRequest(request), authentication);
  }

  public ResponseEntity<ApplicationPersistenceResponseDto> addApplicationLegacy(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return addApplication(parameters, authentication);
  }

  @PostMapping("/rpc/application-details/application-summary")
  public ResponseEntity<ApplicationPersistenceResponseDto> updateApplicationSummary(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest request =
        toApplicationSummaryUpdateRequest(parameters);
    if (trimToNull(request.applicantTypeCode()) != null
        && !canPerform(authentication, LEGACY_ACTION_CHANGE_APPLICANT_TYPE)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for update application");
      return ResponseEntity.noContent().build();
    }

    String userId = userId(authentication);
    provincialAuthorizationService.requireOrgUnit(
        authentication, request.orgUnitNumber(), OrgUnitSurface.APPLICATION_WRITE);
    requireApplicationAccess(request.applicationNumber(), authentication);
    if (!provincialAuthorizationService.canCreateForClient(
        authentication, request.ownerClientNumber(), request.agentClientNumber())) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    applicationEditPolicyService.requireSummaryEdit(
        authentication, service, request.applicationNumber());
    ApplicationEditLockDto lock = requireEditable(request.applicationNumber(), authentication);
    if (lock.locked()) {
      return applicationPersistenceLockConflict(lock, request.applicationNumber());
    }
    return operationCoordinator.executeApplicationMutation(
        request.applicationNumber(),
        () -> service.getPermitNumbersForApplicationMutation(request.applicationNumber()),
        () -> {
          provincialAuthorizationService.requireOrgUnit(
              authentication, request.orgUnitNumber(), OrgUnitSurface.APPLICATION_WRITE);
          requireApplicationAccess(request.applicationNumber(), authentication);
          if (!provincialAuthorizationService.canCreateForClient(
              authentication,
              request.ownerClientNumber(),
              request.agentClientNumber())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          applicationEditPolicyService.requireSummaryEdit(
              authentication, service, request.applicationNumber());
          ApplicationEditLockDto currentLock =
              requireEditable(request.applicationNumber(), authentication);
          if (currentLock.locked()) {
            return applicationPersistenceLockConflict(
                currentLock, request.applicationNumber());
          }
          ApplicationDetailsRpcService.CreateApplicationResult result =
              service.updateApplicationSummary(request, userId);
          return ResponseEntity.ok(
              new ApplicationPersistenceResponseDto(
                  result.valid(),
                  result.message(),
                  result.applicationNumber(),
                  result.errors(),
                  result.warnings()));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_UPDATE_APPLICATION)
  public ResponseEntity<ApplicationPersistenceResponseDto> updateApplicationLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return updateApplicationSummary(parameters, authentication);
  }

  @GetMapping("/rpc/application-details/application-summary")
  public ResponseEntity<ApplicationSummaryResponseDto> getApplicationSummary(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPLICATION_DETAILS)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application summary");
      return ResponseEntity.noContent().build();
    }

    requireApplicationAccess(parsePositiveLong(applicationNumber), authentication);

    return service
        .getApplicationSummarySnapshot(parsePositiveLong(applicationNumber))
        .map(snapshot -> ResponseEntity.ok(toApplicationSummaryResponse(snapshot)))
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @GetMapping("/rpc/application-details/client-data")
  public ResponseEntity<ApplicationClientDataResponseDto> getClientData(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for application client data");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    return clientLookupService
        .getClientData(clientNumber, clientLocationCode)
        .map(data -> ResponseEntity.ok(toClientDataResponse(data, null)))
        .orElseGet(
            () ->
                ResponseEntity.ok(
                    new ApplicationClientDataResponseDto(
                        null, null, null, null, null, null, null, null, null, null, "true")));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_CLIENT_DATA)
  public ResponseEntity<ApplicationClientDataResponseDto> getClientDataLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    return getClientData(clientNumber, clientLocationCode);
  }

  @GetMapping("/rpc/application-details/client-locations")
  public ResponseEntity<List<ApplicationClientLocationResponseDto>> getClientLocations(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "applicantType", required = false) String applicantType) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for application client locations");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot =
        service == null ? null : service.getApplicationClientSnapshot(parsedApplicationNumber).orElse(null);
    if (parsedApplicationNumber != null) {
      requireApplicationAccess(parsedApplicationNumber, currentAuthentication());
    }
    List<ApplicationClientLocationResponseDto> response =
        clientLookupService.getClientLocations(clientNumber).stream()
            .map(
                location ->
                    new ApplicationClientLocationResponseDto(
                        location.locationName(),
                        location.locationCode(),
                        isSelectedLocation(clientNumber, location.locationCode(), applicantType, snapshot)))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_CLIENT_LOCATIONS)
  public ResponseEntity<List<ApplicationClientLocationResponseDto>> getClientLocationsLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "applicantType", required = false) String applicantType) {
    return getClientLocations(clientNumber, applicationNumber, applicantType);
  }

  @GetMapping("/rpc/application-details/contacts-for-location")
  public ResponseEntity<List<ApplicationClientContactResponseDto>> getContactsForLocation(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "applicantType", required = false) String applicantType) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for application contacts");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot =
        service == null ? null : service.getApplicationClientSnapshot(parsedApplicationNumber).orElse(null);
    if (parsedApplicationNumber != null) {
      requireApplicationAccess(parsedApplicationNumber, currentAuthentication());
    }
    List<ClientLookupService.ClientContact> contacts =
        resolveApplicationContacts(clientLookupService, clientNumber, clientLocationCode, applicantType, snapshot);
    ClientLookupService.ClientData data =
        clientLookupService.getClientData(clientNumber, clientLocationCode).orElse(null);

    List<ApplicationClientContactResponseDto> response =
        contacts.stream()
            .map(contact -> toClientContactResponse(contact, data))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_CONTACTS_FOR_LOCATION)
  public ResponseEntity<List<ApplicationClientContactResponseDto>> getContactsForLocationLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "applicantType", required = false) String applicantType) {
    return getContactsForLocation(clientNumber, clientLocationCode, applicationNumber, applicantType);
  }

  @GetMapping("/rpc/application-details/species-codes")
  public ResponseEntity<List<ApplicationCodeResponseDto>> getSpeciesCodes() {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for species codes");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getSpeciesCodes().stream().map(this::toCodeResponse).toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SPECIES_CODES)
  public ResponseEntity<List<ApplicationCodeResponseDto>> getSpeciesCodesLegacy() {
    return getSpeciesCodes();
  }

  @GetMapping("/rpc/application-details/package-status-codes")
  public ResponseEntity<List<ApplicationCodeResponseDto>> getPackageStatusCodes() {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package status codes");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.getPackageStatusCodes().stream().map(this::toCodeResponse).toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_PACKAGE_STATUS_CODES)
  public ResponseEntity<List<ApplicationCodeResponseDto>> getPackageStatusCodesLegacy() {
    return getPackageStatusCodes();
  }

  @GetMapping("/rpc/application-details/grade-codes")
  public ResponseEntity<List<ApplicationCodeResponseDto>> getGradeCodes(
      @RequestParam(name = "speciesCode", required = false) String speciesCode,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber,
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "region", required = false) String region) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for grade codes");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getGradeCodes(
            firstTrimmedNonBlank(orgUnitNumber, region),
            firstTrimmedNonBlank(speciesCode, species))
            .stream()
            .map(this::toCodeResponse)
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_GRADE_CODES)
  public ResponseEntity<List<ApplicationCodeResponseDto>> getGradeCodesLegacy(
      @RequestParam(name = "speciesCode", required = false) String speciesCode,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber,
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "region", required = false) String region) {
    return getGradeCodes(speciesCode, orgUnitNumber, species, region);
  }

  @GetMapping("/rpc/application-details/end-uses-for-species-region")
  public ResponseEntity<List<ApplicationCodeResponseDto>> getEndUseForSpeciesRegion(
      @RequestParam(name = "speciesJSON", required = false) String speciesJson,
      @RequestParam(name = "region", required = false) String region,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for end uses");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.getEndUsesForSpeciesRegion(
            firstTrimmedNonBlank(region, orgUnitNumber), parseSpeciesJson(speciesJson))
            .stream()
            .map(this::toCodeResponse)
            .toList());
  }

  @PostMapping(
      value = "/applicationDetailsRPC",
      params = "actionMapping=" + ACTION_GET_END_USE_FOR_SPECIES_REGION)
  public ResponseEntity<List<ApplicationCodeResponseDto>> getEndUseForSpeciesRegionLegacy(
      @RequestParam(name = "speciesJSON", required = false) String speciesJson,
      @RequestParam(name = "region", required = false) String region,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber) {
    return getEndUseForSpeciesRegion(speciesJson, region, orgUnitNumber);
  }

  @GetMapping("/rpc/application-details/remaining-species")
  public ResponseEntity<List<ApplicationRemainingSpeciesResponseDto>> getRemainingSpecies(
      @RequestParam(name = "speciesJSON", required = false) String speciesJson,
      @RequestParam(name = "region", required = false) String region,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber,
      @RequestParam(name = "productType", required = false) String productType,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for remaining species");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service
            .getRemainingSpecies(
                firstTrimmedNonBlank(region, orgUnitNumber),
                firstTrimmedNonBlank(productType, productTypeCode),
                parseSpeciesJson(speciesJson))
            .stream()
            .map(item -> new ApplicationRemainingSpeciesResponseDto(item.code()))
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_REMAINING_SPECIES)
  public ResponseEntity<List<ApplicationRemainingSpeciesResponseDto>> getRemainingSpeciesLegacy(
      @RequestParam(name = "speciesJSON", required = false) String speciesJson,
      @RequestParam(name = "region", required = false) String region,
      @RequestParam(name = "orgUnitNumber", required = false) String orgUnitNumber,
      @RequestParam(name = "productType", required = false) String productType,
      @RequestParam(name = "productTypeCode", required = false) String productTypeCode) {
    return getRemainingSpecies(speciesJson, region, orgUnitNumber, productType, productTypeCode);
  }

  @GetMapping("/rpc/application-details/selected-end-use")
  public ResponseEntity<SelectedEndUseResponseDto> getSelectedEndUse(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for selected end use");
      return ResponseEntity.noContent().build();
    }

    requireApplicationAccess(parsePositiveLong(applicationNumber));

    return service
        .getSelectedEndUse(parsePositiveLong(applicationNumber))
        .map(value -> ResponseEntity.ok(new SelectedEndUseResponseDto(true, value)))
        .orElseGet(() -> ResponseEntity.ok(new SelectedEndUseResponseDto(false, null)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SELECTED_END_USE)
  public ResponseEntity<SelectedEndUseResponseDto> getSelectedEndUseLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getSelectedEndUse(applicationNumber);
  }

  @GetMapping("/rpc/application-details/package-selected-end-use")
  public ResponseEntity<SelectedEndUseResponseDto> getPackageSelectedEndUse(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package selected end use");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, null);

    return service
        .getPackageSelectedEndUse(packageNumber)
        .map(value -> ResponseEntity.ok(new SelectedEndUseResponseDto(true, value)))
        .orElseGet(() -> ResponseEntity.ok(new SelectedEndUseResponseDto(false, null)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_PACKAGE_SELECTED_END_USE)
  public ResponseEntity<SelectedEndUseResponseDto> getPackageSelectedEndUseLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    return getPackageSelectedEndUse(packageNumber);
  }

  @GetMapping("/rpc/application-details/species-for-application")
  public ResponseEntity<List<ApplicationSpeciesEndUseResponseDto>> getSpeciesForApplication(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application species");
      return ResponseEntity.noContent().build();
    }

    requireApplicationAccess(parsePositiveLong(applicationNumber));

    return ResponseEntity.ok(
        service.getSpeciesForApplication(parsePositiveLong(applicationNumber)).stream()
            .map(this::toApplicationSpeciesEndUseResponse)
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SPECIES_FOR_APPLICATION)
  public ResponseEntity<List<ApplicationSpeciesEndUseResponseDto>> getSpeciesForApplicationLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getSpeciesForApplication(applicationNumber);
  }

  @GetMapping("/rpc/application-details/species-for-package")
  public ResponseEntity<List<PackageSpeciesEndUseResponseDto>> getSpeciesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package species");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, null);

    return ResponseEntity.ok(
        service.getSpeciesForPackage(packageNumber).stream()
            .map(this::toPackageSpeciesEndUseResponse)
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SPECIES_FOR_PACKAGE)
  public ResponseEntity<List<PackageSpeciesEndUseResponseDto>> getSpeciesForPackageLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    return getSpeciesForPackage(packageNumber);
  }

  @GetMapping("/rpc/application-details/unique-scales")
  public ResponseEntity<List<ApplicationScaleResponseDto>> getUniqueScalesForApplication(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application scales");
      return ResponseEntity.noContent().build();
    }

    requireApplicationAccess(parsePositiveLong(applicationNumber));

    return ResponseEntity.ok(
        service.getUniqueScalesForApplication(parsePositiveLong(applicationNumber)).stream()
            .map(item -> new ApplicationScaleResponseDto(item.timberMark()))
            .toList());
  }

  @PostMapping(
      value = "/applicationDetailsRPC",
      params = "actionMapping=" + ACTION_GET_UNIQUE_SCALES_FOR_APPLICATION)
  public ResponseEntity<List<ApplicationScaleResponseDto>> getUniqueScalesForApplicationLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getUniqueScalesForApplication(applicationNumber);
  }

  @GetMapping("/rpc/application-details/permits")
  public ResponseEntity<List<ApplicationPermitResponseDto>> findPermits(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application permits");
      return ResponseEntity.noContent().build();
    }

    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    boolean canViewPermitDetails =
        canPerform(authentication, LEGACY_ACTION_PERMIT_DETAILS);

    return ResponseEntity.ok(
        service.findPermits(parsedApplicationNumber).stream()
            .filter(
                item ->
                    canViewPermitDetails
                        && provincialAuthorizationService.canAccessPermit(
                            authentication, item.permitNumber()))
            .map(item -> new ApplicationPermitResponseDto(item.permitNumber(), item.permitStatusDescription()))
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_FIND_PERMIT)
  public ResponseEntity<List<ApplicationPermitResponseDto>> findPermitLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    return findPermits(applicationNumber, authentication);
  }

  @GetMapping("/rpc/application-details/package-scales")
  public ResponseEntity<List<ApplicationPackageScaleResponseDto>> getScalesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package scales");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, null);

    return ResponseEntity.ok(
        service.getScalesForPackage(packageNumber).stream()
            .map(this::toPackageScaleResponse)
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SCALES_FOR_PACKAGE)
  public ResponseEntity<List<ApplicationPackageScaleResponseDto>> getScalesForPackageLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    return getScalesForPackage(packageNumber);
  }

  @GetMapping("/rpc/application-details/package-details")
  public ResponseEntity<ApplicationPackageDetailsResponseDto> getPackageDetails(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package details");
      return ResponseEntity.noContent().build();
    }

    requirePackageAccess(service, packageNumber, null);

    return ResponseEntity.ok(toPackageDetailsResponse(service.getPackageDetails(packageNumber)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_PACKAGE_DETAILS)
  public ResponseEntity<ApplicationPackageDetailsResponseDto> getPackageDetailsLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    return getPackageDetails(packageNumber);
  }

  @GetMapping("/rpc/application-details/scale")
  public ResponseEntity<ApplicationScaleDetailResponseDto> getScaleById(
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "scaleId", required = false) String scaleId) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for scale detail");
      return ResponseEntity.noContent().build();
    }

    String resolvedScaleId = firstTrimmedNonBlank(scaleDetailId, scaleId);
    requireScaleAccess(service, resolvedScaleId, null);

    return ResponseEntity.ok(
        toScaleDetailResponse(service.getScaleById(resolvedScaleId)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_SCALE_BY_ID)
  public ResponseEntity<ApplicationScaleDetailResponseDto> getScaleByIdLegacy(
      @RequestParam(name = "scaleDetailId", required = false) String scaleDetailId,
      @RequestParam(name = "scaleId", required = false) String scaleId) {
    return getScaleById(scaleDetailId, scaleId);
  }

  @GetMapping("/rpc/application-details/package-validity")
  public ResponseEntity<PackageValidityResponseDto> isPackageValid(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package validity");
      return ResponseEntity.noContent().build();
    }

    ApplicationDetailsRpcService.PackageValidityItem validity = service.isPackageValid(packageNumber);
    if (!validity.valid()) {
      requirePackageAccess(service, packageNumber, null);
    }
    return ResponseEntity.ok(toPackageValidityResponse(validity));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_IS_PACKAGE_VALID)
  public ResponseEntity<PackageValidityResponseDto> isPackageValidLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    return isPackageValid(packageNumber);
  }

  @PostMapping("/rpc/application-details/package")
  public ResponseEntity<PackagePersistenceResponseDto> addPackageToApplication(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for add package");
      return ResponseEntity.noContent().build();
    }

    ApplicationDetailsRpcService.PackageMutationRequest request = toPackageMutationRequest(parameters);
    requireApplicationAccess(request.applicationNumber(), authentication);
    applicationEditPolicyService.requirePackageAddOrDelete(
        authentication, service, request.applicationNumber());
    ApplicationEditLockDto lock = requireEditable(request.applicationNumber(), authentication);
    if (lock.locked()) {
      return packagePersistenceLockConflict(lock);
    }

    return operationCoordinator.executeApplicationMutation(
        request.applicationNumber(),
        () -> service.getPermitNumbersForApplicationMutation(request.applicationNumber()),
        () -> {
          requireApplicationAccess(request.applicationNumber(), authentication);
          applicationEditPolicyService.requirePackageAddOrDelete(
              authentication, service, request.applicationNumber());
          ApplicationEditLockDto currentLock =
              requireEditable(request.applicationNumber(), authentication);
          if (currentLock.locked()) {
            return packagePersistenceLockConflict(currentLock);
          }
          return ResponseEntity.ok(
              toPackagePersistenceResponse(
                  service.addPackage(request, userId(authentication))));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_ADD_PACKAGE_TO_APPLICATION)
  public ResponseEntity<PackagePersistenceResponseDto> addPackageToApplicationLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return addPackageToApplication(parameters, authentication);
  }

  @PostMapping("/rpc/application-details/package-update")
  public ResponseEntity<PackagePersistenceResponseDto> updatePackage(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for update package");
      return ResponseEntity.noContent().build();
    }

    ApplicationDetailsRpcService.PackageMutationRequest request = toPackageMutationRequest(parameters);
    requireApplicationAccess(request.applicationNumber(), authentication);
    requirePackageAccess(service, request.packageNumber(), request.applicationNumber());
    applicationEditPolicyService.requirePackageEdit(
        authentication, service, request.applicationNumber());
    if (isPackageNumberChange(request.packageNumber(), request.newPackageNumber())) {
      applicationEditPolicyService.requirePackageNumberUpdate(
          authentication, service, request.applicationNumber());
    }
    ApplicationEditLockDto lock = requireEditable(request.applicationNumber(), authentication);
    if (lock.locked()) {
      return packagePersistenceLockConflict(lock);
    }

    return operationCoordinator.executeApplicationMutation(
        request.applicationNumber(),
        () -> service.getPermitNumbersForApplicationMutation(request.applicationNumber()),
        () -> {
          requireApplicationAccess(request.applicationNumber(), authentication);
          requirePackageAccess(
              service, request.packageNumber(), request.applicationNumber());
          applicationEditPolicyService.requirePackageEdit(
              authentication, service, request.applicationNumber());
          if (isPackageNumberChange(request.packageNumber(), request.newPackageNumber())) {
            applicationEditPolicyService.requirePackageNumberUpdate(
                authentication, service, request.applicationNumber());
          }
          ApplicationEditLockDto currentLock =
              requireEditable(request.applicationNumber(), authentication);
          if (currentLock.locked()) {
            return packagePersistenceLockConflict(currentLock);
          }
          return ResponseEntity.ok(
              toPackagePersistenceResponse(
                  service.updatePackage(request, userId(authentication))));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_UPDATE_PACKAGE)
  public ResponseEntity<PackagePersistenceResponseDto> updatePackageLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return updatePackage(parameters, authentication);
  }

  @PostMapping("/rpc/application-details/package-scale")
  public ResponseEntity<ScalePersistenceResponseDto> addScaleToPackage(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for add scale");
      return ResponseEntity.noContent().build();
    }

    ApplicationDetailsRpcService.ScaleMutationRequest request = toScaleMutationRequest(parameters);
    requireApplicationAccess(request.applicationNumber(), authentication);
    requirePackageAccess(service, request.packageNumber(), request.applicationNumber());
    applicationEditPolicyService.requireScaleAddOrDelete(
        authentication, service, request.applicationNumber());
    ApplicationEditLockDto lock = requireEditable(request.applicationNumber(), authentication);
    if (lock.locked()) {
      return scalePersistenceLockConflict(lock);
    }

    return operationCoordinator.executeApplicationMutation(
        request.applicationNumber(),
        () -> service.getPermitNumbersForApplicationMutation(request.applicationNumber()),
        () -> {
          requireApplicationAccess(request.applicationNumber(), authentication);
          requirePackageAccess(
              service, request.packageNumber(), request.applicationNumber());
          applicationEditPolicyService.requireScaleAddOrDelete(
              authentication, service, request.applicationNumber());
          ApplicationEditLockDto currentLock =
              requireEditable(request.applicationNumber(), authentication);
          if (currentLock.locked()) {
            return scalePersistenceLockConflict(currentLock);
          }
          return ResponseEntity.ok(
              toScalePersistenceResponse(
                  service.addScaleToPackage(request, userId(authentication))));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_ADD_SCALE_TO_PACKAGE)
  public ResponseEntity<ScalePersistenceResponseDto> addScaleToPackageLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return addScaleToPackage(parameters, authentication);
  }

  @DeleteMapping("/rpc/application-details/scale")
  public ResponseEntity<DeleteResponseDto> deleteScaleById(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for delete scale");
      return ResponseEntity.noContent().build();
    }

    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    requireScaleAccess(service, scaleId, parsedApplicationNumber);
    applicationEditPolicyService.requireScaleAddOrDelete(
        authentication, service, parsedApplicationNumber);
    ApplicationEditLockDto lock = requireEditable(parsedApplicationNumber, authentication);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(new DeleteResponseDto(false));
    }

    return operationCoordinator.executeApplicationMutation(
        parsedApplicationNumber,
        () -> service.getPermitNumbersForApplicationMutation(parsedApplicationNumber),
        () -> {
          requireApplicationAccess(parsedApplicationNumber, authentication);
          requireScaleAccess(service, scaleId, parsedApplicationNumber);
          applicationEditPolicyService.requireScaleAddOrDelete(
              authentication, service, parsedApplicationNumber);
          ApplicationEditLockDto currentLock =
              requireEditable(parsedApplicationNumber, authentication);
          if (currentLock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new DeleteResponseDto(false));
          }
          return ResponseEntity.ok(
              new DeleteResponseDto(
                  service.deleteScaleById(scaleId, userId(authentication))));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_DELETE_SCALE_BY_ID)
  public ResponseEntity<DeleteResponseDto> deleteScaleByIdLegacy(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    return deleteScaleById(scaleId, applicationNumber, authentication);
  }

  @DeleteMapping("/rpc/application-details/package")
  public ResponseEntity<DeleteResponseDto> deletePackageById(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for delete package");
      return ResponseEntity.noContent().build();
    }

    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);
    requirePackageAccess(service, packageNumber, parsedApplicationNumber);
    applicationEditPolicyService.requirePackageAddOrDelete(
        authentication, service, parsedApplicationNumber);
    ApplicationEditLockDto lock = requireEditable(parsedApplicationNumber, authentication);
    if (lock.locked()) {
      return ResponseEntity.status(HttpStatus.CONFLICT).body(new DeleteResponseDto(false));
    }

    return operationCoordinator.executeApplicationMutation(
        parsedApplicationNumber,
        () -> service.getPermitNumbersForApplicationMutation(parsedApplicationNumber),
        () -> {
          requireApplicationAccess(parsedApplicationNumber, authentication);
          requirePackageAccess(service, packageNumber, parsedApplicationNumber);
          applicationEditPolicyService.requirePackageAddOrDelete(
              authentication, service, parsedApplicationNumber);
          ApplicationEditLockDto currentLock =
              requireEditable(parsedApplicationNumber, authentication);
          if (currentLock.locked()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new DeleteResponseDto(false));
          }
          return ResponseEntity.ok(
              new DeleteResponseDto(
                  service.deletePackageById(packageNumber, userId(authentication))));
        });
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_DELETE_PACKAGE_BY_ID)
  public ResponseEntity<DeleteResponseDto> deletePackageByIdLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    return deletePackageById(packageNumber, applicationNumber, authentication);
  }

  private boolean canPerform(Authentication authentication, String action) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), action);
  }

  private boolean canPerform(List<String> roles, String action) {
    return authorizationService.canPerformAction(roles, action);
  }

  private boolean isPackageNumberChange(String packageNumber, String newPackageNumber) {
    String current = trimToNull(packageNumber);
    String requested = trimToNull(newPackageNumber);
    return requested != null && !requested.equals(current);
  }

  private ApplicationEditLockDto requireEditable(Long applicationNumber, Authentication authentication) {
    provincialAuthorizationService.requireApplication(authentication, applicationNumber);
    return editLockService.requireEditable(applicationNumber, userId(authentication), userId(authentication));
  }

  private Authentication currentAuthentication() {
    return SecurityContextHolder.getContext().getAuthentication();
  }

  private void requireApplicationAccess(Long applicationNumber) {
    provincialAuthorizationService.requireApplication(currentAuthentication(), applicationNumber);
  }

  private void requireApplicationAccess(Long applicationNumber, Authentication authentication) {
    provincialAuthorizationService.requireApplication(authentication, applicationNumber);
  }

  private void requirePermitAccess(Long permitNumber, Authentication authentication) {
    provincialAuthorizationService.requirePermit(authentication, permitNumber);
  }

  private void requireClientAccess(String clientNumber) {
    if (!provincialAuthorizationService.canCreateForClient(
        currentAuthentication(), clientNumber, null)) {
      throw new AccessDeniedException("Client is outside the authenticated client scope.");
    }
  }

  private void requirePackageAccess(
      ApplicationDetailsRpcService service, String packageNumber, Long expectedApplicationNumber) {
    Authentication authentication = currentAuthentication();
    Long actualApplicationNumber =
        service
            .findApplicationNumberForPackage(packageNumber)
            .orElseThrow(() -> new AccessDeniedException("Package parent application is unavailable."));
    if (expectedApplicationNumber != null && !expectedApplicationNumber.equals(actualApplicationNumber)) {
      throw new AccessDeniedException("Package does not belong to the supplied application.");
    }
    provincialAuthorizationService.requireApplication(authentication, actualApplicationNumber);
  }

  private void requireScaleAccess(
      ApplicationDetailsRpcService service, String scaleId, Long expectedApplicationNumber) {
    Authentication authentication = currentAuthentication();
    Long actualApplicationNumber =
        service
            .findApplicationNumberForScale(scaleId)
            .orElseThrow(() -> new AccessDeniedException("Scale parent application is unavailable."));
    if (expectedApplicationNumber != null && !expectedApplicationNumber.equals(actualApplicationNumber)) {
      throw new AccessDeniedException("Scale does not belong to the supplied application.");
    }
    provincialAuthorizationService.requireApplication(authentication, actualApplicationNumber);
  }

  private void requireRemarkAccess(
      ApplicationDetailsRpcService service,
      Long remarkId,
      Long expectedApplicationNumber,
      Authentication authentication) {
    Long applicationNumber =
        service
            .findApplicationNumberForRemark(remarkId)
            .orElseThrow(() -> new AccessDeniedException("Remark parent application is unavailable."));
    if (expectedApplicationNumber != null && !expectedApplicationNumber.equals(applicationNumber)) {
      throw new AccessDeniedException("Remark does not belong to the supplied application.");
    }
    provincialAuthorizationService.requireApplication(authentication, applicationNumber);
  }

  private ResponseEntity<ApplicationPersistenceResponseDto> applicationPersistenceLockConflict(
      ApplicationEditLockDto lock, Long applicationNumber) {
    String message = lock.message();
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(
            new ApplicationPersistenceResponseDto(
                false, message, applicationNumber, List.of(message), List.of()));
  }

  private ResponseEntity<PackagePersistenceResponseDto> packagePersistenceLockConflict(
      ApplicationEditLockDto lock) {
    String message = lock.message();
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(
            new PackagePersistenceResponseDto(
                false, List.of(message), List.of(), null, null, null, null, null, null));
  }

  private ResponseEntity<ScalePersistenceResponseDto> scalePersistenceLockConflict(
      ApplicationEditLockDto lock) {
    String message = lock.message();
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(new ScalePersistenceResponseDto(false, null, List.of(message), List.of()));
  }

  private boolean applicationDocumentCanBeRemovedFromApplication(
      ApplicationDetailsRpcService service,
      Long documentId,
      Long applicationNumber) {
    if (documentId == null || documentId < 1 || applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    List<ApplicationDetailsRpcService.DocumentItem> matches =
        service.getDocumentDetails(applicationNumber).stream()
            .filter(item -> documentId.equals(item.id()))
            .limit(2)
            .toList();
    if (matches.size() != 1) {
      return false;
    }
    ApplicationDetailsRpcService.DocumentItem item = matches.getFirst();
    return item.deletable()
        && "application".equals(item.source())
        && applicationNumber.equals(item.sourceApplicationNumber())
        && item.sourcePermitNumber() == null;
  }

  private boolean canAccessApplicationDocument(
      ApplicationDetailsRpcService.DocumentItem item,
      Long applicationNumber,
      Authentication authentication) {
    if (item == null || applicationNumber == null || applicationNumber < 1) {
      return false;
    }
    if ("permit".equals(item.source())
        && item.sourcePermitNumber() != null
        && item.sourceApplicationNumber() == null) {
      if (!canPerform(authentication, LEGACY_ACTION_PERMIT_DETAILS)) {
        return false;
      }
      try {
        requirePermitAccess(item.sourcePermitNumber(), authentication);
        return true;
      } catch (AccessDeniedException ex) {
        return false;
      }
    }
    return "application".equals(item.source())
        && applicationNumber.equals(item.sourceApplicationNumber())
        && item.sourcePermitNumber() == null;
  }

  private boolean canRemoveApplicationDocumentWithCurrentStatus(
      ApplicationDetailsRpcService service, Long applicationNumber, List<String> roles) {
    return service
        .getApplicationSummarySnapshot(applicationNumber)
        .map(snapshot -> canRemoveApplicationDocumentWithStatus(snapshot.applicationStatusCode(), roles))
        .orElse(false);
  }

  private boolean canRemoveApplicationDocumentWithStatus(String applicationStatusCode, List<String> roles) {
    String status = applicationStatusCode == null ? "" : applicationStatusCode.trim().toUpperCase(Locale.ROOT);
    if (status.isBlank()) {
      return false;
    }

    List<String> normalizedRoles = normalizedRoles(roles);
    if (normalizedRoles.stream().anyMatch(APPLICATION_DOCUMENT_DELETE_ROLES::contains)) {
      return !APPLICATION_STATUS_EXPIRED.equals(status);
    }

    boolean industryUser =
        normalizedRoles.stream()
            .anyMatch(
                role ->
                    APPLICATION_DOCUMENT_INDUSTRY_ROLES.contains(role)
                        || role.startsWith("LEXIS_PROVINCIAL_SUBMITTER_"));
    return industryUser
        && (APPLICATION_STATUS_PERMITTED.equals(status) || APPLICATION_STATUS_EXPIRED.equals(status));
  }

  private boolean hasApplicationDocumentDeleteRole(List<String> roles) {
    List<String> normalizedRoles = normalizedRoles(roles);
    return normalizedRoles.stream().anyMatch(APPLICATION_DOCUMENT_DELETE_ROLES::contains)
        || normalizedRoles.stream()
            .anyMatch(
                role ->
                    APPLICATION_DOCUMENT_INDUSTRY_ROLES.contains(role)
                        || role.startsWith("LEXIS_PROVINCIAL_SUBMITTER_"));
  }

  private List<String> normalizedRoles(List<String> roles) {
    if (roles == null || roles.isEmpty()) {
      return List.of();
    }
    return roles.stream()
        .filter(role -> role != null)
        .map(role -> role.trim().toUpperCase(Locale.ROOT))
        .toList();
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest toCreateApplicationRequest(
      MultiValueMap<String, String> parameters) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        parsePositiveLong(first(parameters, "federalApplicationNumber", "fedApplicationNumber")),
        parseDate(first(parameters, "applicationDate")),
        parsePositiveLong(first(parameters, "exemptionTerm", "termDays")),
        parseDate(first(parameters, "dateReceived", "receivedDate")),
        parseDouble(first(parameters, "applicationVolume")),
        parseDouble(first(parameters, "averageLogVolume")),
        first(parameters, "logLocation", "productLocation"),
        parsePositiveLong(first(parameters, "exportScheduleId", "legacyExportScheduleId")),
        first(parameters, "agentClientNumber", "applicantClientNumber"),
        first(parameters, "agentClientLocation", "agentClientLocationCode", "applicantClientLocationCode"),
        first(parameters, "ownerClientNumber"),
        first(parameters, "ownerClientLocation", "ownerClientLocationCode"),
        canonicalExemptionNumber(first(parameters, "exemptionNumber")),
        first(parameters, "exemptionReason", "exemptionType", "exemptionTypeCode"),
        first(parameters, "ownerApplicantType", "applicantType"),
        parsePositiveLong(first(parameters, "region", "orgUnitNumber")),
        first(parameters, "productType", "productTypeCode"),
        first(parameters, "exportJurisdictionCode", "jurisdictionCode"),
        first(parameters, "ageClass", "growthTypeCode"),
        first(parameters, "agentContactName"),
        first(parameters, "ownerContactName"),
        first(parameters, "oicIndicator"),
        first(parameters, "applicationEndUseCode", "endUseCode", "endUse"),
        parseSpeciesSelection(parameters),
        first(parameters, "additionalRemarks", "comments", "remarkBody", "remark"),
        true);
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest withScopedSubmitterOwnerIdentity(
      ApplicationDetailsRpcService.CreateApplicationRequest request,
      Authentication authentication) {
    String scopedClientNumber =
        normalizeClientNumber(
            provincialAuthorizationService.scopedForestClientNumber(authentication));
    if (scopedClientNumber == null) {
      return request;
    }

    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        request.federalApplicationNumber(),
        request.applicationDate(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        request.averageLogVolume(),
        request.productLocation(),
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        scopedClientNumber,
        "00",
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        request.applicationStatusCode(),
        request.applicantTypeCode(),
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.jurisdictionCode(),
        request.growthTypeCode(),
        request.agentContactName(),
        request.ownerContactName(),
        request.oicIndicator(),
        request.endUseCode(),
        request.speciesCodes(),
        request.remarkBody(),
        request.validationEnabled());
  }

  private String canonicalExemptionNumber(String exemptionNumber) {
    String normalized = trimToNull(exemptionNumber);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest toApplicationSummaryUpdateRequest(
      MultiValueMap<String, String> parameters) {
    return new ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest(
        parsePositiveLong(first(parameters, "applicationNumber")),
        parseDate(first(parameters, "applicationDate")),
        parsePositiveLong(first(parameters, "exemptionTerm", "termDays")),
        parseDate(first(parameters, "dateReceived", "receivedDate")),
        parseDouble(first(parameters, "exemptionApplicationVolume", "applicationVolume")),
        parseDouble(first(parameters, "averageLogVolume")),
        first(parameters, "exemptionReason", "exemptionReasonCode", "exportExemptionReasonCode"),
        first(parameters, "logLocation", "productLocation"),
        parsePositiveLong(first(parameters, "exportScheduleId", "legacyExportScheduleId")),
        first(parameters, "agentClientNumber", "applicantClientNumber"),
        first(parameters, "agentClientLocation", "agentClientLocationCode", "applicantClientLocationCode"),
        first(parameters, "ownerClientNumber"),
        first(parameters, "ownerClientLocation", "ownerClientLocationCode"),
        first(parameters, "exportApplicationStatusCode", "applicationStatusCode"),
        first(parameters, "ownerApplicantType", "applicantType"),
        parsePositiveLong(first(parameters, "region", "orgUnitNumber")),
        first(parameters, "productType", "productTypeCode"),
        first(parameters, "exportJurisdictionCode", "jurisdictionCode"),
        first(parameters, "ageClass", "growthTypeCode"),
        first(parameters, "agentContactName"),
        first(parameters, "ownerContactName"),
        first(parameters, "oicIndicator"),
        first(parameters, "applicationEndUseCode", "endUseCode", "endUse"),
        parseSpeciesSelection(parameters),
        true);
  }

  private ApplicationDetailsRpcService.PackageMutationRequest toPackageMutationRequest(
      MultiValueMap<String, String> parameters) {
    return new ApplicationDetailsRpcService.PackageMutationRequest(
        first(parameters, "packageNumber"),
        first(parameters, "newPackageNumber"),
        parsePositiveLong(first(parameters, "applicationNumber")),
        parseDouble(first(parameters, "packageDialogPackageVolume", "packageVolume", "volume")),
        parseDouble(first(parameters, "packageDialogAverageLength", "averageLength", "length")),
        parseDouble(first(parameters, "packageDialogAverageDiameter", "averageDiameter", "diameter")),
        first(parameters, "packageDialogPackageStatus", "packageStatus", "status"),
        first(parameters, "packageDialogPackageComment", "comments", "comment"),
        first(parameters, "packageDialogReprocessedIndicator", "reprocessed"),
        first(parameters, "packageDialogAgeClass", "updatePackageDialogAgeClass", "ageClass"),
        first(parameters, "packageDialogProductType", "updatePackageDialogProductType", "productType"),
        first(parameters, "createPackageEndUse", "updatePackageEndUse", "endUseCode"),
        parseCsv(first(parameters, "createPackageSpeciesTableValues", "updatePackageSpeciesTableValues", "speciesCodes")));
  }

  private ApplicationDetailsRpcService.ScaleMutationRequest toScaleMutationRequest(
      MultiValueMap<String, String> parameters) {
    return new ApplicationDetailsRpcService.ScaleMutationRequest(
        first(parameters, "timberMark"),
        first(parameters, "packageNumber"),
        first(parameters, "gradeCode"),
        first(parameters, "speciesCode"),
        parsePositiveLong(first(parameters, "applicationNumber")),
        parseNonNegativeLong(first(parameters, "scalePieces", "pieces")),
        parseDouble(first(parameters, "scaleVolume", "volume")));
  }

  private boolean hasApplicationFormChanges(
      MultiValueMap<String, String> parameters,
      ApplicationDetailsRpcService.ApplicationSummarySnapshot snapshot) {
    if (snapshot == null || APPLICATION_STATUS_EXPIRED.equalsIgnoreCase(snapshot.applicationStatusCode())) {
      return false;
    }

    String additionalRemarks = first(parameters, "additionalRemarks", "remarks");
    if (additionalRemarks != null) {
      return true;
    }
    if (isBlank(snapshot.ownerContactName())) {
      return true;
    }

    return fieldChanged(snapshot.ownerClientNumber(), first(parameters, "ownerClientNumber"))
        || fieldChanged(
            snapshot.ownerClientLocationCode(),
            first(parameters, "ownerClientLocation", "ownerClientLocationCode"))
        || fieldChanged(snapshot.orgUnitNumber(), parsePositiveLong(first(parameters, "region", "orgUnitNumber")))
        || fieldChanged(snapshot.productTypeCode(), first(parameters, "productType", "productTypeCode"))
        || fieldChanged(
            snapshot.exemptionReasonCode(),
            first(parameters, "exemptionReason", "exemptionReasonCode", "exportExemptionReasonCode"))
        || fieldChanged(snapshot.applicationDate(), parseDate(first(parameters, "applicationDate")))
        || fieldChanged(snapshot.receivedDate(), parseDate(first(parameters, "dateReceived", "receivedDate")))
        || fieldChanged(
            snapshot.exportScheduleId(),
            parsePositiveLong(first(parameters, "exportScheduleId", "legacyExportScheduleId")))
        || fieldChanged(snapshot.termDays(), parsePositiveLong(first(parameters, "exemptionTerm", "termDays")))
        || fieldChanged(snapshot.productLocation(), first(parameters, "logLocation", "productLocation"))
        || fieldChanged(snapshot.averageLogVolume(), parseDouble(first(parameters, "averageLogVolume")))
        || fieldChanged(snapshot.ownerContactName(), first(parameters, "ownerContactName"))
        || agentChanged(parameters, snapshot);
  }

  private boolean agentChanged(
      MultiValueMap<String, String> parameters,
      ApplicationDetailsRpcService.ApplicationSummarySnapshot snapshot) {
    String agentNumber = first(parameters, "agentClientNumber", "applicantClientNumber");
    if (agentNumber == null && snapshot.agentClientNumber() == null) {
      return false;
    }
    if (snapshot.agentClientNumber() != null && isBlank(snapshot.agentContactName())) {
      return true;
    }
    return fieldChanged(snapshot.agentClientNumber(), agentNumber)
        || fieldChanged(
            snapshot.agentClientLocationCode(),
            first(parameters, "agentClientLocation", "agentClientLocationCode", "applicantClientLocationCode"))
        || fieldChanged(snapshot.agentContactName(), first(parameters, "agentContactName"));
  }

  private boolean fieldChanged(Object currentValue, Object submittedValue) {
    return !normalizeComparable(currentValue).equals(normalizeComparable(submittedValue));
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private String normalizeComparable(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof Double doubleValue) {
      return Double.toString(doubleValue);
    }
    return value.toString().trim();
  }

  private boolean isSelectedLocation(
      String clientNumber,
      String locationCode,
      String applicantType,
      ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot) {
    if (snapshot == null) {
      return false;
    }
    String normalizedClientNumber = normalizeClientNumber(clientNumber);
    String normalizedLocationCode = trimToNull(locationCode);
    if ("owner".equalsIgnoreCase(applicantType)) {
      return equalsIgnoreCase(normalizedClientNumber, snapshot.ownerClientNumber())
          && equalsIgnoreCase(normalizedLocationCode, snapshot.ownerClientLocationCode());
    }
    if ("agent".equalsIgnoreCase(applicantType)) {
      return equalsIgnoreCase(normalizedClientNumber, snapshot.agentClientNumber())
          && equalsIgnoreCase(normalizedLocationCode, snapshot.agentClientLocationCode());
    }
    return false;
  }

  private List<ClientLookupService.ClientContact> resolveApplicationContacts(
      ClientLookupService clientLookupService,
      String clientNumber,
      String clientLocationCode,
      String applicantType,
      ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot) {
    String normalizedClientNumber = normalizeClientNumber(clientNumber);
    String normalizedLocationCode = trimToNull(clientLocationCode);
    if (snapshot != null && "agent".equalsIgnoreCase(applicantType)
        && trimToNull(snapshot.agentContactName()) != null
        && equalsIgnoreCase(normalizedClientNumber, snapshot.agentClientNumber())
        && equalsIgnoreCase(normalizedLocationCode, snapshot.agentClientLocationCode())) {
      return List.of(new ClientLookupService.ClientContact(snapshot.agentContactName(), "-1"));
    }
    if (snapshot != null && "owner".equalsIgnoreCase(applicantType)
        && trimToNull(snapshot.ownerContactName()) != null
        && equalsIgnoreCase(normalizedClientNumber, snapshot.ownerClientNumber())
        && equalsIgnoreCase(normalizedLocationCode, snapshot.ownerClientLocationCode())) {
      return List.of(new ClientLookupService.ClientContact(snapshot.ownerContactName(), "-1"));
    }
    return clientLookupService.getContactsForLocation(clientNumber, clientLocationCode);
  }

  private ApplicationClientDataResponseDto toClientDataResponse(
      ClientLookupService.ClientData data, String notfound) {
    return new ApplicationClientDataResponseDto(
        data.clientNumber(),
        data.companyName(),
        data.address(),
        data.city(),
        data.province(),
        data.postalCode(),
        data.country(),
        data.phone(),
        data.fax(),
        data.email(),
        notfound);
  }

  private ApplicationClientContactResponseDto toClientContactResponse(
      ClientLookupService.ClientContact contact, ClientLookupService.ClientData data) {
    return new ApplicationClientContactResponseDto(
        contact.contactName(),
        contact.contactId(),
        data == null ? null : data.clientNumber(),
        data == null ? null : data.companyName(),
        data == null ? null : data.address(),
        data == null ? null : data.city(),
        data == null ? null : data.province(),
        data == null ? null : data.postalCode(),
        data == null ? null : data.country(),
        data == null ? null : data.phone(),
        data == null ? null : data.fax(),
        data == null ? null : data.email());
  }

  private boolean equalsIgnoreCase(String left, String right) {
    return left != null && right != null && left.equalsIgnoreCase(right);
  }

  private List<String> parseSpeciesJson(String speciesJson) {
    if (speciesJson == null || speciesJson.isBlank()) {
      return List.of();
    }
    try {
      return OBJECT_MAPPER.readValue(speciesJson, STRING_LIST_TYPE).stream()
          .map(TextUtils::trimToNull)
          .filter(value -> value != null)
          .toList();
    } catch (JsonProcessingException ex) {
      LOGGER.warn(
          "event=lexis_application_details operation=parse_species outcome=invalid failureType={}",
          exceptionType(ex));
      return List.of();
    }
  }

  private List<String> parseSpeciesSelection(MultiValueMap<String, String> parameters) {
    String speciesJson = first(parameters, "speciesJSON", "speciesJson");
    if (trimToNull(speciesJson) != null) {
      return parseSpeciesJson(speciesJson);
    }
    return parseCsv(
        first(
            parameters,
            "applicationSelectedSpecies",
            "speciesTableValues",
            "selectedSpecies",
            "speciesCodes"));
  }

  private List<String> parseCsv(String csv) {
    String normalized = trimToNull(csv);
    if (normalized == null) {
      return List.of();
    }
    return List.of(normalized.split(",")).stream()
        .map(TextUtils::trimToNull)
        .filter(value -> value != null)
        .toList();
  }

  private ApplicationCodeResponseDto toCodeResponse(ApplicationDetailsRpcService.CodeItem item) {
    return new ApplicationCodeResponseDto(item.code(), item.description());
  }

  private ApplicationSpeciesEndUseResponseDto toApplicationSpeciesEndUseResponse(
      ApplicationDetailsRpcService.SpeciesEndUseItem item) {
    return new ApplicationSpeciesEndUseResponseDto(
        item.species(), item.endUse(), item.endUseDescription());
  }

  private PackageSpeciesEndUseResponseDto toPackageSpeciesEndUseResponse(
      ApplicationDetailsRpcService.SpeciesEndUseItem item) {
    return new PackageSpeciesEndUseResponseDto(
        item.species(), item.endUse(), item.endUseDescription(), item.endUse());
  }

  private ApplicationPackageScaleResponseDto toPackageScaleResponse(
      ApplicationDetailsRpcService.ApplicationPackageScaleItem item) {
    return new ApplicationPackageScaleResponseDto(
        item.permitted(),
        item.timberMark(),
        item.species(),
        item.pieces(),
        item.grade(),
        item.volume(),
        item.id(),
        item.cascadeSplitCode());
  }

  private ApplicationScaleDetailResponseDto toScaleDetailResponse(
      ApplicationDetailsRpcService.ApplicationScaleDetailItem item) {
    return new ApplicationScaleDetailResponseDto(
        item.success(),
        item.timberMark(),
        item.species(),
        item.pieces(),
        item.grade(),
        item.volume(),
        item.id());
  }

  private ApplicationPackageDetailsResponseDto toPackageDetailsResponse(
      ApplicationDetailsRpcService.PackageDetailsItem item) {
    return new ApplicationPackageDetailsResponseDto(
        item.success(),
        item.packageNumber(),
        item.volume(),
        item.scaledVolume(),
        item.length(),
        item.diameter(),
        item.status(),
        item.comments(),
        item.statusDescription(),
        item.reprocessed(),
        item.ageClass(),
        item.ageClassDescription(),
        item.productType(),
        item.productTypeDescription());
  }

  private ApplicationSummaryResponseDto toApplicationSummaryResponse(
      ApplicationDetailsRpcService.ApplicationSummarySnapshot item) {
    return new ApplicationSummaryResponseDto(
        item.applicationNumber(),
        item.federalApplicationNumber(),
        item.applicationDate(),
        item.termDays(),
        item.receivedDate(),
        item.applicationVolume(),
        item.averageLogVolume(),
        item.productLocation(),
        item.exportScheduleId(),
        item.agentClientNumber(),
        item.agentClientLocationCode(),
        item.ownerClientNumber(),
        item.ownerClientLocationCode(),
        item.exemptionNumber(),
        item.exemptionReasonCode(),
        item.applicationStatusCode(),
        item.applicantTypeCode(),
        item.orgUnitNumber(),
        item.productTypeCode(),
        item.jurisdictionCode(),
        item.growthTypeCode(),
        item.agentContactName(),
        item.ownerContactName(),
        item.oicIndicator());
  }

  private PackageValidityResponseDto toPackageValidityResponse(
      ApplicationDetailsRpcService.PackageValidityItem item) {
    return new PackageValidityResponseDto(item.valid(), item.message());
  }

  private PackagePersistenceResponseDto toPackagePersistenceResponse(
      ApplicationDetailsRpcService.PackagePersistenceResult item) {
    return new PackagePersistenceResponseDto(
        item.valid(),
        item.errors(),
        item.warnings(),
        item.packageNumber(),
        item.volume(),
        item.length(),
        item.diameter(),
        item.status(),
        item.packageNumber());
  }

  private ScalePersistenceResponseDto toScalePersistenceResponse(
      ApplicationDetailsRpcService.ScalePersistenceResult item) {
    ApplicationDetailsRpcService.ApplicationPackageScaleItem result = item.result();
    return new ScalePersistenceResponseDto(
        item.valid(),
        result == null
            ? null
            : new ScalePersistenceResultDto(
                result.timberMark(),
                result.pieces(),
                result.species(),
                result.grade(),
                result.volume(),
                result.id()),
        item.errors(),
        item.warnings());
  }

  private String userId(Authentication authentication) {
    if (principalService != null) {
      return principalService.resolvePrincipalName(authentication);
    }
    return authentication == null ? null : authentication.getName();
  }

  private ResponseEntity<ApplicationStatusEmailResponseDto> sendApplicationStatusEmail(
      MultiValueMap<String, String> parameters, String statusCode, Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPLICATIONS_REVIEW)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationReviewService service = applicationReviewServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application review service unavailable - returning no content for application status email");
      return ResponseEntity.noContent().build();
    }

    Long applicationNumber = parsePositiveLong(first(parameters, "applicationNumber"));
    if (applicationNumber != null) {
      requireApplicationAccess(applicationNumber, authentication);
    }
    ApplicationReviewStatusEmailResultDto result =
        applicationNumber == null
            ? new ApplicationReviewStatusEmailResultDto(
                false, "Application number must be a positive value.")
            : operationCoordinator.executeApplicationLocalMutation(
                applicationNumber,
                () -> {
                  requireApplicationAccess(applicationNumber, authentication);
                  return service.sendStatusEmail(
                      applicationNumber,
                      new ApplicationReviewStatusEmailRequestDto(
                          statusCode,
                          first(parameters, "toEmailAddress", "clientEmailAddress"),
                          first(
                              parameters,
                              "additionalRemarks",
                              "remark",
                              "remarkBody")));
                });
    return ResponseEntity.ok(new ApplicationStatusEmailResponseDto(result.success(), result.message()));
  }

  public record DocumentDetailsResponseDto(
      String name,
      String description,
      String type,
      long id,
      String source,
      boolean deletable) {}

  public record RemoveDocumentResponseDto(String success) {}

  public record GetRemarkResponseDto(String remark, boolean notfound) {}

  public record PersistRemarkResponseDto(
      String status, Instant date, String user, String remark, String title, Long remarkId) {}

  public record CheckFormChangesResponseDto(boolean applicationChanged) {}

  public record CheckUnusedVolumeResponseDto(boolean volumeUsedInd) {}

  public record ReleaseLockResponseDto(String release) {}

  public record ApplicationStatusEmailResponseDto(boolean success, String message) {}

  public record ApplicationPersistenceResponseDto(
      boolean valid,
      String message,
      Long applicationNumber,
      List<String> errors,
      List<String> warnings) {}

  public record ApplicationSummaryResponseDto(
      Long applicationNumber,
      Long federalApplicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator) {}

  public record ApplicationClientDataResponseDto(
      String clientNumber,
      String companyName,
      String address,
      String city,
      String province,
      String postalCode,
      String country,
      String phone,
      String fax,
      String email,
      String notfound) {}

  public record ApplicationClientLocationResponseDto(
      String locationName, String locationCode, boolean selected) {}

  public record ApplicationClientContactResponseDto(
      String contactName,
      String contactId,
      String clientNumber,
      String companyName,
      String address,
      String city,
      String province,
      String postalCode,
      String country,
      String phone,
      String fax,
      String email) {}

  public record ApplicationCodeResponseDto(String code, String description) {}

  public record ApplicationRemainingSpeciesResponseDto(String code) {}

  public record SelectedEndUseResponseDto(boolean success, String selectedEndUse) {}

  public record ApplicationSpeciesEndUseResponseDto(
      String species, String enduse, String endUseDescription) {}

  public record PackageSpeciesEndUseResponseDto(
      String species, String enduse, String packageEndUseDescription, String packageEndUse) {}

  public record ApplicationScaleResponseDto(String timberMark) {}

  public record ApplicationPermitResponseDto(
      Long permitNumber, String permitStatusDescription) {}

  public record ApplicationPackageScaleResponseDto(
      boolean permitted,
      String timberMark,
      String species,
      long pieces,
      String grade,
      String volume,
      String id,
      String cascadeSplitCode) {}

  public record ApplicationPackageDetailsResponseDto(
      boolean success,
      String packageNumber,
      String volume,
      double scaledVolume,
      String length,
      String diameter,
      String status,
      String comments,
      String statusDesc,
      String reprocessed,
      String ageClass,
      String ageClassDescription,
      String productType,
      String productTypeDescription) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ApplicationScaleDetailResponseDto(
      boolean success,
      String timberMark,
      String species,
      String pieces,
      String grade,
      String volume,
      String id) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PackageValidityResponseDto(boolean valid, String message) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record PackagePersistenceResponseDto(
      boolean valid,
      List<String> errors,
      List<String> warnings,
      String packageNumber,
      String volume,
      String length,
      String diameter,
      String status,
      @JsonProperty("package") String packageName) {}

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record ScalePersistenceResponseDto(
      boolean valid,
      ScalePersistenceResultDto result,
      List<String> errors,
      List<String> warnings) {}

  public record ScalePersistenceResultDto(
      String timberMark, long pieces, String species, String grade, String volume, String id) {}

  public record DeleteResponseDto(boolean success) {}
}

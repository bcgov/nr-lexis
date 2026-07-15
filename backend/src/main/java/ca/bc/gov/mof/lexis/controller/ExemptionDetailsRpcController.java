package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDate;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDouble;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLongs;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.sanitizeFileName;
import static ca.bc.gov.mof.lexis.util.TextUtils.firstTrimmedNonBlank;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataRetrievalFailureException;
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
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class ExemptionDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionDetailsRpcController.class);

  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";
  private static final String EXEMPTION_STATUS_EXPIRED = "EXP";
  private static final Set<String> EXEMPTION_APPLICATION_LINK_ROLES =
      Set.of(ROLE_ADMIN, ROLE_APPLICATION_APPROVER);
  private static final Set<String> EXEMPTION_DOCUMENT_DELETE_ROLES =
      Set.of(ROLE_ADMIN, ROLE_APPLICATION_APPROVER);

  private static final String ACTION_GET_APPLICATIONS = "getApplications";
  private static final String ACTION_GET_PERMITS = "getPermits";
  private static final String ACTION_GET_BLANKET_OIC_TOTALS = "getBlanketOICTotals";
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_REMOVE_DOCUMENT = "removeDocument";
  private static final String ACTION_ADD_EXEMPTION = "addExemption";
  private static final String ACTION_UPDATE_EXEMPTION = "updateExemption";
  private static final String ACTION_CHECK_EXEMPTION_NUMBER = "checkExemptionNumber";
  private static final String ACTION_ADD_APPLICATION_TO_EXEMPTION = "addApplicationToExemption";
  private static final String ACTION_REMOVE_APPLICATION_FROM_EXEMPTION = "removeApplicationFromExemption";
  private static final String ACTION_GET_CLIENT_DATA = "getClientData";
  private static final String ACTION_GET_CLIENT_LOCATIONS = "getClientLocations";
  private static final String ACTION_GET_CONTACTS_FOR_LOCATION = "getContactsForLocation";
  private static final String ACTION_APPROVE_EXEMPTIONS = "approveExemptions";
  private static final String ACTION_SEND_EXEMPTION_APPROVAL_EMAIL = "sendExemptionApprovalEmail";
  private static final String ACTION_SEND_EXEMPTION_APPROVAL_EMAILS = "sendExemptionApprovalEmails";
  private static final String LEGACY_ACTION_APPROVE_EXEMPTION = "approveExemption";
  private static final String LEGACY_ACTION_CREATE_EXEMPTION = "/createExemption";
  private static final String LEGACY_ACTION_SAVE_EXEMPTION = "saveExemption";
  private static final String LEGACY_ACTION_APPLICATION_DETAILS = "/applicationDetails";
  private static final String LEGACY_ACTION_PERMIT_DETAILS = "/permitDetails";
  private final ObjectProvider<ExemptionDetailsRpcService> serviceProvider;
  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisPrincipalService principalService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private ProvincialAuthorizationService provincialAuthorizationService;
  private ApplicationEditLockService editLockService;
  private ExemptionService exemptionService;

  public ExemptionDetailsRpcController(
      ObjectProvider<ExemptionDetailsRpcService> serviceProvider,
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisPrincipalService principalService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.principalService = principalService;
    this.operationCoordinator = operationCoordinator;
  }

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @Autowired
  void setApplicationEditLockService(ApplicationEditLockService editLockService) {
    this.editLockService = editLockService;
  }

  @Autowired(required = false)
  void setExemptionService(ExemptionService exemptionService) {
    this.exemptionService = exemptionService;
  }

  @GetMapping("/rpc/exemption-details/create-preview")
  public ResponseEntity<CreateExemptionPreviewResponseDto> previewCreateExemption(
      @RequestParam(name = "applicationNumbers", required = false)
          List<Long> applicationNumbers,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Exemption details RPC service unavailable - returning no content for create preview");
      return ResponseEntity.noContent().build();
    }

    List<Long> normalizedApplicationNumbers =
        applicationNumbers == null ? List.of() : applicationNumbers.stream().distinct().toList();
    normalizedApplicationNumbers.forEach(
        applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.CreateExemptionPreview preview =
        service.previewCreateExemption(
            normalizedApplicationNumbers,
            authorizationService.canPerformAction(roles, "viewFederalApplication"));
    return ResponseEntity.ok(
        new CreateExemptionPreviewResponseDto(
            preview.valid(),
            preview.exemptionTypeCode(),
            preview.exemptionStatusCode(),
            preview.approvedVolume(),
            preview.expiryDate(),
            preview.applicationNumbers(),
            preview.errors()));
  }

  @GetMapping("/rpc/exemption-details/applications")
  public ResponseEntity<ExemptionApplicationsResponseDto> getApplications(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get applications");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber, authentication);

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.ExemptionApplicationsResponse payload =
        service.getApplications(
            exemptionNumber,
            authorizationService.canPerformAction(roles, "viewFederalApplication"),
            applicationNumber ->
                provincialAuthorizationService != null
                    && provincialAuthorizationService.canAccessApplication(
                        authentication, applicationNumber));

    return ResponseEntity.ok(toApplicationsResponse(payload));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_APPLICATIONS)
  public ResponseEntity<ExemptionApplicationsResponseDto> getApplicationsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return getApplications(exemptionNumber, authentication);
  }

  @GetMapping("/rpc/exemption-details/permits")
  public ResponseEntity<List<PermitItemDto>> getPermits(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get permits");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber, authentication);

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    boolean canViewPermitDetails =
        authorizationService.canPerformAction(roles, LEGACY_ACTION_PERMIT_DETAILS);

    List<PermitItemDto> permits =
        service
            .getPermits(
                exemptionNumber,
                permitNumber ->
                    canViewPermitDetails
                        && provincialAuthorizationService != null
                        && provincialAuthorizationService.canAccessPermit(
                            authentication, permitNumber))
            .stream()
            .filter(ExemptionDetailsRpcService.PermitItem::canViewPermit)
            .map(
                row ->
                    new PermitItemDto(
                        row.permitNumber(),
                        row.permitVolume(),
                        row.permitStatus(),
                        row.permitIssueDate(),
                        row.canViewPermit()))
            .toList();
    return ResponseEntity.ok(permits);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_PERMITS)
  public ResponseEntity<List<PermitItemDto>> getPermitsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return getPermits(exemptionNumber, authentication);
  }

  @GetMapping("/rpc/exemption-details/blanket-oic-totals")
  public ResponseEntity<BlanketOicTotalsResponseDto> getBlanketOicTotals(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn(
          "Exemption details RPC service unavailable - returning no content for get blanket OIC totals");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber);

    ExemptionDetailsRpcService.BlanketOicTotalsResponse payload =
        service.getBlanketOicTotals(exemptionNumber);
    return ResponseEntity.ok(
        new BlanketOicTotalsResponseDto(payload.requestedVolume(), payload.completedVolume()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_BLANKET_OIC_TOTALS)
  public ResponseEntity<BlanketOicTotalsResponseDto> getBlanketOicTotalsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return getBlanketOicTotals(exemptionNumber);
  }

  @GetMapping("/rpc/exemption-details/edit-context")
  public ResponseEntity<ExemptionEditContextResponseDto> getEditContext(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for edit context");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber);
    Authentication authentication =
        SecurityContextHolder.getContext().getAuthentication();
    ApplicationEditLockDto lock = null;
    if (canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      lock = acquireExemptionLock(exemptionNumber, authentication);
    }

    ExemptionDetailsRpcService.ExemptionEditContext context =
        service.getEditContext(exemptionNumber);
    return ResponseEntity.ok(
        new ExemptionEditContextResponseDto(
            context.rateOverrideEnabled(),
            context.fixedFeeRate(),
            context.regionNumbers(),
            lock != null && lock.locked(),
            lock == null ? null : lock.message()));
  }

  @PostMapping("/rpc/exemption-details/release-lock")
  public ResponseEntity<ReleaseLockResponseDto> releaseLock(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    if (editLockService != null) {
      editLockService.releaseExemption(exemptionNumber, userId(authentication));
    }
    return ResponseEntity.ok(new ReleaseLockResponseDto("ok"));
  }

  @GetMapping("/rpc/exemption-details/document-details")
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetails(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }
    Authentication authentication =
        SecurityContextHolder.getContext().getAuthentication();
    requireExemptionAccess(exemptionNumber, authentication);

    List<DocumentItemDto> response =
        service.getDocumentDetails(exemptionNumber).stream()
            .filter(
                item ->
                    canAccessExemptionDocument(
                        item, exemptionNumber, authentication))
            .map(
                item ->
                    new DocumentItemDto(
                        item.name(),
                        item.description(),
                        item.type(),
                        item.id(),
                        item.source(),
                        item.deletable()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return getDocumentDetails(exemptionNumber);
  }

  @GetMapping("/rpc/exemption-details/document")
  public ResponseEntity<StreamingResponseBody> streamDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get document");
      return ResponseEntity.noContent().build();
    }

    Long parsedFileId = parsePositiveLong(fileId);
    Authentication authentication =
        SecurityContextHolder.getContext().getAuthentication();
    requireExemptionAccess(exemptionNumber, authentication);
    ExemptionDetailsRpcService.DocumentItem document =
        service
            .findDocumentForExemption(parsedFileId, exemptionNumber)
            .filter(
                item ->
                    canAccessExemptionDocument(
                        item, exemptionNumber, authentication))
            .orElseThrow(
                () ->
                    new AccessDeniedException(
                        "Document does not belong to an accessible source for the supplied exemption."));

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
              StreamingResponseBody body =
                  TemporaryDocumentStreamingBody.stream(content::writeTo);
              return ResponseEntity.ok().headers(headers).body(body);
            })
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @GetMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<StreamingResponseBody> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return streamDocument(fileId, fileName, exemptionNumber);
  }

  @DeleteMapping("/rpc/exemption-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!hasExemptionDocumentDeleteRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - rejecting remove document");
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }

    Long parsedDocumentId = parsePositiveLong(documentId);
    requireExemptionAccess(exemptionNumber, authentication);
    if (!service.documentCanBeRemovedFromExemption(parsedDocumentId, exemptionNumber)) {
      throw new AccessDeniedException(
          "Document is not an exemption-owned attachment for the supplied exemption.");
    }
    if (!canRemoveExemptionDocument(exemptionNumber, roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    List<String> exemptionNumbers =
        normalizedExemptionNumbers(exemptionNumber);
    return operationCoordinator.executeExemptionMutation(
        exemptionNumbers,
        () ->
            linkedApplicationNumbersForMutation(
                service, exemptionNumbers, List.of()),
        () ->
            linkedPermitNumbersForMutation(
                service, exemptionNumbers, List.of()),
        () -> {
          requireExemptionAccess(exemptionNumber, authentication);
          if (!service.documentCanBeRemovedFromExemption(
              parsedDocumentId, exemptionNumber)) {
            throw new AccessDeniedException(
                "Document is not an exemption-owned attachment for the supplied exemption.");
          }
          if (!canRemoveExemptionDocument(exemptionNumber, roles)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
          }
          List<Long> applicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, exemptionNumbers, List.of());
          applicationNumbers.forEach(
              applicationNumber ->
                  requireApplicationAccess(applicationNumber, authentication));
          return withExemptionApplicationEditLocks(
              exemptionNumbers,
              applicationNumbers,
              authentication,
              () -> {
                boolean removed = service.removeDocument(parsedDocumentId);
                return ResponseEntity.ok(
                    new RemoveDocumentResponseDto(
                        Boolean.toString(removed)));
              });
        });
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return removeDocument(documentId, exemptionNumber, authentication);
  }

  @GetMapping("/rpc/exemption-details/check-exemption-number")
  public ResponseEntity<ExemptionNumberValidationResponseDto> checkExemptionNumber(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for check exemption number");
      return ResponseEntity.noContent().build();
    }

    ExemptionDetailsRpcService.ExemptionNumberValidationResult result =
        service.checkExemptionNumber(exemptionNumber);
    return ResponseEntity.ok(
        new ExemptionNumberValidationResponseDto(result.valid(), result.message()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_CHECK_EXEMPTION_NUMBER)
  public ResponseEntity<ExemptionNumberValidationResponseDto> checkExemptionNumberLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return checkExemptionNumber(exemptionNumber);
  }

  @PostMapping("/rpc/exemption-details/application")
  public ResponseEntity<ApplicationExemptionLinkResponseDto> addApplicationToExemption(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!authorizationService.canPerformAction(roles, LEGACY_ACTION_SAVE_EXEMPTION)
        || !hasExemptionApplicationLinkRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for add application to exemption");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber, authentication);
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);

    List<String> exemptionNumbers =
        normalizedExemptionNumbers(exemptionNumber);
    List<Long> additionalApplicationNumbers = List.of(parsedApplicationNumber);
    return operationCoordinator.executeExemptionMutation(
        exemptionNumbers,
        () ->
            linkedApplicationNumbersForMutation(
                service, exemptionNumbers, additionalApplicationNumbers),
        () ->
            linkedPermitNumbersForMutation(
                service, exemptionNumbers, additionalApplicationNumbers),
        () -> {
          requireExemptionAccess(exemptionNumber, authentication);
          List<Long> applicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, exemptionNumbers, additionalApplicationNumbers);
          applicationNumbers.forEach(
              linkedApplicationNumber ->
                  requireApplicationAccess(
                      linkedApplicationNumber, authentication));
          return withExemptionApplicationEditLocks(
              exemptionNumbers,
              applicationNumbers,
              authentication,
              () -> {
                ExemptionDetailsRpcService.ApplicationExemptionLinkResult result =
                    service.addApplicationToExemption(
                        parsedApplicationNumber,
                        exemptionNumber,
                        userId(authentication),
                        authorizationService.canPerformAction(
                            roles, "viewFederalApplication"));
                return ResponseEntity.ok(
                    new ApplicationExemptionLinkResponseDto(
                        result.success(), result.errors()));
              });
        });
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_ADD_APPLICATION_TO_EXEMPTION)
  public ResponseEntity<ApplicationExemptionLinkResponseDto> addApplicationToExemptionLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return addApplicationToExemption(applicationNumber, exemptionNumber, authentication);
  }

  @DeleteMapping("/rpc/exemption-details/application")
  public ResponseEntity<ApplicationExemptionLinkResponseDto> removeApplicationFromExemption(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    if (!authorizationService.canPerformAction(roles, LEGACY_ACTION_SAVE_EXEMPTION)
        || !hasExemptionApplicationLinkRole(roles)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for remove application from exemption");
      return ResponseEntity.noContent().build();
    }
    requireExemptionAccess(exemptionNumber, authentication);
    Long parsedApplicationNumber = parsePositiveLong(applicationNumber);
    requireApplicationAccess(parsedApplicationNumber, authentication);

    List<String> exemptionNumbers =
        normalizedExemptionNumbers(exemptionNumber);
    List<Long> additionalApplicationNumbers = List.of(parsedApplicationNumber);
    return operationCoordinator.executeExemptionMutation(
        exemptionNumbers,
        () ->
            linkedApplicationNumbersForMutation(
                service, exemptionNumbers, additionalApplicationNumbers),
        () ->
            linkedPermitNumbersForMutation(
                service, exemptionNumbers, additionalApplicationNumbers),
        () -> {
          requireExemptionAccess(exemptionNumber, authentication);
          List<Long> applicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, exemptionNumbers, additionalApplicationNumbers);
          applicationNumbers.forEach(
              linkedApplicationNumber ->
                  requireApplicationAccess(
                      linkedApplicationNumber, authentication));
          return withExemptionApplicationEditLocks(
              exemptionNumbers,
              applicationNumbers,
              authentication,
              () -> {
                ExemptionDetailsRpcService.ApplicationExemptionLinkResult result =
                    service.removeApplicationFromExemption(
                        parsedApplicationNumber,
                        exemptionNumber,
                        userId(authentication));
                return ResponseEntity.ok(
                    new ApplicationExemptionLinkResponseDto(
                        result.success(), result.errors()));
              });
        });
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_APPLICATION_FROM_EXEMPTION)
  public ResponseEntity<ApplicationExemptionLinkResponseDto> removeApplicationFromExemptionLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      Authentication authentication) {
    return removeApplicationFromExemption(applicationNumber, exemptionNumber, authentication);
  }

  @PostMapping("/rpc/exemption-details/exemption")
  public ResponseEntity<ExemptionPersistenceResponseDto> addExemption(
      HttpServletRequest request,
      Authentication authentication) {
    return addExemption(fromRequest(request), authentication);
  }

  private ResponseEntity<ExemptionPersistenceResponseDto> addExemption(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for add exemption");
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.CreateExemptionRequest createRequest =
        toCreateExemptionRequest(parameters, roles);
    requireCreateExemptionAccess(createRequest, authentication);
    requireExemptionRegionAccess(createRequest.regionNumbers(), authentication);
    List<String> exemptionNumbers =
        normalizedExemptionNumbers(createRequest.exemptionNumber());
    List<Long> applicationNumbers =
        normalizedApplicationNumbers(createRequest.applicationNumbers());
    Supplier<ResponseEntity<ExemptionPersistenceResponseDto>> mutation =
        () -> {
          requireCreateExemptionAccess(createRequest, authentication);
          requireExemptionRegionAccess(createRequest.regionNumbers(), authentication);
          List<Long> lockedApplicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, exemptionNumbers, applicationNumbers);
          lockedApplicationNumbers.forEach(
              applicationNumber ->
                  requireApplicationAccess(applicationNumber, authentication));
          List<Long> applicationLocksToRelease =
              acquireApplicationLocksForMutation(
                  lockedApplicationNumbers, authentication);
          try {
            ExemptionDetailsRpcService.CreateExemptionResult result =
                service.addExemption(
                    createRequest,
                    userId(authentication),
                    authorizationService.canPerformAction(
                        roles, LEGACY_ACTION_APPROVE_EXEMPTION));
            return toExemptionPersistenceResponse(result);
          } finally {
            releaseApplicationLocks(applicationLocksToRelease, authentication);
          }
        };
    return exemptionNumbers.isEmpty() && applicationNumbers.isEmpty()
        ? mutation.get()
        : operationCoordinator.executeExemptionMutation(
            exemptionNumbers,
            () ->
                linkedApplicationNumbersForMutation(
                    service, exemptionNumbers, applicationNumbers),
            () ->
                linkedPermitNumbersForMutation(
                    service, exemptionNumbers, applicationNumbers),
            mutation);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_ADD_EXEMPTION)
  public ResponseEntity<ExemptionPersistenceResponseDto> addExemptionLegacy(
      HttpServletRequest request,
      Authentication authentication) {
    return addExemption(fromRequest(request), authentication);
  }

  public ResponseEntity<ExemptionPersistenceResponseDto> addExemptionLegacy(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return addExemption(parameters, authentication);
  }

  @PostMapping("/rpc/exemption-details/exemption/update")
  public ResponseEntity<ExemptionPersistenceResponseDto> updateExemption(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for update exemption");
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.UpdateExemptionRequest updateRequest =
        toUpdateExemptionRequest(parameters);
    String existingExemptionNumber =
        firstTrimmedNonBlank(
            updateRequest.previousExemptionNumber(), updateRequest.exemptionNumber());
    requireExemptionAccess(existingExemptionNumber, authentication);
    requireBlanketOicRoleScope(updateRequest.exemptionTypeCode(), authentication);
    requireExemptionRegionAccess(updateRequest.regionNumbers(), authentication);
    List<String> exemptionNumbers =
        normalizedExemptionNumbers(
            existingExemptionNumber, updateRequest.exemptionNumber());
    return operationCoordinator.executeExemptionMutation(
        exemptionNumbers,
        () ->
            linkedApplicationNumbersForMutation(
                service, exemptionNumbers, List.of()),
        () ->
            linkedPermitNumbersForMutation(
                service, exemptionNumbers, List.of()),
        () -> {
          requireExemptionAccess(existingExemptionNumber, authentication);
          requireBlanketOicRoleScope(
              updateRequest.exemptionTypeCode(), authentication);
          requireExemptionRegionAccess(updateRequest.regionNumbers(), authentication);
          List<Long> applicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, exemptionNumbers, List.of());
          applicationNumbers.forEach(
              applicationNumber ->
                  requireApplicationAccess(applicationNumber, authentication));
          List<String> exemptionLocksToRelease =
              acquireExemptionLocksForMutation(
                  exemptionNumbers, authentication, false);
          List<Long> applicationLocksToRelease = List.of();
          try {
            applicationLocksToRelease =
                acquireApplicationLocksForMutation(
                    applicationNumbers, authentication);
            ExemptionDetailsRpcService.CreateExemptionResult result =
                service.updateExemption(
                    updateRequest,
                    userId(authentication),
                    authorizationService.canPerformAction(
                        roles, "approveExemption"));
            return toExemptionPersistenceResponse(result);
          } finally {
            releaseApplicationLocks(
                applicationLocksToRelease, authentication);
            releaseExemptionLocks(exemptionLocksToRelease, authentication);
          }
        });
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_UPDATE_EXEMPTION)
  public ResponseEntity<ExemptionPersistenceResponseDto> updateExemptionLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    return updateExemption(parameters, authentication);
  }

  @PostMapping("/rpc/exemption-details/approve-exemptions")
  public ResponseEntity<ExemptionApprovalResponseDto> approveExemptions(
      @RequestParam(name = "exemptionNumbers", required = false) String exemptionNumbers,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPROVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for approve exemptions");
      return ResponseEntity.noContent().build();
    }
    List<String> normalizedExemptions =
        normalizedExemptionNumbers(exemptionNumbers);
    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    Supplier<ResponseEntity<ExemptionApprovalResponseDto>> mutation =
        () -> {
          normalizedExemptions.forEach(
              exemptionNumber ->
                  requireExemptionAccess(exemptionNumber, authentication));
          List<Long> applicationNumbers =
              linkedApplicationNumbersForMutation(
                  service, normalizedExemptions, List.of());
          applicationNumbers.forEach(
              applicationNumber ->
                  requireApplicationAccess(applicationNumber, authentication));
          return withExemptionApplicationEditLocks(
              normalizedExemptions,
              applicationNumbers,
              authentication,
              () -> {
                ExemptionDetailsRpcService.ExemptionApprovalResult result =
                    service.approveExemptions(
                        exemptionNumbers,
                        userId(authentication),
                        authorizationService.canPerformAction(
                            roles, "approveExemption"));
                return ResponseEntity.ok(toApprovalResponse(result));
              });
        };
    return normalizedExemptions.isEmpty()
        ? mutation.get()
        : operationCoordinator.executeExemptionMutation(
            normalizedExemptions,
            () ->
                linkedApplicationNumbersForMutation(
                    service, normalizedExemptions, List.of()),
            () ->
                linkedPermitNumbersForMutation(
                    service, normalizedExemptions, List.of()),
            mutation);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_APPROVE_EXEMPTIONS)
  public ResponseEntity<ExemptionApprovalResponseDto> approveExemptionsLegacy(
      @RequestParam(name = "exemptionNumbers", required = false) String exemptionNumbers,
      Authentication authentication) {
    return approveExemptions(exemptionNumbers, authentication);
  }

  @PostMapping("/rpc/exemption-details/approval-email")
  public ResponseEntity<ExemptionApprovalEmailResponseDto> sendExemptionApprovalEmail(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "legacyExemptionNumber", required = false) String legacyExemptionNumber,
      @RequestParam(name = "toEmailAddress", required = false) String toEmailAddress,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPROVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for approval email");
      return ResponseEntity.noContent().build();
    }

    requireExemptionAccess(
        firstTrimmedNonBlank(exemptionNumber, legacyExemptionNumber), authentication);

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult result =
        service.sendExemptionApprovalEmail(
            firstTrimmedNonBlank(exemptionNumber, legacyExemptionNumber), toEmailAddress);
    return ResponseEntity.ok(new ExemptionApprovalEmailResponseDto(result.success(), result.message()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_SEND_EXEMPTION_APPROVAL_EMAIL)
  public ResponseEntity<ExemptionApprovalEmailResponseDto> sendExemptionApprovalEmailLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber,
      @RequestParam(name = "legacyExemptionNumber", required = false) String legacyExemptionNumber,
      @RequestParam(name = "toEmailAddress", required = false) String toEmailAddress,
      Authentication authentication) {
    return sendExemptionApprovalEmail(exemptionNumber, legacyExemptionNumber, toEmailAddress, authentication);
  }

  @PostMapping("/rpc/exemption-details/approval-emails")
  public ResponseEntity<ExemptionApprovalEmailResponseDto> sendExemptionApprovalEmails(
      @RequestParam(name = "sendGrid", required = false) String sendGrid,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_APPROVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for approval emails");
      return ResponseEntity.noContent().build();
    }
    if (sendGrid != null) {
      for (String entry : sendGrid.split(",")) {
        String[] pair = entry.split(":", 2);
        if (pair.length == 2 && !pair[0].isBlank()) {
          requireExemptionAccess(pair[0].trim(), authentication);
        }
      }
    }

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult result =
        service.sendExemptionApprovalEmails(sendGrid);
    return ResponseEntity.ok(new ExemptionApprovalEmailResponseDto(result.success(), result.message()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_SEND_EXEMPTION_APPROVAL_EMAILS)
  public ResponseEntity<ExemptionApprovalEmailResponseDto> sendExemptionApprovalEmailsLegacy(
      @RequestParam(name = "sendGrid", required = false) String sendGrid,
      Authentication authentication) {
    return sendExemptionApprovalEmails(sendGrid, authentication);
  }

  @GetMapping("/rpc/exemption-details/client-data")
  public ResponseEntity<ExemptionClientDataResponseDto> getClientData(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for exemption client data");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    return clientLookupService
        .getClientData(clientNumber, clientLocationCode)
        .map(
            data ->
                ResponseEntity.ok(
                    new ExemptionClientDataResponseDto(
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
                        null)))
        .orElseGet(
            () ->
                ResponseEntity.ok(
                    new ExemptionClientDataResponseDto(
                        null, null, null, null, null, null, null, null, null, null, "true")));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_CLIENT_DATA)
  public ResponseEntity<ExemptionClientDataResponseDto> getClientDataLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    return getClientData(clientNumber, clientLocationCode);
  }

  @GetMapping("/rpc/exemption-details/client-locations")
  public ResponseEntity<List<ExemptionClientLocationResponseDto>> getClientLocations(
      @RequestParam(name = "clientNumber", required = false) String clientNumber) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for exemption client locations");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    List<ExemptionClientLocationResponseDto> response =
        clientLookupService.getClientLocations(clientNumber).stream()
            .map(
                location ->
                    new ExemptionClientLocationResponseDto(
                        location.locationName(), location.locationCode(), location.selected()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_CLIENT_LOCATIONS)
  public ResponseEntity<List<ExemptionClientLocationResponseDto>> getClientLocationsLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber) {
    return getClientLocations(clientNumber);
  }

  @GetMapping("/rpc/exemption-details/contacts-for-location")
  public ResponseEntity<List<ExemptionClientContactResponseDto>> getContactsForLocation(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    ClientLookupService clientLookupService = clientLookupServiceProvider.getIfAvailable();
    if (clientLookupService == null) {
      LOGGER.warn("Client lookup service unavailable - returning no content for exemption contacts");
      return ResponseEntity.noContent().build();
    }
    requireClientAccess(clientNumber);

    List<ExemptionClientContactResponseDto> response =
        clientLookupService.getContactsForLocation(clientNumber, clientLocationCode).stream()
            .map(contact -> new ExemptionClientContactResponseDto(contact.contactName(), contact.contactId()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_CONTACTS_FOR_LOCATION)
  public ResponseEntity<List<ExemptionClientContactResponseDto>> getContactsForLocationLegacy(
      @RequestParam(name = "clientNumber", required = false) String clientNumber,
      @RequestParam(name = "clientLocationCode", required = false) String clientLocationCode) {
    return getContactsForLocation(clientNumber, clientLocationCode);
  }

  private ExemptionApplicationsResponseDto toApplicationsResponse(
      ExemptionDetailsRpcService.ExemptionApplicationsResponse response) {
    List<ApplicationItemDto> applications =
        response.applications().stream()
            .map(
                row ->
                    new ApplicationItemDto(
                        row.applicationNumber(),
                        row.requestedVolume(),
                        row.scaleVolume(),
                        row.locked(),
                        row.jurisdiction()))
            .toList();

    return new ExemptionApplicationsResponseDto(
        applications, response.containsUnmanu(), response.ownerNumber());
  }

  private ExemptionApprovalResponseDto toApprovalResponse(
      ExemptionDetailsRpcService.ExemptionApprovalResult result) {
    return new ExemptionApprovalResponseDto(
        result.success(),
        result.valid(),
        result.sendGrid(),
        result.clientEmailAddress(),
        result.errorMessage(),
        result.warnings(),
        result.errors());
  }

  private ResponseEntity<ExemptionPersistenceResponseDto> toExemptionPersistenceResponse(
      ExemptionDetailsRpcService.CreateExemptionResult result) {
    return ResponseEntity.ok(
        new ExemptionPersistenceResponseDto(
            result.success(),
            result.message(),
            result.exemptionNumber(),
            result.refreshPage(),
            result.errors(),
            result.warnings()));
  }

  private boolean canPerform(Authentication authentication, String action) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), action);
  }

  private boolean canRemoveExemptionDocument(
      String exemptionNumber, List<String> roles) {
    if (exemptionService == null || exemptionNumber == null || exemptionNumber.isBlank()) {
      return false;
    }
    if (!hasExemptionDocumentDeleteRole(roles)) {
      return false;
    }
    return exemptionService
        .findByExemptionNumber(exemptionNumber.trim())
        .map(detail -> detail.exemptionStatusCode())
        .map(status -> status.trim().toUpperCase(Locale.ROOT))
        .filter(status -> !status.isBlank())
        .map(status -> !EXEMPTION_STATUS_EXPIRED.equals(status))
        .orElse(false);
  }

  private boolean hasExemptionDocumentDeleteRole(List<String> roles) {
    return roles != null
        && roles.stream()
            .filter(role -> role != null)
            .map(role -> role.trim().toUpperCase(Locale.ROOT))
            .anyMatch(EXEMPTION_DOCUMENT_DELETE_ROLES::contains);
  }

  private boolean hasExemptionApplicationLinkRole(List<String> roles) {
    return roles != null
        && roles.stream()
            .filter(Objects::nonNull)
            .map(role -> role.trim().toUpperCase(Locale.ROOT))
            .anyMatch(EXEMPTION_APPLICATION_LINK_ROLES::contains);
  }

  private ExemptionDetailsRpcService.CreateExemptionRequest toCreateExemptionRequest(
      MultiValueMap<String, String> parameters, List<String> roles) {
    return new ExemptionDetailsRpcService.CreateExemptionRequest(
        first(parameters, "exemptionNumber", "legacyExemptionNumber"),
        parseDouble(first(parameters, "approvedVolume")),
        parseDate(first(parameters, "approvalDate", "exemptionApprovalDate")),
        parseDate(first(parameters, "exemptionExpiryDate", "expiryDate")),
        first(parameters, "otherConditions"),
        first(parameters, "exemptionTypeCode", "legacyExemptionType"),
        first(parameters, "exemptionStatusCode"),
        parseDouble(first(parameters, "feeRate")),
        resolveRateOverride(parameters),
        parseApplicationNumbers(parameters),
        authorizationService.canPerformAction(roles, "viewFederalApplication"),
        parseRegions(parameters));
  }

  private ExemptionDetailsRpcService.UpdateExemptionRequest toUpdateExemptionRequest(
      MultiValueMap<String, String> parameters) {
    return new ExemptionDetailsRpcService.UpdateExemptionRequest(
        first(parameters, "exemptionNumber", "legacyExemptionNumber"),
        first(parameters, "legacyExemptionNumber", "previousExemptionNumber"),
        parseDouble(first(parameters, "approvedVolume")),
        parseDate(first(parameters, "approvalDate", "exemptionApprovalDate")),
        parseDate(first(parameters, "exemptionExpiryDate", "expiryDate")),
        first(parameters, "otherConditions"),
        first(parameters, "exemptionTypeCode", "legacyExemptionType"),
        first(parameters, "exemptionStatusCode"),
        parseDouble(first(parameters, "feeRate")),
        resolveRateOverride(parameters),
        parseRegions(parameters));
  }

  private Boolean resolveRateOverride(MultiValueMap<String, String> parameters) {
    if (hasParameter(parameters, "enableRateOverride")) {
      return Boolean.TRUE;
    }
    if (hasParameter(parameters, "feeRate")) {
      return Boolean.FALSE;
    }
    return null;
  }

  private boolean hasParameter(MultiValueMap<String, String> parameters, String name) {
    return parameters != null && parameters.containsKey(name);
  }

  private void requireExemptionAccess(
      String exemptionNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireExemption(authentication, exemptionNumber);
    }
  }

  private void requireExemptionAccess(String exemptionNumber) {
    requireExemptionAccess(
        exemptionNumber, SecurityContextHolder.getContext().getAuthentication());
  }

  private void requireApplicationAccess(
      Long applicationNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireApplication(authentication, applicationNumber);
    }
  }

  private boolean canAccessExemptionDocument(
      ExemptionDetailsRpcService.DocumentItem item,
      String exemptionNumber,
      Authentication authentication) {
    if (item == null || exemptionNumber == null || exemptionNumber.isBlank()) {
      return false;
    }
    if ("application".equals(item.source())
        && item.sourceApplicationNumber() != null
        && item.sourceExemptionNumber() == null) {
      if (!canPerform(authentication, LEGACY_ACTION_APPLICATION_DETAILS)) {
        return false;
      }
      try {
        requireApplicationAccess(item.sourceApplicationNumber(), authentication);
        return true;
      } catch (AccessDeniedException ex) {
        return false;
      }
    }
    return "exemption".equals(item.source())
        && item.sourceExemptionNumber() != null
        && exemptionNumber.trim().equals(item.sourceExemptionNumber().trim())
        && item.sourceApplicationNumber() == null;
  }

  private void requireCreateExemptionAccess(
      ExemptionDetailsRpcService.CreateExemptionRequest request,
      Authentication authentication) {
    if (request == null) {
      throw new AccessDeniedException("Exemption details are required.");
    }
    requireBlanketOicRoleScope(request.exemptionTypeCode(), authentication);
    normalizedApplicationNumbers(request.applicationNumbers())
        .forEach(applicationNumber -> requireApplicationAccess(applicationNumber, authentication));
  }

  private void requireBlanketOicRoleScope(
      String exemptionTypeCode, Authentication authentication) {
    String exemptionType = firstTrimmedNonBlank(exemptionTypeCode);
    if ("B".equalsIgnoreCase(exemptionType)
        && provincialAuthorizationService != null
        && !provincialAuthorizationService.canViewBlanketOic(authentication)) {
      throw new AccessDeniedException("Blanket OIC exemptions are outside the authenticated role scope.");
    }
  }

  private void requireExemptionRegionAccess(
      List<Long> regions, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requireOrgUnits(
          authentication, regions, OrgUnitSurface.EXEMPTION_WRITE);
    }
  }

  private List<Long> acquireApplicationLocksForMutation(
      List<Long> applicationNumbers, Authentication authentication) {
    if (editLockService == null) {
      return List.of();
    }
    String currentUser = userId(authentication);
    List<Long> acquiredForMutation = new ArrayList<>();
    try {
      for (Long applicationNumber : normalizedApplicationNumbers(applicationNumbers)) {
        ApplicationEditLockDto existing =
            editLockService.snapshot(applicationNumber, currentUser, false);
        ApplicationEditLockDto lock =
            editLockService.acquire(applicationNumber, currentUser, currentUser, false);
        if (lock == null || lock.locked()) {
          throw new EditLockConflictException(
              lock == null ? "The application edit lock could not be acquired." : lock.message());
        }
        if (existing == null || !existing.heldByCurrentUser()) {
          acquiredForMutation.add(applicationNumber);
        }
      }
      return List.copyOf(acquiredForMutation);
    } catch (RuntimeException exception) {
      acquiredForMutation.forEach(
          applicationNumber -> editLockService.release(applicationNumber, currentUser));
      throw exception;
    }
  }

  private void releaseApplicationLocks(
      List<Long> applicationNumbers, Authentication authentication) {
    if (editLockService == null || applicationNumbers == null || applicationNumbers.isEmpty()) {
      return;
    }
    String currentUser = userId(authentication);
    applicationNumbers.forEach(
        applicationNumber -> editLockService.release(applicationNumber, currentUser));
  }

  private List<String> acquireExemptionLocksForMutation(
      List<String> exemptionNumbers,
      Authentication authentication,
      boolean requireAccess) {
    List<String> normalizedExemptionNumbers =
        normalizedExemptionNumbers(String.join(",", exemptionNumbers));
    if (requireAccess) {
      normalizedExemptionNumbers.forEach(
          exemptionNumber ->
              requireExemptionAccess(exemptionNumber, authentication));
    }
    if (editLockService == null) {
      return List.of();
    }

    String currentUser = userId(authentication);
    List<String> acquiredForMutation = new ArrayList<>();
    try {
      for (String exemptionNumber : normalizedExemptionNumbers) {
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
        if (previous == null || !previous.heldByCurrentUser()) {
          acquiredForMutation.add(exemptionNumber);
        }
      }
      return List.copyOf(acquiredForMutation);
    } catch (RuntimeException exception) {
      acquiredForMutation.forEach(
          exemptionNumber -> editLockService.releaseExemption(exemptionNumber, currentUser));
      throw exception;
    }
  }

  private void releaseExemptionLocks(
      List<String> exemptionNumbers, Authentication authentication) {
    if (editLockService == null || exemptionNumbers == null || exemptionNumbers.isEmpty()) {
      return;
    }
    String currentUser = userId(authentication);
    exemptionNumbers.forEach(
        exemptionNumber -> editLockService.releaseExemption(exemptionNumber, currentUser));
  }

  private <T> T withExemptionApplicationEditLocks(
      List<String> exemptionNumbers,
      List<Long> applicationNumbers,
      Authentication authentication,
      Supplier<T> mutation) {
    List<String> exemptionLocksToRelease =
        acquireExemptionLocksForMutation(
            exemptionNumbers, authentication, false);
    List<Long> applicationLocksToRelease = List.of();
    try {
      applicationLocksToRelease =
          acquireApplicationLocksForMutation(
              applicationNumbers, authentication);
      return mutation.get();
    } finally {
      releaseApplicationLocks(applicationLocksToRelease, authentication);
      releaseExemptionLocks(exemptionLocksToRelease, authentication);
    }
  }

  private List<String> normalizedExemptionNumbers(String exemptionNumbers) {
    if (exemptionNumbers == null || exemptionNumbers.isBlank()) {
      return List.of();
    }
    return Arrays.stream(exemptionNumbers.split(","))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .map(value -> value.toUpperCase(Locale.ROOT))
        .distinct()
        .sorted()
        .toList();
  }

  private List<String> normalizedExemptionNumbers(String... exemptionNumbers) {
    if (exemptionNumbers == null || exemptionNumbers.length == 0) {
      return List.of();
    }
    return Arrays.stream(exemptionNumbers)
        .filter(Objects::nonNull)
        .flatMap(value -> Arrays.stream(value.split(",")))
        .map(String::trim)
        .filter(value -> !value.isEmpty())
        .map(value -> value.toUpperCase(Locale.ROOT))
        .distinct()
        .sorted()
        .toList();
  }

  private List<Long> normalizedApplicationNumbers(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return List.of();
    }
    return applicationNumbers.stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .sorted()
        .toList();
  }

  private List<Long> linkedApplicationNumbersForMutation(
      ExemptionDetailsRpcService service,
      List<String> exemptionNumbers,
      List<Long> additionalApplicationNumbers) {
    SortedSet<Long> applicationNumbers =
        new TreeSet<>(
            normalizedApplicationNumbers(additionalApplicationNumbers));
    for (String exemptionNumber : exemptionNumbers) {
      List<Long> linkedApplications =
          service.getApplicationNumbersForMutation(exemptionNumber);
      if (linkedApplications == null) {
        throw new DataRetrievalFailureException(
            "Exemption applications could not be loaded for mutation.");
      }
      for (Long applicationNumber : linkedApplications) {
        if (applicationNumber == null || applicationNumber < 1) {
          throw new DataRetrievalFailureException(
              "An exemption application relationship returned an invalid application number.");
        }
        applicationNumbers.add(applicationNumber);
      }
    }
    return List.copyOf(applicationNumbers);
  }

  private List<Long> linkedPermitNumbersForMutation(
      ExemptionDetailsRpcService service,
      List<String> exemptionNumbers,
      List<Long> additionalApplicationNumbers) {
    List<Long> applicationNumbers =
        linkedApplicationNumbersForMutation(
            service, exemptionNumbers, additionalApplicationNumbers);
    SortedSet<Long> permitNumbers = new TreeSet<>();
    for (String exemptionNumber : exemptionNumbers) {
      List<Long> directPermits =
          service.getPermitNumbersForMutation(exemptionNumber);
      if (directPermits == null) {
        throw new DataRetrievalFailureException(
            "Exemption permit relationships could not be loaded for mutation.");
      }
      for (Long permitNumber : directPermits) {
        if (permitNumber == null || permitNumber < 1) {
          throw new DataRetrievalFailureException(
              "An exemption permit relationship returned an invalid permit number.");
        }
        permitNumbers.add(permitNumber);
      }
    }
    if (applicationNumbers.isEmpty()) {
      return List.copyOf(permitNumbers);
    }
    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    if (applicationDetailsService == null) {
      throw new DataRetrievalFailureException(
          "Application permit relationships are unavailable for exemption mutation.");
    }
    for (Long applicationNumber : applicationNumbers) {
      List<Long> linkedPermits =
          applicationDetailsService.getPermitNumbersForApplicationMutation(
              applicationNumber);
      if (linkedPermits == null) {
        throw new DataRetrievalFailureException(
            "Application permit relationships could not be loaded for exemption mutation.");
      }
      for (Long permitNumber : linkedPermits) {
        if (permitNumber == null || permitNumber < 1) {
          throw new DataRetrievalFailureException(
              "An application permit relationship returned an invalid permit number.");
        }
        permitNumbers.add(permitNumber);
      }
    }
    return List.copyOf(permitNumbers);
  }

  private ApplicationEditLockDto acquireExemptionLock(
      String exemptionNumber, Authentication authentication) {
    if (editLockService == null) {
      return null;
    }
    String currentUser = userId(authentication);
    return editLockService.acquireExemption(
        exemptionNumber, currentUser, currentUser, false);
  }

  private void requireClientAccess(String clientNumber) {
    if (provincialAuthorizationService != null
        && !provincialAuthorizationService.canCreateForClient(
            SecurityContextHolder.getContext().getAuthentication(), clientNumber, null)) {
      throw new AccessDeniedException("Client is outside the authenticated client scope.");
    }
  }

  private String userId(Authentication authentication) {
    return principalService.resolvePrincipalName(authentication);
  }

  private List<Long> parseRegions(MultiValueMap<String, String> parameters) {
    return parsePositiveLongs(parameters, "region", "regions", "orgUnitNumber");
  }

  private List<Long> parseApplicationNumbers(MultiValueMap<String, String> parameters) {
    if (parameters == null) {
      return List.of();
    }
    List<Long> applicationNumbers = new ArrayList<>();
    for (String name : List.of("applicationNumber", "applications", "applicationNumbers")) {
      for (String rawValue : parameters.getOrDefault(name, List.of())) {
        if (rawValue == null) {
          continue;
        }
        for (String token : rawValue.split(",", -1)) {
          String normalized = token.trim();
          if (normalized.isEmpty()) {
            continue;
          }
          Long applicationNumber = parsePositiveLong(normalized);
          if (applicationNumber == null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Application numbers must be positive whole numbers.");
          }
          if (!applicationNumbers.contains(applicationNumber)) {
            applicationNumbers.add(applicationNumber);
          }
        }
      }
    }
    return List.copyOf(applicationNumbers);
  }

  public record ExemptionApplicationsResponseDto(
      List<ApplicationItemDto> applications, boolean containsUnmanu, String ownerNumber) {}

  public record ApplicationItemDto(
      long applicationNumber,
      String requestedVolume,
      String scaleVolume,
      boolean locked,
      String jurisdiction) {}

  public record PermitItemDto(
      long permitNumber,
      String permitVolume,
      String permitStatus,
      String permitIssueDate,
      boolean canViewPermit) {}

  public record BlanketOicTotalsResponseDto(String requestedVolume, String completedVolume) {}

  public record ExemptionEditContextResponseDto(
      boolean rateOverrideEnabled,
      Double fixedFeeRate,
      List<Long> regionNumbers,
      boolean locked,
      String lockMessage) {}

  public record ReleaseLockResponseDto(String release) {}

  public record DocumentItemDto(
      String name,
      String description,
      String type,
      long id,
      String source,
      boolean deletable) {}

  public record RemoveDocumentResponseDto(String success) {}

  public record ExemptionNumberValidationResponseDto(boolean isValid, String message) {}

  public record CreateExemptionPreviewResponseDto(
      boolean valid,
      String exemptionTypeCode,
      String exemptionStatusCode,
      String approvedVolume,
      java.time.LocalDate expiryDate,
      List<Long> applicationNumbers,
      List<String> errors) {}

  public record ApplicationExemptionLinkResponseDto(boolean success, List<String> errors) {}

  public record ExemptionPersistenceResponseDto(
      boolean success,
      String message,
      String exemptionNumber,
      boolean refreshPage,
      List<String> errors,
      List<String> warnings) {}

  public record ExemptionApprovalResponseDto(
      boolean success,
      boolean valid,
      List<List<String>> sendGrid,
      String clientEmailAddress,
      String errorMessage,
      List<String> warnings,
      List<String> errors) {}

  public record ExemptionApprovalEmailResponseDto(boolean success, String message) {}

  public record ExemptionClientDataResponseDto(
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

  public record ExemptionClientLocationResponseDto(
      String locationName, String locationCode, boolean selected) {}

  public record ExemptionClientContactResponseDto(String contactName, String contactId) {}
}

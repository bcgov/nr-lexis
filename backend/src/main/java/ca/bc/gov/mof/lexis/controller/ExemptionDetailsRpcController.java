package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.first;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDate;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parseDouble;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.parsePositiveLong;
import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.sanitizeFileName;

import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class ExemptionDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionDetailsRpcController.class);

  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";

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
  private static final String LEGACY_ACTION_SAVE_EXEMPTION = "saveExemption";
  private final ObjectProvider<ExemptionDetailsRpcService> serviceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisPrincipalService principalService;

  public ExemptionDetailsRpcController(
      ObjectProvider<ExemptionDetailsRpcService> serviceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisPrincipalService principalService) {
    this.serviceProvider = serviceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.principalService = principalService;
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

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.ExemptionApplicationsResponse payload =
        service.getApplications(
            exemptionNumber,
            authorizationService.canPerformAction(roles, "viewFederalApplication"),
            authorizationService.canPerformAction(roles, "viewOICApplication"));

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

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    boolean industryUser =
        roles.stream().anyMatch(role -> sessionService.getConfiguredIndustryRoles().contains(role));
    boolean privilegedUser =
        roles.contains(ROLE_READ_ONLY) || roles.contains(ROLE_APPLICATION_APPROVER);
    boolean ministryUser = !industryUser;
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    List<PermitItemDto> permits =
        service
            .getPermits(exemptionNumber, ministryUser, privilegedUser, forestClientNumber)
            .stream()
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

  @GetMapping("/rpc/exemption-details/document-details")
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetails(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    List<DocumentItemDto> response =
        service.getDocumentDetails(exemptionNumber).stream()
            .map(
                item ->
                    new DocumentItemDto(item.name(), item.description(), item.type(), item.id()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentItemDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "exemptionNumber", required = false) String exemptionNumber) {
    return getDocumentDetails(exemptionNumber);
  }

  @GetMapping("/rpc/exemption-details/document")
  public ResponseEntity<byte[]> getDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for get document");
      return ResponseEntity.noContent().build();
    }

    return service
        .getDocument(parsePositiveLong(fileId))
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
              return ResponseEntity.ok().headers(headers).body(content.bytes());
            })
        .orElseGet(() -> ResponseEntity.noContent().build());
  }

  @GetMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<byte[]> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    return getDocument(fileId, fileName);
  }

  @DeleteMapping("/rpc/exemption-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for remove document");
      return ResponseEntity.noContent().build();
    }

    boolean removed = service.removeDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    return removeDocument(documentId, authentication);
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
    if (!canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for add application to exemption");
      return ResponseEntity.noContent().build();
    }

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.ApplicationExemptionLinkResult result =
        service.addApplicationToExemption(
            parsePositiveLong(applicationNumber),
            exemptionNumber,
            userId(authentication),
            authorizationService.canPerformAction(roles, "viewFederalApplication"),
            authorizationService.canPerformAction(roles, "viewOICApplication"));
    return ResponseEntity.ok(new ApplicationExemptionLinkResponseDto(result.success(), result.errors()));
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
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_SAVE_EXEMPTION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ExemptionDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Exemption details RPC service unavailable - returning no content for remove application from exemption");
      return ResponseEntity.noContent().build();
    }

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult result =
        service.removeApplicationFromExemption(
            parsePositiveLong(applicationNumber),
            userId(authentication));
    return ResponseEntity.ok(new ApplicationExemptionLinkResponseDto(result.success(), result.errors()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_APPLICATION_FROM_EXEMPTION)
  public ResponseEntity<ApplicationExemptionLinkResponseDto> removeApplicationFromExemptionLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      Authentication authentication) {
    return removeApplicationFromExemption(applicationNumber, authentication);
  }

  @PostMapping("/rpc/exemption-details/exemption")
  public ResponseEntity<ExemptionPersistenceResponseDto> addExemption(
      @RequestParam MultiValueMap<String, String> parameters,
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
    ExemptionDetailsRpcService.CreateExemptionResult result =
        service.addExemption(
            toCreateExemptionRequest(parameters, roles),
            userId(authentication));
    return ResponseEntity.ok(
        new ExemptionPersistenceResponseDto(
            result.success(),
            result.message(),
            result.exemptionNumber(),
            result.refreshPage(),
            result.errors(),
            result.warnings()));
  }

  @PostMapping(value = "/exemptionDetailsRPC", params = "actionMapping=" + ACTION_ADD_EXEMPTION)
  public ResponseEntity<ExemptionPersistenceResponseDto> addExemptionLegacy(
      @RequestParam MultiValueMap<String, String> parameters,
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
    ExemptionDetailsRpcService.CreateExemptionResult result =
        service.updateExemption(
            toUpdateExemptionRequest(parameters),
            userId(authentication),
            authorizationService.canPerformAction(roles, "approveExemption"));
    return ResponseEntity.ok(
        new ExemptionPersistenceResponseDto(
            result.success(),
            result.message(),
            result.exemptionNumber(),
            result.refreshPage(),
            result.errors(),
            result.warnings()));
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

    List<String> roles = sessionService.parseRolesFromPrincipal(authentication);
    ExemptionDetailsRpcService.ExemptionApprovalResult result =
        service.approveExemptions(
            exemptionNumbers,
            userId(authentication),
            authorizationService.canPerformAction(roles, "approveExemption"));
    return ResponseEntity.ok(toApprovalResponse(result));
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

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult result =
        service.sendExemptionApprovalEmail(
            firstNonBlank(exemptionNumber, legacyExemptionNumber), toEmailAddress);
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

  private boolean canPerform(Authentication authentication, String action) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), action);
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
        authorizationService.canPerformAction(roles, "viewOICApplication"),
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

  private String firstNonBlank(String... values) {
    if (values == null) {
      return null;
    }
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  private boolean hasParameter(MultiValueMap<String, String> parameters, String name) {
    return parameters != null && parameters.containsKey(name);
  }

  private String userId(Authentication authentication) {
    return principalService.resolvePrincipalName(authentication);
  }

  private List<Long> parseRegions(MultiValueMap<String, String> parameters) {
    if (parameters == null) {
      return List.of();
    }
    List<String> rawValues = new ArrayList<>();
    rawValues.addAll(parameters.getOrDefault("region", List.of()));
    rawValues.addAll(parameters.getOrDefault("regions", List.of()));
    rawValues.addAll(parameters.getOrDefault("orgUnitNumber", List.of()));

    return rawValues.stream()
        .flatMap(value -> List.of(value.split(",")).stream())
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .map(RequestParameterUtils::parsePositiveLong)
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
  }

  private List<Long> parseApplicationNumbers(MultiValueMap<String, String> parameters) {
    if (parameters == null) {
      return List.of();
    }
    List<String> rawValues = new ArrayList<>();
    rawValues.addAll(parameters.getOrDefault("applicationNumber", List.of()));
    rawValues.addAll(parameters.getOrDefault("applications", List.of()));
    rawValues.addAll(parameters.getOrDefault("applicationNumbers", List.of()));

    return rawValues.stream()
        .flatMap(value -> List.of(value.split(",")).stream())
        .map(String::trim)
        .filter(value -> !value.isBlank())
        .map(RequestParameterUtils::parsePositiveLong)
        .filter(value -> value != null && value > 0)
        .distinct()
        .toList();
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

  public record DocumentItemDto(String name, String description, String type, long id) {}

  public record RemoveDocumentResponseDto(String success) {}

  public record ExemptionNumberValidationResponseDto(boolean isValid, String message) {}

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

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
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
public class ApplicationDetailsRpcController {

  private static final Logger LOGGER = LoggerFactory.getLogger(ApplicationDetailsRpcController.class);
  private static final String ACTION_GET_DOCUMENT_DETAILS = "getDocumentDetails";
  private static final String ACTION_GET_DOCUMENT = "getDocument";
  private static final String ACTION_REMOVE_DOCUMENT = "removeDocument";
  private static final String ACTION_GET_REMARK = "getRemark";
  private static final String ACTION_PERSIST_REMARK = "persistRemark";
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
  private static final String LEGACY_ACTION_FILE_APPLICATION_UPLOAD = "/fileApplicationUpload";
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

  private final ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  private final ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public ApplicationDetailsRpcController(
      ObjectProvider<ApplicationDetailsRpcService> serviceProvider,
      ObjectProvider<ClientLookupService> clientLookupServiceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.serviceProvider = serviceProvider;
    this.clientLookupServiceProvider = clientLookupServiceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping("/rpc/application-details/document-details")
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetails(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for document details");
      return ResponseEntity.noContent().build();
    }

    List<DocumentDetailsResponseDto> response =
        service.getDocumentDetails(parsePositiveLong(applicationNumber)).stream()
            .map(
                item ->
                    new DocumentDetailsResponseDto(
                        item.name(), item.description(), item.type(), item.id()))
            .toList();
    return ResponseEntity.ok(response);
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT_DETAILS)
  public ResponseEntity<List<DocumentDetailsResponseDto>> getDocumentDetailsLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return getDocumentDetails(applicationNumber);
  }

  @GetMapping("/rpc/application-details/document")
  public ResponseEntity<byte[]> getDocument(
      @RequestParam(name = "fileId", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get document");
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

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_DOCUMENT)
  public ResponseEntity<byte[]> getDocumentLegacy(
      @RequestParam(name = "fileID", required = false) String fileId,
      @RequestParam(name = "fileName", required = false) String fileName) {
    return getDocument(fileId, fileName);
  }

  @DeleteMapping("/rpc/application-details/document")
  public ResponseEntity<RemoveDocumentResponseDto> removeDocument(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_FILE_APPLICATION_UPLOAD)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for remove document");
      return ResponseEntity.noContent().build();
    }
    boolean removed = service.removeDocument(parsePositiveLong(documentId));
    return ResponseEntity.ok(new RemoveDocumentResponseDto(Boolean.toString(removed)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_REMOVE_DOCUMENT)
  public ResponseEntity<RemoveDocumentResponseDto> removeDocumentLegacy(
      @RequestParam(name = "documentId", required = false) String documentId,
      Authentication authentication) {
    return removeDocument(documentId, authentication);
  }

  @GetMapping("/rpc/application-details/remark")
  public ResponseEntity<GetRemarkResponseDto> getRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for get remark");
      return ResponseEntity.noContent().build();
    }

    return service
        .getRemark(parsePositiveLong(remarkId))
        .map(remark -> ResponseEntity.ok(new GetRemarkResponseDto(remark, false)))
        .orElseGet(() -> ResponseEntity.ok(new GetRemarkResponseDto(null, true)));
  }

  @GetMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_GET_REMARK)
  public ResponseEntity<GetRemarkResponseDto> getRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId) {
    return getRemark(remarkId);
  }

  @PostMapping("/rpc/application-details/remark")
  public ResponseEntity<PersistRemarkResponseDto> persistRemark(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for persist remark");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    return service
        .persistRemark(remarkId, parsePositiveLong(applicationNumber), remarkBody, userId)
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
                    new PersistRemarkResponseDto("error", null, null, null, null, null)));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_PERSIST_REMARK)
  public ResponseEntity<PersistRemarkResponseDto> persistRemarkLegacy(
      @RequestParam(name = "remarkId", required = false) String remarkId,
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber,
      @RequestParam(name = "remarkBody", required = false) String remarkBody,
      Authentication authentication) {
    return persistRemark(remarkId, applicationNumber, remarkBody, authentication);
  }

  @PostMapping("/rpc/application-details/application")
  public ResponseEntity<ApplicationPersistenceResponseDto> addApplication(
      @RequestParam MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for add application");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    ApplicationDetailsRpcService.CreateApplicationResult result =
        service.addApplication(toCreateApplicationRequest(parameters), userId);
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
      @RequestParam MultiValueMap<String, String> parameters,
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

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for update application");
      return ResponseEntity.noContent().build();
    }

    String userId = authentication == null ? null : authentication.getName();
    ApplicationDetailsRpcService.CreateApplicationResult result =
        service.updateApplicationSummary(toApplicationSummaryUpdateRequest(parameters), userId);
    return ResponseEntity.ok(
        new ApplicationPersistenceResponseDto(
            result.valid(),
            result.message(),
            result.applicationNumber(),
            result.errors(),
            result.warnings()));
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
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application summary");
      return ResponseEntity.noContent().build();
    }

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

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot =
        service == null ? null : service.getApplicationClientSnapshot(parsePositiveLong(applicationNumber)).orElse(null);
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

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    ApplicationDetailsRpcService.ApplicationClientSnapshot snapshot =
        service == null ? null : service.getApplicationClientSnapshot(parsePositiveLong(applicationNumber)).orElse(null);
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
        service.getGradeCodes(firstNonBlank(orgUnitNumber, region), firstNonBlank(speciesCode, species))
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
        service.getEndUsesForSpeciesRegion(firstNonBlank(region, orgUnitNumber), parseSpeciesJson(speciesJson))
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
                firstNonBlank(region, orgUnitNumber),
                firstNonBlank(productType, productTypeCode),
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
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for application permits");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.findPermits(parsePositiveLong(applicationNumber)).stream()
            .map(item -> new ApplicationPermitResponseDto(item.permitNumber(), item.permitStatusDescription()))
            .toList());
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_FIND_PERMIT)
  public ResponseEntity<List<ApplicationPermitResponseDto>> findPermitLegacy(
      @RequestParam(name = "applicationNumber", required = false) String applicationNumber) {
    return findPermits(applicationNumber);
  }

  @GetMapping("/rpc/application-details/package-scales")
  public ResponseEntity<List<ApplicationPackageScaleResponseDto>> getScalesForPackage(
      @RequestParam(name = "packageNumber", required = false) String packageNumber) {
    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for package scales");
      return ResponseEntity.noContent().build();
    }

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

    return ResponseEntity.ok(toScaleDetailResponse(service.getScaleById(firstNonBlank(scaleDetailId, scaleId))));
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

    return ResponseEntity.ok(toPackageValidityResponse(service.isPackageValid(packageNumber)));
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

    return ResponseEntity.ok(
        toPackagePersistenceResponse(
            service.addPackage(toPackageMutationRequest(parameters), userId(authentication))));
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

    return ResponseEntity.ok(
        toPackagePersistenceResponse(
            service.updatePackage(toPackageMutationRequest(parameters), userId(authentication))));
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

    return ResponseEntity.ok(
        toScalePersistenceResponse(
            service.addScaleToPackage(toScaleMutationRequest(parameters), userId(authentication))));
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
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for delete scale");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        new DeleteResponseDto(service.deleteScaleById(scaleId, userId(authentication))));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_DELETE_SCALE_BY_ID)
  public ResponseEntity<DeleteResponseDto> deleteScaleByIdLegacy(
      @RequestParam(name = "scaleId", required = false) String scaleId,
      Authentication authentication) {
    return deleteScaleById(scaleId, authentication);
  }

  @DeleteMapping("/rpc/application-details/package")
  public ResponseEntity<DeleteResponseDto> deletePackageById(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      Authentication authentication) {
    if (!canPerform(authentication, LEGACY_ACTION_CREATE_APPLICATION)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    ApplicationDetailsRpcService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Application details RPC service unavailable - returning no content for delete package");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        new DeleteResponseDto(service.deletePackageById(packageNumber, userId(authentication))));
  }

  @PostMapping(value = "/applicationDetailsRPC", params = "actionMapping=" + ACTION_DELETE_PACKAGE_BY_ID)
  public ResponseEntity<DeleteResponseDto> deletePackageByIdLegacy(
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      Authentication authentication) {
    return deletePackageById(packageNumber, authentication);
  }

  private boolean canPerform(Authentication authentication, String action) {
    return authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), action);
  }

  private Long parsePositiveLong(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      long parsed = Long.parseLong(rawValue.trim());
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
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
        first(parameters, "exemptionNumber"),
        first(parameters, "exemptionReason", "exemptionType", "exemptionTypeCode"),
        first(parameters, "ownerApplicantType", "applicantType"),
        parsePositiveLong(first(parameters, "region", "orgUnitNumber")),
        first(parameters, "productType", "productTypeCode"),
        first(parameters, "exportJurisdictionCode", "jurisdictionCode"),
        first(parameters, "ageClass", "growthTypeCode"),
        first(parameters, "agentContactName"),
        first(parameters, "ownerContactName"),
        first(parameters, "oicIndicator"),
        !"false".equalsIgnoreCase(first(parameters, "validation")));
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
        !"false".equalsIgnoreCase(first(parameters, "validation")));
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

  private String first(MultiValueMap<String, String> parameters, String... names) {
    if (parameters == null || names == null) {
      return null;
    }
    for (String name : names) {
      String value = parameters.getFirst(name);
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  private LocalDate parseDate(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    String normalized = rawValue.trim();
    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      try {
        return LocalDate.parse(normalized, LEGACY_DATE_FORMATTER);
      } catch (DateTimeParseException ex) {
        return null;
      }
    }
  }

  private Double parseDouble(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      return Double.parseDouble(rawValue.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private Long parseNonNegativeLong(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    try {
      long parsed = Long.parseLong(rawValue.trim());
      return parsed >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String sanitizeFileName(String rawValue) {
    if (rawValue == null || rawValue.isBlank()) {
      return null;
    }
    String normalized = rawValue.trim();
    int slashIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
    if (slashIndex >= 0 && slashIndex < normalized.length() - 1) {
      normalized = normalized.substring(slashIndex + 1);
    }
    return normalized;
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

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private String normalizeClientNumber(String clientNumber) {
    String normalized = trimToNull(clientNumber);
    if (normalized == null) {
      return null;
    }
    return normalized.length() >= 8 ? normalized : "0".repeat(8 - normalized.length()) + normalized;
  }

  private boolean equalsIgnoreCase(String left, String right) {
    return left != null && right != null && left.equalsIgnoreCase(right);
  }

  private String firstNonBlank(String first, String second) {
    String normalizedFirst = trimToNull(first);
    return normalizedFirst == null ? trimToNull(second) : normalizedFirst;
  }

  private List<String> parseSpeciesJson(String speciesJson) {
    if (speciesJson == null || speciesJson.isBlank()) {
      return List.of();
    }
    try {
      return OBJECT_MAPPER.readValue(speciesJson, STRING_LIST_TYPE).stream()
          .map(this::trimToNull)
          .filter(value -> value != null)
          .toList();
    } catch (JsonProcessingException ex) {
      LOGGER.warn("Unable to parse legacy speciesJSON [{}]", speciesJson);
      return List.of();
    }
  }

  private List<String> parseCsv(String csv) {
    String normalized = trimToNull(csv);
    if (normalized == null) {
      return List.of();
    }
    return List.of(normalized.split(",")).stream()
        .map(this::trimToNull)
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
    return authentication == null ? null : authentication.getName();
  }

  public record DocumentDetailsResponseDto(
      String name, String description, String type, long id) {}

  public record RemoveDocumentResponseDto(String success) {}

  public record GetRemarkResponseDto(String remark, boolean notfound) {}

  public record PersistRemarkResponseDto(
      String status, Instant date, String user, String remark, String title, Long remarkId) {}

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

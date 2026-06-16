package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.controller.RequestParameterUtils.fromRequest;
import static ca.bc.gov.mof.lexis.controller.SearchRequestUtils.parseSearchDate;

import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.service.reserve.IndianReservePermitService;
import ca.bc.gov.mof.lexis.service.reserve.IndianReservePermitService.CreatePermitRequest;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.MultiValueMap;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/indian-reserve/permits")
@Validated
public class IndianReservePermitController {

  private static final Logger LOGGER = LoggerFactory.getLogger(IndianReservePermitController.class);
  private static final String LEGACY_ACTION_SAVE_PERMIT = "savePermit";
  private static final String LEGACY_ACTION_VIEW_OIC_APPLICATION = "viewOICApplication";

  private final ObjectProvider<IndianReservePermitService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public IndianReservePermitController(
      ObjectProvider<IndianReservePermitService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping("/search/options")
  public ResponseEntity<IndianReservePermitSearchOptionsDto> searchOptions() {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for options");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.searchOptions());
  }

  @GetMapping("/search")
  public ResponseEntity<IndianReservePermitSearchResponseDto> search(
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "fromPermitIssueDate", required = false) String issuedFromDate,
      @RequestParam(name = "toPermitIssueDate", required = false) String issuedToDate,
      @RequestParam(name = "fromEstimatedShippingDate", required = false) String shippingFromDate,
      @RequestParam(name = "toEstimatedShippingDate", required = false) String shippingToDate,
      @RequestParam(name = "page", defaultValue = "0") @PositiveOrZero Integer page,
      @RequestParam(name = "size", defaultValue = "25") @Min(1) @Max(200) Integer size) {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for search");
      return ResponseEntity.noContent().build();
    }

    IndianReservePermitSearchCriteria criteria =
        buildCriteria(
            permitNumber,
            packageNumber,
            issuedFromDate,
            issuedToDate,
            shippingFromDate,
            shippingToDate,
            page,
            size);

    return ResponseEntity.ok(service.search(criteria));
  }

  @GetMapping("/search/count")
  public ResponseEntity<SearchCountResponseDto> count(
      @RequestParam(name = "permitNumber", required = false) String permitNumber,
      @RequestParam(name = "packageNumber", required = false) String packageNumber,
      @RequestParam(name = "fromPermitIssueDate", required = false) String issuedFromDate,
      @RequestParam(name = "toPermitIssueDate", required = false) String issuedToDate,
      @RequestParam(name = "fromEstimatedShippingDate", required = false) String shippingFromDate,
      @RequestParam(name = "toEstimatedShippingDate", required = false) String shippingToDate) {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for count");
      return ResponseEntity.noContent().build();
    }

    IndianReservePermitSearchCriteria criteria =
        buildCriteria(
            permitNumber,
            packageNumber,
            issuedFromDate,
            issuedToDate,
            shippingFromDate,
            shippingToDate,
            0,
            1);
    return ResponseEntity.ok(new SearchCountResponseDto(service.count(criteria)));
  }

  @GetMapping("/{permitNumber}")
  public ResponseEntity<IndianReservePermitDetailDto> getByPermitNumber(
      @PathVariable("permitNumber") String permitNumber) {
    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for detail");
      return ResponseEntity.noContent().build();
    }
    return service.findByPermitNumber(permitNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }

  @PostMapping
  public ResponseEntity<PermitMutationRpcResponseDto> addPermit(
      HttpServletRequest request,
      Authentication authentication) {
    return addPermit(fromRequest(request), authentication);
  }

  ResponseEntity<PermitMutationRpcResponseDto> addPermit(
      MultiValueMap<String, String> parameters,
      Authentication authentication) {
    if (!canSaveIndianReservePermit(authentication)) {
      return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
    }

    IndianReservePermitService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Indian reserve permit service unavailable - returning no content for add permit");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(
        service.addPermit(
            toCreatePermitRequest(parameters),
            authentication == null ? null : authentication.getName()));
  }

  private boolean canSaveIndianReservePermit(Authentication authentication) {
    var roles = sessionService.parseRolesFromPrincipal(authentication);
    return authorizationService.canPerformAction(roles, LEGACY_ACTION_SAVE_PERMIT)
        && authorizationService.canPerformAction(roles, LEGACY_ACTION_VIEW_OIC_APPLICATION);
  }

  private IndianReservePermitSearchCriteria buildCriteria(
      String permitNumber,
      String packageNumber,
      String issuedFromDate,
      String issuedToDate,
      String shippingFromDate,
      String shippingToDate,
      Integer page,
      Integer size) {
    return new IndianReservePermitSearchCriteria(
        permitNumber,
        packageNumber,
        parseSearchDate(issuedFromDate),
        parseSearchDate(issuedToDate),
        parseSearchDate(shippingFromDate),
        parseSearchDate(shippingToDate),
        page,
        size);
  }

  private CreatePermitRequest toCreatePermitRequest(MultiValueMap<String, String> parameters) {
    return new CreatePermitRequest(
        firstValue(parameters, "permitNumber"),
        firstValue(parameters, "packageNumber"),
        firstValue(parameters, "clientNumber"),
        firstValue(parameters, "clientLocation"),
        firstValue(parameters, "region", "orgUnitNumber", "orgUnitNo"),
        firstValue(parameters, "applicationDate"),
        firstValue(parameters, "permitIssueDate"),
        firstValue(parameters, "estimatedShippingDate", "estShippingDate"),
        firstValue(parameters, "destinationCountry"),
        firstValue(parameters, "transportTypeCode"),
        firstValue(parameters, "transportName"),
        firstValue(parameters, "portOfExport"),
        firstValue(parameters, "otherPortOfExport"),
        firstValue(parameters, "permitRemarks", "remarks"));
  }

  private String firstValue(MultiValueMap<String, String> parameters, String... names) {
    if (parameters == null || names == null) {
      return null;
    }
    for (String name : names) {
      String value = parameters.getFirst(name);
      if (value != null) {
        return value;
      }
    }
    return null;
  }
}

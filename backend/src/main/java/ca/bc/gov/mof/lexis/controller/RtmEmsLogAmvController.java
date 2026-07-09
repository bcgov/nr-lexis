package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseRetrievalDate;
import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rtm")
@Validated
public class RtmEmsLogAmvController {

  private static final Logger LOGGER = LoggerFactory.getLogger(RtmEmsLogAmvController.class);

  private final ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  private final Clock clock;

  @Autowired
  public RtmEmsLogAmvController(ObjectProvider<RtmEmsLogAmvService> serviceProvider) {
    this(serviceProvider, Clock.systemDefaultZone());
  }

  RtmEmsLogAmvController(ObjectProvider<RtmEmsLogAmvService> serviceProvider, Clock clock) {
    this.serviceProvider = serviceProvider;
    this.clock = clock == null ? Clock.systemDefaultZone() : clock;
  }

  @GetMapping("/emslogamv")
  public ResponseEntity<List<RtmEmsLogAmvRowDto>> find(
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "updateDate", required = false) String updateDate) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for find");
      return ResponseEntity.noContent().build();
    }

    return ResponseEntity.ok(service.find(species, growthIndicator, retrievalDate, updateDate));
  }

  @PostMapping("/emslogamv")
  public ResponseEntity<RtmEmsLogAmvMutationResultDto> save(
      @RequestBody(required = false) RtmEmsLogAmvSaveRequestDto request) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("RTM EMS AMV service unavailable - returning no content for save");
      return ResponseEntity.noContent().build();
    }

    RtmEmsLogAmvSaveRequestDto normalizedRequest =
        request == null
            ? new RtmEmsLogAmvSaveRequestDto(null, null, null, null, null, null, null)
            : request;

    if (isPastEffectiveDate(normalizedRequest)) {
      RtmEmsLogAmvMutationResultDto result =
          new RtmEmsLogAmvMutationResultDto(
              "validation_failed",
              "Past effective dates are read-only.",
              List.of("Past effective dates are read-only."),
              List.of());
      return ResponseEntity.status(responseStatus(result.status())).body(result);
    }

    RtmEmsLogAmvMutationResultDto result = service.save(normalizedRequest);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  private HttpStatus responseStatus(String status) {
    return "accepted".equalsIgnoreCase(status) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private boolean isPastEffectiveDate(RtmEmsLogAmvSaveRequestDto request) {
    LocalDate effectiveDate =
        "update".equals(request.effectiveSaveMode())
            ? parseIsoOrLegacyDate(request.updateDate())
            : parseRetrievalDate(request.retrievalDate());
    return effectiveDate != null && effectiveDate.isBefore(LocalDate.now(clock));
  }
}

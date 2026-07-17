package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvBatchSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessResourceFailureException;
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

  @Autowired
  public RtmEmsLogAmvController(ObjectProvider<RtmEmsLogAmvService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/emslogamv")
  public ResponseEntity<List<RtmEmsLogAmvRowDto>> find(
      @RequestParam(name = "species", required = false) String species,
      @RequestParam(name = "growthIndicator", required = false) String growthIndicator,
      @RequestParam(name = "retrievalDate", required = false) String retrievalDate,
      @RequestParam(name = "updateDate", required = false) String updateDate,
      @RequestParam(name = "latestBeforeDate", required = false) String latestBeforeDate) {
    RtmEmsLogAmvService service = requiredService("find");

    if (latestBeforeDate != null && !latestBeforeDate.isBlank()) {
      return ResponseEntity.ok(service.findLatestBefore(latestBeforeDate));
    }

    return ResponseEntity.ok(service.find(species, growthIndicator, retrievalDate, updateDate));
  }

  @PostMapping("/emslogamv")
  public ResponseEntity<RtmEmsLogAmvMutationResultDto> save(
      @RequestBody(required = false) RtmEmsLogAmvSaveRequestDto request) {
    RtmEmsLogAmvService service = requiredService("save");

    RtmEmsLogAmvSaveRequestDto normalizedRequest =
        request == null
            ? new RtmEmsLogAmvSaveRequestDto(null, null, null, null, null, null, null)
            : request;

    RtmEmsLogAmvMutationResultDto result = service.save(normalizedRequest);
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  @PostMapping("/emslogamv/batch")
  public ResponseEntity<RtmEmsLogAmvMutationResultDto> saveBatch(
      @RequestBody(required = false) RtmEmsLogAmvBatchSaveRequestDto request) {
    RtmEmsLogAmvService service = requiredService("save_batch");
    RtmEmsLogAmvMutationResultDto result =
        service.saveBatch(request == null ? List.of() : request.values());
    return ResponseEntity.status(responseStatus(result.status())).body(result);
  }

  private HttpStatus responseStatus(String status) {
    return "accepted".equalsIgnoreCase(status) ? HttpStatus.OK : HttpStatus.UNPROCESSABLE_ENTITY;
  }

  private RtmEmsLogAmvService requiredService(String operation) {
    RtmEmsLogAmvService service = serviceProvider.getIfAvailable();
    if (service != null) {
      return service;
    }

    LOGGER.warn(
        "event=lexis_rtm_amv operation={} outcome=service_unavailable", operation);
    throw new DataAccessResourceFailureException(
        "The authoritative RTM AMV service is temporarily unavailable.");
  }
}

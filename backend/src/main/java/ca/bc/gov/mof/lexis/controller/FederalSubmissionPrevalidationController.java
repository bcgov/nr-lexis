package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import ca.bc.gov.mof.lexis.service.federal.FederalSubmissionPrevalidationService;
import ca.bc.gov.mof.lexis.service.federal.FederalSubmissionPrevalidationXmlCodec;
import ca.bc.gov.mof.lexis.service.federal.FederalSubmissionPrevalidationXmlCodec.ParsedRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/federal/submissions")
public class FederalSubmissionPrevalidationController {

  private final ObjectProvider<FederalSubmissionPrevalidationService> serviceProvider;

  public FederalSubmissionPrevalidationController(
      ObjectProvider<FederalSubmissionPrevalidationService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @PostMapping(
      value = "/prevalidation",
      consumes = MediaType.APPLICATION_JSON_VALUE,
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<FederalSubmissionPrevalidationDto> prevalidate(
      @RequestBody FederalSubmissionPrevalidationDto submission) {
    if (submission == null) {
      return ResponseEntity.badRequest().build();
    }
    FederalSubmissionPrevalidationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return ResponseEntity.ok(service.validate(submission));
  }

  @PostMapping(
      value = "/prevalidation",
      consumes = {
        MediaType.APPLICATION_XML_VALUE,
        MediaType.TEXT_XML_VALUE,
        "application/soap+xml"
      },
      produces = {
        MediaType.APPLICATION_XML_VALUE,
        MediaType.TEXT_XML_VALUE,
        "application/soap+xml"
      })
  public ResponseEntity<String> prevalidateXml(@RequestBody(required = false) String xml) {
    ParsedRequest request;
    try {
      request = FederalSubmissionPrevalidationXmlCodec.parse(xml);
    } catch (IllegalArgumentException exception) {
      return ResponseEntity.badRequest().build();
    }

    FederalSubmissionPrevalidationService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    FederalSubmissionPrevalidationDto response = service.validate(request.submission());
    return ResponseEntity.ok()
        .contentType(FederalSubmissionPrevalidationXmlCodec.responseMediaType(request))
        .body(FederalSubmissionPrevalidationXmlCodec.renderResponse(request, response));
  }
}

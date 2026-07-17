package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.ShippingReferenceOptionsDto;
import ca.bc.gov.mof.lexis.service.reference.ShippingReferenceService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/shipping-reference-options")
public class ShippingReferenceController {

  private final ObjectProvider<ShippingReferenceService> serviceProvider;

  public ShippingReferenceController(ObjectProvider<ShippingReferenceService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping
  public ResponseEntity<ShippingReferenceOptionsDto> getActiveOptions() {
    ShippingReferenceService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return ResponseEntity.ok(service.findActiveOptionsRequired());
  }
}

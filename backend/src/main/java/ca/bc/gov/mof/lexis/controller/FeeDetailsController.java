package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.fee.FeePermitSummaryDto;
import ca.bc.gov.mof.lexis.service.fee.FeeDetailsService;
import jakarta.validation.constraints.Positive;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/fee-details")
@Validated
public class FeeDetailsController {

  private static final Logger LOGGER = LoggerFactory.getLogger(FeeDetailsController.class);

  private final ObjectProvider<FeeDetailsService> serviceProvider;

  public FeeDetailsController(ObjectProvider<FeeDetailsService> serviceProvider) {
    this.serviceProvider = serviceProvider;
  }

  @GetMapping("/permits/{permitNumber}/summary")
  public ResponseEntity<FeePermitSummaryDto> permitSummary(
      @PathVariable("permitNumber") @Positive Long permitNumber) {
    FeeDetailsService service = serviceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Fee details service unavailable - returning no content for permit summary");
      return ResponseEntity.noContent().build();
    }

    return service.getPermitSummary(permitNumber)
        .map(ResponseEntity::ok)
        .orElseGet(() -> ResponseEntity.notFound().build());
  }
}

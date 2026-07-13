package ca.bc.gov.mof.lexis.service.permit;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Component
@Validated
@ConfigurationProperties(prefix = "lexis.permit-invoice")
public class PermitInvoiceProperties {

  @Min(1)
  @Max(3600)
  private int gbmsTimeoutSeconds = 60;

  public int getGbmsTimeoutSeconds() {
    return gbmsTimeoutSeconds;
  }

  public void setGbmsTimeoutSeconds(int gbmsTimeoutSeconds) {
    this.gbmsTimeoutSeconds = gbmsTimeoutSeconds;
  }
}

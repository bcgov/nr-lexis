package ca.bc.gov.mof.lexis.configuration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lexis.features")
public class LexisFeatureProperties {

  private boolean prodRtmOnly;

  public boolean isProdRtmOnly() {
    return prodRtmOnly;
  }

  public void setProdRtmOnly(boolean prodRtmOnly) {
    this.prodRtmOnly = prodRtmOnly;
  }
}

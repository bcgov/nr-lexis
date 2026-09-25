package ca.bc.gov.mof.lexis;

import ca.bc.gov.mof.lexis.configuration.OracleTlsCompatibility;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class LexisApiApplication {

  public static void main(String[] args) {
    OracleTlsCompatibility.allowRsaKeyExchange();
    SpringApplication.run(LexisApiApplication.class, args);
  }
}

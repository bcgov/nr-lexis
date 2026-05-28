package ca.bc.gov.mof.lexis;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class LexisApiApplication {

  public static void main(String[] args) {
    SpringApplication.run(LexisApiApplication.class, args);
  }
}

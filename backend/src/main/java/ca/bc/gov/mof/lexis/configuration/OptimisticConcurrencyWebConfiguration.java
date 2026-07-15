package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.controller.OptimisticRecordVersionInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@Profile("oracle")
class OptimisticConcurrencyWebConfiguration implements WebMvcConfigurer {

  private final OptimisticRecordVersionInterceptor interceptor;

  OptimisticConcurrencyWebConfiguration(OptimisticRecordVersionInterceptor interceptor) {
    this.interceptor = interceptor;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(interceptor);
  }
}

package ca.bc.gov.mof.lexis.configuration;

import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminRpcService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminScheduleService;
import ca.bc.gov.mof.lexis.service.admin.LexisAdminService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionDetailsRpcService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.reference.ShippingReferenceService;
import ca.bc.gov.mof.lexis.service.report.LexisReportService;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import ca.bc.gov.mof.lexis.service.session.LexisUserPreferenceService;
import ca.bc.gov.mof.lexis.service.summary.LexisSummaryService;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.util.List;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** Prevents a deployed Oracle runtime from starting with partial business-service coverage. */
@Configuration(proxyBeanMethods = false)
@Profile("oracle")
@ConditionalOnProperty(name = "lexis.runtime.require-oracle-profile", havingValue = "true")
public class OracleServiceRequirementConfiguration {

  private static final List<Class<?>> REQUIRED_SERVICE_TYPES =
      List.of(
          LexisApplicationService.class,
          ApplicationDetailsRpcService.class,
          ExemptionService.class,
          ExemptionDetailsRpcService.class,
          PermitService.class,
          PermitDetailsRpcService.class,
          PurchaseOfferService.class,
          ApplicationReviewService.class,
          LexisAdminService.class,
          LexisAdminRpcService.class,
          LexisAdminScheduleService.class,
          LexisSummaryService.class,
          LexisUploadService.class,
          ApplicationSubmissionImportService.class,
          FederalApplicationService.class,
          RtmEmsLogAmvService.class,
          LexisReportService.class,
          LexisReportScheduleRepository.class,
          ClientLookupService.class,
          BlanketOicPackageService.class,
          ShippingReferenceService.class,
          LexisUserPreferenceService.class);

  @Bean
  SmartInitializingSingleton requiredOracleServiceGuard(ListableBeanFactory beanFactory) {
    return () -> assertRequiredServicesAvailable(beanFactory);
  }

  static void assertRequiredServicesAvailable(ListableBeanFactory beanFactory) {
    List<String> missingServices =
        REQUIRED_SERVICE_TYPES.stream()
            .filter(
                serviceType ->
                    beanFactory.getBeanNamesForType(serviceType, true, false).length == 0)
            .map(Class::getSimpleName)
            .sorted()
            .toList();
    if (!missingServices.isEmpty()) {
      throw new IllegalStateException(
          "Required Oracle business services are unavailable: "
              + String.join(", ", missingServices));
    }
  }

  static List<Class<?>> requiredServiceTypes() {
    return REQUIRED_SERVICE_TYPES;
  }
}

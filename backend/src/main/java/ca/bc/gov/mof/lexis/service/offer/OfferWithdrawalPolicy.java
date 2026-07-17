package ca.bc.gov.mof.lexis.service.offer;

import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

@Service
public class OfferWithdrawalPolicy {

  private final ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  private final ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;

  public OfferWithdrawalPolicy(
      ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider,
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider) {
    this.applicationDetailsServiceProvider = applicationDetailsServiceProvider;
    this.scheduleRepositoryProvider = scheduleRepositoryProvider;
  }

  public boolean canWithdraw(Long applicationNumber) {
    return findWithdrawalDeadline(applicationNumber)
        .map(deadline -> !deadline.isBefore(LexisBusinessTime.today()))
        .orElse(false);
  }

  private Optional<LocalDate> findWithdrawalDeadline(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    ApplicationDetailsRpcService applicationDetailsService =
        applicationDetailsServiceProvider.getIfAvailable();
    LexisReportScheduleRepository scheduleRepository =
        scheduleRepositoryProvider.getIfAvailable();
    if (applicationDetailsService == null || scheduleRepository == null) {
      return Optional.empty();
    }
    return applicationDetailsService
        .getApplicationSummarySnapshot(applicationNumber)
        .map(ApplicationDetailsRpcService.ApplicationSummarySnapshot::exportScheduleId)
        .flatMap(scheduleRepository::findExportScheduleById)
        .map(schedule -> schedule.offerWithdrawalDate());
  }
}

package ca.bc.gov.mof.lexis.service.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

@ExtendWith(MockitoExtension.class)
class OfferWithdrawalPolicyTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private LexisReportScheduleRepository scheduleRepository;

  private OfferWithdrawalPolicy policy;

  @BeforeEach
  void setup() {
    policy =
        new OfferWithdrawalPolicy(applicationDetailsServiceProvider, scheduleRepositoryProvider);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
  }

  @Test
  void shouldUseWithdrawalDateInsteadOfTheLaterOfferEndDate() {
    LocalDate today = LexisBusinessTime.today();
    stubSchedule(today.plusDays(10), today.minusDays(1));

    assertThat(policy.canWithdraw(1000456L)).isFalse();
  }

  @Test
  void shouldIncludeTheWithdrawalDeadline() {
    LocalDate today = LexisBusinessTime.today();
    stubSchedule(today.plusDays(10), today);

    assertThat(policy.canWithdraw(1000456L)).isTrue();
  }

  @Test
  void shouldFailClosedWhenTheApplicationScheduleCannotBeResolved() {
    when(applicationDetailsService.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.empty());

    assertThat(policy.canWithdraw(1000456L)).isFalse();
  }

  private void stubSchedule(LocalDate offerEndDate, LocalDate offerWithdrawalDate) {
    when(applicationDetailsService.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(applicationSummary(901L)));
    when(scheduleRepository.findExportScheduleById(901L))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    901L,
                    LocalDate.of(2026, 1, 1),
                    LocalDate.of(2026, 1, 2),
                    LocalDate.of(2026, 1, 3),
                    offerEndDate,
                    offerWithdrawalDate,
                    LocalDate.of(2026, 1, 4))));
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot applicationSummary(
      Long exportScheduleId) {
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        1000456L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        exportScheduleId,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }
}

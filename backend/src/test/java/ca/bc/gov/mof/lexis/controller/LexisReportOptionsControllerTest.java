package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.report.LexisReportOptionsDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisReportOptionsController")
class LexisReportOptionsControllerTest {

  @Mock private ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  @Mock private LexisReportScheduleRepository scheduleRepository;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisPrincipalService principalService;
  @Mock private Authentication authentication;

  @Test
  void optionsShouldFailClosedWhenScheduleRepositoryMissing() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(null);
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    assertThatThrownBy(() -> controller.options(authentication))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Authoritative report options repository is unavailable");
    verifyNoInteractions(scheduleRepository);
  }

  @Test
  void optionsShouldReturnCurrentScheduleCodesAndAdvertisingDateLabels() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedulesRequired())
        .thenReturn(
            List.of(
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1001L, LocalDate.of(2026, 6, 15)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1002L, LocalDate.of(2026, 6, 29))));
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(scheduleRepository.loadReportJurisdictionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("", "All"),
                new CodeNameDto("P", "Provincial"),
                new CodeNameDto("F", "Federal")));
    when(scheduleRepository.loadReportExemptionTypeOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("", "All"),
                new CodeNameDto("M", "Ministerial"),
                new CodeNameDto("OIC", "OIC")));
    when(scheduleRepository.loadReportExemptionReasonOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("SEC128", "Section 128")));
    when(scheduleRepository.loadReportExemptionStatusOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("A", "Approved")));
    when(scheduleRepository.loadReportGrowthTypeOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("O", "Old Growth")));
    when(scheduleRepository.loadReportPermitStatusOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("ISS", "Issued")));
    when(scheduleRepository.loadReportDestinationCountryOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("US", "United States")));
    when(scheduleRepository.loadAllReportDestinationCountryOptions())
        .thenReturn(List.of(new CodeNameDto("US", "United States"), new CodeNameDto("NZ", "New Zealand")));
    when(scheduleRepository.loadReportPortOfExportOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("PAC", "Pacific")));
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().currentSchedules())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("1001", "2026-06-15"),
            org.assertj.core.groups.Tuple.tuple("1002", "2026-06-29"));
    assertThat(response.getBody().defaultRegion()).isNull();
    assertThat(response.getBody().regions())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("12", "Coast"),
            org.assertj.core.groups.Tuple.tuple("24", "Skeena"));
    assertThat(response.getBody().reportJurisdictions())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("P", "Provincial"),
            org.assertj.core.groups.Tuple.tuple("F", "Federal"));
    assertThat(response.getBody().biweeklyJurisdictions())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("P", "Provincial"),
            org.assertj.core.groups.Tuple.tuple("F", "Federal"));
    assertThat(response.getBody().teacJurisdictions())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("P", "Provincial"),
            org.assertj.core.groups.Tuple.tuple("F", "Federal"));
    assertThat(response.getBody().exemptionTypes())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("M", "Ministerial"),
            org.assertj.core.groups.Tuple.tuple("OIC", "OIC"));
    assertThat(response.getBody().tenureExemptionTypes())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("M", "Ministerial"),
            org.assertj.core.groups.Tuple.tuple("OIC", "OIC"),
            org.assertj.core.groups.Tuple.tuple("", "All"));
    assertThat(response.getBody().exemptionReasons())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("SEC128", "Section 128"));
    assertThat(response.getBody().exemptionStatuses())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("A", "Approved"));
    assertThat(response.getBody().growthTypes())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("O", "Old Growth"));
    assertThat(response.getBody().permitStatuses())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("ISS", "Issued"));
    assertThat(response.getBody().destinationCountries())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("US", "United States"));
    assertThat(response.getBody().allDestinationCountries())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("US", "United States"),
            org.assertj.core.groups.Tuple.tuple("NZ", "New Zealand"));
    assertThat(response.getBody().portsOfExport())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "All"),
            org.assertj.core.groups.Tuple.tuple("PAC", "Pacific"));
    verify(scheduleRepository).findCurrentSchedulesRequired();
    verify(scheduleRepository).loadRegionOptions();
    verify(scheduleRepository).loadReportJurisdictionOptions();
    verify(scheduleRepository).loadReportExemptionTypeOptions();
    verify(scheduleRepository).loadReportExemptionReasonOptions();
    verify(scheduleRepository).loadReportExemptionStatusOptions();
    verify(scheduleRepository).loadReportGrowthTypeOptions();
    verify(scheduleRepository).loadReportPermitStatusOptions();
    verify(scheduleRepository).loadReportDestinationCountryOptions();
    verify(scheduleRepository).loadAllReportDestinationCountryOptions();
    verify(scheduleRepository).loadReportPortOfExportOptions();
    verifyNoMoreInteractions(scheduleRepository);
  }

  @Test
  void optionsShouldLoadIndependentOracleLookupsConcurrently() throws Exception {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    CountDownLatch started = new CountDownLatch(4);
    CountDownLatch release = new CountDownLatch(1);
    when(scheduleRepository.findCurrentSchedulesRequired())
        .thenAnswer(
            invocation -> {
              awaitLookup(started, release);
              return List.of();
            });
    when(scheduleRepository.loadRegionOptions())
        .thenAnswer(
            invocation -> {
              awaitLookup(started, release);
              return List.of();
            });
    when(scheduleRepository.loadReportJurisdictionOptions())
        .thenAnswer(
            invocation -> {
              awaitLookup(started, release);
              return List.of();
            });
    when(scheduleRepository.loadReportExemptionTypeOptions())
        .thenAnswer(
            invocation -> {
              awaitLookup(started, release);
              return List.of();
            });
    ExecutorService executor = Executors.newFixedThreadPool(4);
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService, executor);

    try {
      CompletableFuture<ResponseEntity<LexisReportOptionsDto>> response =
          CompletableFuture.supplyAsync(() -> controller.options(authentication));

      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      release.countDown();
      assertThat(response.join().getStatusCode()).isEqualTo(HttpStatus.OK);
    } finally {
      release.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void optionsShouldPropagateCurrentScheduleLookupFailure() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedulesRequired())
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    assertThatThrownBy(() -> controller.options(authentication))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void optionsShouldPropagateCodeLookupFailureForProblemDetail503Handling() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadReportJurisdictionOptions())
        .thenThrow(new DataAccessResourceFailureException("Jurisdictions unavailable"));
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    assertThatThrownBy(() -> controller.options(authentication))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Jurisdictions unavailable");
  }

  @Test
  void optionsShouldPreferAvailableIdirOrgUnitRegion() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(principalService.resolveOrgUnitNo(authentication)).thenReturn("24");
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("24");
    verifyNoInteractions(sessionService);
  }

  @ParameterizedTest
  @ValueSource(strings = {"99", "not-an-org-unit"})
  void optionsShouldIgnoreUnavailableOrMalformedOrgUnitRegion(String orgUnitNo) {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(List.of(new CodeNameDto("12", "Coast")));
    when(principalService.resolveOrgUnitNo(authentication)).thenReturn(orgUnitNo);
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("12");
  }

  @Test
  void optionsShouldExposeDefaultRegionWhenOnlyOneConcreteRegionIsAvailable() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(List.of(new CodeNameDto("12", "Coast")));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("12");
  }

  @Test
  void optionsShouldUseForestClientDefaultRegionForIndustryUserWithoutOrgUnitClaim() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(principalService.resolveOrgUnitNo(authentication)).thenReturn(null);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(scheduleRepository.findDefaultRegionForForestClientNumber("00077881"))
        .thenReturn(java.util.Optional.of("24"));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("24");
  }

  @Test
  void optionsShouldIgnoreLegacyForestClientDefaultRegionWhenRegionIsUnavailable() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(scheduleRepository.findDefaultRegionForForestClientNumber("00077881"))
        .thenReturn(java.util.Optional.of("99"));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(
            scheduleRepositoryProvider, sessionService, principalService);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isNull();
  }

  private static void awaitLookup(CountDownLatch started, CountDownLatch release)
      throws InterruptedException {
    started.countDown();
    if (!release.await(5, TimeUnit.SECONDS)) {
      throw new AssertionError("Concurrent report option lookup was not released");
    }
  }
}

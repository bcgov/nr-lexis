package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.report.LexisReportOptionsDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisReportOptionsController")
class LexisReportOptionsControllerTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-25T00:00:00Z"), ZoneOffset.UTC);

  @Mock private ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  @Mock private LexisReportScheduleRepository scheduleRepository;
  @Mock private LexisSessionService sessionService;
  @Mock private Authentication authentication;

  @Test
  void optionsShouldReturnNoContentWhenScheduleRepositoryMissing() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(null);
    LexisReportOptionsController controller =
        new LexisReportOptionsController(scheduleRepositoryProvider, sessionService, FIXED_CLOCK);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(scheduleRepository);
  }

  @Test
  void optionsShouldReturnCurrentScheduleCodesAndAdvertisingDateLabels() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedules())
        .thenReturn(
            List.of(
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1001L, LocalDate.of(2026, 6, 15)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1002L, LocalDate.of(2026, 6, 29)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    1003L, LocalDate.of(2026, 7, 13)),
                new LexisReportScheduleRepository.CurrentScheduleRow(
                    null, LocalDate.of(2026, 7, 27))));
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
    when(scheduleRepository.loadBiweeklyJurisdictionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("", "All"),
                new CodeNameDto("P", "Provincial"),
                new CodeNameDto("F", "Federal")));
    when(scheduleRepository.loadTeacJurisdictionOptions())
        .thenReturn(List.of(new CodeNameDto("P", "Provincial"), new CodeNameDto("F", "Federal")));
    when(scheduleRepository.loadReportExemptionTypeOptions())
        .thenReturn(List.of(new CodeNameDto("", "All"), new CodeNameDto("OIC", "OIC")));
    when(scheduleRepository.loadTenureExemptionTypeOptions())
        .thenReturn(List.of(new CodeNameDto("M", "Ministerial"), new CodeNameDto("", "All")));
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
        new LexisReportOptionsController(scheduleRepositoryProvider, sessionService, FIXED_CLOCK);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().currentSchedules())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("", "Blank"),
            org.assertj.core.groups.Tuple.tuple("1002", "2026-06-29"),
            org.assertj.core.groups.Tuple.tuple("1003", "2026-07-13"));
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
            org.assertj.core.groups.Tuple.tuple("OIC", "OIC"));
    assertThat(response.getBody().tenureExemptionTypes())
        .extracting("code", "name")
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple("M", "Ministerial"),
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
    verify(scheduleRepository).findCurrentSchedules();
    verify(scheduleRepository).loadRegionOptions();
    verify(scheduleRepository).loadReportJurisdictionOptions();
    verify(scheduleRepository).loadBiweeklyJurisdictionOptions();
    verify(scheduleRepository).loadTeacJurisdictionOptions();
    verify(scheduleRepository).loadReportExemptionTypeOptions();
    verify(scheduleRepository).loadTenureExemptionTypeOptions();
    verify(scheduleRepository).loadReportExemptionReasonOptions();
    verify(scheduleRepository).loadReportExemptionStatusOptions();
    verify(scheduleRepository).loadReportGrowthTypeOptions();
    verify(scheduleRepository).loadReportPermitStatusOptions();
    verify(scheduleRepository).loadReportDestinationCountryOptions();
    verify(scheduleRepository).loadAllReportDestinationCountryOptions();
    verify(scheduleRepository).loadReportPortOfExportOptions();
  }

  @Test
  void optionsShouldExposeDefaultRegionWhenOnlyOneConcreteRegionIsAvailable() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedules()).thenReturn(List.of());
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(List.of(new CodeNameDto("12", "Coast")));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadTenureExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(scheduleRepositoryProvider, sessionService, FIXED_CLOCK);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("12");
  }

  @Test
  void optionsShouldExposeLegacyForestClientDefaultRegionWhenResolvedRegionIsAvailable() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedules()).thenReturn(List.of());
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(scheduleRepository.findDefaultRegionForForestClientNumber("00077881"))
        .thenReturn(java.util.Optional.of("24"));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadTenureExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(scheduleRepositoryProvider, sessionService, FIXED_CLOCK);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isEqualTo("24");
  }

  @Test
  void optionsShouldIgnoreLegacyForestClientDefaultRegionWhenRegionIsUnavailable() {
    when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    when(scheduleRepository.findCurrentSchedules()).thenReturn(List.of());
    when(scheduleRepository.loadRegionOptions())
        .thenReturn(
            List.of(
                new CodeNameDto("12", "Coast"),
                new CodeNameDto("24", "Skeena")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(scheduleRepository.findDefaultRegionForForestClientNumber("00077881"))
        .thenReturn(java.util.Optional.of("99"));
    when(scheduleRepository.loadReportExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadTenureExemptionTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionReasonOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportExemptionStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportGrowthTypeOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPermitStatusOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportDestinationCountryOptions()).thenReturn(List.of());
    when(scheduleRepository.loadReportPortOfExportOptions()).thenReturn(List.of());
    LexisReportOptionsController controller =
        new LexisReportOptionsController(scheduleRepositoryProvider, sessionService, FIXED_CLOCK);

    ResponseEntity<LexisReportOptionsDto> response = controller.options(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().defaultRegion()).isNull();
  }
}

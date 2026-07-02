package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.report.LexisReportOptionsDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/reports")
public class LexisReportOptionsController {

  private static final DateTimeFormatter DISPLAY_DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;

  private final ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  private final LexisSessionService sessionService;
  private final Clock clock;

  @Autowired
  public LexisReportOptionsController(
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider,
      LexisSessionService sessionService) {
    this(scheduleRepositoryProvider, sessionService, Clock.systemDefaultZone());
  }

  LexisReportOptionsController(
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider,
      LexisSessionService sessionService,
      Clock clock) {
    this.scheduleRepositoryProvider = scheduleRepositoryProvider;
    this.sessionService = sessionService;
    this.clock = clock == null ? Clock.systemDefaultZone() : clock;
  }

  @GetMapping("/options")
  public ResponseEntity<LexisReportOptionsDto> options(Authentication authentication) {
    LexisReportScheduleRepository scheduleRepository = scheduleRepositoryProvider.getIfAvailable();
    if (scheduleRepository == null) {
      return ResponseEntity.noContent().build();
    }
    List<CodeNameDto> regionOptions = scheduleRepository.loadRegionOptions();

    return ResponseEntity.ok(
        new LexisReportOptionsDto(
            toCurrentScheduleOptions(scheduleRepository),
            resolveDefaultRegion(scheduleRepository, regionOptions, authentication),
            regionOptions,
            scheduleRepository.loadReportJurisdictionOptions(),
            scheduleRepository.loadBiweeklyJurisdictionOptions(),
            scheduleRepository.loadTeacJurisdictionOptions(),
            scheduleRepository.loadReportExemptionTypeOptions(),
            scheduleRepository.loadTenureExemptionTypeOptions(),
            scheduleRepository.loadReportExemptionReasonOptions(),
            scheduleRepository.loadReportExemptionStatusOptions(),
            scheduleRepository.loadReportGrowthTypeOptions(),
            scheduleRepository.loadReportPermitStatusOptions(),
            scheduleRepository.loadReportDestinationCountryOptions(),
            scheduleRepository.loadAllReportDestinationCountryOptions(),
            scheduleRepository.loadReportPortOfExportOptions()));
  }

  private String resolveDefaultRegion(
      LexisReportScheduleRepository scheduleRepository,
      List<CodeNameDto> regions,
      Authentication authentication) {
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);
    if (forestClientNumber != null) {
      String legacyFallbackRegion =
          scheduleRepository.findDefaultRegionForForestClientNumber(forestClientNumber).orElse(null);
      if (legacyFallbackRegion != null && hasRegion(regions, legacyFallbackRegion)) {
        return legacyFallbackRegion;
      }
    }
    return resolveSingleDefaultRegion(regions);
  }

  private boolean hasRegion(List<CodeNameDto> regions, String region) {
    return regions.stream().map(CodeNameDto::code).anyMatch(region::equals);
  }

  private List<CodeNameDto> toCurrentScheduleOptions(
      LexisReportScheduleRepository scheduleRepository) {
    List<CodeNameDto> options = new ArrayList<>();
    LocalDate today = LocalDate.now(clock);
    options.addAll(
        scheduleRepository.findUpcomingExportSchedules().stream()
        .filter(row -> row.exportScheduleId() != null && row.advertisingDate() != null)
        .filter(row -> !row.advertisingDate().isBefore(today))
        .limit(2)
        .map(
            row ->
                new CodeNameDto(
                    String.valueOf(row.exportScheduleId()),
                    row.advertisingDate().format(DISPLAY_DATE_FORMATTER)))
        .toList());
    options.add(new CodeNameDto("", "Blank"));
    return options;
  }

  private String resolveSingleDefaultRegion(List<CodeNameDto> regions) {
    List<String> concreteRegions =
        regions.stream()
            .map(CodeNameDto::code)
            .filter(code -> code != null && !code.isBlank())
            .toList();
    return concreteRegions.size() == 1 ? concreteRegions.get(0) : null;
  }
}

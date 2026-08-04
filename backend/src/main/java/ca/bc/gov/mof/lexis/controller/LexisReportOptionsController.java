package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.configuration.ReportOptionsExecutorConfiguration.EXECUTOR_BEAN_NAME;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.report.LexisReportOptionsDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
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
  private final LexisPrincipalService principalService;
  private final Executor reportOptionExecutor;

  @Autowired
  public LexisReportOptionsController(
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider,
      LexisSessionService sessionService,
      LexisPrincipalService principalService,
      @Qualifier(EXECUTOR_BEAN_NAME) Executor reportOptionExecutor) {
    this.scheduleRepositoryProvider = scheduleRepositoryProvider;
    this.sessionService = sessionService;
    this.principalService = principalService;
    this.reportOptionExecutor = reportOptionExecutor;
  }

  public LexisReportOptionsController(
      ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider,
      LexisSessionService sessionService,
      LexisPrincipalService principalService) {
    this(scheduleRepositoryProvider, sessionService, principalService, Runnable::run);
  }

  @GetMapping("/options")
  public ResponseEntity<LexisReportOptionsDto> options(Authentication authentication) {
    LexisReportScheduleRepository scheduleRepository = scheduleRepositoryProvider.getIfAvailable();
    if (scheduleRepository == null) {
      throw new DataAccessResourceFailureException(
          "Authoritative report options repository is unavailable");
    }
    List<List<CodeNameDto>> primaryOptions =
        loadOptionBatch(
            List.of(
                () -> toCurrentScheduleOptions(scheduleRepository),
                scheduleRepository::loadRegionOptions,
                scheduleRepository::loadReportJurisdictionOptions,
                scheduleRepository::loadReportExemptionTypeOptions));
    List<CodeNameDto> currentSchedules = primaryOptions.get(0);
    List<CodeNameDto> regionOptions = primaryOptions.get(1);
    List<CodeNameDto> reportJurisdictions = primaryOptions.get(2);
    List<CodeNameDto> exemptionTypes = primaryOptions.get(3);

    List<List<CodeNameDto>> classificationOptions =
        loadOptionBatch(
            List.of(
                scheduleRepository::loadReportExemptionReasonOptions,
                scheduleRepository::loadReportExemptionStatusOptions,
                scheduleRepository::loadReportGrowthTypeOptions,
                scheduleRepository::loadReportPermitStatusOptions));

    List<List<CodeNameDto>> destinationOptions =
        loadOptionBatch(
            List.of(
                scheduleRepository::loadReportDestinationCountryOptions,
                scheduleRepository::loadAllReportDestinationCountryOptions,
                scheduleRepository::loadReportPortOfExportOptions));

    return ResponseEntity.ok(
        new LexisReportOptionsDto(
            currentSchedules,
            resolveDefaultRegion(scheduleRepository, regionOptions, authentication),
            regionOptions,
            reportJurisdictions,
            reportJurisdictions,
            withoutAllOption(reportJurisdictions),
            exemptionTypes,
            withTrailingAllOption(exemptionTypes),
            classificationOptions.get(0),
            classificationOptions.get(1),
            classificationOptions.get(2),
            classificationOptions.get(3),
            destinationOptions.get(0),
            destinationOptions.get(1),
            destinationOptions.get(2)));
  }

  private List<List<CodeNameDto>> loadOptionBatch(
      List<Supplier<List<CodeNameDto>>> optionLoaders) {
    List<CompletableFuture<List<CodeNameDto>>> futures = new ArrayList<>(optionLoaders.size());
    try {
      optionLoaders.forEach(
          loader -> futures.add(CompletableFuture.supplyAsync(loader, reportOptionExecutor)));
    } catch (RejectedExecutionException exception) {
      throw new DataAccessResourceFailureException(
          "Authoritative report options executor is unavailable", exception);
    }

    return futures.stream().map(this::joinOptionLookup).toList();
  }

  private List<CodeNameDto> joinOptionLookup(
      CompletableFuture<List<CodeNameDto>> optionLookup) {
    try {
      return optionLookup.join();
    } catch (CompletionException exception) {
      Throwable cause = exception.getCause();
      if (cause instanceof RuntimeException runtimeException) {
        throw runtimeException;
      }
      throw new DataAccessResourceFailureException(
          "Authoritative report option lookup failed", cause);
    }
  }

  private List<CodeNameDto> withoutAllOption(List<CodeNameDto> options) {
    return options.stream().filter(option -> !option.code().isBlank()).toList();
  }

  private List<CodeNameDto> withTrailingAllOption(List<CodeNameDto> options) {
    List<CodeNameDto> reordered = new ArrayList<>(withoutAllOption(options));
    options.stream()
        .filter(option -> option.code().isBlank())
        .findFirst()
        .ifPresent(reordered::add);
    return List.copyOf(reordered);
  }

  private String resolveDefaultRegion(
      LexisReportScheduleRepository scheduleRepository,
      List<CodeNameDto> regions,
      Authentication authentication) {
    String orgUnitNo = principalService.resolveOrgUnitNo(authentication);
    if (orgUnitNo != null && hasRegion(regions, orgUnitNo)) {
      return orgUnitNo;
    }

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
    return scheduleRepository.findCurrentSchedulesRequired().stream()
        .filter(row -> row.exportScheduleId() != null && row.advertisingDate() != null)
        .limit(2)
        .map(
            row ->
                new CodeNameDto(
                    String.valueOf(row.exportScheduleId()),
                    row.advertisingDate().format(DISPLAY_DATE_FORMATTER)))
        .toList();
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

package ca.bc.gov.mof.lexis.service.application;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.LexisApplicationRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisApplicationService implements LexisApplicationService {

  private static final DateTimeFormatter DISPLAY_DATE_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE;

  private final LexisApplicationRepository repository;
  private final LexisReportScheduleRepository scheduleRepository;
  private final Clock clock;

  @Autowired
  public OracleLexisApplicationService(
      LexisApplicationRepository repository, LexisReportScheduleRepository scheduleRepository) {
    this(repository, scheduleRepository, Clock.systemDefaultZone());
  }

  OracleLexisApplicationService(
      LexisApplicationRepository repository,
      LexisReportScheduleRepository scheduleRepository,
      Clock clock) {
    this.repository = repository;
    this.scheduleRepository = scheduleRepository;
    this.clock = clock == null ? Clock.systemDefaultZone() : clock;
  }

  @Override
  public LexisApplicationSearchOptionsDto searchOptions() {
    return new LexisApplicationSearchOptionsDto(
        safeList(repository.loadExemptionTypeOptions()),
        safeList(repository.loadExemptionReasonOptions()),
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadProductTypeOptions()),
        safeList(repository.loadGrowthTypeOptions()),
        safeList(repository.loadRegionOptions()),
        currentScheduleOptions());
  }

  @Override
  public LexisApplicationSearchResponseDto search(LexisApplicationSearchCriteria criteria) {
    LexisApplicationSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<LexisApplicationSearchResultDto> searchPage = repository.search(normalized);
    List<LexisApplicationSearchResultDto> results = searchPage == null ? List.of() : safeList(searchPage.getContent());

    return new LexisApplicationSearchResponseDto(
        results,
        searchPage == null ? 0 : (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(LexisApplicationSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<LexisApplicationDetailDto> findByApplicationNumber(long applicationNumber) {
    if (applicationNumber < 1) {
      return Optional.empty();
    }
    return repository.findByApplicationNumber(applicationNumber);
  }

  @Override
  public Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber) {
    String normalized = trimToNull(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }
    return repository.findPackageByPackageNumber(normalized);
  }

  @Override
  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    List<Long> normalized = positiveDistinctLongs(applicationNumbers);
    if (normalized.isEmpty()) {
      return false;
    }
    return repository.verifyApplicationClients(normalized);
  }

  @Override
  public boolean hasValidOffer(List<Long> applicationNumbers) {
    List<Long> normalized = positiveDistinctLongs(applicationNumbers);
    if (normalized.isEmpty()) {
      return false;
    }
    return repository.hasValidOffer(normalized);
  }

  private LexisApplicationSearchCriteria normalizeCriteria(LexisApplicationSearchCriteria input) {
    if (input == null) {
      return new LexisApplicationSearchCriteria(
          null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 25);
    }

    return new LexisApplicationSearchCriteria(
        trimToNull(input.applicationNumber()),
        trimToNull(input.packageNumber()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.exemptionType()),
        trimToNull(input.applicationStatus()),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.agentClientNumber()),
        trimToNull(input.productTypeCode()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        positiveDistinctLongs(input.regionNumbers()),
        trimToNull(input.sortField()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

  private List<CodeNameDto> currentScheduleOptions() {
    List<CodeNameDto> options = new ArrayList<>();
    LocalDate today = LocalDate.now(clock);
    options.addAll(
        safeList(scheduleRepository.findUpcomingExportSchedules()).stream()
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
}

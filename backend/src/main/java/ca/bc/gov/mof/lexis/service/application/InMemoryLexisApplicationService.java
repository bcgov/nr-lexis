package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.stream.Stream;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("stub-services & !oracle")
public class InMemoryLexisApplicationService implements LexisApplicationService {

  private static final String APPLICANT_TYPE_AGENT = "A";
  private static final String SORT_DESC = "DESC";

  private static final List<CodeNameDto> EXEMPTION_TYPES =
      List.of(
          new CodeNameDto("ALL", "All"),
          new CodeNameDto("FEE", "Fee in Lieu"),
          new CodeNameDto("APP", "Application Exemption"));

  private static final List<CodeNameDto> EXEMPTION_REASONS =
      List.of(
          new CodeNameDto("U", "Unadvertised"),
          new CodeNameDto("S", "Section 127"),
          new CodeNameDto("E", "Emergency"));

  private static final List<CodeNameDto> APPLICATION_STATUSES =
      List.of(
          new CodeNameDto("NEW", "New"),
          new CodeNameDto("REV", "In Review"),
          new CodeNameDto("PER", "Permitted"));

  private static final List<CodeNameDto> PRODUCT_TYPES =
      List.of(
          new CodeNameDto("LOG", "Logs"),
          new CodeNameDto("LUM", "Lumber"));

  private static final List<CodeNameDto> GROWTH_TYPES =
      List.of(
          new CodeNameDto("O", "Old Growth"),
          new CodeNameDto("S", "Second Growth"));

  private static final List<CodeNameDto> REGIONS =
      List.of(
          new CodeNameDto("1903", "Cariboo Natural Resource Region"),
          new CodeNameDto("1904", "Kootenay-Boundary Natural Resource Region"),
          new CodeNameDto("1905", "Northeast Natural Resource Region"),
          new CodeNameDto("1906", "Omineca Natural Resource Region"),
          new CodeNameDto("1907", "Thompson-Okanagan Natural Resource Region"),
          new CodeNameDto("1908", "Skeena Natural Resource Region"),
          new CodeNameDto("1909", "South Coast Natural Resource Region"),
          new CodeNameDto("1910", "West Coast Natural Resource Region"));

  private static final List<ApplicationRecord> APPLICATIONS =
      List.of(
          new ApplicationRecord(
              1000123L,
              "NEW",
              "New",
              "O",
              "00012345",
              "00",
              null,
              null,
              "EX-204",
              "APP",
              "LOG",
              "R1",
              11L,
              210.5,
              2.1,
              "ER01",
              LocalDate.of(2026, 1, 14),
              LocalDate.of(2026, 1, 15),
              LocalDate.of(2026, 2, 1),
              180L,
              true,
              false,
              false,
              false,
              false,
              false,
              List.of(
                  new LexisApplicationDetailDto.LexisPackageDto("PKG-901", 120.3, 42),
                  new LexisApplicationDetailDto.LexisPackageDto("PKG-902", 90.2, 33)),
              List.of(
                  new LexisApplicationDetailDto.LexisRemarkDto(
                      1001L,
                      "Initial Review",
                      "Submitted with complete scale package.",
                      "system",
                      LocalDate.of(2026, 1, 15))),
              List.of()),
          new ApplicationRecord(
              1000456L,
              "REV",
              "In Review",
              APPLICANT_TYPE_AGENT,
              "00077881",
              "00",
              "00055667",
              "00",
              "EX-205",
              "FEE",
              "LUM",
              "R2",
              12L,
              95.0,
              1.6,
              "ER02",
              LocalDate.of(2026, 2, 20),
              LocalDate.of(2026, 2, 21),
              LocalDate.of(2026, 2, 26),
              120L,
              true,
              false,
              true,
              false,
              false,
              false,
              List.of(new LexisApplicationDetailDto.LexisPackageDto("PKG-903", 95.0, 28)),
              List.of(
                  new LexisApplicationDetailDto.LexisRemarkDto(
                      1002L,
                      "Pending",
                      "Awaiting agency confirmation for listing date.",
                      "system",
                      LocalDate.of(2026, 2, 21))),
              List.of(
                  new LexisApplicationDetailDto.LexisOfferDto(
                      "OF-810", "Example Timber Ltd.", LocalDate.of(2026, 3, 1), true, null),
                  new LexisApplicationDetailDto.LexisOfferDto(
                      "OF-803",
                      "Interior Mill Co.",
                      LocalDate.of(2026, 2, 28),
                      true,
                      LocalDate.of(2026, 3, 20)))),
          new ApplicationRecord(
              1000999L,
              "PER",
              "Permitted",
              "O",
              "00091011",
              "00",
              null,
              null,
              "EX-300",
              "APP",
              "LOG",
              "R3",
              24L,
              325.75,
              2.8,
              "ER03",
              LocalDate.of(2025, 11, 3),
              LocalDate.of(2025, 11, 5),
              LocalDate.of(2025, 11, 30),
              365L,
              false,
              true,
              false,
              false,
              true,
              false,
              List.of(new LexisApplicationDetailDto.LexisPackageDto("PKG-950", 325.75, 88)),
              List.of(
                  new LexisApplicationDetailDto.LexisRemarkDto(
                      1003L,
                      "Completed",
                      "Permit issued and application closed.",
                      "system",
                      LocalDate.of(2025, 12, 2))),
              List.of(
                  new LexisApplicationDetailDto.LexisOfferDto(
                      "OF-990",
                      "North Coast Exports",
                      LocalDate.of(2025, 12, 2),
                      true,
                      LocalDate.of(2025, 12, 20)))));

  @Override
  public LexisApplicationSearchOptionsDto searchOptions() {
    return new LexisApplicationSearchOptionsDto(
        EXEMPTION_TYPES,
        EXEMPTION_REASONS,
        APPLICATION_STATUSES,
        PRODUCT_TYPES,
        GROWTH_TYPES,
        REGIONS,
        List.of());
  }

  @Override
  public LexisApplicationSearchResponseDto search(LexisApplicationSearchCriteria criteria) {
    int page = Math.max(0, criteria.page());
    int size = Math.max(1, criteria.size());

    List<ApplicationRecord> filtered = filterApplications(criteria);

    int fromIndex = Math.min(page * size, filtered.size());
    int toIndex = Math.min(fromIndex + size, filtered.size());

    List<LexisApplicationSearchResultDto> paged =
        filtered.subList(fromIndex, toIndex).stream().map(this::toSearchResult).toList();

    return new LexisApplicationSearchResponseDto(paged, filtered.size(), page, size);
  }

  @Override
  public int count(LexisApplicationSearchCriteria criteria) {
    return filterApplications(criteria).size();
  }

  @Override
  public Optional<LexisApplicationDetailDto> findByApplicationNumber(long applicationNumber) {
    return APPLICATIONS.stream()
        .filter(app -> app.applicationNumber() == applicationNumber)
        .findFirst()
        .map(this::toDetail);
  }

  @Override
  public Optional<LexisPackageLookupDto> findPackageByPackageNumber(String packageNumber) {
    if (blank(packageNumber)) {
      return Optional.empty();
    }

    String normalized = normalize(packageNumber);
    return APPLICATIONS.stream()
        .flatMap(
            app ->
                app.packages().stream()
                    .filter(pkg -> normalize(pkg.packageNumber()).equals(normalized))
                    .map(
                        pkg ->
                            new LexisPackageLookupDto(
                                pkg.packageNumber(), app.applicationNumber(), pkg.volume(), null)))
        .findFirst();
  }

  @Override
  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    List<ApplicationRecord> records = resolveRequested(applicationNumbers);
    if (records.isEmpty()) {
      return false;
    }

    String ownerClient = null;
    String ownerLocation = null;
    String previousAgent = null;

    for (int i = 0; i < records.size(); i++) {
      ApplicationRecord record = records.get(i);

      if (ownerClient == null) {
        ownerClient = record.ownerClientNumber();
      }
      if (ownerLocation == null) {
        ownerLocation = record.ownerClientLocationCode();
      }

      if (!Objects.equals(ownerClient, record.ownerClientNumber())) {
        return false;
      }
      if (!Objects.equals(ownerLocation, record.ownerClientLocationCode())) {
        return false;
      }

      if (previousAgent != null && !Objects.equals(previousAgent, record.agentClientNumber())) {
        return false;
      }
      if (previousAgent == null && i != 0 && record.agentClientLocationCode() != null) {
        return false;
      }
      previousAgent = record.agentClientNumber();
    }

    return true;
  }

  @Override
  public boolean hasValidOffer(List<Long> applicationNumbers) {
    List<ApplicationRecord> records = resolveRequested(applicationNumbers);
    for (ApplicationRecord record : records) {
      for (LexisApplicationDetailDto.LexisOfferDto offer : record.offers()) {
        if (offer.validOffer() && offer.withdrawalDate() == null) {
          return true;
        }
      }
    }
    return false;
  }

  private List<ApplicationRecord> filterApplications(LexisApplicationSearchCriteria criteria) {
    return APPLICATIONS.stream()
        .filter(matchesApplicationNumber(criteria.applicationNumber()))
        .filter(matchesPackageNumber(criteria.packageNumber()))
        .filter(matchesText(ApplicationRecord::exemptionNumber, criteria.exemptionNumber()))
        .filter(matchesText(ApplicationRecord::ownerClientNumber, criteria.ownerClientNumber()))
        .filter(matchesExact(ApplicationRecord::exemptionType, criteria.exemptionType()))
        .filter(matchesExact(ApplicationRecord::statusCode, criteria.applicationStatus()))
        .filter(matchesExact(ApplicationRecord::productTypeCode, criteria.productTypeCode()))
        .filter(matchesAgentClientLogic(criteria.agentClientNumber()))
        .filter(matchesDateRange(
            ApplicationRecord::receivedDate, criteria.receivedFromDate(), criteria.receivedToDate()))
        .filter(matchesDateRange(
            ApplicationRecord::listingDate, criteria.listingFromDate(), criteria.listingToDate()))
        .filter(matchesRegion(criteria.regionNumbers()))
        .sorted(resolveSort(criteria.sortField()))
        .toList();
  }

  private List<ApplicationRecord> resolveRequested(List<Long> applicationNumbers) {
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      return List.of();
    }

    List<ApplicationRecord> records = new ArrayList<>();
    for (Long applicationNumber : applicationNumbers) {
      if (applicationNumber == null) {
        continue;
      }
      APPLICATIONS.stream()
          .filter(app -> app.applicationNumber() == applicationNumber)
          .findFirst()
          .ifPresent(records::add);
    }
    return records;
  }

  private LexisApplicationSearchResultDto toSearchResult(ApplicationRecord record) {
    String client =
        APPLICANT_TYPE_AGENT.equals(record.applicantType())
                && record.agentClientNumber() != null
                && !record.agentClientNumber().equals(record.ownerClientNumber())
            ? record.agentClientNumber()
            : "";

    return new LexisApplicationSearchResultDto(
        record.applicationNumber(),
        record.statusDescription(),
        client,
        record.ownerClientNumber(),
        nullToEmpty(record.exemptionNumber()),
        record.listingDate(),
        record.regionCode(),
        record.applicationVolume(),
        record.showCheckbox(),
        record.locked());
  }

  private LexisApplicationDetailDto toDetail(ApplicationRecord record) {
    return new LexisApplicationDetailDto(
        record.applicationNumber(),
        record.exemptionNumber(),
        record.statusCode(),
        record.statusDescription(),
        record.ownerClientNumber(),
        record.agentClientNumber(),
        record.orgUnitNumber(),
        regionName(record.orgUnitNumber()),
        record.productTypeCode(),
        record.exemptionReasonCode(),
        record.applicationDate(),
        record.receivedDate(),
        record.listingDate(),
        null,
        record.termDays(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.canCreateOffers(),
        record.industryUser(),
        record.readOnly(),
        record.exemptionApprover(),
        record.locked(),
        null,
        null,
        record.packages(),
        record.remarks(),
        record.offers(),
        "system");
  }

  private String regionName(Long regionNumber) {
    if (regionNumber == null) {
      return "";
    }
    return REGIONS.stream()
        .filter(code -> Objects.equals(code.code(), String.valueOf(regionNumber)))
        .map(CodeNameDto::name)
        .findFirst()
        .orElse("");
  }

  private Predicate<ApplicationRecord> matchesApplicationNumber(String applicationNumber) {
    if (blank(applicationNumber)) {
      return ignored -> true;
    }
    String value = applicationNumber.trim();
    return app -> String.valueOf(app.applicationNumber()).contains(value) && app.applicationNumber() > 0;
  }

  private Predicate<ApplicationRecord> matchesPackageNumber(String packageNumber) {
    if (blank(packageNumber)) {
      return ignored -> true;
    }
    String value = normalize(packageNumber);
    return app ->
        app.packages().stream()
            .map(LexisApplicationDetailDto.LexisPackageDto::packageNumber)
            .filter(Objects::nonNull)
            .map(this::normalize)
            .anyMatch(pkg -> pkg.contains(value));
  }

  private Predicate<ApplicationRecord> matchesText(
      java.util.function.Function<ApplicationRecord, String> getter, String value) {
    if (blank(value)) {
      return ignored -> true;
    }
    String expected = normalize(value);
    return app -> {
      String actual = getter.apply(app);
      return actual != null && normalize(actual).contains(expected);
    };
  }

  private Predicate<ApplicationRecord> matchesExact(
      java.util.function.Function<ApplicationRecord, String> getter, String value) {
    if (blank(value) || "ALL".equalsIgnoreCase(value)) {
      return ignored -> true;
    }
    String expected = normalize(value);
    return app -> expected.equals(normalize(getter.apply(app)));
  }

  private Predicate<ApplicationRecord> matchesAgentClientLogic(String agentClientNumber) {
    if (blank(agentClientNumber)) {
      return ignored -> true;
    }
    String expected = normalize(agentClientNumber);
    return app ->
        (expected.equals(normalize(app.ownerClientNumber()))
                && !"A".equalsIgnoreCase(app.applicantType()))
            || (expected.equals(normalize(app.agentClientNumber()))
                && "A".equalsIgnoreCase(app.applicantType()));
  }

  private Predicate<ApplicationRecord> matchesRegion(List<Long> regionNumbers) {
    if (regionNumbers == null || regionNumbers.isEmpty()) {
      return ignored -> true;
    }
    return app -> app.orgUnitNumber() != null && regionNumbers.contains(app.orgUnitNumber());
  }

  private Predicate<ApplicationRecord> matchesDateRange(
      java.util.function.Function<ApplicationRecord, LocalDate> getter,
      LocalDate from,
      LocalDate to) {
    return app -> {
      LocalDate value = getter.apply(app);
      if (value == null) {
        return false;
      }
      boolean afterFrom = from == null || !value.isBefore(from);
      boolean beforeTo = to == null || !value.isAfter(to);
      return afterFrom && beforeTo;
    };
  }

  private Comparator<ApplicationRecord> resolveSort(String sortField) {
    if (blank(sortField)) {
      return Comparator.comparingLong(ApplicationRecord::applicationNumber);
    }

    String normalized = sortField.trim();
    boolean desc = normalized.toUpperCase(Locale.ENGLISH).endsWith(SORT_DESC);
    String key = desc ? normalized.substring(0, normalized.length() - 4).trim() : normalized;

    Comparator<ApplicationRecord> comparator =
        switch (normalize(key)) {
          case "status", "applicationstatus" -> Comparator.comparing(ApplicationRecord::statusDescription);
          case "listingdate" -> Comparator.comparing(ApplicationRecord::listingDate);
          case "receiveddate" -> Comparator.comparing(ApplicationRecord::receivedDate);
          case "region", "orgunitno", "org_unit_no" ->
              Comparator.comparing(ApplicationRecord::orgUnitNumber, Comparator.nullsLast(Long::compareTo));
          case "applicationvolume", "exemptionapplicationvolume" ->
              Comparator.comparingDouble(ApplicationRecord::applicationVolume);
          default -> Comparator.comparingLong(ApplicationRecord::applicationNumber);
        };

    return desc ? comparator.reversed() : comparator;
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim().toUpperCase(Locale.ENGLISH);
  }

  private boolean blank(String value) {
    return value == null || value.trim().isEmpty();
  }

  private String nullToEmpty(String value) {
    return value == null ? "" : value;
  }

  private record ApplicationRecord(
      long applicationNumber,
      String statusCode,
      String statusDescription,
      String applicantType,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      String exemptionNumber,
      String exemptionType,
      String productTypeCode,
      String regionCode,
      Long orgUnitNumber,
      double applicationVolume,
      double averageLogVolume,
      String exemptionReasonCode,
      LocalDate applicationDate,
      LocalDate receivedDate,
      LocalDate listingDate,
      Long termDays,
      boolean showCheckbox,
      boolean locked,
      boolean canCreateOffers,
      boolean industryUser,
      boolean readOnly,
      boolean exemptionApprover,
      List<LexisApplicationDetailDto.LexisPackageDto> packages,
      List<LexisApplicationDetailDto.LexisRemarkDto> remarks,
      List<LexisApplicationDetailDto.LexisOfferDto> offers) {}
}

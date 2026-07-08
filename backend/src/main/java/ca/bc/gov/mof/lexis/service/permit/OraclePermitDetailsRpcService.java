package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parseDouble;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitRpcScaleItemDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.AttachmentTypeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.CountryCodeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.DocumentRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.EndUsePairRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageDetailsRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.BoicScaleMutationRecord;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageCandidateRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.SalesInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ScaleMutationRecord;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ScaleMutationRow;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OraclePermitDetailsRpcService implements PermitDetailsRpcService {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final LocalDate FEE_MASK_EFFECTIVE_DATE = LocalDate.of(2024, 6, 27);
  private static final BigDecimal ONE_HUNDRED = BigDecimal.valueOf(100);
  private static final String EXEMPTION_TYPE_MINISTERIAL = "M";
  private static final String EXEMPTION_TYPE_BLANKET_OIC = "B";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String EXPORT_SCALE_METHOD_WEIGHT = "W";
  private static final String EXPORT_PERMIT_STATUS_ACTIVE = "ACT";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String APPLICATION_STATUS_PERMITTED = "PMT";
  private static final String SPECIES_FIR = "FI";
  private static final int MAX_SALES_INVOICE_NUMBER_LENGTH = 9;
  private static final long RCO_REGION_CODE = 1835L;
  private static final long RSK_REGION_CODE = 1908L;
  private static final long RSC_REGION_CODE = 1909L;
  private static final long RWC_REGION_CODE = 1910L;
  private static final Pattern RSK_NON_Z_GRADE_PATTERN = Pattern.compile("[A-Y]");
  private static final Set<String> DECIDUOUS_SPECIES_CODES =
      Set.of("AL", "AR", "AS", "BI", "CO", "MA");
  private static final Set<String> LOW_CONIFEROUS_GRADE_CODES = Set.of("U", "X", "Y", "Z");

  private final PermitRpcRepository repository;
  private final LexisApplicationService applicationService;
  private final ExemptionService exemptionService;
  private final ApplicationReviewRepository applicationReviewRepository;

  public OraclePermitDetailsRpcService(
      PermitRpcRepository repository,
      LexisApplicationService applicationService,
      ExemptionService exemptionService,
      ApplicationReviewRepository applicationReviewRepository) {
    this.repository = repository;
    this.applicationService = applicationService;
    this.exemptionService = exemptionService;
    this.applicationReviewRepository = applicationReviewRepository;
  }

  @Override
  public PermitSummaryRpcResponseDto getPermitSummary(
      Long permitNumber,
      String countryCode,
      String applicationDate,
      String packageNumber,
      boolean ministryUser) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitSummaryRpcResponseDto("0.0", 0L, "$0.00", List.of(), "$0.00", "");
    }

    List<PermitScaleDetailRow> allPermitScales = repository.findScaleDetailsByPermitNumber(permitNumber);
    FeeCalculationContext feeContext = buildFeeContext(permitNumber, countryCode, applicationDate);

    String normalizedPackageNumber = trimToNull(packageNumber);
    String permitNumberString = permitNumber.toString();
    double totalVolume = 0.0d;
    long totalPieces = 0L;
    BigDecimal totalFees = BigDecimal.ZERO;
    BigDecimal totalFeeForPackage = BigDecimal.ZERO;
    List<PermitRpcScaleItemDto> scaleList = new ArrayList<>();
    for (PermitScaleDetailRow scale : allPermitScales) {
      BigDecimal fee = calculateRoundedFeeForScale(scale, feeContext);
      totalVolume += scale.speciesGradeVolume();
      totalPieces += scale.piecesCount();
      totalFees = totalFees.add(fee);
      if (normalizedPackageNumber != null && normalizedPackageNumber.equals(scale.packageNumber())) {
        totalFeeForPackage = totalFeeForPackage.add(fee);
        scaleList.add(
            toSummaryScaleItem(
                scale,
                permitNumberString,
                ministryUser,
                fee,
                getAverageMarketValueForScale(scale, feeContext)));
      }
    }

    boolean maskFees =
        shouldMaskFees(
            firstNonNull(countryCode, feeContext.exportCountryCode()),
            firstNonNull(parseDate(applicationDate), feeContext.permitApplicationDate()));
    return new PermitSummaryRpcResponseDto(
        formatVolume(totalVolume),
        totalPieces,
        maskFees ? "$" : formatCurrency(totalFees),
        scaleList,
        maskFees ? "$" : formatCurrency(totalFeeForPackage),
        resolveGrowthType(packageNumber));
  }

  @Override
  public PermitTotalFeesRpcResponseDto getTotalFeesForPermit(
      Long permitNumber,
      String countryCode,
      String applicationDate) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitTotalFeesRpcResponseDto("$0.00");
    }

    FeeCalculationContext feeContext = buildFeeContext(permitNumber, countryCode, applicationDate);
    BigDecimal totalFees = sumFees(repository.findScaleDetailsByPermitNumber(permitNumber), feeContext);
    if (shouldMaskFees(
        firstNonNull(countryCode, feeContext.exportCountryCode()),
        firstNonNull(parseDate(applicationDate), feeContext.permitApplicationDate()))) {
      return new PermitTotalFeesRpcResponseDto("$");
    }
    return new PermitTotalFeesRpcResponseDto(formatCurrency(totalFees));
  }

  @Override
  public PermitScaleFeesRpcResponseDto getScaleFeesForPackage(
      String packageNumber,
      Long permitNumber,
      boolean ministryUser) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null || permitNumber == null || permitNumber < 1) {
      return new PermitScaleFeesRpcResponseDto("$0.00", List.of(), "");
    }

    String permitNumberString = permitNumber.toString();
    FeeCalculationContext feeContext = buildFeeContext(permitNumber, null, null);

    List<PermitScaleDetailRow> scales =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
            .filter(scale -> permitNumberString.equals(trimToNull(scale.exportPermitDetailNumber())))
            .toList();

    boolean maskScaleFees = shouldMaskScaleFeesForPackageView(feeContext);
    boolean maskTotalFeeForPackage = shouldMaskTotalFeeForPackage(feeContext);
    boolean countryCanada = isCanadaCountryCode(feeContext.exportCountryCode());
    Map<String, String> speciesDescriptionByCode = new HashMap<>();
    Map<String, String> gradeDescriptionByCode = new HashMap<>();
    List<PermitRpcScaleItemDto> scaleList = new ArrayList<>(scales.size());
    BigDecimal totalFeeForPackage = BigDecimal.ZERO;
    for (PermitScaleDetailRow scale : scales) {
      String species =
          resolveSpeciesDescription(scale.exportSpeciesCode(), speciesDescriptionByCode);
      String grade = resolveGradeDescription(scale.exportGradeCode(), gradeDescriptionByCode);
      BigDecimal fee = calculateRoundedFeeForScale(scale, feeContext);
      BigDecimal amv = getScaleDisplayAmv(scale, feeContext);
      String ewb = countryCanada ? "" : formatCurrencyNoScale(trimToNull(scale.ewb()));
      String fil = countryCanada ? "" : appendPercent(trimToNull(scale.fil()));
      String mf = countryCanada ? "" : nonNull(scale.mf());

      totalFeeForPackage = totalFeeForPackage.add(fee);
      scaleList.add(
          new PermitRpcScaleItemDto(
              nonNull(scale.timberMark()),
              species,
              grade,
              formatCurrency(amv),
              formatVolume(scale.speciesGradeVolume()),
              ministryUser,
              ewb,
              scale.piecesCount(),
              fil,
              mf,
              maskScaleFees ? "$" : formatCurrency(fee),
              "",
              nonNull(scale.exportScaleDetailId()),
              nonNull(scale.exportPermitDetailNumber())));
    }

    return new PermitScaleFeesRpcResponseDto(
        maskTotalFeeForPackage ? "$" : formatCurrency(totalFeeForPackage),
        scaleList,
        resolveGrowthType(packageNumber));
  }

  @Override
  public PermitScalesForPackageRpcResponseDto getScalesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return new PermitScalesForPackageRpcResponseDto(List.of());
    }

    Map<Long, String> regionByApplication = new HashMap<>();
    Map<String, String> speciesDescriptionByCode = new HashMap<>();
    Map<String, String> gradeDescriptionByCode = new HashMap<>();
    List<PermitScaleItemRpcResponseDto> scaleList =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
            .map(
                scale -> {
                  String species =
                      resolveSpeciesDescription(scale.exportSpeciesCode(), speciesDescriptionByCode);
                  String grade =
                      resolveGradeDescription(scale.exportGradeCode(), gradeDescriptionByCode);
                  String region =
                      resolveRegionForApplication(scale.applicationNumber(), regionByApplication);
                  String permit = firstNonNull(trimToNull(scale.exportPermitDetailNumber()), "");
                  return new PermitScaleItemRpcResponseDto(
                      nonNull(scale.timberMark()),
                      scale.piecesCount(),
                      species,
                      grade,
                      formatVolume(scale.speciesGradeVolume()),
                      permit,
                      nonNull(scale.exportScaleDetailId()),
                      nonNull(scale.cascadeSplitCode()),
                      region);
                })
            .toList();

    return new PermitScalesForPackageRpcResponseDto(scaleList);
  }

  @Override
  public PermitDataAfterScaleUpdateRpcResponseDto getPermitDataAfterScaleUpdate(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitDataAfterScaleUpdateRpcResponseDto("0.0", 0L, "$0.00", 0.0d);
    }

    String permitNumberString = permitNumber.toString();
    FeeCalculationContext feeContext = buildFeeContext(permitNumber, null, null);
    List<PermitScaleDetailRow> permitScales =
        repository.findScaleDetailsByPermitNumber(permitNumber).stream()
            .filter(scale -> permitNumberString.equals(trimToNull(scale.exportPermitDetailNumber())))
            .toList();

    double totalVolume = permitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = permitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();
    BigDecimal totalFees = sumFees(permitScales, feeContext);
    double exemptionVolume =
        exemptionService
            .findByExemptionNumber(feeContext.exemptionNumber())
            .map(exemption -> exemption.remainingVolume())
            .orElse(0.0d);

    return new PermitDataAfterScaleUpdateRpcResponseDto(
        formatVolume(totalVolume), totalPieces, formatCurrency(totalFees), exemptionVolume);
  }

  @Override
  public PermitPackageVolumeSumRpcResponseDto getPackageVolumeSum(Long permitNumber, String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (permitNumber == null || permitNumber < 1 || normalizedPackageNumber == null) {
      return new PermitPackageVolumeSumRpcResponseDto("0.0");
    }

    String permitNumberString = permitNumber.toString();
    double packageVolume =
        repository.findScaleDetailsByPermitNumber(permitNumber).stream()
            .filter(scale -> permitNumberString.equals(trimToNull(scale.exportPermitDetailNumber())))
            .filter(scale -> normalizedPackageNumber.equals(trimToNull(scale.packageNumber())))
            .mapToDouble(PermitScaleDetailRow::speciesGradeVolume)
            .sum();

    return new PermitPackageVolumeSumRpcResponseDto(formatVolume(packageVolume));
  }

  @Override
  public PermitPackageInfoRpcResponseDto getPackageInfo(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return emptyPackageInfo();
    }

    PackageInfoRow packageInfo = repository.findPackageInfoByPackageNumber(normalizedPackageNumber).orElse(null);
    if (packageInfo == null) {
      return emptyPackageInfo();
    }

    ApplicationInfoRow applicationInfo =
        repository.findApplicationInfoByNumber(packageInfo.applicationNumber()).orElse(null);
    if (applicationInfo == null) {
      return new PermitPackageInfoRpcResponseDto(
          "",
          "",
          "",
          formatVolume(packageInfo.packageVolume()),
          formatVolume(packageInfo.averageLength()),
          formatVolume(packageInfo.averageDiameter()),
          "");
    }

    String exemptionTypeCode =
        repository.findExemptionTypeCode(applicationInfo.exemptionNumber()).orElse(null);
    boolean blanketOic = EXEMPTION_TYPE_BLANKET_OIC.equalsIgnoreCase(trimToNull(exemptionTypeCode));

    String productTypeCode =
        firstNonNull(trimToNull(applicationInfo.productTypeCode()), trimToNull(packageInfo.productTypeCode()));
    String productTypeDescription =
        productTypeCode == null
            ? ""
            : repository.findProductTypeDescription(productTypeCode).orElse(productTypeCode);

    String growthTypeCode =
        blanketOic
            ? firstNonNull(trimToNull(packageInfo.growthTypeCode()), trimToNull(applicationInfo.growthTypeCode()))
            : firstNonNull(trimToNull(applicationInfo.growthTypeCode()), trimToNull(packageInfo.growthTypeCode()));
    String growthTypeDescription =
        growthTypeCode == null
            ? ""
            : repository.findGrowthTypeDescription(growthTypeCode).orElse(growthTypeCode);

    String endUseDescription =
        blanketOic
            ? buildBlanketPackageEndUseSort(normalizedPackageNumber)
            : buildApplicationEndUseSort(applicationInfo);

    return new PermitPackageInfoRpcResponseDto(
        nonNull(applicationInfo.regionName()),
        nonNull(endUseDescription),
        nonNull(growthTypeDescription),
        formatVolume(packageInfo.packageVolume()),
        formatVolume(packageInfo.averageLength()),
        formatVolume(packageInfo.averageDiameter()),
        nonNull(productTypeDescription));
  }

  @Override
  public PermitPackageDetailsRpcResponseDto getPackageDetails(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return emptyPackageDetails();
    }

    PackageDetailsRow packageDetails =
        repository.findPackageDetailsByPackageNumber(normalizedPackageNumber).orElse(null);
    if (packageDetails == null) {
      return emptyPackageDetails();
    }

    BigDecimal scaledVolume = BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP);
    for (PermitScaleDetailRow scale : repository.findScaleDetailsByPackageNumber(normalizedPackageNumber)) {
      BigDecimal speciesGradeVolume =
          BigDecimal.valueOf(scale.speciesGradeVolume()).setScale(1, RoundingMode.HALF_UP);
      scaledVolume = scaledVolume.add(speciesGradeVolume).setScale(1, RoundingMode.HALF_UP);
    }

    String growthTypeDescription =
        repository
            .findGrowthTypeDescription(packageDetails.growthTypeCode())
            .orElse(nonNull(trimToNull(packageDetails.growthTypeCode())));
    String packageStatusDescription =
        repository
            .findPackageStatusDescription(packageDetails.packageStatusCode())
            .orElse(nonNull(trimToNull(packageDetails.packageStatusCode())));

    return new PermitPackageDetailsRpcResponseDto(
        true,
        nonNull(packageDetails.packageNumber()),
        formatVolume(packageDetails.packageVolume()),
        scaledVolume.doubleValue(),
        formatVolume(packageDetails.averageLength()),
        formatVolume(packageDetails.averageDiameter()),
        nonNull(trimToNull(packageDetails.packageStatusCode())),
        nonNull(packageDetails.comments()),
        packageStatusDescription,
        nonNull(trimToNull(packageDetails.reprocessedIndicator())),
        nonNull(growthTypeDescription));
  }

  @Override
  public PermitPackageListRpcResponseDto getPackageList(Long permitNumber) {
    List<String> packageList = repository.findPackageNumbersByPermitNumber(permitNumber);
    if (packageList.isEmpty()) {
      return new PermitPackageListRpcResponseDto(List.of("No Packages"));
    }
    return new PermitPackageListRpcResponseDto(packageList);
  }

  @Override
  public PermitPackageListRpcResponseDto getOicPackageList(Long permitNumber) {
    List<String> packageList = repository.findPackageNumbersByOicPermitNumber(permitNumber);
    if (packageList.isEmpty()) {
      return new PermitPackageListRpcResponseDto(List.of("No Packages"));
    }
    return new PermitPackageListRpcResponseDto(packageList);
  }

  @Override
  public PermitHasApplicationsRpcResponseDto getPermitHasApplications(Long permitNumber) {
    boolean hasApplications = !repository.findPackageNumbersByPermitNumber(permitNumber).isEmpty();
    return new PermitHasApplicationsRpcResponseDto(hasApplications);
  }

  @Override
  public PermitCountryListRpcResponseDto getCountryList() {
    List<PermitCountryItemRpcResponseDto> countries =
        repository.findAllCountryCodes().stream()
            .sorted(
                Comparator.comparingLong((CountryCodeRow row) -> sortGroup(row.groupBy()))
                    .thenComparingLong(CountryCodeRow::orderBy)
                    .thenComparing(row -> nonNull(trimToNull(row.code()))))
            .map(row -> new PermitCountryItemRpcResponseDto(nonNull(row.description()), nonNull(row.code())))
            .toList();
    return new PermitCountryListRpcResponseDto(countries);
  }

  @Override
  public PermitNumberAvailabilityRpcResponseDto checkPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitNumberAvailabilityRpcResponseDto(true);
    }
    return new PermitNumberAvailabilityRpcResponseDto(
        repository.findPermitPolicyContextByPermitNumber(permitNumber).isEmpty());
  }

  @Override
  public PermitApplicationListRpcResponseDto getApplicationList(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitApplicationListRpcResponseDto(List.of());
    }

    List<String> applications =
        repository.findApplicationNumbersByPermitNumber(permitNumber).stream()
            .map(String::valueOf)
            .toList();
    return new PermitApplicationListRpcResponseDto(applications);
  }

  @Override
  public PermitAvailableApplicationListRpcResponseDto getAvailableApplicationList(
      String exemptionNumber, String selectedApplicationsCsv) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return new PermitAvailableApplicationListRpcResponseDto(
          List.of(), "No applications are currently available.");
    }

    Set<String> selectedApplications = parseCsvSet(selectedApplicationsCsv);
    Map<Long, Boolean> hasUnassignedPermitByApplication = new LinkedHashMap<>();
    for (PackageCandidateRow row : repository.findPackagesByExemptionNumber(normalizedExemptionNumber)) {
      if (row.applicationNumber() == null || row.applicationNumber() < 1) {
        continue;
      }
      boolean hasUnassignedPermit =
          row.exportPermitNumber() == null || row.exportPermitNumber() < 1;
      hasUnassignedPermitByApplication.merge(
          row.applicationNumber(), hasUnassignedPermit, Boolean::logicalOr);
    }

    List<String> applicationList =
        hasUnassignedPermitByApplication.entrySet().stream()
            .filter(Map.Entry::getValue)
            .map(entry -> String.valueOf(entry.getKey()))
            .filter(applicationNumber -> !selectedApplications.contains(applicationNumber))
            .sorted()
            .toList();

    return new PermitAvailableApplicationListRpcResponseDto(
        applicationList,
        applicationList.isEmpty() ? "No applications are currently available." : null);
  }

  @Override
  public PermitAvailablePackageListRpcResponseDto getAvailablePackageList(
      String exemptionNumber, String selectedPackagesCsv) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return new PermitAvailablePackageListRpcResponseDto(
          List.of(), "No applications are currently available.");
    }

    Set<String> selectedPackages = parseCsvSet(selectedPackagesCsv);
    List<String> distinctPackages =
        repository.findPackagesByExemptionNumber(normalizedExemptionNumber).stream()
            .filter(row -> row.exportPermitNumber() == null || row.exportPermitNumber() < 1)
            .map(PackageCandidateRow::packageNumber)
            .map(TextUtils::trimToNull)
            .filter(java.util.Objects::nonNull)
            .filter(packageNumber -> !selectedPackages.contains(packageNumber))
            .distinct()
            .sorted()
            .toList();
    return new PermitAvailablePackageListRpcResponseDto(
        distinctPackages,
        distinctPackages.isEmpty() ? "No applications are currently available." : null);
  }

  @Override
  public PermitApprovedExemptionVolumeRpcResponseDto getApprovedExemptionVolume(
      String exemptionNumber) {
    double approvedVolume =
        exemptionService
            .findByExemptionNumber(exemptionNumber)
            .map(exemption -> exemption.approvedVolume())
            .orElse(0.0d);
    return new PermitApprovedExemptionVolumeRpcResponseDto(approvedVolume);
  }

  @Override
  public PermitExemptionVolumeRemainingRpcResponseDto getExemptionVolumeRemaining(
      String exemptionNumber) {
    double remainingVolume =
        exemptionService
            .findByExemptionNumber(exemptionNumber)
            .map(exemption -> exemption.remainingVolume())
            .orElse(0.0d);
    return new PermitExemptionVolumeRemainingRpcResponseDto(remainingVolume);
  }

  @Override
  public List<PermitGbmsInvoiceHistoryItemRpcResponseDto> getGbmsInvoiceHistory(
      String receiptNumber, Long permitNumber, boolean readOnlyUser) {
    return repository.findGbmsInvoiceHistory(receiptNumber, permitNumber, readOnlyUser).stream()
        .map(this::toGbmsInvoiceHistoryItem)
        .toList();
  }

  @Override
  public boolean hasFormChanges(PermitMutationRequestDto request) {
    if (request == null) {
      return false;
    }

    Long permitNumber = parsePositiveLong(request.permitNumber());
    if (permitNumber == null) {
      return false;
    }

    Optional<PermitMutationRow> storedPermitOptional =
        repository.findPermitMutationByPermitNumber(permitNumber);
    if (storedPermitOptional.isEmpty()) {
      return false;
    }

    PermitMutationRow storedPermit = storedPermitOptional.get();
    return hasStringChanged(storedPermit.permitStatusCode(), request.permitStatus())
        || hasDateChanged(storedPermit.expiryDate(), parseDate(request.permitExpiryDate()))
        || hasDateChanged(storedPermit.permitIssueDate(), parseDate(request.permitIssueDate()))
        || hasDateChanged(storedPermit.applicationDate(), parseDate(request.permitSubmitDate()))
        || hasLongChanged(
            storedPermit.orgUnitNo(),
            parseLongOrZero(firstNonNull(request.orgUnitNumber(), request.oicRegion())))
        || hasStringChanged(storedPermit.remarks(), request.permitRemarks())
        || hasStringChanged(storedPermit.destinationCompanyName(), request.destinationCompanyName())
        || hasStringChanged(storedPermit.countryCode(), request.destinationCountry())
        || hasStringChanged(storedPermit.transportTypeCode(), request.transportType())
        || hasStringChanged(storedPermit.transportName(), request.transportName())
        || hasDateChanged(
            storedPermit.estimatedShippingDate(), parseDate(request.estimatedShippingDate()))
        || hasStringChanged(storedPermit.portOfExportCode(), request.portOfExport())
        || hasStringChanged(storedPermit.receiptNumber(), request.permitReceiptNo())
        || hasLongChanged(storedPermit.numberOfPieces(), parseLongOrZero(request.permitNumberOfPieces()));
  }

  @Override
  public PermitMutationRpcResponseDto addPermit(PermitMutationRequestDto request, String userId) {
    String normalizedUserId = trimToNull(userId);
    List<String> errors = new ArrayList<>();
    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }

    String exemptionNumber = trimToNull(request.exemptionNumber());
    if (exemptionNumber == null) {
      errors.add("A valid exemption number is required.");
    }

    boolean blanketOic =
        exemptionNumber != null
            && exemptionService
                .findByExemptionNumber(exemptionNumber)
                .map(exemption -> exemption.blanketOic())
                .orElse(false);

    Long orgUnitNumber =
        parsePositiveLong(blanketOic ? firstNonNull(request.oicRegion(), request.orgUnitNumber()) : request.orgUnitNumber());
    if (orgUnitNumber == null) {
      errors.add("A valid region is required.");
    }

    String permitStatus = firstNonNull(trimToNull(request.permitStatus()), EXPORT_PERMIT_STATUS_ACTIVE);
    LocalDate submitDate = parseDate(request.permitSubmitDate());
    LocalDate issueDate = parseDate(request.permitIssueDate());
    LocalDate expiryDate = parseDate(request.permitExpiryDate());
    LocalDate receivedDate = blanketOic ? parseDate(request.permitRequestDate()) : submitDate;
    LocalDate estimatedShippingDate = parseDate(request.estimatedShippingDate());
    Double permitVolume = firstNonNull(parseDouble(request.permitTotalVolume()), 0.0d);
    Long numberOfPieces = firstNonNull(parsePositiveLong(request.permitNumberOfPieces()), 0L);
    Long oicRequestPieces = parsePositiveLong(request.oicPermitTotalPieces());
    Double oicRequestVolume = parseDouble(request.oicPermitTotalVolume());
    Long oicApplicationNumber = parsePositiveLong(request.oicApplicationNumber());

    String growthTypeCode =
        firstNonNull(trimToNull(request.packageAgeClass()), trimToNull(request.permitGrowthType()));
    String productTypeCode = trimToNull(request.packageProductType());

    String clientNumber = trimToNull(request.ownerClientNumber());
    String clientLocationCode = trimToNull(request.ownerClientLocation());
    String agentNumber = trimToNull(request.agentClientNumber());
    String agentLocationCode = trimToNull(request.agentClientLocation());

    if (!blanketOic && exemptionNumber != null) {
      List<Long> applicationNumbers = repository.findApplicationNumbersByExemptionNumber(exemptionNumber);
      if (!applicationNumbers.isEmpty()) {
        Optional<ApplicationInfoRow> firstApplication =
            repository.findApplicationInfoByNumber(applicationNumbers.get(0));
        if (firstApplication.isPresent()) {
          ApplicationInfoRow app = firstApplication.get();
          clientNumber = firstNonNull(clientNumber, trimToNull(app.ownerClientNumber()));
          clientLocationCode =
              firstNonNull(clientLocationCode, trimToNull(app.ownerClientLocationCode()));
          agentNumber = firstNonNull(agentNumber, trimToNull(app.agentClientNumber()));
          agentLocationCode =
              firstNonNull(agentLocationCode, trimToNull(app.agentClientLocationCode()));
          productTypeCode = firstNonNull(productTypeCode, trimToNull(app.productTypeCode()));
          growthTypeCode = firstNonNull(growthTypeCode, trimToNull(app.growthTypeCode()));
        }
      }

      Optional<LocalDate> exemptionExpiryDate =
          exemptionService.findByExemptionNumber(exemptionNumber).map(exemption -> exemption.expiryDate());
      if (exemptionExpiryDate.isPresent()) {
        expiryDate = exemptionExpiryDate.get();
      }
    }

    if (permitStatus == null) {
      errors.add("A valid permit status is required.");
    }
    if (issueDate == null) {
      errors.add("A valid permit issue date is required.");
    }
    if (submitDate == null) {
      errors.add("A valid permit submit date is required.");
    }
    if (!errors.isEmpty()) {
      return failureMutationResponse(errors, null);
    }

    Double overrideFee = parseDouble(request.overrideFee());
    String overrideComment = trimToNull(request.overrideComment());
    if ("false".equalsIgnoreCase(trimToNull(request.overrideInd()))) {
      overrideFee = null;
      overrideComment = null;
    }

    PermitMutationRow insertRow =
        new PermitMutationRow(
            null,
            trimToNull(request.destinationCompanyName()),
            trimToNull(request.transportName()),
            estimatedShippingDate,
            trimToNull(request.otherPortOfExport()),
            submitDate,
            receivedDate,
            issueDate,
            trimToNull(request.permitReceiptNo()),
            expiryDate,
            permitVolume,
            numberOfPieces,
            0L,
            null,
            trimToNull(request.permitRemarks()),
            normalizedUserId,
            null,
            trimToNull(request.transportType()),
            EXPORT_SCALE_METHOD_WEIGHT,
            clientNumber,
            clientLocationCode,
            agentNumber,
            agentLocationCode,
            exemptionNumber,
            orgUnitNumber,
            trimToNull(request.portOfExport()),
            permitStatus,
            growthTypeCode,
            trimToNull(request.destinationCountry()),
            overrideFee,
            overrideComment,
            oicApplicationNumber,
            oicRequestPieces,
            oicRequestVolume,
            productTypeCode);

    Optional<PermitMutationRow> inserted = repository.insertPermitDetail(insertRow, normalizedUserId);
    if (inserted.isEmpty() || inserted.get().permitNumber() == null) {
      return failureMutationResponse(List.of("Unable to save permit."), null);
    }

    PermitMutationRow permit = inserted.get();
    return new PermitMutationRpcResponseDto(
        true,
        "The permit was saved successfully.",
        List.of(),
        List.of(),
        permit.permitNumber(),
        permit.permitStatusCode(),
        permit.receiptNumber(),
        false,
        false,
        null);
  }

  @Override
  public PermitMutationRpcResponseDto updatePermit(PermitMutationRequestDto request, String userId) {
    String normalizedUserId = trimToNull(userId);
    Long permitNumber = parsePositiveLong(request.permitNumber());
    if (normalizedUserId == null) {
      return failureMutationResponse(List.of("A valid user identifier is required."), permitNumber);
    }
    if (permitNumber == null) {
      return failureMutationResponse(List.of("A valid permit number is required."), null);
    }

    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return failureMutationResponse(List.of("Permit not found."), permitNumber);
    }

    PermitMutationRow current = existing.get();
    Double overrideFee = parseDouble(request.overrideFee());
    String overrideComment = trimToNull(request.overrideComment());
    if ("false".equalsIgnoreCase(trimToNull(request.overrideInd()))) {
      overrideFee = null;
      overrideComment = null;
    } else {
      overrideFee = firstNonNull(overrideFee, current.overrideFee());
      overrideComment = firstNonNull(overrideComment, current.overrideComment());
    }

    PermitMutationRow updated =
        new PermitMutationRow(
            permitNumber,
            firstNonNull(trimToNull(request.destinationCompanyName()), current.destinationCompanyName()),
            firstNonNull(trimToNull(request.transportName()), current.transportName()),
            firstNonNull(parseDate(request.estimatedShippingDate()), current.estimatedShippingDate()),
            firstNonNull(trimToNull(request.otherPortOfExport()), current.otherPortOfExport()),
            firstNonNull(parseDate(request.permitSubmitDate()), current.applicationDate()),
            firstNonNull(parseDate(firstNonNull(request.permitRequestDate(), request.permitSubmitDate())), current.receivedDate()),
            firstNonNull(parseDate(request.permitIssueDate()), current.permitIssueDate()),
            firstNonNull(trimToNull(request.permitReceiptNo()), current.receiptNumber()),
            firstNonNull(parseDate(request.permitExpiryDate()), current.expiryDate()),
            firstNonNull(parseDouble(request.permitTotalVolume()), current.permitVolume()),
            firstNonNull(parsePositiveLong(request.permitNumberOfPieces()), current.numberOfPieces()),
            firstNonNull(current.feeInLieuVolume(), 0L),
            current.federalPermitNumber(),
            firstNonNull(trimToNull(request.permitRemarks()), current.remarks()),
            current.entryUserId(),
            current.entryTimestamp(),
            firstNonNull(trimToNull(request.transportType()), current.transportTypeCode()),
            firstNonNull(trimToNull(current.scaleMethodCode()), EXPORT_SCALE_METHOD_WEIGHT),
            firstNonNull(trimToNull(request.ownerClientNumber()), current.clientNumber()),
            firstNonNull(trimToNull(request.ownerClientLocation()), current.clientLocationCode()),
            firstNonNull(trimToNull(request.agentClientNumber()), current.agentNumber()),
            firstNonNull(trimToNull(request.agentClientLocation()), current.agentLocationCode()),
            firstNonNull(trimToNull(request.exemptionNumber()), current.exemptionNumber()),
            firstNonNull(parsePositiveLong(firstNonNull(request.orgUnitNumber(), request.oicRegion())), current.orgUnitNo()),
            firstNonNull(trimToNull(request.portOfExport()), current.portOfExportCode()),
            firstNonNull(trimToNull(request.permitStatus()), current.permitStatusCode()),
            firstNonNull(trimToNull(firstNonNull(request.packageAgeClass(), request.permitGrowthType())), current.growthTypeCode()),
            firstNonNull(trimToNull(request.destinationCountry()), current.countryCode()),
            overrideFee,
            overrideComment,
            firstNonNull(parsePositiveLong(request.oicApplicationNumber()), current.oicApplicationNumber()),
            firstNonNull(parsePositiveLong(request.oicPermitTotalPieces()), current.oicRequestPieces()),
            firstNonNull(parseDouble(request.oicPermitTotalVolume()), current.oicRequestVolume()),
            firstNonNull(trimToNull(request.packageProductType()), current.productTypeCode()));

    boolean saved = repository.updatePermitDetail(updated, normalizedUserId, null);
    if (!saved) {
      return failureMutationResponse(List.of("Unable to update permit."), permitNumber);
    }

    return new PermitMutationRpcResponseDto(
        true,
        "The permit was updated successfully.",
        List.of(),
        List.of(),
        permitNumber,
        updated.permitStatusCode(),
        updated.receiptNumber(),
        false,
        false,
        null);
  }

  @Override
  public PermitMutationRpcResponseDto updateShipping(PermitMutationRequestDto request, String userId) {
    String normalizedUserId = trimToNull(userId);
    Long permitNumber = parsePositiveLong(request.permitNumber());
    if (normalizedUserId == null) {
      return failureMutationResponse(List.of("A valid user identifier is required."), permitNumber);
    }
    if (permitNumber == null) {
      return failureMutationResponse(List.of("A valid permit number is required."), null);
    }

    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return failureMutationResponse(List.of("Permit not found."), permitNumber);
    }

    String rawShippingDate = trimToNull(request.estimatedShippingDate());
    LocalDate parsedShippingDate = parseDate(rawShippingDate);
    if (rawShippingDate != null && parsedShippingDate == null) {
      return failureMutationResponse(List.of("Invalid Date Format"), permitNumber);
    }

    PermitMutationRow current = existing.get();
    PermitMutationRow updated =
        new PermitMutationRow(
            permitNumber,
            firstNonNull(trimToNull(request.destinationCompanyName()), current.destinationCompanyName()),
            firstNonNull(trimToNull(request.transportName()), current.transportName()),
            firstNonNull(parsedShippingDate, current.estimatedShippingDate()),
            firstNonNull(trimToNull(request.otherPortOfExport()), current.otherPortOfExport()),
            current.applicationDate(),
            current.receivedDate(),
            current.permitIssueDate(),
            current.receiptNumber(),
            current.expiryDate(),
            current.permitVolume(),
            current.numberOfPieces(),
            firstNonNull(current.feeInLieuVolume(), 0L),
            current.federalPermitNumber(),
            current.remarks(),
            current.entryUserId(),
            current.entryTimestamp(),
            firstNonNull(trimToNull(request.transportType()), current.transportTypeCode()),
            firstNonNull(trimToNull(current.scaleMethodCode()), EXPORT_SCALE_METHOD_WEIGHT),
            current.clientNumber(),
            current.clientLocationCode(),
            current.agentNumber(),
            current.agentLocationCode(),
            current.exemptionNumber(),
            current.orgUnitNo(),
            firstNonNull(trimToNull(request.portOfExport()), current.portOfExportCode()),
            current.permitStatusCode(),
            current.growthTypeCode(),
            firstNonNull(trimToNull(request.destinationCountry()), current.countryCode()),
            current.overrideFee(),
            current.overrideComment(),
            current.oicApplicationNumber(),
            current.oicRequestPieces(),
            current.oicRequestVolume(),
            current.productTypeCode());

    boolean saved = repository.updatePermitDetail(updated, normalizedUserId, null);
    if (!saved) {
      return failureMutationResponse(List.of("Unable to save permit."), permitNumber);
    }

    return new PermitMutationRpcResponseDto(
        true,
        "The permit was saved successfully.",
        List.of(),
        List.of(),
        permitNumber,
        updated.permitStatusCode(),
        updated.receiptNumber(),
        false,
        false,
        null);
  }

  @Override
  public PermitPersistenceRpcResponseDto updateScaleAttachment(
      String scaleDetailId, Long permitNumber, boolean attachInd, String userId) {
    String normalizedUserId = trimToNull(userId);
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedUserId == null) {
      return failurePersistenceResponse(List.of("A valid user identifier is required."), permitNumber);
    }
    if (permitNumber == null || permitNumber < 1) {
      return failurePersistenceResponse(List.of("A valid permit number is required."), permitNumber);
    }
    if (normalizedScaleDetailId == null) {
      return failurePersistenceResponse(List.of("A valid scale detail id is required."), permitNumber);
    }

    Optional<ScaleMutationRow> existing = repository.findScaleMutationById(normalizedScaleDetailId);
    if (existing.isEmpty()) {
      return failurePersistenceResponse(List.of("Scale detail not found."), permitNumber);
    }

    ScaleMutationRow scale = existing.get();
    Long currentPermitNumber = scale.exportPermitDetailNumber();
    Long targetPermitNumber;
    if (attachInd) {
      if (currentPermitNumber != null && !permitNumber.equals(currentPermitNumber)) {
        return failurePersistenceResponse(
            List.of("Scale detail is already assigned to another permit."), permitNumber);
      }
      targetPermitNumber = permitNumber;
    } else {
      if (currentPermitNumber == null || !permitNumber.equals(currentPermitNumber)) {
        return failurePersistenceResponse(
            List.of("Scale detail is not assigned to this permit."), permitNumber);
      }
      targetPermitNumber = null;
    }

    ScaleMutationRecord updatedScale =
        new ScaleMutationRecord(
            scale.scaleDetailId(),
            scale.timberMark(),
            scale.piecesCount(),
            scale.speciesGradeVolume(),
            scale.packageNumber(),
            scale.exportSpeciesCode(),
            scale.exportGradeCode(),
            targetPermitNumber,
            scale.entryUserId(),
            scale.entryTimestamp());

    if (!repository.updateScaleDetail(updatedScale, normalizedUserId)) {
      return failurePersistenceResponse(List.of("Unable to update scale detail."), permitNumber);
    }
    updatePermitTotals(permitNumber, normalizedUserId);

    return new PermitPersistenceRpcResponseDto(
        true,
        attachInd ? "Scale detail was added to the permit." : "Scale detail was removed from the permit.",
        List.of(),
        List.of(),
        permitNumber);
  }

  @Override
  public PermitPersistenceRpcResponseDto addApplicationsToPermit(
      Long permitNumber, String selectedApplicationsCsv, String userId) {
    String normalizedUserId = trimToNull(userId);
    List<Long> applicationNumbers =
        parseCsvSet(selectedApplicationsCsv).stream()
            .map(ca.bc.gov.mof.lexis.util.ValueUtils::parsePositiveLong)
            .filter(java.util.Objects::nonNull)
            .toList();

    List<String> validationErrors =
        validateApplicationAssociationRequest(permitNumber, normalizedUserId, applicationNumbers);
    if (!validationErrors.isEmpty()) {
      return failurePersistenceResponse(validationErrors, permitNumber);
    }

    List<String> errors = new ArrayList<>();
    int attachedScaleCount = 0;
    for (Long applicationNumber : applicationNumbers) {
      boolean applicationHadScaleAttached = false;
      for (ScaleMutationRow scale : repository.findScaleMutationDetailsByApplicationNumber(applicationNumber)) {
        if (scale.exportPermitDetailNumber() != null) {
          continue;
        }
        if (!updateScalePermitAssignment(scale, permitNumber, normalizedUserId)) {
          errors.add("Unable to add application " + applicationNumber + " to the permit.");
          break;
        }
        applicationHadScaleAttached = true;
        attachedScaleCount++;
      }

      if (applicationHadScaleAttached
          && !applicationReviewRepository.updateStatus(
              applicationNumber, APPLICATION_STATUS_PERMITTED, null, normalizedUserId)) {
        errors.add("Unable to update application " + applicationNumber + " status.");
      }
    }

    if (!errors.isEmpty()) {
      return failurePersistenceResponse(errors, permitNumber);
    }

    updatePermitTotals(permitNumber, normalizedUserId);
    return new PermitPersistenceRpcResponseDto(
        true,
        attachedScaleCount == 1
            ? "Application scale row was added to the permit."
            : "Application scale rows were added to the permit.",
        List.of(),
        List.of(),
        permitNumber);
  }

  @Override
  public PermitPersistenceRpcResponseDto removeApplicationFromPermit(
      Long permitNumber, Long applicationNumber, String userId) {
    String normalizedUserId = trimToNull(userId);
    if (normalizedUserId == null) {
      return failurePersistenceResponse(List.of("A valid user identifier is required."), permitNumber);
    }
    if (permitNumber == null || permitNumber < 1) {
      return failurePersistenceResponse(List.of("A valid permit number is required."), permitNumber);
    }
    if (applicationNumber == null || applicationNumber < 1) {
      return failurePersistenceResponse(List.of("A valid application number is required."), permitNumber);
    }

    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return failurePersistenceResponse(List.of("Permit not found."), permitNumber);
    }
    PermitMutationRow permit = existing.get();
    if (isBlanketOicPermit(permit)) {
      return failurePersistenceResponse(
          List.of("Application associations are not changed this way for Blanket OIC permits."), permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(trimToNull(permit.permitStatusCode()))) {
      return failurePersistenceResponse(
          List.of("Applications cannot be changed for a completed permit."), permitNumber);
    }

    int removedScaleCount = 0;
    for (ScaleMutationRow scale : repository.findScaleMutationDetailsByApplicationNumber(applicationNumber)) {
      if (!permitNumber.equals(scale.exportPermitDetailNumber())) {
        continue;
      }
      if (!updateScalePermitAssignment(scale, null, normalizedUserId)) {
        return failurePersistenceResponse(
            List.of("Unable to remove application " + applicationNumber + " from the permit."), permitNumber);
      }
      removedScaleCount++;
    }

    updatePermitTotals(permitNumber, normalizedUserId);
    return new PermitPersistenceRpcResponseDto(
        true,
        removedScaleCount == 1
            ? "Application scale row was removed from the permit."
            : "Application scale rows were removed from the permit.",
        List.of(),
        List.of(),
        permitNumber);
  }

  @Override
  public PermitPersistenceRpcResponseDto addBlanketOicScale(
      Long permitNumber,
      String packageNumber,
      String timberMark,
      String scaleVolume,
      Long scalePieces,
      String speciesCode,
      String gradeCode,
      String userId) {
    String normalizedUserId = trimToNull(userId);
    String normalizedPackageNumber = trimToNull(packageNumber);
    String normalizedTimberMark = trimToNull(timberMark);
    String normalizedSpeciesCode = trimToNull(speciesCode);
    String normalizedGradeCode = trimToNull(gradeCode);
    Double normalizedVolume = parseDouble(scaleVolume);
    List<String> errors = new ArrayList<>();

    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }
    if (permitNumber == null || permitNumber < 1) {
      errors.add("A valid permit number is required.");
    }
    if (normalizedPackageNumber == null) {
      errors.add("A valid package number is required.");
    }
    if (normalizedTimberMark == null) {
      errors.add("A valid timber mark is required.");
    }
    if (normalizedSpeciesCode == null) {
      errors.add("A valid species code is required.");
    }
    if (normalizedGradeCode == null) {
      errors.add("A valid grade code is required.");
    }
    if (scalePieces == null || scalePieces < 1) {
      errors.add("A valid pieces count is required.");
    }
    if (normalizedVolume == null || normalizedVolume <= 0.0d) {
      errors.add("A valid scale volume is required.");
    }
    if (!errors.isEmpty()) {
      return failurePersistenceResponse(errors, permitNumber);
    }

    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return failurePersistenceResponse(List.of("Permit not found."), permitNumber);
    }

    PermitMutationRow current = existing.get();
    if (!isBlanketOicPermit(current)) {
      return failurePersistenceResponse(
          List.of("Scale rows can only be added here for Blanket OIC permits."), permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(trimToNull(current.permitStatusCode()))) {
      return failurePersistenceResponse(
          List.of("Scale rows cannot be changed for a completed permit."), permitNumber);
    }
    if (current.oicApplicationNumber() == null || current.oicApplicationNumber() < 1) {
      return failurePersistenceResponse(
          List.of("The permit does not have an OIC application number."), permitNumber);
    }
    if (!repository.findPackageNumbersByOicPermitNumber(permitNumber).contains(normalizedPackageNumber)) {
      return failurePersistenceResponse(
          List.of("Package is not available for this Blanket OIC permit."), permitNumber);
    }

    Double fixedExemptionRate =
        repository.findFixedExemptionRate(current.exemptionNumber()).map(BigDecimal::doubleValue).orElse(null);
    Optional<PermitScaleDetailRow> inserted =
        repository.insertBoicScaleDetail(
            new BoicScaleMutationRecord(
                normalizedTimberMark,
                scalePieces,
                normalizedVolume,
                normalizedPackageNumber,
                normalizedSpeciesCode,
                normalizedGradeCode,
                current.oicApplicationNumber(),
                permitNumber,
                fixedExemptionRate,
                normalizedUserId,
                new Timestamp(System.currentTimeMillis())));

    if (inserted.isEmpty()) {
      return failurePersistenceResponse(List.of("Unable to add Blanket OIC scale detail."), permitNumber);
    }

    updatePermitTotals(permitNumber, normalizedUserId);
    return new PermitPersistenceRpcResponseDto(
        true, "Blanket OIC scale detail was added.", List.of(), List.of(), permitNumber);
  }

  @Override
  public PermitPersistenceRpcResponseDto deleteBlanketOicScale(
      String scaleDetailId, Long permitNumber, String userId) {
    String normalizedUserId = trimToNull(userId);
    String normalizedScaleDetailId = trimToNull(scaleDetailId);
    if (normalizedUserId == null) {
      return failurePersistenceResponse(List.of("A valid user identifier is required."), permitNumber);
    }
    if (permitNumber == null || permitNumber < 1) {
      return failurePersistenceResponse(List.of("A valid permit number is required."), permitNumber);
    }
    if (normalizedScaleDetailId == null) {
      return failurePersistenceResponse(List.of("A valid scale detail id is required."), permitNumber);
    }

    Optional<PermitMutationRow> existingPermit = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existingPermit.isEmpty()) {
      return failurePersistenceResponse(List.of("Permit not found."), permitNumber);
    }

    PermitMutationRow currentPermit = existingPermit.get();
    if (!isBlanketOicPermit(currentPermit)) {
      return failurePersistenceResponse(
          List.of("Scale rows can only be removed here for Blanket OIC permits."), permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(trimToNull(currentPermit.permitStatusCode()))) {
      return failurePersistenceResponse(
          List.of("Scale rows cannot be changed for a completed permit."), permitNumber);
    }

    Optional<ScaleMutationRow> existingScale = repository.findScaleMutationById(normalizedScaleDetailId);
    if (existingScale.isEmpty()) {
      return failurePersistenceResponse(List.of("Scale detail not found."), permitNumber);
    }

    Long scalePermitNumber = existingScale.get().exportPermitDetailNumber();
    if (!permitNumber.equals(scalePermitNumber)) {
      return failurePersistenceResponse(
          List.of("Scale detail is not assigned to this permit."), permitNumber);
    }

    if (!repository.deleteScaleDetailById(normalizedScaleDetailId, normalizedUserId)) {
      return failurePersistenceResponse(List.of("Unable to remove Blanket OIC scale detail."), permitNumber);
    }

    updatePermitTotals(permitNumber, normalizedUserId);
    return new PermitPersistenceRpcResponseDto(
        true, "Blanket OIC scale detail was removed.", List.of(), List.of(), permitNumber);
  }

  @Override
  public PermitPersistenceRpcResponseDto addInvoice(
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal invoiceExportValue,
      BigDecimal invoiceConversionRate,
      BigDecimal invoiceFeeInLieu,
      String userId) {
    List<String> errors = new ArrayList<>();
    String normalizedSalesInvoiceNumber = trimToNull(salesInvoiceNumber);

    if (permitNumber == null || permitNumber < 1) {
      errors.add("A valid permit number is required.");
    }
    if (normalizedSalesInvoiceNumber == null) {
      errors.add("A valid sales invoice number is required.");
    } else if (normalizedSalesInvoiceNumber.length() > MAX_SALES_INVOICE_NUMBER_LENGTH) {
      errors.add(
          "The sales invoice number must be "
              + MAX_SALES_INVOICE_NUMBER_LENGTH
              + " characters or fewer.");
    }
    if (invoiceExportValue == null || invoiceExportValue.compareTo(BigDecimal.ZERO) <= 0) {
      errors.add("A valid export value is required.");
    }
    if (invoiceConversionRate == null || invoiceConversionRate.compareTo(BigDecimal.ZERO) <= 0) {
      errors.add("A valid currency conversion rate is required.");
    }
    if (invoiceFeeInLieu == null || invoiceFeeInLieu.compareTo(BigDecimal.ZERO) <= 0) {
      errors.add("A valid fee in lieu is required.");
    }
    if (!errors.isEmpty()) {
      return new PermitPersistenceRpcResponseDto(
          false, "", errors, List.of(), permitNumber);
    }

    if (repository.findSalesInvoiceByNumberAndPermit(normalizedSalesInvoiceNumber, permitNumber).isPresent()) {
      return new PermitPersistenceRpcResponseDto(
          false,
          "",
          List.of("Sales invoice " + normalizedSalesInvoiceNumber + " already exists."),
          List.of(),
          permitNumber);
    }

    Optional<SalesInvoiceRow> inserted =
        repository.insertSalesInvoice(
            permitNumber,
            normalizedSalesInvoiceNumber,
            invoiceExportValue,
            invoiceConversionRate,
            invoiceFeeInLieu,
            trimToNull(userId));
    if (inserted.isEmpty()) {
      return new PermitPersistenceRpcResponseDto(
          false,
          "",
          List.of("Unable to save sales invoice."),
          List.of(),
          permitNumber);
    }

    return new PermitPersistenceRpcResponseDto(
        true,
        "The sales invoice was saved successfully.",
        List.of(),
        List.of(),
        permitNumber);
  }

  @Override
  public PermitInvoiceListRpcResponseDto getInvoicesForPermit(Long permitNumber) {
    return new PermitInvoiceListRpcResponseDto(repository.findInvoiceNumbersByPermit(permitNumber));
  }

  @Override
  public PermitInvoiceDetailsRpcResponseDto getInvoiceDetails(
      Long permitNumber, String salesInvoiceNumber) {
    Optional<SalesInvoiceRow> invoice =
        repository.findSalesInvoiceByNumberAndPermit(salesInvoiceNumber, permitNumber);
    if (invoice.isEmpty()) {
      return new PermitInvoiceDetailsRpcResponseDto(false, "", "", "");
    }

    SalesInvoiceRow row = invoice.get();
    BigDecimal rateToCad = BigDecimal.valueOf(row.currencyConversionRate());
    BigDecimal feeCad = rateToCad.multiply(BigDecimal.valueOf(row.feeInLieu()));
    BigDecimal valueCad = rateToCad.multiply(BigDecimal.valueOf(row.exportValue()));

    return new PermitInvoiceDetailsRpcResponseDto(
        true,
        formatDecimal(rateToCad, 2),
        formatCurrency(feeCad),
        formatCurrency(valueCad));
  }

  @Override
  public PermitConversionRateRpcResponseDto getConversionRate() {
    Optional<Double> conversionRate = repository.findCurrencyConversionRateByDate(LocalDate.now(), "USD");
    if (conversionRate.isEmpty()) {
      return new PermitConversionRateRpcResponseDto(false, "");
    }

    return new PermitConversionRateRpcResponseDto(
        true, formatDecimal(BigDecimal.valueOf(conversionRate.get()), 2));
  }

  @Override
  public List<PermitFileTypeRpcResponseDto> getFileTypes() {
    return repository.findAllAttachmentTypes().stream()
        .sorted(
            Comparator.comparingLong((AttachmentTypeRow row) -> sortGroup(row.groupBy()))
                .thenComparingLong(AttachmentTypeRow::orderBy)
                .thenComparing(row -> nonNull(trimToNull(row.code()))))
        .map(row -> new PermitFileTypeRpcResponseDto(nonNull(row.code()), nonNull(row.description())))
        .toList();
  }

  @Override
  public List<PermitDocumentItemRpcResponseDto> getDocumentDetails(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    List<DocumentRow> allDocuments = new ArrayList<>();
    allDocuments.addAll(repository.findPermitDocumentDetailsByPermitNumber(permitNumber));

    List<Long> applicationNumbers =
        repository.findApplicationNumbersByPermitNumber(permitNumber).stream()
            .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
            .distinct()
            .toList();

    for (Long applicationNumber : applicationNumbers) {
      allDocuments.addAll(repository.findApplicationDocumentDetailsByApplicationNumber(applicationNumber));
    }

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    return allDocuments.stream()
        .map(
            row ->
                new PermitDocumentItemRpcResponseDto(
                    nonNull(row.fileName()),
                    nonNull(row.description()),
                    resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode),
                    nonNull(trimToNull(row.attachmentTypeCode())),
                    row.id()))
        .toList();
  }

  @Override
  public Optional<DocumentContent> getDocument(Long fileId) {
    return repository.findFileAttachmentBytes(fileId).map(DocumentContent::new);
  }

  @Override
  public boolean removePermitDocument(Long documentId) {
    return repository.deletePermitFile(documentId);
  }

  @Override
  public boolean removeApplicationDocument(Long documentId) {
    return repository.deleteApplicationFile(documentId);
  }

  @Override
  public boolean removeInvoiceDocument(Long documentId) {
    return repository.deleteInvoiceFile(documentId);
  }

  private PermitPackageInfoRpcResponseDto emptyPackageInfo() {
    return new PermitPackageInfoRpcResponseDto("", "", "", "", "", "", "");
  }

  private PermitPackageDetailsRpcResponseDto emptyPackageDetails() {
    return new PermitPackageDetailsRpcResponseDto(
        false, "", "", 0.0d, "", "", "", "", "", "", "");
  }

  private String buildApplicationEndUseSort(ApplicationInfoRow applicationInfo) {
    String endUseSort = trimToNull(applicationInfo.endUseSort());
    if (endUseSort != null) {
      return endUseSort;
    }

    List<EndUsePairRow> endUses = repository.findEndUsesByApplicationNumber(applicationInfo.applicationNumber());
    if (endUses.isEmpty()) {
      return "";
    }

    EndUsePairRow firstEndUse = endUses.get(0);
    List<String> candidateExcolCodes =
        repository.findCandidateExcolCodes(
            endUses.size(),
            firstEndUse.speciesCode(),
            firstEndUse.endUseCode(),
            applicationInfo.orgUnitNo());

    if (candidateExcolCodes.size() == 1) {
      return candidateExcolCodes.get(0);
    }

    for (String excolCode : candidateExcolCodes) {
      boolean candidateMatches = true;
      for (EndUsePairRow endUse : endUses) {
        String speciesCode = trimToNull(endUse.speciesCode());
        if (speciesCode == null || !excolCode.contains(speciesCode)) {
          candidateMatches = false;
          break;
        }

        if (!EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(trimToNull(applicationInfo.productTypeCode()))
            && !excolCode.contains(nonNull(firstEndUse.endUseCode()))) {
          candidateMatches = false;
          break;
        }
      }

      if (candidateMatches) {
        return excolCode;
      }
    }

    return buildLegacyPackageEndUseSort(endUses);
  }

  private String buildBlanketPackageEndUseSort(String packageNumber) {
    return buildLegacyPackageEndUseSort(repository.findEndUsesByPackageNumber(packageNumber));
  }

  private String buildLegacyPackageEndUseSort(List<EndUsePairRow> endUses) {
    String endUseSort = "";
    for (EndUsePairRow endUse : endUses) {
      endUseSort = nonNull(endUse.speciesCode()) + "/" + nonNull(endUse.endUseCode()) + "\n";
    }
    return endUseSort;
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = trimToNull(attachmentTypeCode);
    if (normalizedCode == null) {
      return "";
    }

    String known = attachmentTypeByCode.get(normalizedCode);
    if (known != null) {
      return known;
    }

    String resolved = repository.findAttachmentTypeDescription(normalizedCode).orElse(normalizedCode);
    attachmentTypeByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String resolveRegionForApplication(
      Long applicationNumber, Map<Long, String> regionByApplication) {
    if (applicationNumber == null || applicationNumber < 1) {
      return "";
    }
    String cached = regionByApplication.get(applicationNumber);
    if (cached != null) {
      return cached;
    }

    String resolved =
        repository
            .findApplicationInfoByNumber(applicationNumber)
            .map(ApplicationInfoRow::regionName)
            .map(this::nonNull)
            .orElse("");
    regionByApplication.put(applicationNumber, resolved);
    return resolved;
  }

  private String resolveSpeciesDescription(String speciesCode, Map<String, String> speciesDescriptionByCode) {
    String normalizedCode = trimToNull(speciesCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = speciesDescriptionByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }

    String resolved = repository.findSpeciesDescription(normalizedCode).orElse(normalizedCode);
    speciesDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String resolveGradeDescription(String gradeCode, Map<String, String> gradeDescriptionByCode) {
    String normalizedCode = trimToNull(gradeCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = gradeDescriptionByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }

    String resolved = repository.findGradeDescription(normalizedCode).orElse(normalizedCode);
    gradeDescriptionByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private PermitGbmsInvoiceHistoryItemRpcResponseDto toGbmsInvoiceHistoryItem(
      GbmsInvoiceHistoryRow row) {
    return new PermitGbmsInvoiceHistoryItemRpcResponseDto(
        nonNull(row.invoiceNumber()),
        nonNull(row.cancelledByInvoice()),
        nonNull(row.replacedByInvoice()),
        formatDecimal(BigDecimal.valueOf(row.invoiceAmount()), 2),
        formatDate(row.printedDate()),
        formatDate(row.entryDate()),
        formatDate(row.updateDate()));
  }

  private String formatDate(LocalDate value) {
    return value == null ? "" : LEGACY_DATE_FORMATTER.format(value);
  }

  private long sortGroup(long groupBy) {
    return groupBy == 0L ? 9999L : groupBy;
  }

  private PermitRpcScaleItemDto toSummaryScaleItem(
      PermitScaleDetailRow scale,
      String permitNumber,
      boolean ministryUser,
      BigDecimal fee,
      BigDecimal amv) {
    return new PermitRpcScaleItemDto(
        nonNull(scale.timberMark()),
        nonNull(scale.exportSpeciesCode()),
        nonNull(scale.exportGradeCode()),
        formatDecimal(amv, 2),
        formatVolume(scale.speciesGradeVolume()),
        ministryUser,
        nonNull(scale.ewb()),
        scale.piecesCount(),
        nonNull(scale.fil()),
        nonNull(scale.mf()),
        formatCurrency(fee),
        nonNull(scale.cascadeSplitCode()),
        nonNull(scale.exportScaleDetailId()),
        trimToNull(scale.exportPermitDetailNumber()) == null ? "" : permitNumber);
  }

  private String resolveGrowthType(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return "";
    }

    String growthTypeCode =
        applicationService
            .findPackageByPackageNumber(normalizedPackageNumber)
            .map(LexisPackageLookupDto::growthTypeCode)
            .map(TextUtils::trimToNull)
            .orElse(null);
    if (growthTypeCode == null) {
      return "";
    }
    return repository.findGrowthTypeDescription(growthTypeCode).orElse(growthTypeCode);
  }

  private BigDecimal sumFees(List<PermitScaleDetailRow> scales, FeeCalculationContext context) {
    BigDecimal total = BigDecimal.ZERO;
    for (PermitScaleDetailRow scale : scales) {
      total = total.add(calculateRoundedFeeForScale(scale, context));
    }
    return total;
  }

  private BigDecimal calculateRoundedFeeForScale(
      PermitScaleDetailRow scale, FeeCalculationContext context) {
    return calculateFeeForScale(scale, context).setScale(2, RoundingMode.HALF_UP);
  }

  private BigDecimal calculateFeeForScale(PermitScaleDetailRow scale, FeeCalculationContext context) {
    if (trimToNull(scale.exportPermitDetailNumber()) == null) {
      return BigDecimal.ZERO;
    }

    BigDecimal volume = BigDecimal.valueOf(scale.speciesGradeVolume());
    boolean ministerialPostTwoEleven =
        isMinisterialPostTwoElevenCoastalRule(scale, context.permitApplicationDate(), context);

    if (ministerialPostTwoEleven) {
      if (context.fixedExemptionRate() != null) {
        return volume.multiply(context.fixedExemptionRate());
      }
      if (isApplicationUnmanufactured(scale.applicationNumber(), context)) {
        return volume;
      }
      if (isPostTwoElevenCoastalEligible(scale.exportGradeCode(), context.orgUnitNo())) {
        BigDecimal amv = getAverageMarketValueForScale(scale, context);
        return calculateFeeWithFilAndMf(amv, volume, scale.fil(), scale.mf());
      }
      return BigDecimal.ZERO;
    }

    if (context.fixedExemptionRate() != null) {
      return volume.multiply(context.fixedExemptionRate());
    }

    BigDecimal scaleFee;
    if (isApplicationUnmanufactured(scale.applicationNumber(), context)) {
      scaleFee = volume;
    } else if (isGeneralCoastalRegion(context.orgUnitNo())) {
      if (DECIDUOUS_SPECIES_CODES.contains(normalizeCode(scale.exportSpeciesCode()))) {
        scaleFee = volume;
      } else {
        BigDecimal amv = getAverageMarketValueForScale(scale, context);
        BigDecimal feePercentage = rcoFeePercentage(scale.exportSpeciesCode(), scale.exportGradeCode());
        if (amv.multiply(feePercentage).compareTo(BigDecimal.ONE) < 0) {
          scaleFee = volume;
        } else {
          scaleFee = amv.multiply(feePercentage).multiply(volume);
        }
      }
    } else {
      scaleFee = volume;
    }

    BigDecimal policyIncrease = context.feePolicyPercentIncrease();
    return scaleFee.add(scaleFee.multiply(policyIncrease).divide(ONE_HUNDRED, 8, RoundingMode.HALF_UP));
  }

  private BigDecimal calculateFeeWithFilAndMf(
      BigDecimal amv, BigDecimal volume, String filValue, String mfValue) {
    BigDecimal fil = parseDecimal(filValue);
    BigDecimal mf = parseDecimal(mfValue);

    if (fil != null && mf != null) {
      BigDecimal fee = amv.multiply(fil.divide(ONE_HUNDRED, 8, RoundingMode.HALF_UP)).multiply(volume);
      if (mf.compareTo(BigDecimal.ZERO) != 0) {
        return fee.add(fee.multiply(mf).divide(ONE_HUNDRED, 8, RoundingMode.HALF_UP));
      }
      return fee;
    }

    if (fil != null) {
      return amv.multiply(fil.divide(ONE_HUNDRED, 8, RoundingMode.HALF_UP)).multiply(volume);
    }

    if (mf != null) {
      BigDecimal fee = amv.multiply(volume);
      if (mf.compareTo(BigDecimal.ZERO) != 0) {
        return fee.add(fee.multiply(mf).divide(ONE_HUNDRED, 8, RoundingMode.HALF_UP));
      }
      return fee;
    }

    return amv.multiply(volume);
  }

  private boolean shouldMaskFees(String countryCode, LocalDate applicationDate) {
    String normalizedCountryCode = trimToNull(countryCode);
    return "CA".equalsIgnoreCase(normalizedCountryCode)
        && applicationDate != null
        && !applicationDate.isBefore(FEE_MASK_EFFECTIVE_DATE);
  }

  private boolean shouldMaskScaleFeesForPackageView(FeeCalculationContext context) {
    if (context.overrideFee() > 0.0d) {
      return true;
    }
    return isCanadaCountryCode(context.exportCountryCode())
        && context.permitApplicationDate() != null
        && !context.permitApplicationDate().isBefore(FEE_MASK_EFFECTIVE_DATE);
  }

  private boolean shouldMaskTotalFeeForPackage(FeeCalculationContext context) {
    if (context.permitApplicationDate() != null
        && context.permitApplicationDate().isBefore(FEE_MASK_EFFECTIVE_DATE)) {
      return true;
    }
    return shouldMaskScaleFeesForPackageView(context);
  }

  private BigDecimal getAverageMarketValueForScale(
      PermitScaleDetailRow scale, FeeCalculationContext context) {
    if (trimToNull(scale.exportPermitDetailNumber()) == null) {
      return BigDecimal.ZERO;
    }

    String species = normalizeCode(scale.exportSpeciesCode());
    if (DECIDUOUS_SPECIES_CODES.contains(species)) {
      return BigDecimal.ONE;
    }

    String scaleId = trimToNull(scale.exportScaleDetailId());
    if (scaleId == null) {
      return BigDecimal.ZERO;
    }

    if (context.amvByScaleId().containsKey(scaleId)) {
      return context.amvByScaleId().get(scaleId);
    }

    BigDecimal amv = repository.findAverageMarketValueByScaleId(scaleId).orElse(BigDecimal.ZERO);
    context.amvByScaleId().put(scaleId, amv);
    return amv;
  }

  private BigDecimal getScaleDisplayAmv(PermitScaleDetailRow scale, FeeCalculationContext context) {
    if ("B".equalsIgnoreCase(context.exemptionTypeCode()) && context.fixedExemptionRate() != null) {
      return context.fixedExemptionRate().setScale(2, RoundingMode.HALF_UP);
    }
    return getAverageMarketValueForScale(scale, context).setScale(2, RoundingMode.HALF_UP);
  }

  private boolean isApplicationUnmanufactured(Long applicationNumber, FeeCalculationContext context) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    if (context.unmanufacturedByApplicationNumber().containsKey(applicationNumber)) {
      return context.unmanufacturedByApplicationNumber().get(applicationNumber);
    }

    boolean unmanufactured = repository.isApplicationUnmanufactured(applicationNumber);
    context.unmanufacturedByApplicationNumber().put(applicationNumber, unmanufactured);
    return unmanufactured;
  }

  private boolean isMinisterialPostTwoElevenCoastalRule(
      PermitScaleDetailRow scale, LocalDate permitApplicationDate, FeeCalculationContext context) {
    return permitApplicationDate != null
        && !permitApplicationDate.isBefore(FEE_MASK_EFFECTIVE_DATE)
        && EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(context.exemptionTypeCode())
        && isPostTwoElevenCoastalEligible(scale.exportGradeCode(), context.orgUnitNo());
  }

  private boolean isPostTwoElevenCoastalEligible(String gradeCode, Long orgUnitNo) {
    if (orgUnitNo == null) {
      return false;
    }
    return orgUnitNo == RCO_REGION_CODE
        || orgUnitNo == RSC_REGION_CODE
        || orgUnitNo == RWC_REGION_CODE
        || (orgUnitNo == RSK_REGION_CODE && isRskNonZGrade(gradeCode));
  }

  private boolean isGeneralCoastalRegion(Long orgUnitNo) {
    if (orgUnitNo == null) {
      return false;
    }
    return orgUnitNo == RCO_REGION_CODE
        || orgUnitNo == RSK_REGION_CODE
        || orgUnitNo == RSC_REGION_CODE
        || orgUnitNo == RWC_REGION_CODE;
  }

  private boolean isRskNonZGrade(String gradeCode) {
    String normalizedGrade = normalizeCode(gradeCode);
    return normalizedGrade != null && RSK_NON_Z_GRADE_PATTERN.matcher(normalizedGrade).matches();
  }

  private BigDecimal rcoFeePercentage(String speciesCode, String gradeCode) {
    String species = normalizeCode(speciesCode);
    String grade = normalizeCode(gradeCode);
    if (SPECIES_FIR.equals(species)) {
      return BigDecimal.valueOf(0.15d);
    }
    if (LOW_CONIFEROUS_GRADE_CODES.contains(grade)) {
      return BigDecimal.valueOf(0.05d);
    }
    return BigDecimal.valueOf(0.10d);
  }

  private FeeCalculationContext buildFeeContext(
      Long permitNumber, String countryCode, String applicationDate) {
    PermitPolicyContextRow permitContext =
        repository.findPermitPolicyContextByPermitNumber(permitNumber).orElse(null);

    LocalDate permitApplicationDate =
        permitContext == null ? null : firstNonNull(permitContext.applicationDate(), parseDate(applicationDate));
    String resolvedCountryCode =
        firstNonNull(trimToNull(countryCode), permitContext == null ? null : permitContext.exportCountryCode());
    Long orgUnitNo = permitContext == null ? null : permitContext.orgUnitNo();
    String exemptionNumber = permitContext == null ? null : permitContext.exemptionNumber();
    String exemptionTypeCode =
        exemptionNumber == null ? null : repository.findExemptionTypeCode(exemptionNumber).orElse(null);
    BigDecimal fixedExemptionRate =
        exemptionNumber == null ? null : repository.findFixedExemptionRate(exemptionNumber).orElse(null);
    BigDecimal feePolicyPercentIncrease =
        repository.findFeePolicyPercentIncrease(permitApplicationDate, orgUnitNo);
    double overrideFee = permitContext == null ? 0.0d : permitContext.overrideFee();

    return new FeeCalculationContext(
        permitNumber,
        orgUnitNo,
        permitApplicationDate,
        trimToNull(exemptionNumber),
        trimToNull(exemptionTypeCode),
        fixedExemptionRate,
        feePolicyPercentIncrease == null ? BigDecimal.ZERO : feePolicyPercentIncrease,
        trimToNull(resolvedCountryCode),
        overrideFee,
        new HashMap<>(),
        new HashMap<>());
  }

  private PermitMutationRpcResponseDto failureMutationResponse(List<String> errors, Long permitNumber) {
    return new PermitMutationRpcResponseDto(
        false, "", errors, List.of(), permitNumber, null, null, null, null, null);
  }

  private PermitPersistenceRpcResponseDto failurePersistenceResponse(
      List<String> errors, Long permitNumber) {
    return new PermitPersistenceRpcResponseDto(false, "", errors, List.of(), permitNumber);
  }

  private List<String> validateApplicationAssociationRequest(
      Long permitNumber, String userId, List<Long> applicationNumbers) {
    List<String> errors = new ArrayList<>();
    if (userId == null) {
      errors.add("A valid user identifier is required.");
    }
    if (permitNumber == null || permitNumber < 1) {
      errors.add("A valid permit number is required.");
    }
    if (applicationNumbers == null || applicationNumbers.isEmpty()) {
      errors.add("Select at least one application.");
    }
    if (!errors.isEmpty()) {
      return errors;
    }

    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return List.of("Permit not found.");
    }
    PermitMutationRow permit = existing.get();
    if (isBlanketOicPermit(permit)) {
      return List.of("Application associations are not changed this way for Blanket OIC permits.");
    }
    if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(trimToNull(permit.permitStatusCode()))) {
      return List.of("Applications cannot be changed for a completed permit.");
    }
    return List.of();
  }

  private boolean updateScalePermitAssignment(
      ScaleMutationRow scale, Long permitNumber, String userId) {
    if (scale == null) {
      return false;
    }
    return repository.updateScaleDetail(
        new ScaleMutationRecord(
            scale.scaleDetailId(),
            scale.timberMark(),
            scale.piecesCount(),
            scale.speciesGradeVolume(),
            scale.packageNumber(),
            scale.exportSpeciesCode(),
            scale.exportGradeCode(),
            permitNumber,
            scale.entryUserId(),
            scale.entryTimestamp()),
        userId);
  }

  private boolean isBlanketOicPermit(PermitMutationRow permit) {
    if (permit == null) {
      return false;
    }
    String exemptionNumber = trimToNull(permit.exemptionNumber());
    return exemptionNumber != null
        && exemptionService
            .findByExemptionNumber(exemptionNumber)
            .map(exemption -> exemption.blanketOic())
            .orElse(false);
  }

  private void updatePermitTotals(Long permitNumber, String userId) {
    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return;
    }

    List<PermitScaleDetailRow> permitScales = repository.findScaleDetailsByPermitNumber(permitNumber);
    double totalVolume =
        permitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = permitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();

    PermitMutationRow current = existing.get();
    Double currentVolume = firstNonNull(current.permitVolume(), 0.0d);
    Long currentPieces = firstNonNull(current.numberOfPieces(), 0L);
    if (Double.compare(currentVolume, totalVolume) == 0 && currentPieces == totalPieces) {
      return;
    }

    PermitMutationRow updated =
        new PermitMutationRow(
            current.permitNumber(),
            current.destinationCompanyName(),
            current.transportName(),
            current.estimatedShippingDate(),
            current.otherPortOfExport(),
            current.applicationDate(),
            current.receivedDate(),
            current.permitIssueDate(),
            current.receiptNumber(),
            current.expiryDate(),
            totalVolume,
            totalPieces,
            current.feeInLieuVolume(),
            current.federalPermitNumber(),
            current.remarks(),
            current.entryUserId(),
            current.entryTimestamp(),
            current.transportTypeCode(),
            current.scaleMethodCode(),
            current.clientNumber(),
            current.clientLocationCode(),
            current.agentNumber(),
            current.agentLocationCode(),
            current.exemptionNumber(),
            current.orgUnitNo(),
            current.portOfExportCode(),
            current.permitStatusCode(),
            current.growthTypeCode(),
            current.countryCode(),
            current.overrideFee(),
            current.overrideComment(),
            current.oicApplicationNumber(),
            current.oicRequestPieces(),
            current.oicRequestVolume(),
            current.productTypeCode());
    repository.updatePermitDetail(updated, userId, null);
  }

  private boolean hasStringChanged(String stored, String formValue) {
    return !java.util.Objects.equals(trimToNull(stored), trimToNull(formValue));
  }

  private boolean hasDateChanged(LocalDate stored, LocalDate formValue) {
    return !java.util.Objects.equals(stored, formValue);
  }

  private boolean hasLongChanged(Long stored, long formValue) {
    return firstNonNull(stored, 0L) != formValue;
  }

  private long parseLongOrZero(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return 0L;
    }
    try {
      return Long.parseLong(normalized);
    } catch (NumberFormatException ex) {
      return 0L;
    }
  }

  private LocalDate parseDate(String value) {
    return parseIsoOrLegacyDate(value);
  }

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private String formatCurrency(BigDecimal value) {
    return "$" + value.setScale(2, RoundingMode.HALF_UP).toPlainString();
  }

  private String formatCurrencyNoScale(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : "$" + normalized;
  }

  private String formatDecimal(BigDecimal value, int scale) {
    if (value == null) {
      return "";
    }
    return value.setScale(scale, RoundingMode.HALF_UP).toPlainString();
  }

  private String appendPercent(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : normalized + "%";
  }

  private BigDecimal parseDecimal(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      return new BigDecimal(normalized);
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private Set<String> parseCsvSet(String csv) {
    String normalizedCsv = trimToNull(csv);
    if (normalizedCsv == null) {
      return Set.of();
    }

    return normalizedCsv.lines()
        .flatMap(line -> java.util.Arrays.stream(line.split(",")))
        .map(String::trim)
        .filter(token -> !token.isEmpty())
        .collect(java.util.stream.Collectors.toCollection(java.util.LinkedHashSet::new));
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  private String normalizeCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase();
  }

  private boolean isCanadaCountryCode(String countryCode) {
    return "CA".equalsIgnoreCase(trimToNull(countryCode));
  }

  private record FeeCalculationContext(
      Long permitNumber,
      Long orgUnitNo,
      LocalDate permitApplicationDate,
      String exemptionNumber,
      String exemptionTypeCode,
      BigDecimal fixedExemptionRate,
      BigDecimal feePolicyPercentIncrease,
      String exportCountryCode,
      double overrideFee,
      Map<Long, Boolean> unmanufacturedByApplicationNumber,
      Map<String, BigDecimal> amvByScaleId) {}
}

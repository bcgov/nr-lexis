package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitRpcScaleItemDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.EndUsePairRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
  private static final String SPECIES_FIR = "FI";
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

  public OraclePermitDetailsRpcService(
      PermitRpcRepository repository,
      LexisApplicationService applicationService,
      ExemptionService exemptionService) {
    this.repository = repository;
    this.applicationService = applicationService;
    this.exemptionService = exemptionService;
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

    double totalVolume = allPermitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = allPermitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();
    BigDecimal totalFees = sumFees(allPermitScales, feeContext);

    String normalizedPackageNumber = trimToNull(packageNumber);
    List<PermitScaleDetailRow> selectedPackageScales =
        normalizedPackageNumber == null
            ? List.of()
            : allPermitScales.stream()
                .filter(scale -> normalizedPackageNumber.equals(scale.packageNumber()))
                .toList();

    BigDecimal totalFeeForPackage = sumFees(selectedPackageScales, feeContext);
    String permitNumberString = permitNumber.toString();
    List<PermitRpcScaleItemDto> scaleList =
        selectedPackageScales.stream()
            .map(scale -> toSummaryScaleItem(scale, permitNumberString, ministryUser, feeContext))
            .toList();

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

    BigDecimal totalFeeForPackage = sumFees(scales, feeContext);
    boolean maskScaleFees = shouldMaskScaleFeesForPackageView(feeContext);
    boolean maskTotalFeeForPackage = shouldMaskTotalFeeForPackage(feeContext);
    List<PermitRpcScaleItemDto> scaleList =
        scales.stream()
            .map(scale -> toPackageScaleItem(scale, ministryUser, feeContext, maskScaleFees))
            .toList();

    return new PermitScaleFeesRpcResponseDto(
        maskTotalFeeForPackage ? "$" : formatCurrency(totalFeeForPackage),
        scaleList,
        resolveGrowthType(packageNumber));
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
  public PermitPackageListRpcResponseDto getPackageList(Long permitNumber) {
    List<String> packageList = repository.findPackageNumbersByPermitNumber(permitNumber);
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

  private PermitPackageInfoRpcResponseDto emptyPackageInfo() {
    return new PermitPackageInfoRpcResponseDto("", "", "", "", "", "", "");
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

  private PermitRpcScaleItemDto toSummaryScaleItem(
      PermitScaleDetailRow scale,
      String permitNumber,
      boolean ministryUser,
      FeeCalculationContext feeContext) {
    BigDecimal fee = calculateRoundedFeeForScale(scale, feeContext);
    BigDecimal amv = getAverageMarketValueForScale(scale, feeContext);
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

  private PermitRpcScaleItemDto toPackageScaleItem(
      PermitScaleDetailRow scale,
      boolean ministryUser,
      FeeCalculationContext feeContext,
      boolean maskScaleFees) {
    String species =
        repository
            .findSpeciesDescription(scale.exportSpeciesCode())
            .orElse(nonNull(scale.exportSpeciesCode()));
    String grade =
        repository.findGradeDescription(scale.exportGradeCode()).orElse(nonNull(scale.exportGradeCode()));
    BigDecimal fee = calculateRoundedFeeForScale(scale, feeContext);
    BigDecimal amv = getScaleDisplayAmv(scale, feeContext);
    boolean countryCanada = isCanadaCountryCode(feeContext.exportCountryCode());
    String ewb = countryCanada ? "" : formatCurrencyNoScale(trimToNull(scale.ewb()));
    String fil = countryCanada ? "" : appendPercent(trimToNull(scale.fil()));
    String mf = countryCanada ? "" : nonNull(scale.mf());

    return new PermitRpcScaleItemDto(
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
        nonNull(scale.exportPermitDetailNumber()));
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
            .map(this::trimToNull)
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

  private LocalDate parseDate(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }

    try {
      return LocalDate.parse(normalized);
    } catch (DateTimeParseException ignored) {
      // Fall through to legacy parser.
    }

    try {
      return LocalDate.parse(normalized, LEGACY_DATE_FORMATTER);
    } catch (DateTimeParseException ignored) {
      return null;
    }
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

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
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

  private <T> T firstNonNull(T first, T second) {
    return first != null ? first : second;
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

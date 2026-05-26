package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitRpcScaleItemDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OraclePermitDetailsRpcService implements PermitDetailsRpcService {

  private static final DateTimeFormatter LEGACY_DATE_FORMATTER =
      DateTimeFormatter.ofPattern("MM/dd/yyyy");
  private static final LocalDate FEE_MASK_EFFECTIVE_DATE = LocalDate.of(2024, 6, 27);

  private final PermitRpcRepository repository;
  private final LexisApplicationService applicationService;

  public OraclePermitDetailsRpcService(
      PermitRpcRepository repository, LexisApplicationService applicationService) {
    this.repository = repository;
    this.applicationService = applicationService;
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
    double totalVolume = allPermitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = allPermitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();
    BigDecimal totalFees = sumScaffoldFees(allPermitScales);

    String normalizedPackageNumber = trimToNull(packageNumber);
    List<PermitScaleDetailRow> selectedPackageScales =
        normalizedPackageNumber == null
            ? List.of()
            : allPermitScales.stream()
                .filter(scale -> normalizedPackageNumber.equals(scale.packageNumber()))
                .toList();

    BigDecimal totalFeeForPackage = sumScaffoldFees(selectedPackageScales);
    String permitNumberString = permitNumber.toString();
    List<PermitRpcScaleItemDto> scaleList =
        selectedPackageScales.stream()
            .map(scale -> toSummaryScaleItem(scale, permitNumberString, ministryUser))
            .toList();

    boolean maskFees = shouldMaskFees(countryCode, applicationDate);
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

    BigDecimal totalFees = sumScaffoldFees(repository.findScaleDetailsByPermitNumber(permitNumber));
    if (shouldMaskFees(countryCode, applicationDate)) {
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
    List<PermitScaleDetailRow> scales =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
            .filter(scale -> permitNumberString.equals(trimToNull(scale.exportPermitDetailNumber())))
            .toList();

    BigDecimal totalFeeForPackage = sumScaffoldFees(scales);
    List<PermitRpcScaleItemDto> scaleList =
        scales.stream().map(scale -> toPackageScaleItem(scale, ministryUser)).toList();

    return new PermitScaleFeesRpcResponseDto(
        formatCurrency(totalFeeForPackage),
        scaleList,
        resolveGrowthType(packageNumber));
  }

  private PermitRpcScaleItemDto toSummaryScaleItem(
      PermitScaleDetailRow scale, String permitNumber, boolean ministryUser) {
    return new PermitRpcScaleItemDto(
        nonNull(scale.timberMark()),
        nonNull(scale.exportSpeciesCode()),
        nonNull(scale.exportGradeCode()),
        formatCurrency(scaffoldFeeForScale(scale)),
        formatVolume(scale.speciesGradeVolume()),
        ministryUser,
        formatEwb(scale.ewb()),
        scale.piecesCount(),
        formatFil(scale.fil()),
        formatMf(scale.mf()),
        formatCurrency(scaffoldFeeForScale(scale)),
        nonNull(scale.cascadeSplitCode()),
        nonNull(scale.exportScaleDetailId()),
        trimToNull(scale.exportPermitDetailNumber()) == null ? "" : permitNumber);
  }

  private PermitRpcScaleItemDto toPackageScaleItem(PermitScaleDetailRow scale, boolean ministryUser) {
    String species =
        repository
            .findSpeciesDescription(scale.exportSpeciesCode())
            .orElse(nonNull(scale.exportSpeciesCode()));
    String grade =
        repository.findGradeDescription(scale.exportGradeCode()).orElse(nonNull(scale.exportGradeCode()));
    BigDecimal scaffoldFee = scaffoldFeeForScale(scale);

    return new PermitRpcScaleItemDto(
        nonNull(scale.timberMark()),
        species,
        grade,
        formatCurrency(scaffoldFee),
        formatVolume(scale.speciesGradeVolume()),
        ministryUser,
        formatEwb(scale.ewb()),
        scale.piecesCount(),
        formatFil(scale.fil()),
        formatMf(scale.mf()),
        formatCurrency(scaffoldFee),
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

  private BigDecimal sumScaffoldFees(List<PermitScaleDetailRow> scales) {
    BigDecimal total = BigDecimal.ZERO;
    for (PermitScaleDetailRow scale : scales) {
      total = total.add(scaffoldFeeForScale(scale));
    }
    return total;
  }

  private BigDecimal scaffoldFeeForScale(PermitScaleDetailRow scale) {
    // Temporary parity scaffold: use scale volume as a fee baseline until export policy fee rules are ported.
    return BigDecimal.valueOf(scale.speciesGradeVolume()).setScale(2, RoundingMode.HALF_UP);
  }

  private boolean shouldMaskFees(String countryCode, String applicationDate) {
    String normalizedCountryCode = trimToNull(countryCode);
    LocalDate parsedApplicationDate = parseDate(applicationDate);
    return "CA".equalsIgnoreCase(normalizedCountryCode)
        && parsedApplicationDate != null
        && !parsedApplicationDate.isBefore(FEE_MASK_EFFECTIVE_DATE);
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

  private String formatEwb(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : "$" + normalized;
  }

  private String formatFil(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : normalized + "%";
  }

  private String formatMf(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? "" : normalized;
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
}

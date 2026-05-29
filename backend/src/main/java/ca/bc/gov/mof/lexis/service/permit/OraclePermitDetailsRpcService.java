package ca.bc.gov.mof.lexis.service.permit;

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
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleUploadPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleUploadRowDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleUploadSubmitRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleUploadSubmitResponseDto;
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
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageCandidateRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ScaleUploadInsertRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.SalesInvoiceRow;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

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
  private static final String SPECIES_FIR = "FI";
  private static final long RCO_REGION_CODE = 1835L;
  private static final long RSK_REGION_CODE = 1908L;
  private static final long RSC_REGION_CODE = 1909L;
  private static final long RWC_REGION_CODE = 1910L;
  private static final Pattern RSK_NON_Z_GRADE_PATTERN = Pattern.compile("[A-Y]");
  private static final Set<String> DECIDUOUS_SPECIES_CODES =
      Set.of("AL", "AR", "AS", "BI", "CO", "MA");
  private static final Set<String> LOW_CONIFEROUS_GRADE_CODES = Set.of("U", "X", "Y", "Z");
  private static final Set<String> TIMBER_MARK_ALIASES =
      Set.of("timbermark", "mark", "timbermarknumber");
  private static final Set<String> SPECIES_ALIASES =
      Set.of("species", "speciescode", "exportspeciescode");
  private static final Set<String> GRADE_ALIASES = Set.of("grade", "gradecode", "exportgradecode");
  private static final Set<String> PIECES_ALIASES =
      Set.of("pieces", "piececount", "piecescount", "numberofpieces", "scalepieces");
  private static final Set<String> VOLUME_ALIASES =
      Set.of("volume", "scalevolume", "speciesgradevolume", "totalvolume");
  private static final Set<String> PACKAGE_ALIASES =
      Set.of("package", "packagenumber", "exportpackagenumber");
  private static final Set<String> APPLICATION_ALIASES =
      Set.of("application", "applicationnumber", "exportapplicationnumber");
  private static final Set<String> PERMIT_ALIASES =
      Set.of("permit", "permitnumber", "exportpermitdetailnumber", "exportpermitnumber");

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
  public PermitScalesForPackageRpcResponseDto getScalesForPackage(String packageNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (normalizedPackageNumber == null) {
      return new PermitScalesForPackageRpcResponseDto(List.of());
    }

    Map<Long, String> regionByApplication = new HashMap<>();
    List<PermitScaleItemRpcResponseDto> scaleList =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
            .map(
                scale -> {
                  String species =
                      repository
                          .findSpeciesDescription(scale.exportSpeciesCode())
                          .orElse(nonNull(scale.exportSpeciesCode()));
                  String grade =
                      repository
                          .findGradeDescription(scale.exportGradeCode())
                          .orElse(nonNull(scale.exportGradeCode()));
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
  public PermitScaleUploadPreviewResponseDto previewScaleXmlUpload(
      MultipartFile file, Long permitNumber, String packageNumber) {
    List<String> errors = new ArrayList<>();
    if (file == null || file.isEmpty()) {
      errors.add("Choose an XML file to preview.");
      return emptyScaleUploadPreview(null, errors);
    }

    String fileName = resolveFileName(file);
    if (!fileName.toLowerCase(Locale.ROOT).endsWith(".xml")) {
      errors.add("Scale upload must be an XML file.");
      return emptyScaleUploadPreview(fileName, errors);
    }

    Document document;
    try {
      document = parseXml(file);
    } catch (IOException | ParserConfigurationException | SAXException ex) {
      errors.add("Unable to parse XML file. Confirm the file is well-formed XML.");
      return emptyScaleUploadPreview(fileName, errors);
    }

    List<Element> scaleElements = findScaleRowElements(document);
    if (scaleElements.isEmpty()) {
      errors.add("No scale rows were found in the XML file.");
      return emptyScaleUploadPreview(fileName, errors);
    }

    ScaleUploadValidationContext context = new ScaleUploadValidationContext();
    List<PermitScaleUploadRowDto> rows = new ArrayList<>();
    int lineNumber = 1;
    for (Element element : scaleElements) {
      rows.add(toScaleUploadRow(element, lineNumber++, permitNumber, packageNumber, context));
    }

    return scaleUploadPreview(fileName, rows, errors, List.of());
  }

  @Override
  @Transactional
  public PermitScaleUploadSubmitResponseDto submitScaleXmlUpload(
      PermitScaleUploadSubmitRequestDto request, String userId) {
    String normalizedUserId = trimToNull(userId);
    Long requestPermitNumber = request == null ? null : request.permitNumber();
    List<String> errors = new ArrayList<>();
    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }
    if (requestPermitNumber == null || requestPermitNumber < 1) {
      errors.add("A valid permit number is required.");
    }
    if (request == null || request.rows() == null || request.rows().isEmpty()) {
      errors.add("At least one reviewed scale row is required.");
    }
    if (!errors.isEmpty()) {
      return scaleUploadSubmitFailure(requestPermitNumber, errors, List.of());
    }

    ScaleUploadValidationContext context = new ScaleUploadValidationContext();
    List<PermitScaleUploadRowDto> validatedRows = new ArrayList<>();
    for (PermitScaleUploadSubmitRequestDto.ScaleRow row : request.rows()) {
      validatedRows.add(toScaleUploadRow(row, requestPermitNumber, context));
    }

    List<String> rowErrors =
        validatedRows.stream().flatMap(row -> row.errors().stream()).distinct().toList();
    if (!rowErrors.isEmpty()) {
      return scaleUploadSubmitFailure(requestPermitNumber, rowErrors, validatedRows);
    }

    BigDecimal exemptionOverrideRate = resolveExemptionOverrideRate(requestPermitNumber);
    int submittedRows = 0;
    for (PermitScaleUploadRowDto row : validatedRows) {
      Optional<PermitScaleDetailRow> inserted =
          repository.insertScaleDetail(
              new ScaleUploadInsertRow(
                  row.timberMark(),
                  row.pieces(),
                  row.volume(),
                  row.packageNumber(),
                  row.speciesCode(),
                  row.gradeCode(),
                  row.permitNumber(),
                  exemptionOverrideRate),
              normalizedUserId);
      if (inserted.isEmpty()) {
        markCurrentTransactionRollbackOnly();
        return scaleUploadSubmitFailure(
            requestPermitNumber,
            List.of("Unable to save scale row " + row.lineNumber() + "."),
            validatedRows);
      }
      submittedRows++;
    }

    updatePermitTotals(requestPermitNumber, normalizedUserId);
    return new PermitScaleUploadSubmitResponseDto(
        true,
        submittedRows + " scale row(s) saved successfully.",
        submittedRows,
        requestPermitNumber,
        List.of(),
        List.of(),
        validatedRows);
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
    Map<Long, Boolean> hasAssignedPermitByApplication = new LinkedHashMap<>();
    for (PackageCandidateRow row : repository.findPackagesByExemptionNumber(normalizedExemptionNumber)) {
      if (row.applicationNumber() == null || row.applicationNumber() < 1) {
        continue;
      }
      boolean hasAssignedPermit =
          row.exportPermitNumber() != null && row.exportPermitNumber() > 0;
      hasAssignedPermitByApplication.merge(
          row.applicationNumber(), hasAssignedPermit, Boolean::logicalOr);
    }

    List<String> applicationList =
        hasAssignedPermitByApplication.entrySet().stream()
            .filter(entry -> !entry.getValue())
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
    List<String> packageList = new ArrayList<>();
    for (Long applicationNumber :
        repository.findApplicationNumbersByExemptionNumber(normalizedExemptionNumber)) {
      for (PackageCandidateRow row : repository.findPackagesByApplicationNumber(applicationNumber)) {
        String packageNumber = trimToNull(row.packageNumber());
        if (packageNumber == null) {
          continue;
        }
        if (selectedPackages.contains(packageNumber)) {
          continue;
        }
        if (row.exportPermitNumber() != null && row.exportPermitNumber() > 0) {
          continue;
        }
        packageList.add(packageNumber);
      }
    }

    List<String> distinctPackages = packageList.stream().distinct().sorted().toList();
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
        repository.findScaleDetailsByPermitNumber(permitNumber).stream()
            .map(PermitScaleDetailRow::applicationNumber)
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

  private PermitMutationRpcResponseDto failureMutationResponse(List<String> errors, Long permitNumber) {
    return new PermitMutationRpcResponseDto(
        false, "", errors, List.of(), permitNumber, null, null, null, null, null);
  }

  private PermitScaleUploadPreviewResponseDto emptyScaleUploadPreview(
      String fileName, List<String> errors) {
    return new PermitScaleUploadPreviewResponseDto(
        fileName, 0, 0, 0L, BigDecimal.ZERO.setScale(1, RoundingMode.HALF_UP), errors, List.of(), List.of());
  }

  private PermitScaleUploadPreviewResponseDto scaleUploadPreview(
      String fileName,
      List<PermitScaleUploadRowDto> rows,
      List<String> errors,
      List<String> warnings) {
    List<PermitScaleUploadRowDto> validRows = rows.stream().filter(PermitScaleUploadRowDto::valid).toList();
    long totalPieces =
        validRows.stream().map(PermitScaleUploadRowDto::pieces).mapToLong(value -> value == null ? 0L : value).sum();
    BigDecimal totalVolume =
        validRows.stream()
            .map(PermitScaleUploadRowDto::volume)
            .filter(java.util.Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add)
            .setScale(1, RoundingMode.HALF_UP);

    return new PermitScaleUploadPreviewResponseDto(
        fileName, rows.size(), validRows.size(), totalPieces, totalVolume, errors, warnings, rows);
  }

  private PermitScaleUploadSubmitResponseDto scaleUploadSubmitFailure(
      Long permitNumber, List<String> errors, List<PermitScaleUploadRowDto> rows) {
    return new PermitScaleUploadSubmitResponseDto(
        false, "", 0, permitNumber, errors, List.of(), rows == null ? List.of() : rows);
  }

  private Document parseXml(MultipartFile file)
      throws ParserConfigurationException, IOException, SAXException {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    try (var inputStream = file.getInputStream()) {
      Document document = factory.newDocumentBuilder().parse(inputStream);
      document.getDocumentElement().normalize();
      return document;
    }
  }

  private List<Element> findScaleRowElements(Document document) {
    if (document == null || document.getDocumentElement() == null) {
      return List.of();
    }

    List<Element> elements = new ArrayList<>();
    collectScaleRowElements(document.getDocumentElement(), elements);
    return elements;
  }

  private void collectScaleRowElements(Element element, List<Element> elements) {
    if (isScaleRowElement(element)) {
      elements.add(element);
      return;
    }

    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      Node child = children.item(i);
      if (child instanceof Element childElement) {
        collectScaleRowElements(childElement, elements);
      }
    }
  }

  private boolean isScaleRowElement(Element element) {
    int fieldCount = 0;
    if (readField(element, TIMBER_MARK_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, SPECIES_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, GRADE_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, PIECES_ALIASES) != null) {
      fieldCount++;
    }
    if (readField(element, VOLUME_ALIASES) != null) {
      fieldCount++;
    }
    return fieldCount >= 3
        && (readField(element, PIECES_ALIASES) != null || readField(element, VOLUME_ALIASES) != null);
  }

  private PermitScaleUploadRowDto toScaleUploadRow(
      Element element,
      int lineNumber,
      Long defaultPermitNumber,
      String defaultPackageNumber,
      ScaleUploadValidationContext context) {
    String timberMark = trimToNull(readField(element, TIMBER_MARK_ALIASES));
    String speciesCode = normalizeCode(readField(element, SPECIES_ALIASES));
    String gradeCode = normalizeCode(readField(element, GRADE_ALIASES));
    Long pieces = parseNonNegativeLong(readField(element, PIECES_ALIASES));
    BigDecimal volume = parseNonNegativeDecimal(readField(element, VOLUME_ALIASES));
    String packageNumber =
        firstNonNull(trimToNull(readField(element, PACKAGE_ALIASES)), trimToNull(defaultPackageNumber));
    Long rowPermitNumber = parsePositiveLong(readField(element, PERMIT_ALIASES));
    Long permitNumber = firstNonNull(defaultPermitNumber, rowPermitNumber);
    Long applicationNumber = parsePositiveLong(readField(element, APPLICATION_ALIASES));
    boolean permitMismatch =
        defaultPermitNumber != null && rowPermitNumber != null && !defaultPermitNumber.equals(rowPermitNumber);

    return validateScaleUploadRow(
        lineNumber,
        timberMark,
        speciesCode,
        gradeCode,
        pieces,
        volume,
        packageNumber,
        applicationNumber,
        permitNumber,
        permitMismatch,
        context);
  }

  private PermitScaleUploadRowDto toScaleUploadRow(
      PermitScaleUploadSubmitRequestDto.ScaleRow row,
      Long defaultPermitNumber,
      ScaleUploadValidationContext context) {
    Long rowPermitNumber = row.permitNumber();
    Long permitNumber = firstNonNull(defaultPermitNumber, rowPermitNumber);
    boolean permitMismatch =
        defaultPermitNumber != null && rowPermitNumber != null && !defaultPermitNumber.equals(rowPermitNumber);
    return validateScaleUploadRow(
        row.lineNumber(),
        trimToNull(row.timberMark()),
        normalizeCode(row.speciesCode()),
        normalizeCode(row.gradeCode()),
        row.pieces(),
        row.volume(),
        trimToNull(row.packageNumber()),
        row.applicationNumber(),
        permitNumber,
        permitMismatch,
        context);
  }

  private PermitScaleUploadRowDto validateScaleUploadRow(
      int lineNumber,
      String timberMark,
      String speciesCode,
      String gradeCode,
      Long pieces,
      BigDecimal volume,
      String packageNumber,
      Long applicationNumber,
      Long permitNumber,
      boolean permitMismatch,
      ScaleUploadValidationContext context) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    boolean permitFound = false;
    boolean packageFound = false;

    if (permitMismatch) {
      errors.add("Row " + lineNumber + " permit number does not match the selected permit.");
    }
    if (permitNumber == null || permitNumber < 1) {
      errors.add("Row " + lineNumber + " requires a valid permit number.");
    } else if (!permitExists(permitNumber, context)) {
      errors.add("Permit " + permitNumber + " was not found.");
    } else {
      permitFound = true;
    }
    if (packageNumber == null) {
      errors.add("Row " + lineNumber + " requires a package number.");
    }
    if (timberMark == null) {
      errors.add("Row " + lineNumber + " requires a timber mark.");
    }
    if (speciesCode == null) {
      errors.add("Row " + lineNumber + " requires a species code.");
    }
    if (gradeCode == null) {
      errors.add("Row " + lineNumber + " requires a grade code.");
    }
    if (pieces == null) {
      errors.add("Row " + lineNumber + " requires a numeric pieces value.");
    } else if (pieces < 0 || pieces > 999_999_999L) {
      errors.add("Row " + lineNumber + " pieces must be between 0 and 999999999.");
    }
    if (volume == null) {
      errors.add("Row " + lineNumber + " requires a numeric volume value.");
    } else if (volume.compareTo(BigDecimal.ZERO) < 0
        || volume.compareTo(BigDecimal.valueOf(99_999.9d)) > 0) {
      errors.add("Row " + lineNumber + " volume must be between 0 and 99999.9.");
    } else {
      volume = volume.setScale(1, RoundingMode.HALF_UP);
    }

    String speciesDescription = "";
    if (speciesCode != null) {
      Optional<String> description =
          context.speciesDescriptionByCode.computeIfAbsent(speciesCode, repository::findSpeciesDescription);
      if (description.isEmpty()) {
        errors.add("Row " + lineNumber + " species code " + speciesCode + " was not found.");
      }
      speciesDescription = description.orElse("");
    }

    String gradeDescription = "";
    if (gradeCode != null) {
      Optional<String> description =
          context.gradeDescriptionByCode.computeIfAbsent(gradeCode, repository::findGradeDescription);
      if (description.isEmpty()) {
        errors.add("Row " + lineNumber + " grade code " + gradeCode + " was not found.");
      }
      gradeDescription = description.orElse("");
    }

    if (packageNumber != null) {
      Optional<PackageInfoRow> packageInfo =
          context.packageInfoByNumber.computeIfAbsent(
              packageNumber, repository::findPackageInfoByPackageNumber);
      if (packageInfo.isEmpty()) {
        errors.add("Package " + packageNumber + " was not found.");
      } else {
        packageFound = true;
        Long packageApplicationNumber = packageInfo.get().applicationNumber();
        if (applicationNumber == null) {
          applicationNumber = packageApplicationNumber;
        } else if (packageApplicationNumber != null
            && !packageApplicationNumber.equals(applicationNumber)) {
          errors.add(
              "Row "
                  + lineNumber
                  + " application number does not match package "
                  + packageNumber
                  + ".");
        }
      }
    }
    if (permitFound && packageFound && !packageBelongsToPermit(packageNumber, permitNumber, context)) {
      errors.add("Package " + packageNumber + " is not linked to permit " + permitNumber + ".");
    }

    String combinationKey = scaleCombinationKey(packageNumber, timberMark, speciesCode, gradeCode);
    if (combinationKey != null && !context.uploadCombinationKeys.add(combinationKey)) {
      errors.add(
          "Row " + lineNumber + " duplicates another uploaded row for package, timber mark, species, and grade.");
    }
    if (combinationKey != null && packageNumber != null) {
      List<PermitScaleDetailRow> existingScales =
          context.scalesByPackageNumber.computeIfAbsent(
              packageNumber, repository::findScaleDetailsByPackageNumber);
      boolean existingCombination =
          existingScales.stream()
              .map(
                  scale ->
                      scaleCombinationKey(
                          scale.packageNumber(),
                          scale.timberMark(),
                          scale.exportSpeciesCode(),
                          scale.exportGradeCode()))
              .anyMatch(combinationKey::equals);
      if (existingCombination) {
        errors.add(
            "Row " + lineNumber + " already exists for package, timber mark, species, and grade.");
      }
    }

    return new PermitScaleUploadRowDto(
        lineNumber,
        timberMark,
        speciesCode,
        speciesDescription,
        gradeCode,
        gradeDescription,
        pieces,
        volume,
        packageNumber,
        applicationNumber,
        permitNumber,
        errors.isEmpty(),
        errors,
        warnings);
  }

  private boolean permitExists(Long permitNumber, ScaleUploadValidationContext context) {
    return context.permitExistsByNumber.computeIfAbsent(
        permitNumber, value -> repository.findPermitMutationByPermitNumber(value).isPresent());
  }

  private boolean packageBelongsToPermit(
      String packageNumber, Long permitNumber, ScaleUploadValidationContext context) {
    String normalizedPackageNumber = normalizePackageNumber(packageNumber);
    if (normalizedPackageNumber == null || permitNumber == null || permitNumber < 1) {
      return false;
    }

    Set<String> permitPackages =
        context.packageNumbersByPermitNumber.computeIfAbsent(
            permitNumber,
            value -> {
              Set<String> packageNumbers = new LinkedHashSet<>();
              repository.findPackageNumbersByPermitNumber(value).stream()
                  .map(this::normalizePackageNumber)
                  .filter(java.util.Objects::nonNull)
                  .forEach(packageNumbers::add);
              repository.findPackageNumbersByOicPermitNumber(value).stream()
                  .map(this::normalizePackageNumber)
                  .filter(java.util.Objects::nonNull)
                  .forEach(packageNumbers::add);
              return packageNumbers;
            });
    return permitPackages.contains(normalizedPackageNumber);
  }

  private String readField(Element element, Set<String> aliases) {
    if (element == null) {
      return null;
    }

    for (int i = 0; i < element.getAttributes().getLength(); i++) {
      Node attribute = element.getAttributes().item(i);
      if (aliases.contains(normalizeXmlName(attribute.getNodeName()))) {
        return trimToNull(attribute.getNodeValue());
      }
    }

    NodeList children = element.getChildNodes();
    for (int i = 0; i < children.getLength(); i++) {
      Node child = children.item(i);
      if (child instanceof Element childElement
          && aliases.contains(normalizeXmlName(childElement.getNodeName()))) {
        return trimToNull(childElement.getTextContent());
      }
    }

    return null;
  }

  private String normalizeXmlName(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return "";
    }
    return normalized.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
  }

  private Long parseNonNegativeLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private BigDecimal parseNonNegativeDecimal(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      BigDecimal parsed = new BigDecimal(normalized);
      return parsed.compareTo(BigDecimal.ZERO) >= 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String scaleCombinationKey(
      String packageNumber, String timberMark, String speciesCode, String gradeCode) {
    if (packageNumber == null || timberMark == null || speciesCode == null || gradeCode == null) {
      return null;
    }
    return String.join(
        "|",
        packageNumber.trim().toUpperCase(Locale.ROOT),
        timberMark.trim().toUpperCase(Locale.ROOT),
        speciesCode.trim().toUpperCase(Locale.ROOT),
        gradeCode.trim().toUpperCase(Locale.ROOT));
  }

  private BigDecimal resolveExemptionOverrideRate(Long permitNumber) {
    PermitPolicyContextRow context =
        repository.findPermitPolicyContextByPermitNumber(permitNumber).orElse(null);
    if (context == null || trimToNull(context.exemptionNumber()) == null) {
      return BigDecimal.ZERO;
    }
    String exemptionTypeCode =
        repository.findExemptionTypeCode(context.exemptionNumber()).orElse(null);
    if (!EXEMPTION_TYPE_BLANKET_OIC.equalsIgnoreCase(trimToNull(exemptionTypeCode))) {
      return BigDecimal.ZERO;
    }
    return repository.findFixedExemptionRate(context.exemptionNumber()).orElse(BigDecimal.ZERO);
  }

  private void updatePermitTotals(Long permitNumber, String userId) {
    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return;
    }

    String permitNumberString = permitNumber.toString();
    List<PermitScaleDetailRow> permitScales =
        repository.findScaleDetailsByPermitNumber(permitNumber).stream()
            .filter(scale -> permitNumberString.equals(trimToNull(scale.exportPermitDetailNumber())))
            .toList();
    double totalVolume = permitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = permitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();

    PermitMutationRow current = existing.get();
    if (Double.compare(firstNonNull(current.permitVolume(), 0.0d), totalVolume) == 0
        && firstNonNull(current.numberOfPieces(), 0L) == totalPieces) {
      return;
    }

    repository.updatePermitDetail(
        new PermitMutationRow(
            permitNumber,
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
            firstNonNull(current.feeInLieuVolume(), 0L),
            current.federalPermitNumber(),
            current.remarks(),
            current.entryUserId(),
            current.entryTimestamp(),
            current.transportTypeCode(),
            firstNonNull(trimToNull(current.scaleMethodCode()), EXPORT_SCALE_METHOD_WEIGHT),
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
            current.productTypeCode()),
        userId,
        null);
  }

  private String resolveFileName(MultipartFile file) {
    String fileName = file == null ? null : trimToNull(file.getOriginalFilename());
    return fileName == null ? "scale-upload.xml" : fileName;
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

  private Long parsePositiveLong(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      long parsed = Long.parseLong(normalized);
      return parsed > 0 ? parsed : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private Double parseDouble(String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return null;
    }
    try {
      return Double.parseDouble(normalized);
    } catch (NumberFormatException ex) {
      return null;
    }
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
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private String normalizePackageNumber(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private boolean isCanadaCountryCode(String countryCode) {
    return "CA".equalsIgnoreCase(trimToNull(countryCode));
  }

  private <T> T firstNonNull(T first, T second) {
    return first != null ? first : second;
  }

  private void markCurrentTransactionRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ex) {
      // Unit tests can exercise this path without a Spring transaction.
    }
  }

  private static final class ScaleUploadValidationContext {
    private final Map<Long, Boolean> permitExistsByNumber = new HashMap<>();
    private final Map<Long, Set<String>> packageNumbersByPermitNumber = new HashMap<>();
    private final Map<String, Optional<PackageInfoRow>> packageInfoByNumber = new HashMap<>();
    private final Map<String, Optional<String>> speciesDescriptionByCode = new HashMap<>();
    private final Map<String, Optional<String>> gradeDescriptionByCode = new HashMap<>();
    private final Map<String, List<PermitScaleDetailRow>> scalesByPackageNumber = new HashMap<>();
    private final Set<String> uploadCombinationKeys = new LinkedHashSet<>();
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

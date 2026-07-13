package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parseDouble;
import static ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
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
import ca.bc.gov.mof.lexis.service.ScaleDomainValidator;
import ca.bc.gov.mof.lexis.service.ScaleDomainValidator.ScaleValues;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceDetail;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.ProvincialPermitMutationValidator.ValidationResult;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class OraclePermitDetailsRpcService implements PermitDetailsRpcService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OraclePermitDetailsRpcService.class);

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
  private static final String EXPORT_PERMIT_STATUS_PAYMENT_PENDING = "PPD";
  private static final String EXPORT_PERMIT_STATUS_EXPIRED = "EXP";
  private static final String EXPORT_PERMIT_STATUS_CANCELLED = "CAN";
  private static final Set<String> EFFECTIVE_EXPORT_PERMIT_STATUSES =
      Set.of(
          EXPORT_PERMIT_STATUS_ACTIVE,
          EXPORT_PERMIT_STATUS_COMPLETE,
          EXPORT_PERMIT_STATUS_PAYMENT_PENDING);
  private static final Set<String> RECONCILABLE_EXPORT_PERMIT_STATUSES =
      Set.of(
          EXPORT_PERMIT_STATUS_ACTIVE,
          EXPORT_PERMIT_STATUS_COMPLETE,
          EXPORT_PERMIT_STATUS_PAYMENT_PENDING,
          EXPORT_PERMIT_STATUS_EXPIRED,
          EXPORT_PERMIT_STATUS_CANCELLED);
  private static final String APPLICATION_STATUS_PERMITTED = "PMT";
  private static final String APPLICATION_STATUS_EXEMPTED = "EXE";
  private static final String EXEMPTION_STATUS_ACTIVE = "ACT";
  private static final String SPECIES_FIR = "FI";
  private static final int MAX_SALES_INVOICE_NUMBER_LENGTH = 9;
  private static final long MAX_OIC_REQUEST_PIECES = 9_999_999_999L;
  // THE.EXPORT_PERMIT_DETAIL.OIC_REQUEST_VOLUME is VARCHAR2(9), not a numeric column.
  private static final int MAX_OIC_REQUEST_VOLUME_LENGTH = 9;
  private static final Pattern OIC_REQUEST_VOLUME_PATTERN =
      Pattern.compile("\\d+(?:\\.\\d{1,2})?");
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
  private final ClientLookupService clientLookupService;
  private final AuthoritativeClientEmailResolver clientEmailResolver;
  private final PermitNotificationEmailService permitEmailService;
  private final ApplicationDetailsRpcService applicationDetailsRpcService;
  private final ProvincialPermitMutationValidator permitMutationValidator;
  private final ObjectProvider<PermitInvoiceOrchestrationService>
      permitInvoiceOrchestrationServiceProvider;

  public OraclePermitDetailsRpcService(
      PermitRpcRepository repository,
      LexisApplicationService applicationService,
      ExemptionService exemptionService,
      ApplicationReviewRepository applicationReviewRepository,
      ClientLookupService clientLookupService,
      AuthoritativeClientEmailResolver clientEmailResolver,
      PermitNotificationEmailService permitEmailService,
      ApplicationDetailsRpcService applicationDetailsRpcService,
      ObjectProvider<PermitInvoiceOrchestrationService>
          permitInvoiceOrchestrationServiceProvider) {
    this.repository = repository;
    this.applicationService = applicationService;
    this.exemptionService = exemptionService;
    this.applicationReviewRepository = applicationReviewRepository;
    this.clientLookupService = clientLookupService;
    this.clientEmailResolver = clientEmailResolver;
    this.permitEmailService = permitEmailService;
    this.applicationDetailsRpcService = applicationDetailsRpcService;
    this.permitInvoiceOrchestrationServiceProvider =
        permitInvoiceOrchestrationServiceProvider;
    this.permitMutationValidator =
        new ProvincialPermitMutationValidator(repository, clientLookupService);
  }

  @Override
  @Transactional
  public PermitEmailResult sendRequestPermitEmail(
      Long permitNumber, String copyToAddress, String userId) {
    Optional<PermitMutationRow> permitResult =
        repository.findPermitMutationByPermitNumber(permitNumber);
    if (permitResult.isEmpty()) {
      return new PermitEmailResult(false, "Permit not found.");
    }

    PermitMutationRow permit = permitResult.get();
    if (!isReviewRequestEligible(permit)) {
      return new PermitEmailResult(
          false,
          "The permit is not ready for review. An active permit must have an application, package, and scale detail.");
    }

    boolean sent = permitEmailService.sendRequest(permitNumber, copyToAddress);
    if (!sent) {
      return new PermitEmailResult(false, "Permit review request email could not be queued.");
    }

    String requestDate = permit.receivedDate() == null ? null : permit.receivedDate().toString();
    if (isBlanketOicPermit(permit) && permit.receivedDate() == null) {
      LocalDate firstRequestDate = LexisBusinessTime.today();
      if (!updateFirstBlanketOicRequestDate(permit, firstRequestDate, userId)) {
        markRollbackOnly();
        return new PermitEmailResult(
            false,
            "Permit review request email could not be queued because the first request date could not be recorded.",
            null);
      }
      requestDate = firstRequestDate.toString();
    }

    return new PermitEmailResult(
        true, "Permit review request email queued successfully.", requestDate);
  }

  private boolean isReviewRequestEligible(PermitMutationRow permit) {
    if (permit == null
        || permit.permitNumber() == null
        || !EXPORT_PERMIT_STATUS_ACTIVE.equalsIgnoreCase(
            nonNull(trimToNull(permit.permitStatusCode())))) {
      return false;
    }

    boolean blanketOic = isBlanketOicPermit(permit);
    boolean hasApplication =
        blanketOic
            ? isOicApplicationBoundToExemption(
                permit.oicApplicationNumber(), permit.exemptionNumber())
            : !repository
                .findApplicationNumbersByPermitNumberRequired(permit.permitNumber())
                .isEmpty();
    boolean hasPackage =
        blanketOic
            ? !repository.findPackageNumbersByOicPermitNumber(permit.permitNumber()).isEmpty()
            : !repository.findPackageNumbersByPermitNumberRequired(permit.permitNumber()).isEmpty();
    boolean hasScale =
        !repository.findScaleDetailsByPermitNumber(permit.permitNumber()).isEmpty();
    return hasApplication && hasPackage && hasScale;
  }

  private boolean updateFirstBlanketOicRequestDate(
      PermitMutationRow current, LocalDate requestDate, String userId) {
    PermitMutationRow updated =
        new PermitMutationRow(
            current.permitNumber(),
            current.destinationCompanyName(),
            current.transportName(),
            current.estimatedShippingDate(),
            current.otherPortOfExport(),
            requestDate,
            requestDate,
            current.permitIssueDate(),
            current.receiptNumber(),
            current.expiryDate(),
            current.permitVolume(),
            current.numberOfPieces(),
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
    return repository.updatePermitDetail(updated, trimToNull(userId), null);
  }

  @Override
  public PermitEmailResult sendApprovalPermitEmail(
      Long permitNumber, String clientEmailAddress) {
    Optional<PermitMutationRow> permit = repository.findPermitMutationByPermitNumber(permitNumber);
    if (permit.isEmpty()) {
      return new PermitEmailResult(false, "Permit not found.");
    }
    String permitStatus = trimToNull(permit.get().permitStatusCode());
    if (!EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(permitStatus)
        && !EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equalsIgnoreCase(permitStatus)) {
      return new PermitEmailResult(
          false,
          "Permit approval email is only available for completed or payment-pending permits.");
    }
    // Retain the legacy request parameter for wire compatibility, but resolve the recipient from
    // the persisted permit every time.
    String recipient = resolvePermitClientEmail(permit.get()).orElse(null);
    if (recipient == null) {
      return new PermitEmailResult(
          false, "No valid email address is available for the permit applicant.");
    }
    boolean sent =
        permitEmailService.sendApproval(
            permitNumber,
            permit.get().permitStatusCode(),
            repository.findPackageNumbersByPermitNumberRequired(permitNumber),
            recipient);
    return new PermitEmailResult(
        sent,
        sent ? "Permit approval email queued successfully." : "Permit approval email could not be queued.");
  }

  private Optional<String> resolvePermitClientEmail(PermitMutationRow permit) {
    String clientNumber = trimToNull(permit.agentNumber());
    String locationCode = trimToNull(permit.agentLocationCode());
    if (clientNumber == null) {
      clientNumber = trimToNull(permit.clientNumber());
      locationCode = trimToNull(permit.clientLocationCode());
    }
    if (clientNumber == null || locationCode == null) {
      return Optional.empty();
    }
    return clientEmailResolver.resolve(clientNumber, locationCode);
  }

  @Override
  public PermitEditContext getEditContext(Long permitNumber) {
    return repository
        .findPermitMutationByPermitNumber(permitNumber)
        .map(
            permit -> {
              Double overrideFee = permit.overrideFee();
              boolean overrideEnabled = overrideFee != null && overrideFee > 0.0d;
              return new PermitEditContext(
                  overrideEnabled,
                  overrideEnabled
                      ? BigDecimal.valueOf(overrideFee)
                          .setScale(2, RoundingMode.HALF_UP)
                          .toPlainString()
                      : "",
                  nonNull(permit.overrideComment()));
            })
        .orElseGet(() -> new PermitEditContext(false, "", ""));
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
        repository.findPackageDetailsByPackageNumberRequired(normalizedPackageNumber).orElse(null);
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
    List<String> packageList = repository.findPackageNumbersByPermitNumberRequired(permitNumber);
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
    boolean hasApplications =
        !repository.findPackageNumbersByPermitNumberRequired(permitNumber).isEmpty();
    return new PermitHasApplicationsRpcResponseDto(hasApplications);
  }

  @Override
  public PermitCountryListRpcResponseDto getCountryList() {
    List<PermitCountryItemRpcResponseDto> countries =
        repository.findAllCountryCodesRequired().stream()
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
  public PermitApplicationListRpcResponseDto getApplicationList(
      Long permitNumber, Predicate<Long> applicationAccess) {
    if (permitNumber == null || permitNumber < 1) {
      return new PermitApplicationListRpcResponseDto(List.of());
    }

    List<String> applications =
        repository.findApplicationNumbersByPermitNumberRequired(permitNumber).stream()
            .filter(
                applicationNumber ->
                    applicationNumber != null
                        && applicationNumber > 0
                        && applicationAccess.test(applicationNumber))
            .map(String::valueOf)
            .toList();
    return new PermitApplicationListRpcResponseDto(applications);
  }

  @Override
  public PermitAvailableApplicationListRpcResponseDto getAvailableApplicationList(
      String exemptionNumber,
      String selectedApplicationsCsv,
      Predicate<Long> applicationAccess) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return new PermitAvailableApplicationListRpcResponseDto(
          List.of(), "No applications are currently available.");
    }

    Set<String> selectedApplications = parseCsvSet(selectedApplicationsCsv);
    Map<Long, List<ScaleMutationRow>> unassignedScalesByApplication =
        findUnassignedScalesByApplication(
            normalizedExemptionNumber, applicationAccess);

    List<String> applicationList =
        unassignedScalesByApplication.entrySet().stream()
            .filter(entry -> !entry.getValue().isEmpty())
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
      String exemptionNumber,
      String selectedPackagesCsv,
      Predicate<Long> applicationAccess) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return new PermitAvailablePackageListRpcResponseDto(
          List.of(), "No applications are currently available.");
    }

    Set<String> selectedPackages = parseCsvSet(selectedPackagesCsv);
    List<String> distinctPackages =
        findUnassignedScalesByApplication(normalizedExemptionNumber, applicationAccess).values()
            .stream()
            .flatMap(List::stream)
            .map(ScaleMutationRow::packageNumber)
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

  private boolean canAccessApplication(
      Long applicationNumber,
      Predicate<Long> applicationAccess,
      Map<Long, Boolean> applicationAccessByNumber) {
    return applicationNumber != null
        && applicationNumber > 0
        && applicationAccessByNumber.computeIfAbsent(
            applicationNumber, applicationAccess::test);
  }

  private Map<Long, List<ScaleMutationRow>> findUnassignedScalesByApplication(
      String exemptionNumber, Predicate<Long> applicationAccess) {
    Map<Long, Set<String>> packagesByApplication = new LinkedHashMap<>();
    for (PackageCandidateRow candidate :
        repository.findPackagesByExemptionNumberRequired(exemptionNumber)) {
      Long applicationNumber = candidate.applicationNumber();
      String packageNumber = trimToNull(candidate.packageNumber());
      if (applicationNumber == null || applicationNumber < 1 || packageNumber == null) {
        throw new DataRetrievalFailureException(
            "Oracle returned an invalid package relationship for exemption "
                + exemptionNumber
                + ".");
      }
      packagesByApplication
          .computeIfAbsent(applicationNumber, ignored -> new HashSet<>())
          .add(normalizeIdentifier(packageNumber));
    }

    Map<Long, Boolean> applicationAccessByNumber = new HashMap<>();
    Map<Long, List<ScaleMutationRow>> result = new LinkedHashMap<>();
    for (Map.Entry<Long, Set<String>> entry : packagesByApplication.entrySet()) {
      Long applicationNumber = entry.getKey();
      if (!canAccessApplication(
          applicationNumber, applicationAccess, applicationAccessByNumber)) {
        continue;
      }
      List<ScaleMutationRow> scaleRows =
          repository.findScaleMutationDetailsByApplicationNumber(applicationNumber);
      if (scaleRows.stream()
          .anyMatch(
              scale ->
                  scale == null
                      || !applicationNumber.equals(scale.applicationNumber())
                      || (scale.exportPermitDetailNumber() != null
                          && scale.exportPermitDetailNumber() < 1))) {
        throw new DataRetrievalFailureException(
            "Oracle returned an invalid scale relationship for application "
                + applicationNumber
                + ".");
      }
      List<ScaleMutationRow> unassignedScales =
          scaleRows.stream()
              .filter(
                  scale -> entry.getValue().contains(normalizeIdentifier(scale.packageNumber())))
              .filter(scale -> scale.exportPermitDetailNumber() == null)
              .toList();
      result.put(applicationNumber, unassignedScales);
    }
    return result;
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
    return repository
        .findGbmsInvoiceHistoryRequired(receiptNumber, permitNumber, readOnlyUser)
        .stream()
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
  @Transactional
  public PermitMutationRpcResponseDto createPermitFromExemption(
      String exemptionNumber, String userId) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    String normalizedUserId = trimToNull(userId);
    List<String> errors = new ArrayList<>();
    if (normalizedExemptionNumber == null) {
      errors.add("A valid exemption number is required.");
    }
    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }

    ValidatedExemptionBinding exemption =
        normalizedExemptionNumber == null
            ? null
            : validateExemptionBinding(normalizedExemptionNumber, errors);
    List<Long> applicationNumbers = List.of();
    if (exemption != null) {
      if (!EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(exemption.exemptionTypeCode())) {
        errors.add(
            "Only a Ministerial exemption can use the one-step permit creation action.");
      } else {
        applicationNumbers = validatePermitCreationEligibility(exemption, errors);
      }
    }

    ApplicationInfoRow application =
        errors.isEmpty()
            ? resolveMinisterialPermitCreationContext(exemption, applicationNumbers, errors)
            : null;
    if (!errors.isEmpty()) {
      return failureMutationResponse(List.copyOf(errors), null);
    }

    PermitMutationRow insertRow =
        new PermitMutationRow(
            null,
            null,
            null,
            null,
            null,
            LexisBusinessTime.today(),
            null,
            null,
            null,
            exemption.detail().expiryDate(),
            0.0d,
            0L,
            0L,
            null,
            null,
            normalizedUserId,
            null,
            null,
            EXPORT_SCALE_METHOD_WEIGHT,
            trimToNull(application.ownerClientNumber()),
            trimToNull(application.ownerClientLocationCode()),
            trimToNull(application.agentClientNumber()),
            trimToNull(application.agentClientLocationCode()),
            normalizedExemptionNumber,
            application.orgUnitNo(),
            null,
            EXPORT_PERMIT_STATUS_ACTIVE,
            trimToNull(application.growthTypeCode()),
            null,
            null,
            null,
            null,
            null,
            null,
            trimToNull(application.productTypeCode()));

    Optional<PermitMutationRow> inserted =
        repository.insertPermitDetail(insertRow, normalizedUserId);
    if (inserted.filter(row -> matchesInsertedPermit(row, insertRow)).isEmpty()) {
      markRollbackOnly();
      return failureMutationResponse(List.of("Unable to create permit."), null);
    }

    PermitMutationRow permit = inserted.get();
    return new PermitMutationRpcResponseDto(
        true,
        "The permit was created successfully.",
        List.of(),
        List.of(),
        permit.permitNumber(),
        permit.permitStatusCode(),
        permit.receiptNumber(),
        false,
        false,
        null);
  }

  private void validatePermitCreationContext(
      ValidatedExemptionBinding exemption,
      Long expectedApplicationNumber,
      ApplicationInfoRow application,
      List<String> errors) {
    if (!isExpectedPermitCreationApplication(
        exemption, expectedApplicationNumber, application)) {
      errors.add("The permit application context could not be verified.");
      return;
    }

    String ownerClientNumber = trimToNull(application.ownerClientNumber());
    String ownerLocationCode = trimToNull(application.ownerClientLocationCode());
    String agentClientNumber = trimToNull(application.agentClientNumber());
    String agentLocationCode = trimToNull(application.agentClientLocationCode());
    validatePermitCreationClientBinding(
        exemption, ownerClientNumber, agentClientNumber, errors);
    if (application.orgUnitNo() == null || application.orgUnitNo() < 1) {
      errors.add("The application region could not be verified.");
    }
    if (ownerClientNumber == null
        || ownerLocationCode == null
        || clientLookupService
            .getClientDataRequired(ownerClientNumber, ownerLocationCode)
            .isEmpty()) {
      errors.add("The application owner and location could not be verified.");
    }
    if ((agentClientNumber == null) != (agentLocationCode == null)
        || (agentClientNumber != null
            && clientLookupService
                .getClientDataRequired(agentClientNumber, agentLocationCode)
                .isEmpty())) {
      errors.add("The application agent and location could not be verified.");
    }
    if (!repository.isPermitStatusCodeValidRequired(EXPORT_PERMIT_STATUS_ACTIVE)) {
      errors.add("The active permit status code could not be verified.");
    }
    if (!repository.isScaleMethodCodeValidRequired(EXPORT_SCALE_METHOD_WEIGHT)) {
      errors.add("The weight scale method code could not be verified.");
    }
    String growthTypeCode = trimToNull(application.growthTypeCode());
    if (growthTypeCode != null
        && repository.findGrowthTypeDescription(growthTypeCode).isEmpty()) {
      errors.add("The application growth type could not be verified.");
    }
    String productTypeCode = trimToNull(application.productTypeCode());
    if (productTypeCode != null
        && repository.findProductTypeDescription(productTypeCode).isEmpty()) {
      errors.add("The application product type could not be verified.");
    }
  }

  private ApplicationInfoRow resolveMinisterialPermitCreationContext(
      ValidatedExemptionBinding exemption,
      List<Long> applicationNumbers,
      List<String> errors) {
    if (exemption == null
        || applicationNumbers == null
        || applicationNumbers.isEmpty()
        || errors == null) {
      return null;
    }

    List<ApplicationInfoRow> applicationContexts = new ArrayList<>();
    for (Long applicationNumber : applicationNumbers) {
      ApplicationInfoRow context =
          repository.findApplicationInfoByNumber(applicationNumber).orElse(null);
      if (!isExpectedPermitCreationApplication(exemption, applicationNumber, context)) {
        errors.add("The permit application context could not be verified.");
        return null;
      }
      applicationContexts.add(context);
    }

    ApplicationInfoRow primaryApplication = applicationContexts.getFirst();
    validatePermitCreationContext(
        exemption,
        primaryApplication.applicationNumber(),
        primaryApplication,
        errors);
    if (errors.isEmpty()
        && applicationContexts.stream()
            .skip(1)
            .anyMatch(context -> !hasSamePermitCreationContext(primaryApplication, context))) {
      errors.add(
          "Linked applications do not share one permit client, region, growth, and product context.");
    }
    return errors.isEmpty() ? primaryApplication : null;
  }

  private boolean isExpectedPermitCreationApplication(
      ValidatedExemptionBinding exemption,
      Long expectedApplicationNumber,
      ApplicationInfoRow application) {
    return exemption != null
        && application != null
        && java.util.Objects.equals(expectedApplicationNumber, application.applicationNumber())
        && sameIgnoreCase(
            exemption.detail().exemptionNumber(), application.exemptionNumber());
  }

  private boolean hasSamePermitCreationContext(
      ApplicationInfoRow first, ApplicationInfoRow candidate) {
    return first != null
        && candidate != null
        && sameText(first.ownerClientNumber(), candidate.ownerClientNumber())
        && sameText(first.ownerClientLocationCode(), candidate.ownerClientLocationCode())
        && sameText(first.agentClientNumber(), candidate.agentClientNumber())
        && sameText(first.agentClientLocationCode(), candidate.agentClientLocationCode())
        && java.util.Objects.equals(first.orgUnitNo(), candidate.orgUnitNo())
        && sameIgnoreCase(first.growthTypeCode(), candidate.growthTypeCode())
        && sameIgnoreCase(first.productTypeCode(), candidate.productTypeCode());
  }

  private void validatePermitCreationClientBinding(
      ValidatedExemptionBinding exemption,
      String ownerClientNumber,
      String agentClientNumber,
      List<String> errors) {
    String exemptionOwner = trimToNull(exemption.detail().ownerClientNumber());
    String exemptionAgent = trimToNull(exemption.detail().agentClientNumber());
    if (!java.util.Objects.equals(ownerClientNumber, exemptionOwner)) {
      errors.add("The permit owner does not match the selected exemption.");
    }
    if (!java.util.Objects.equals(agentClientNumber, exemptionAgent)) {
      errors.add("The permit agent does not match the selected exemption.");
    }
  }

  @Override
  @Transactional
  public PermitMutationRpcResponseDto addPermit(PermitMutationRequestDto request, String userId) {
    if (request == null) {
      return failureMutationResponse(List.of("Permit details are required."), null);
    }
    String normalizedUserId = trimToNull(userId);
    List<String> errors = new ArrayList<>();
    if (normalizedUserId == null) {
      errors.add("A valid user identifier is required.");
    }

    String exemptionNumber = trimToNull(request.exemptionNumber());
    if (exemptionNumber == null) {
      errors.add("A valid exemption number is required.");
    }

    ValidatedExemptionBinding exemptionBinding =
        exemptionNumber == null ? null : validateExemptionBinding(exemptionNumber, errors);
    List<Long> ministerialApplicationNumbers = List.of();
    if (exemptionBinding != null) {
      ministerialApplicationNumbers =
          validatePermitCreationEligibility(exemptionBinding, errors);
    }
    boolean blanketOic = exemptionBinding != null && exemptionBinding.blanketOic();
    ApplicationInfoRow ministerialApplication =
        exemptionBinding != null
                && EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(
                    exemptionBinding.exemptionTypeCode())
                && errors.isEmpty()
            ? resolveMinisterialPermitCreationContext(
                exemptionBinding, ministerialApplicationNumbers, errors)
            : null;

    Long submittedOrgUnitNumber =
        parsePositiveLong(
            blanketOic
                ? firstNonNull(request.oicRegion(), request.orgUnitNumber())
                : request.orgUnitNumber());
    Long orgUnitNumber =
        ministerialApplication == null
            ? submittedOrgUnitNumber
            : ministerialApplication.orgUnitNo();
    if (orgUnitNumber == null) {
      errors.add("A valid region is required.");
    }

    String permitStatus =
        normalizeCode(
            firstNonNull(trimToNull(request.permitStatus()), EXPORT_PERMIT_STATUS_ACTIVE));
    if (!EXPORT_PERMIT_STATUS_ACTIVE.equalsIgnoreCase(permitStatus)) {
      errors.add("A new permit must have active status.");
    }
    LocalDate submitDate = parseDate(request.permitSubmitDate());
    LocalDate issueDate = parseDate(request.permitIssueDate());
    LocalDate expiryDate = parseDate(request.permitExpiryDate());
    LocalDate receivedDate = blanketOic ? parseDate(request.permitRequestDate()) : submitDate;
    LocalDate estimatedShippingDate = parseDate(request.estimatedShippingDate());
    Double submittedPermitVolume = parseDouble(request.permitTotalVolume());
    Double permitVolume = firstNonNull(submittedPermitVolume, 0.0d);
    Long numberOfPieces = firstNonNull(parsePositiveLong(request.permitNumberOfPieces()), 0L);
    Long oicRequestPieces = parsePositiveLong(request.oicPermitTotalPieces());
    Double oicRequestVolume = parseDouble(request.oicPermitTotalVolume());
    String submittedOicApplicationNumber = trimToNull(request.oicApplicationNumber());
    Long oicApplicationNumber = null;
    if (submittedOicApplicationNumber != null) {
      errors.add(
          "The OIC application relationship is assigned when the first Blanket OIC package is created.");
    }
    if (isInvalidSubmittedDouble(request.permitTotalVolume(), submittedPermitVolume)) {
      errors.add("A valid permit volume is required.");
    }
    if (blanketOic
        && isInvalidSubmittedDouble(request.oicPermitTotalVolume(), oicRequestVolume)) {
      errors.add("A valid Permit Request Volume is required.");
    }
    validateSubmittedOicRequestLimits(request, blanketOic, errors);

    String growthTypeCode =
        firstNonNull(trimToNull(request.packageAgeClass()), trimToNull(request.permitGrowthType()));
    String productTypeCode = trimToNull(request.packageProductType());

    String clientNumber = trimToNull(request.ownerClientNumber());
    String clientLocationCode = trimToNull(request.ownerClientLocation());
    String agentNumber = trimToNull(request.agentClientNumber());
    String agentLocationCode = trimToNull(request.agentClientLocation());

    if (exemptionBinding != null) {
      validateClientBinding(exemptionBinding, clientNumber, agentNumber, errors);
    }

    if (ministerialApplication != null) {
      clientNumber = trimToNull(ministerialApplication.ownerClientNumber());
      clientLocationCode = trimToNull(ministerialApplication.ownerClientLocationCode());
      agentNumber = trimToNull(ministerialApplication.agentClientNumber());
      agentLocationCode = trimToNull(ministerialApplication.agentClientLocationCode());
      productTypeCode = trimToNull(ministerialApplication.productTypeCode());
      growthTypeCode = trimToNull(ministerialApplication.growthTypeCode());
    }

    if (!blanketOic && exemptionNumber != null) {
      Optional<LocalDate> exemptionExpiryDate =
          repository.findExemptionExpiryDate(exemptionNumber);
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
    String overrideIndicator = trimToNull(request.overrideInd());
    if (isInvalidSubmittedDouble(request.overrideFee(), overrideFee)) {
      return failureMutationResponse(List.of("Override fee must be greater than zero."), null);
    }
    if ("true".equalsIgnoreCase(overrideIndicator)
        && (overrideFee == null || overrideFee <= 0.0d)) {
      return failureMutationResponse(
          List.of("Override fee must be greater than zero."), null);
    }
    if ("false".equalsIgnoreCase(overrideIndicator)) {
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

    ValidationResult validation =
        permitMutationValidator.validate(insertRow, exemptionBinding.detail());
    if (!validation.valid()) {
      return validationFailureResponse(validation, null);
    }
    insertRow = validation.permit();

    Optional<PermitMutationRow> inserted = repository.insertPermitDetail(insertRow, normalizedUserId);
    PermitMutationRow expectedInsert = insertRow;
    if (inserted.filter(row -> matchesInsertedPermit(row, expectedInsert)).isEmpty()) {
      markRollbackOnly();
      return failureMutationResponse(List.of("Unable to save permit."), null);
    }

    PermitMutationRow permit = inserted.get();
    return new PermitMutationRpcResponseDto(
        true,
        "The permit was saved successfully.",
        List.of(),
        validation.warnings(),
        permit.permitNumber(),
        permit.permitStatusCode(),
        permit.receiptNumber(),
        false,
        false,
        null);
  }

  @Override
  @Transactional
  public PermitMutationRpcResponseDto updatePermit(PermitMutationRequestDto request, String userId) {
    if (request == null) {
      return failureMutationResponse(List.of("Permit details are required."), null);
    }
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
    if (EXPORT_PERMIT_STATUS_EXPIRED.equalsIgnoreCase(current.permitStatusCode())) {
      return failureMutationResponse(
          List.of("Expired permits are read-only."), permitNumber);
    }
    String currentExemptionNumber = trimToNull(current.exemptionNumber());
    boolean exemptionWasSubmitted = request.exemptionNumber() != null;
    String requestedExemptionNumber = trimToNull(request.exemptionNumber());
    if (exemptionWasSubmitted && requestedExemptionNumber == null) {
      return failureMutationResponse(
          List.of("A valid exemption number is required."), permitNumber);
    }
    String targetExemptionNumber =
        exemptionWasSubmitted ? requestedExemptionNumber : currentExemptionNumber;
    if (targetExemptionNumber == null) {
      return failureMutationResponse(
          List.of("A valid exemption number is required."), permitNumber);
    }

    boolean reparenting =
        requestedExemptionNumber != null
            && !requestedExemptionNumber.equalsIgnoreCase(currentExemptionNumber);
    String submittedOicApplicationNumber = trimToNull(request.oicApplicationNumber());
    Long requestedOicApplicationNumber = parsePositiveLong(submittedOicApplicationNumber);
    List<String> exemptionErrors = new ArrayList<>();
    if (submittedOicApplicationNumber != null && requestedOicApplicationNumber == null) {
      exemptionErrors.add("A valid OIC application number is required.");
    } else if (submittedOicApplicationNumber != null
        && !java.util.Objects.equals(
            requestedOicApplicationNumber, current.oicApplicationNumber())) {
      exemptionErrors.add(
          "The OIC application relationship cannot be changed through permit update.");
    }
    ValidatedExemptionBinding targetExemption =
        validateExemptionBinding(targetExemptionNumber, exemptionErrors);
    if (targetExemption != null) {
      validateClientBinding(
          targetExemption,
          mergeSubmittedText(request.ownerClientNumber(), current.clientNumber()),
          mergeSubmittedText(request.agentClientNumber(), current.agentNumber()),
          exemptionErrors);
      if (reparenting) {
        validatePermitReparenting(
            permitNumber,
            targetExemption,
            exemptionErrors);
      }
    }
    if (!exemptionErrors.isEmpty()) {
      return failureMutationResponse(exemptionErrors, permitNumber);
    }

    Double submittedPermitVolume = parseDouble(request.permitTotalVolume());
    Double submittedOicRequestVolume = parseDouble(request.oicPermitTotalVolume());
    List<String> numericErrors = new ArrayList<>();
    if (isInvalidSubmittedDouble(request.permitTotalVolume(), submittedPermitVolume)) {
      numericErrors.add("A valid permit volume is required.");
    }
    boolean targetBlanketOic = targetExemption != null && targetExemption.blanketOic();
    if (targetBlanketOic
        && isInvalidSubmittedDouble(
            request.oicPermitTotalVolume(), submittedOicRequestVolume)) {
      numericErrors.add("A valid Permit Request Volume is required.");
    }
    validateSubmittedOicRequestLimits(request, targetBlanketOic, numericErrors);
    if (!numericErrors.isEmpty()) {
      return failureMutationResponse(numericErrors, permitNumber);
    }

    Double overrideFee = parseDouble(request.overrideFee());
    String overrideComment = trimToNull(request.overrideComment());
    String overrideIndicator = trimToNull(request.overrideInd());
    if (isInvalidSubmittedDouble(request.overrideFee(), overrideFee)) {
      return failureMutationResponse(
          List.of("Override fee must be greater than zero."), permitNumber);
    }
    if ("true".equalsIgnoreCase(overrideIndicator)
        && (overrideFee == null || overrideFee <= 0.0d)) {
      return failureMutationResponse(
          List.of("Override fee must be greater than zero."), permitNumber);
    }
    if ("false".equalsIgnoreCase(overrideIndicator)) {
      overrideFee = null;
      overrideComment = null;
    } else if ("true".equalsIgnoreCase(overrideIndicator)) {
      overrideComment =
          mergeSubmittedText(request.overrideComment(), current.overrideComment());
    } else {
      overrideFee = firstNonNull(overrideFee, current.overrideFee());
      overrideComment =
          mergeSubmittedText(request.overrideComment(), current.overrideComment());
    }

    PermitMutationRow updated =
        new PermitMutationRow(
            permitNumber,
            mergeSubmittedText(
                request.destinationCompanyName(), current.destinationCompanyName()),
            mergeSubmittedText(request.transportName(), current.transportName()),
            mergeSubmittedDate(
                request.estimatedShippingDate(), current.estimatedShippingDate()),
            mergeSubmittedText(request.otherPortOfExport(), current.otherPortOfExport()),
            firstNonNull(parseDate(request.permitSubmitDate()), current.applicationDate()),
            firstNonNull(parseDate(firstNonNull(request.permitRequestDate(), request.permitSubmitDate())), current.receivedDate()),
            firstNonNull(parseDate(request.permitIssueDate()), current.permitIssueDate()),
            mergeSubmittedText(request.permitReceiptNo(), current.receiptNumber()),
            firstNonNull(parseDate(request.permitExpiryDate()), current.expiryDate()),
            firstNonNull(submittedPermitVolume, current.permitVolume()),
            firstNonNull(parsePositiveLong(request.permitNumberOfPieces()), current.numberOfPieces()),
            firstNonNull(current.feeInLieuVolume(), 0L),
            current.federalPermitNumber(),
            mergeSubmittedText(request.permitRemarks(), current.remarks()),
            current.entryUserId(),
            current.entryTimestamp(),
            mergeSubmittedText(request.transportType(), current.transportTypeCode()),
            firstNonNull(trimToNull(current.scaleMethodCode()), EXPORT_SCALE_METHOD_WEIGHT),
            mergeSubmittedText(request.ownerClientNumber(), current.clientNumber()),
            mergeSubmittedText(request.ownerClientLocation(), current.clientLocationCode()),
            mergeSubmittedText(request.agentClientNumber(), current.agentNumber()),
            mergeSubmittedText(request.agentClientLocation(), current.agentLocationCode()),
            targetExemptionNumber,
            firstNonNull(parsePositiveLong(firstNonNull(request.orgUnitNumber(), request.oicRegion())), current.orgUnitNo()),
            mergeSubmittedText(request.portOfExport(), current.portOfExportCode()),
            normalizeCode(
                mergeSubmittedText(request.permitStatus(), current.permitStatusCode())),
            mergeSubmittedText(
                firstNonNull(request.packageAgeClass(), request.permitGrowthType()),
                current.growthTypeCode()),
            mergeSubmittedText(request.destinationCountry(), current.countryCode()),
            overrideFee,
            overrideComment,
            current.oicApplicationNumber(),
            firstNonNull(parsePositiveLong(request.oicPermitTotalPieces()), current.oicRequestPieces()),
            firstNonNull(submittedOicRequestVolume, current.oicRequestVolume()),
            mergeSubmittedText(request.packageProductType(), current.productTypeCode()));

    if (EXPORT_PERMIT_STATUS_EXPIRED.equalsIgnoreCase(updated.permitStatusCode())) {
      return failureMutationResponse(
          List.of("Permit expiry is managed by the expiry process."), permitNumber);
    }

    List<String> oicBindingErrors = new ArrayList<>();
    validateOicApplicationBinding(
        targetExemption, current.oicApplicationNumber(), true, oicBindingErrors);
    if (!oicBindingErrors.isEmpty()) {
      return failureMutationResponse(oicBindingErrors, permitNumber);
    }

    PermitMutationRow submittedPermit = updated;
    String submittedPermitStatusCode = normalizeCode(submittedPermit.permitStatusCode());
    ValidationResult validation =
        permitMutationValidator.validate(submittedPermit, targetExemption.detail());
    if (!validation.valid()) {
      return validationFailureResponse(validation, permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_COMPLETE.equals(submittedPermitStatusCode)
        && isEnteringInvoiceStatus(
            current.permitStatusCode(), submittedPermitStatusCode)) {
      List<String> completionDateErrors =
          permitMutationValidator.validateCompletionDateRelationships(
              submittedPermit, targetExemption.detail());
      if (!completionDateErrors.isEmpty()) {
        return failureMutationResponse(completionDateErrors, permitNumber);
      }
    }
    updated = validation.permit();
    if (current.applicationDate() != null
        && !java.util.Objects.equals(
            current.applicationDate(), updated.applicationDate())) {
      return failureMutationResponse(
          List.of("The permit submit date cannot be changed after the permit is created."),
          permitNumber);
    }
    if (!java.util.Objects.equals(current.orgUnitNo(), updated.orgUnitNo())
        && !targetOrganizationMatchesLinkedApplications(updated)) {
      return failureMutationResponse(
          List.of("The permit organization must match every linked application."),
          permitNumber);
    }
    if (isInvoicedPermitStatus(current.permitStatusCode())
        && hasFeeOverrideDelta(current, updated)) {
      return failureMutationResponse(
          List.of("Fee overrides cannot be changed after permit invoicing."), permitNumber);
    }
    if (isInvoicedPermitStatus(current.permitStatusCode())
        && hasInvoiceMaterialDelta(current, updated)) {
      return failureMutationResponse(
          List.of(
              "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first."),
          permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(submittedPermitStatusCode)
        && !EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equalsIgnoreCase(
            current.permitStatusCode())) {
      return failureMutationResponse(
          List.of(
              "Payment pending is assigned automatically when an interior permit is completed without a receipt."),
          permitNumber);
    }
    if (isEnteringInvoiceStatus(
            current.permitStatusCode(), updated.permitStatusCode())
        && hasInvoicePolicyContextDelta(current, updated)) {
      return failureMutationResponse(
          List.of(
              "Invoice policy and billing fields must be saved while the permit is active before it can be completed."),
          permitNumber);
    }

    PermitInvoiceOrchestrationService invoiceOrchestrationService = null;
    if (requiresInvoiceOrchestration(current.permitStatusCode(), updated.permitStatusCode())) {
      invoiceOrchestrationService =
          permitInvoiceOrchestrationServiceProvider == null
              ? null
              : permitInvoiceOrchestrationServiceProvider.getIfAvailable();
      if (invoiceOrchestrationService == null
          || !supportsInvoiceDestination(
              invoiceOrchestrationService, updated.countryCode())) {
        return failureMutationResponse(
            List.of(
                "Invoice processing is unavailable for this destination; the permit was not changed."),
            permitNumber);
      }
    }

    boolean saved =
        repository.updatePermitDetail(updated, normalizedUserId, FEE_MASK_EFFECTIVE_DATE);
    if (!saved) {
      return failureMutationResponse(List.of("Unable to update permit."), permitNumber);
    }
    if (!synchronizePermitTransitionState(current, updated, normalizedUserId)) {
      markRollbackOnly();
      return failureMutationResponse(
          List.of("Unable to synchronize linked application or package data."), permitNumber);
    }
    if (invoiceOrchestrationService != null
        && !orchestrateInvoiceTransition(
            invoiceOrchestrationService, current, updated, normalizedUserId)) {
      markRollbackOnly();
      return failureMutationResponse(
          List.of("Unable to coordinate the permit invoice status change."), permitNumber);
    }
    if (!updateLinkedApplicationStatusesForPermitTransition(
        permitNumber,
        current.permitStatusCode(),
        updated.permitStatusCode(),
        normalizedUserId)) {
      markRollbackOnly();
      return failureMutationResponse(
          List.of("Unable to update linked application statuses."), permitNumber);
    }

    return new PermitMutationRpcResponseDto(
        true,
        "The permit was updated successfully.",
        List.of(),
        validation.warnings(),
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
    if (EXPORT_PERMIT_STATUS_EXPIRED.equalsIgnoreCase(current.permitStatusCode())) {
      return failureMutationResponse(
          List.of("Expired permits are read-only."), permitNumber);
    }
    if (EXPORT_PERMIT_STATUS_CANCELLED.equalsIgnoreCase(current.permitStatusCode())) {
      return failureMutationResponse(
          List.of("Cancelled permits must be reactivated before shipping details can be changed."),
          permitNumber);
    }
    List<String> exemptionErrors = new ArrayList<>();
    ValidatedExemptionBinding exemption =
        validateExemptionBinding(current.exemptionNumber(), exemptionErrors);
    if (exemption != null) {
      validateClientBinding(
          exemption, current.clientNumber(), current.agentNumber(), exemptionErrors);
    }
    if (!exemptionErrors.isEmpty()) {
      return failureMutationResponse(exemptionErrors, permitNumber);
    }
    PermitMutationRow updated =
        new PermitMutationRow(
            permitNumber,
            mergeSubmittedText(
                request.destinationCompanyName(), current.destinationCompanyName()),
            mergeSubmittedText(request.transportName(), current.transportName()),
            request.estimatedShippingDate() == null
                ? current.estimatedShippingDate()
                : parsedShippingDate,
            mergeSubmittedText(request.otherPortOfExport(), current.otherPortOfExport()),
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
            mergeSubmittedText(request.transportType(), current.transportTypeCode()),
            firstNonNull(trimToNull(current.scaleMethodCode()), EXPORT_SCALE_METHOD_WEIGHT),
            current.clientNumber(),
            current.clientLocationCode(),
            current.agentNumber(),
            current.agentLocationCode(),
            current.exemptionNumber(),
            current.orgUnitNo(),
            mergeSubmittedText(request.portOfExport(), current.portOfExportCode()),
            current.permitStatusCode(),
            current.growthTypeCode(),
            mergeSubmittedText(request.destinationCountry(), current.countryCode()),
            current.overrideFee(),
            current.overrideComment(),
            current.oicApplicationNumber(),
            current.oicRequestPieces(),
            current.oicRequestVolume(),
            current.productTypeCode());

    if (isInvoicedPermitStatus(current.permitStatusCode())
        && hasStringChanged(current.countryCode(), updated.countryCode())) {
      return failureMutationResponse(
          List.of("Destination country cannot be changed after permit invoicing."),
          permitNumber);
    }

    ValidationResult validation =
        permitMutationValidator.validate(updated, exemption.detail());
    if (!validation.valid()) {
      return validationFailureResponse(validation, permitNumber);
    }
    updated = validation.permit();

    boolean saved =
        repository.updatePermitDetail(updated, normalizedUserId, FEE_MASK_EFFECTIVE_DATE);
    if (!saved) {
      return failureMutationResponse(List.of("Unable to save permit."), permitNumber);
    }

    return new PermitMutationRpcResponseDto(
        true,
        "The permit was saved successfully.",
        List.of(),
        validation.warnings(),
        permitNumber,
        updated.permitStatusCode(),
        updated.receiptNumber(),
        false,
        false,
        null);
  }

  @Override
  public String getExemptionNumberForPermitMutation(Long permitNumber) {
    PermitMutationRow permit = requiredPermitMutationRow(permitNumber);
    String exemptionNumber = trimToNull(permit.exemptionNumber());
    if (exemptionNumber == null) {
      throw new DataRetrievalFailureException(
          "Permit " + permitNumber + " has no authoritative exemption relationship.");
    }
    return exemptionNumber;
  }

  @Override
  public List<Long> getApplicationNumbersForPermitMutation(Long permitNumber) {
    java.util.SortedSet<Long> applicationNumbers =
        new java.util.TreeSet<>(
            repository.findApplicationNumbersByPermitNumberRequired(permitNumber));
    PermitMutationRow permit = requiredPermitMutationRow(permitNumber);
    Long oicApplicationNumber = permit.oicApplicationNumber();
    if (oicApplicationNumber != null) {
      if (!isOicApplicationBoundToExemption(
          oicApplicationNumber, permit.exemptionNumber())) {
        throw new DataRetrievalFailureException(
            "Permit " + permitNumber + " has an invalid OIC application relationship.");
      }
      applicationNumbers.add(oicApplicationNumber);
    }
    return List.copyOf(applicationNumbers);
  }

  @Override
  public List<Long> getApplicationNumbersForExemptionMutation(String exemptionNumber) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      throw new DataRetrievalFailureException(
          "A valid exemption relationship is required for permit mutation.");
    }
    return List.copyOf(
        new java.util.TreeSet<>(
            repository.findApplicationNumbersByExemptionNumberRequired(
                normalizedExemptionNumber)));
  }

  private PermitMutationRow requiredPermitMutationRow(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      throw new DataRetrievalFailureException(
          "A valid permit number is required for aggregate mutation.");
    }
    return repository
        .findPermitMutationByPermitNumber(permitNumber)
        .orElseThrow(
            () ->
                new DataRetrievalFailureException(
                    "Permit " + permitNumber + " could not be loaded for mutation."));
  }

  @Override
  public Optional<Long> getApplicationNumberForScaleMutation(String scaleDetailId) {
    return repository
        .findScaleMutationById(trimToNull(scaleDetailId))
        .map(ScaleMutationRow::applicationNumber)
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0);
  }

  @Override
  @Transactional
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

    Optional<PermitMutationRow> permit = repository.findPermitMutationByPermitNumber(permitNumber);
    if (permit.isEmpty()) {
      return failurePersistenceResponse(List.of("Permit not found."), permitNumber);
    }
    if (isBlanketOicPermit(permit.get())
        && !isOicApplicationBoundToExemption(
            permit.get().oicApplicationNumber(), permit.get().exemptionNumber())) {
      return failurePersistenceResponse(
          List.of("The hidden OIC application does not belong to this permit's exemption."),
          permitNumber);
    }
    if (isScaleAttachmentLockedStatus(permit.get().permitStatusCode())) {
      return failurePersistenceResponse(
          List.of(
              "Scale rows cannot be changed for a completed, payment-pending, expired, or cancelled permit."),
          permitNumber);
    }

    Optional<ScaleMutationRow> existing = repository.findScaleMutationById(normalizedScaleDetailId);
    if (existing.isEmpty()) {
      return failurePersistenceResponse(List.of("Scale detail not found."), permitNumber);
    }

    ScaleMutationRow scale = existing.get();
    Long applicationNumber = scale.applicationNumber();
    if (applicationNumber == null || applicationNumber < 1) {
      return failurePersistenceResponse(
          List.of("Scale detail application could not be verified."), permitNumber);
    }

    Long currentPermitNumber = scale.exportPermitDetailNumber();
    Long targetPermitNumber;
    String attachSourceStatus = null;
    if (attachInd) {
      if (currentPermitNumber != null && !permitNumber.equals(currentPermitNumber)) {
        return failurePersistenceResponse(
            List.of("Scale detail is already assigned to another permit."), permitNumber);
      }
      if (!isScaleEligibleForPermit(scale, permit.get())) {
        return failurePersistenceResponse(
            List.of("Scale detail is not eligible for this permit."), permitNumber);
      }
      attachSourceStatus =
          repository
              .findApplicationStatusCodeByNumber(applicationNumber)
              .map(this::normalizeCode)
              .filter(status -> !status.isBlank())
              .orElse(null);
      if (attachSourceStatus == null) {
        return failurePersistenceResponse(
            List.of("Application " + applicationNumber + " status could not be verified."),
            permitNumber);
      }
      if (!APPLICATION_STATUS_EXEMPTED.equals(attachSourceStatus)
          && !APPLICATION_STATUS_PERMITTED.equals(attachSourceStatus)) {
        return failurePersistenceResponse(
            List.of(
                "Application "
                    + applicationNumber
                    + " must be exempted or permitted before a scale can be added to a permit."),
            permitNumber);
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
      markRollbackOnly();
      return failurePersistenceResponse(List.of("Unable to update scale detail."), permitNumber);
    }
    if (attachInd
        && APPLICATION_STATUS_EXEMPTED.equals(attachSourceStatus)
        && !transitionApplicationStatus(
            applicationNumber,
            APPLICATION_STATUS_EXEMPTED,
            APPLICATION_STATUS_PERMITTED,
            normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to reconcile application " + applicationNumber + " status."),
          permitNumber);
    }
    if (!attachInd
        && !synchronizeRemovedApplicationStatus(applicationNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to reconcile application " + applicationNumber + " status."),
          permitNumber);
    }
    if (!updatePermitTotals(permitNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to recalculate permit totals."), permitNumber);
    }

    return new PermitPersistenceRpcResponseDto(
        true,
        attachInd ? "Scale detail was added to the permit." : "Scale detail was removed from the permit.",
        List.of(),
        List.of(),
        permitNumber);
  }

  @Override
  @Transactional
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

    PermitMutationRow permit =
        repository
            .findPermitMutationByPermitNumber(permitNumber)
            .orElseThrow(
                () ->
                    new DataRetrievalFailureException(
                        "Permit " + permitNumber + " was unavailable after validation."));
    Map<Long, List<ScaleMutationRow>> eligibleScalesByApplication =
        findUnassignedScalesByApplication(permit.exemptionNumber(), ignored -> true);
    List<ApplicationScaleAttachmentPlan> attachmentPlans = new ArrayList<>();
    for (Long applicationNumber : applicationNumbers) {
      List<ScaleMutationRow> unassignedScales =
          eligibleScalesByApplication.getOrDefault(applicationNumber, List.of());
      if (unassignedScales.isEmpty()) {
        return failurePersistenceResponse(
            List.of(
                "Application "
                    + applicationNumber
                    + " is no longer eligible to be added to this permit."),
            permitNumber);
      }

      String sourceStatus =
          repository
              .findApplicationStatusCodeByNumber(applicationNumber)
              .map(this::normalizeCode)
              .filter(status -> !status.isBlank())
              .orElse(null);
      if (sourceStatus == null) {
        return failurePersistenceResponse(
            List.of("Application " + applicationNumber + " status could not be verified."),
            permitNumber);
      }
      if (!APPLICATION_STATUS_EXEMPTED.equals(sourceStatus)
          && !APPLICATION_STATUS_PERMITTED.equals(sourceStatus)) {
        return failurePersistenceResponse(
            List.of(
                "Application "
                    + applicationNumber
                    + " must be exempted or permitted before it can be added to a permit."),
            permitNumber);
      }
      attachmentPlans.add(
          new ApplicationScaleAttachmentPlan(applicationNumber, sourceStatus, unassignedScales));
    }

    int attachedScaleCount = 0;
    for (ApplicationScaleAttachmentPlan plan : attachmentPlans) {
      for (ScaleMutationRow scale : plan.unassignedScales()) {
        if (!updateScalePermitAssignment(scale, permitNumber, normalizedUserId)) {
          markRollbackOnly();
          return failurePersistenceResponse(
              List.of("Unable to add application " + plan.applicationNumber() + " to the permit."),
              permitNumber);
        }
        attachedScaleCount++;
      }

      if (APPLICATION_STATUS_EXEMPTED.equals(plan.sourceStatus())
          && !transitionApplicationStatus(
              plan.applicationNumber(),
              APPLICATION_STATUS_EXEMPTED,
              APPLICATION_STATUS_PERMITTED,
              normalizedUserId)) {
        markRollbackOnly();
        return failurePersistenceResponse(
            List.of(
                "Unable to reconcile application "
                    + plan.applicationNumber()
                    + " status."),
            permitNumber);
      }
    }

    if (!updatePermitTotals(permitNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to recalculate permit totals."), permitNumber);
    }
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
  @Transactional
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
    if (isScaleAttachmentLockedStatus(permit.permitStatusCode())) {
      return failurePersistenceResponse(
          List.of(
              "Applications cannot be changed for a completed, payment-pending, expired, or cancelled permit."),
          permitNumber);
    }

    int removedScaleCount = 0;
    for (ScaleMutationRow scale : repository.findScaleMutationDetailsByApplicationNumber(applicationNumber)) {
      if (!permitNumber.equals(scale.exportPermitDetailNumber())) {
        continue;
      }
      if (!updateScalePermitAssignment(scale, null, normalizedUserId)) {
        markRollbackOnly();
        return failurePersistenceResponse(
            List.of("Unable to remove application " + applicationNumber + " from the permit."), permitNumber);
      }
      removedScaleCount++;
    }

    if (removedScaleCount > 0
        && !synchronizeRemovedApplicationStatus(applicationNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to reconcile application " + applicationNumber + " status."),
          permitNumber);
    }

    if (!updatePermitTotals(permitNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to recalculate permit totals."), permitNumber);
    }
    return new PermitPersistenceRpcResponseDto(
        true,
        removedScaleCount == 1
            ? "Application scale row was removed from the permit."
            : "Application scale rows were removed from the permit.",
        List.of(),
        List.of(),
        permitNumber);
  }

  private boolean synchronizeRemovedApplicationStatus(
      Long applicationNumber, String updateUserId) {
    Optional<Boolean> effectivePermitRelationship =
        resolveEffectivePermitRelationship(applicationNumber, null, null, false);
    if (effectivePermitRelationship.isEmpty()) {
      return false;
    }

    Optional<String> currentStatus =
        repository.findApplicationStatusCodeByNumber(applicationNumber);
    String normalizedCurrentStatus = normalizeCode(currentStatus.orElse(null));
    if (normalizedCurrentStatus == null) {
      return false;
    }
    String requiredStatus =
        effectivePermitRelationship.get()
            ? APPLICATION_STATUS_EXEMPTED
            : APPLICATION_STATUS_PERMITTED;
    String targetStatus =
        effectivePermitRelationship.get()
            ? APPLICATION_STATUS_PERMITTED
            : APPLICATION_STATUS_EXEMPTED;
    if (targetStatus.equals(normalizedCurrentStatus)) {
      return true;
    }
    if (!requiredStatus.equals(normalizedCurrentStatus)) {
      return false;
    }

    return transitionApplicationStatus(
        applicationNumber,
        requiredStatus,
        targetStatus,
        updateUserId);
  }

  private boolean transitionApplicationStatus(
      Long applicationNumber,
      String requiredStatus,
      String targetStatus,
      String updateUserId) {
    ApplicationReviewRepository.ApplicationStatusTransitionRow transition =
        applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            applicationNumber,
            targetStatus,
            null,
            updateUserId,
            List.of(requiredStatus));
    return transition.applicationFound()
        && transition.transitionAllowed()
        && transition.updated();
  }

  private Optional<Boolean> resolveEffectivePermitRelationship(
      Long applicationNumber,
      Long transitioningPermitNumber,
      String transitioningPermitStatus,
      boolean requireTransitioningPermitRelationship) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    Set<Long> permitNumbers = new HashSet<>();
    for (ScaleMutationRow scale :
        repository.findScaleMutationDetailsByApplicationNumber(applicationNumber)) {
      if (scale == null) {
        return Optional.empty();
      }
      Long linkedPermitNumber = scale.exportPermitDetailNumber();
      if (linkedPermitNumber == null) {
        continue;
      }
      if (linkedPermitNumber < 1) {
        return Optional.empty();
      }
      permitNumbers.add(linkedPermitNumber);
    }

    boolean transitioningPermitFound = transitioningPermitNumber == null;
    boolean effectiveRelationshipFound = false;
    for (Long linkedPermitNumber : permitNumbers) {
      String permitStatus;
      if (linkedPermitNumber.equals(transitioningPermitNumber)) {
        transitioningPermitFound = true;
        permitStatus = normalizeCode(transitioningPermitStatus);
      } else {
        Optional<PermitMutationRow> linkedPermit =
            repository.findPermitMutationByPermitNumber(linkedPermitNumber);
        if (linkedPermit.isEmpty()) {
          return Optional.empty();
        }
        permitStatus = normalizeCode(linkedPermit.get().permitStatusCode());
      }

      if (permitStatus == null
          || !RECONCILABLE_EXPORT_PERMIT_STATUSES.contains(permitStatus)) {
        return Optional.empty();
      }
      if (EFFECTIVE_EXPORT_PERMIT_STATUSES.contains(permitStatus)) {
        effectiveRelationshipFound = true;
      }
    }

    if (requireTransitioningPermitRelationship && !transitioningPermitFound) {
      return Optional.empty();
    }
    return Optional.of(effectiveRelationshipFound);
  }

  @Override
  @Transactional
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
    errors.addAll(
        ScaleDomainValidator.validateNumericValues(scalePieces, normalizedVolume, true));
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
    if (isScaleAttachmentLockedStatus(current.permitStatusCode())) {
      return failurePersistenceResponse(
          List.of(
              "Scale rows cannot be changed for a completed, payment-pending, expired, or cancelled permit."),
          permitNumber);
    }
    if (current.oicApplicationNumber() == null || current.oicApplicationNumber() < 1) {
      return failurePersistenceResponse(
          List.of("The permit does not have an OIC application number."), permitNumber);
    }
    Long applicationNumber = current.oicApplicationNumber();
    if (!repository.findPackageNumbersByOicPermitNumber(permitNumber).contains(normalizedPackageNumber)) {
      return failurePersistenceResponse(
          List.of("Package is not available for this Blanket OIC permit."), permitNumber);
    }

    if (!repository.isValidBoicTimberMarkRequired(
        normalizedTimberMark, current.exemptionNumber())) {
      errors.add(
          "Timber mark "
              + normalizedTimberMark
              + " is not valid for exemption "
              + current.exemptionNumber()
              + ".");
    }
    if (!repository.isSpeciesCodeValidRequired(normalizedSpeciesCode)) {
      errors.add("Species code " + normalizedSpeciesCode + " does not exist.");
    }
    if (!repository.isGradeCodeValidRequired(normalizedGradeCode)) {
      errors.add("Grade code " + normalizedGradeCode + " does not exist.");
    }

    ScaleValues candidate =
        new ScaleValues(
            normalizedTimberMark,
            normalizedSpeciesCode,
            normalizedGradeCode,
            scalePieces,
            normalizedVolume);
    List<ScaleValues> packageScales =
        repository.findScaleDetailsByPackageNumber(normalizedPackageNumber).stream()
            .map(this::toScaleValues)
            .toList();
    List<ScaleValues> permitScales =
        repository.findScaleDetailsByPermitNumber(permitNumber).stream()
            .map(this::toScaleValues)
            .toList();

    if (ScaleDomainValidator.containsCombination(packageScales, candidate)) {
      errors.add(
          "A scale with the same Timber Mark/Species/Grade combination already exists.");
    }

    Optional<PackageDetailsRow> packageDetails =
        repository.findPackageDetailsByPackageNumberRequired(normalizedPackageNumber);
    if (packageDetails.isEmpty()) {
      errors.add("Package details are unavailable.");
    } else if (ScaleDomainValidator.exceedsVolume(
        packageScales, normalizedVolume, packageDetails.get().packageVolume())) {
      errors.add("The total scale volume exceeds the package volume.");
    }

    if (current.oicRequestPieces() == null) {
      errors.add("The permit request pieces limit is unavailable.");
    } else if (ScaleDomainValidator.exceedsPieces(
        permitScales, scalePieces, current.oicRequestPieces())) {
      errors.add("The total scale pieces exceed the permit request pieces.");
    }
    if (current.oicRequestVolume() == null) {
      errors.add("The permit request volume limit is unavailable.");
    } else if (ScaleDomainValidator.exceedsVolume(
        permitScales, normalizedVolume, current.oicRequestVolume())) {
      errors.add("The total scale volume exceeds the permit request volume.");
    }
    if (!errors.isEmpty()) {
      return failurePersistenceResponse(errors, permitNumber);
    }
    if (!isOicApplicationBoundToExemption(applicationNumber, current.exemptionNumber())) {
      return failurePersistenceResponse(
          List.of("The hidden OIC application does not belong to this permit's exemption."),
          permitNumber);
    }

    String applicationStatus =
        repository
            .findApplicationStatusCodeByNumber(applicationNumber)
            .map(this::normalizeCode)
            .filter(status -> !status.isBlank())
            .orElse(null);
    if (!APPLICATION_STATUS_EXEMPTED.equals(applicationStatus)
        && !APPLICATION_STATUS_PERMITTED.equals(applicationStatus)) {
      return failurePersistenceResponse(
          List.of("The hidden OIC application status could not be reconciled."), permitNumber);
    }

    Double fixedExemptionRate =
        repository.findFixedExemptionRate(current.exemptionNumber()).map(BigDecimal::doubleValue).orElse(null);
    BoicScaleMutationRecord scaleRecord =
        new BoicScaleMutationRecord(
            normalizedTimberMark,
            scalePieces,
            normalizedVolume,
            normalizedPackageNumber,
            normalizedSpeciesCode,
            normalizedGradeCode,
            applicationNumber,
            permitNumber,
            fixedExemptionRate,
            normalizedUserId,
            new Timestamp(System.currentTimeMillis()));
    Optional<PermitScaleDetailRow> inserted = repository.insertBoicScaleDetail(scaleRecord);

    if (inserted.filter(row -> matchesInsertedBoicScale(row, scaleRecord)).isEmpty()) {
      markRollbackOnly();
      return failurePersistenceResponse(List.of("Unable to add Blanket OIC scale detail."), permitNumber);
    }

    if (APPLICATION_STATUS_EXEMPTED.equals(applicationStatus)
        && !transitionApplicationStatus(
            applicationNumber,
            APPLICATION_STATUS_EXEMPTED,
            APPLICATION_STATUS_PERMITTED,
            normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to reconcile the hidden OIC application status."), permitNumber);
    }

    if (!updatePermitTotals(permitNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to recalculate permit totals."), permitNumber);
    }
    return new PermitPersistenceRpcResponseDto(
        true, "Blanket OIC scale detail was added.", List.of(), List.of(), permitNumber);
  }

  @Override
  @Transactional
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
    if (isScaleAttachmentLockedStatus(currentPermit.permitStatusCode())) {
      return failurePersistenceResponse(
          List.of(
              "Scale rows cannot be changed for a completed, payment-pending, expired, or cancelled permit."),
          permitNumber);
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
    Long applicationNumber = existingScale.get().applicationNumber();
    if (applicationNumber == null
        || !applicationNumber.equals(currentPermit.oicApplicationNumber())) {
      return failurePersistenceResponse(
          List.of("Scale detail is not assigned to this permit's hidden OIC application."),
          permitNumber);
    }
    if (!isOicApplicationBoundToExemption(
        applicationNumber, currentPermit.exemptionNumber())) {
      return failurePersistenceResponse(
          List.of("The hidden OIC application does not belong to this permit's exemption."),
          permitNumber);
    }

    if (!repository.deleteScaleDetailById(normalizedScaleDetailId, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(List.of("Unable to remove Blanket OIC scale detail."), permitNumber);
    }

    if (!synchronizeRemovedApplicationStatus(applicationNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to reconcile the hidden OIC application status."), permitNumber);
    }

    if (!updatePermitTotals(permitNumber, normalizedUserId)) {
      markRollbackOnly();
      return failurePersistenceResponse(
          List.of("Unable to recalculate permit totals."), permitNumber);
    }
    return new PermitPersistenceRpcResponseDto(
        true, "Blanket OIC scale detail was removed.", List.of(), List.of(), permitNumber);
  }

  @Override
  @Transactional
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

    Optional<PermitMutationRow> permit = repository.findPermitMutationByPermitNumber(permitNumber);
    if (permit.isEmpty()) {
      return failurePersistenceResponse(List.of("Permit not found."), permitNumber);
    }
    if (!EXPORT_PERMIT_STATUS_ACTIVE.equalsIgnoreCase(
        trimToNull(permit.get().permitStatusCode()))) {
      return failurePersistenceResponse(
          List.of("Invoices can only be added to active permits."), permitNumber);
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
    if (inserted
        .filter(
            row ->
                matchesInsertedSalesInvoice(
                    row,
                    normalizedSalesInvoiceNumber,
                    invoiceExportValue,
                    invoiceConversionRate,
                    invoiceFeeInLieu))
        .isEmpty()) {
      markRollbackOnly();
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
    return new PermitInvoiceListRpcResponseDto(
        repository.findInvoiceNumbersByPermitRequired(permitNumber));
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
    Optional<Double> conversionRate =
        repository.findCurrencyConversionRateByDate(LexisBusinessTime.today(), "USD");
    if (conversionRate.isEmpty()
        || !Double.isFinite(conversionRate.get())
        || conversionRate.get() <= 0.0d) {
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

    List<Long> applicationNumbers =
        repository.findApplicationNumbersByPermitNumberRequired(permitNumber).stream()
            .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
            .distinct()
            .toList();

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    List<PermitDocumentItemRpcResponseDto> documents = new ArrayList<>();
    repository.findPermitDocumentDetailsByPermitNumber(permitNumber).stream()
        .map(
            row -> {
              PermitDocumentProvenance provenance = permitDocumentProvenance(row);
              return toDocumentItem(
                  row,
                  provenance.source(),
                  null,
                  permitNumber,
                  provenance.deletable(),
                  attachmentTypeByCode);
            })
        .forEach(documents::add);

    for (Long applicationNumber : applicationNumbers) {
      repository.findApplicationDocumentDetailsByApplicationNumber(applicationNumber).stream()
          .map(
              row ->
                  toDocumentItem(
                      row,
                      "application",
                      applicationNumber,
                      null,
                      false,
                      attachmentTypeByCode))
          .forEach(documents::add);
    }

    return List.copyOf(documents);
  }

  private PermitDocumentItemRpcResponseDto toDocumentItem(
      DocumentRow row,
      String source,
      Long sourceApplicationNumber,
      Long sourcePermitNumber,
      boolean deletable,
      Map<String, String> attachmentTypeByCode) {
    String typeCode = nonNull(trimToNull(row.attachmentTypeCode()));
    return new PermitDocumentItemRpcResponseDto(
        nonNull(row.fileName()),
        nonNull(row.description()),
        resolveAttachmentTypeDescription(typeCode, attachmentTypeByCode),
        typeCode,
        row.id(),
        source,
        sourceApplicationNumber,
        sourcePermitNumber,
        deletable);
  }

  private PermitDocumentProvenance permitDocumentProvenance(DocumentRow row) {
    boolean permitRelationship = repository.isPermitFileAttachmentRequired(row.id());
    String typeCode = nonNull(trimToNull(row.attachmentTypeCode())).toUpperCase(Locale.ROOT);
    if (permitRelationship && "PMT".equals(typeCode)) {
      return new PermitDocumentProvenance("permit", true);
    }
    if (!permitRelationship && "INV".equals(typeCode)) {
      return new PermitDocumentProvenance("invoice", true);
    }
    LOGGER.warn(
        "event=lexis_permit_attachment operation=resolve_provenance outcome=inconsistent attachmentFingerprint={} relationship={} type={}",
        fingerprint(Long.toString(row.id())),
        permitRelationship ? "permit" : "invoice",
        controlSafe(typeCode));
    return new PermitDocumentProvenance("unknown", false);
  }

  private record PermitDocumentProvenance(String source, boolean deletable) {}

  @Override
  public Optional<DocumentStreamer> streamDocument(Long fileId) {
    if (fileId == null || fileId < 1) {
      return Optional.empty();
    }
    return Optional.of(
        outputStream -> {
          if (!repository.streamFileAttachment(fileId, outputStream)) {
            throw new java.io.FileNotFoundException("Permit attachment was not found.");
          }
        });
  }

  @Override
  public boolean removePermitDocument(Long documentId) {
    return repository.deletePermitFile(documentId);
  }

  @Override
  public Optional<Long> getApplicationNumberForDocumentMutation(
      Long documentId, Long permitNumber) {
    if (documentId == null || documentId < 1 || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    List<Long> matches =
        repository.findApplicationNumbersByPermitNumberRequired(permitNumber).stream()
            .filter(
                applicationNumber ->
                    repository
                        .findApplicationDocumentDetailsByApplicationNumberRequired(
                            applicationNumber)
                        .stream()
                        .anyMatch(document -> documentId.equals(document.id())))
            .toList();
    if (matches.size() > 1) {
      throw new DataRetrievalFailureException(
          "Application document ownership is ambiguous for document " + documentId + ".");
    }
    return matches.stream().findFirst();
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

  private ScaleValues toScaleValues(PermitScaleDetailRow scale) {
    return new ScaleValues(
        scale.timberMark(),
        scale.exportSpeciesCode(),
        scale.exportGradeCode(),
        scale.piecesCount(),
        scale.speciesGradeVolume());
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
      throw new DataRetrievalFailureException(
          "A scale identifier is required to calculate average market value.");
    }

    if (context.amvByScaleId().containsKey(scaleId)) {
      return context.amvByScaleId().get(scaleId);
    }

    BigDecimal amv =
        repository
            .findAverageMarketValueByScaleId(scaleId)
            .orElseThrow(
                () ->
                    new DataRetrievalFailureException(
                        "Average market value was unavailable for scale " + scaleId + "."));
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
      throw new DataRetrievalFailureException(
          "An application number is required to determine the permit fee policy.");
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

  private FeeCalculationContext buildFeeContext(PermitMutationRow permit) {
    String exemptionNumber = trimToNull(permit.exemptionNumber());
    String exemptionTypeCode =
        exemptionNumber == null
            ? null
            : repository
                .findExemptionTypeCode(exemptionNumber)
                .orElseThrow(
                    () ->
                        new DataRetrievalFailureException(
                            "The permit exemption type was unavailable for invoicing."));
    BigDecimal fixedExemptionRate =
        exemptionNumber == null
            ? null
            : repository.findFixedExemptionRate(exemptionNumber).orElse(null);
    BigDecimal feePolicyPercentIncrease =
        repository.findFeePolicyPercentIncrease(permit.applicationDate(), permit.orgUnitNo());

    return new FeeCalculationContext(
        permit.permitNumber(),
        permit.orgUnitNo(),
        permit.applicationDate(),
        exemptionNumber,
        trimToNull(exemptionTypeCode),
        fixedExemptionRate,
        feePolicyPercentIncrease == null ? BigDecimal.ZERO : feePolicyPercentIncrease,
        trimToNull(permit.countryCode()),
        permit.overrideFee() == null ? 0.0d : permit.overrideFee(),
        new HashMap<>(),
        new HashMap<>());
  }

  private ValidatedExemptionBinding validateExemptionBinding(
      String exemptionNumber, List<String> errors) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      errors.add("A valid exemption number is required.");
      return null;
    }

    Optional<ExemptionDetailDto> detailResult =
        exemptionService.findByExemptionNumber(normalizedExemptionNumber);
    Optional<String> repositoryTypeResult =
        repository.findExemptionTypeCode(normalizedExemptionNumber);
    if (detailResult.isEmpty() || repositoryTypeResult.isEmpty()) {
      errors.add("A valid exemption number is required.");
      return null;
    }

    ExemptionDetailDto detail = detailResult.get();
    String detailNumber = trimToNull(detail.exemptionNumber());
    String detailType = trimToNull(detail.exemptionTypeCode());
    String repositoryType = trimToNull(repositoryTypeResult.get());
    boolean supportedType =
        EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(detailType)
            || EXEMPTION_TYPE_BLANKET_OIC.equalsIgnoreCase(detailType);
    boolean blanketOic = EXEMPTION_TYPE_BLANKET_OIC.equalsIgnoreCase(detailType);
    if (!normalizedExemptionNumber.equalsIgnoreCase(detailNumber)
        || !supportedType
        || !detailType.equalsIgnoreCase(repositoryType)
        || detail.blanketOic() != blanketOic) {
      errors.add("The exemption type or identity could not be verified.");
      return null;
    }

    return new ValidatedExemptionBinding(detail, detailType, blanketOic);
  }

  private void validateClientBinding(
      ValidatedExemptionBinding exemption,
      String ownerClientNumber,
      String agentClientNumber,
      List<String> errors) {
    if (!EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(exemption.exemptionTypeCode())) {
      return;
    }

    String submittedOwner = trimToNull(ownerClientNumber);
    String submittedAgent = trimToNull(agentClientNumber);
    String exemptionOwner = trimToNull(exemption.detail().ownerClientNumber());
    String exemptionAgent = trimToNull(exemption.detail().agentClientNumber());
    if (submittedOwner != null && !submittedOwner.equals(exemptionOwner)) {
      errors.add("The permit owner does not match the selected exemption.");
    }
    if (submittedAgent != null && !submittedAgent.equals(exemptionAgent)) {
      errors.add("The permit agent does not match the selected exemption.");
    }
  }

  private List<Long> validatePermitCreationEligibility(
      ValidatedExemptionBinding exemption, List<String> errors) {
    String statusCode = normalizeCode(exemption.detail().exemptionStatusCode());
    if (!EXEMPTION_STATUS_ACTIVE.equals(statusCode)) {
      errors.add("A new permit can only be created from an active exemption.");
      return List.of();
    }
    if (!EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(exemption.exemptionTypeCode())) {
      return List.of();
    }

    String exemptionNumber = exemption.detail().exemptionNumber();
    List<Long> applicationNumbers =
        repository.findApplicationNumbersByExemptionNumberRequired(exemptionNumber);
    if (applicationNumbers.isEmpty()) {
      errors.add(
          "A Ministerial exemption must have at least one linked application before a permit can be created.");
      return List.of();
    }

    for (Long applicationNumber : applicationNumbers) {
      String applicationStatus =
          repository
              .findApplicationStatusCodeByNumber(applicationNumber)
              .map(this::normalizeCode)
              .filter(status -> !status.isBlank())
              .orElse(null);
      if (applicationStatus == null) {
        errors.add(
            "Application " + applicationNumber + " status could not be verified.");
      } else if (!APPLICATION_STATUS_EXEMPTED.equals(applicationStatus)
          && !APPLICATION_STATUS_PERMITTED.equals(applicationStatus)) {
        errors.add(
            "Every application linked to a Ministerial exemption must be exempted or permitted before a permit can be created.");
      }
    }
    return applicationNumbers;
  }

  private void validateOicApplicationBinding(
      ValidatedExemptionBinding exemption,
      Long oicApplicationNumber,
      boolean rejectForMinisterial,
      List<String> errors) {
    if (oicApplicationNumber == null) {
      return;
    }
    if (rejectForMinisterial && !exemption.blanketOic()) {
      errors.add("An OIC application can only be linked to a Blanket OIC exemption.");
      return;
    }

    if (!isOicApplicationBoundToExemption(
        oicApplicationNumber, exemption.detail().exemptionNumber())) {
      errors.add("The OIC application does not belong to the selected exemption.");
    }
  }

  private boolean isOicApplicationBoundToExemption(
      Long applicationNumber, String exemptionNumber) {
    String normalizedExemptionNumber = trimToNull(exemptionNumber);
    if (applicationNumber == null
        || applicationNumber < 1
        || normalizedExemptionNumber == null) {
      return false;
    }
    return repository
        .findApplicationInfoByNumber(applicationNumber)
        .filter(
            application ->
                normalizedExemptionNumber.equalsIgnoreCase(
                    trimToNull(application.exemptionNumber()))
                    && "Y".equals(trimToNull(application.oicIndicator())))
        .isPresent();
  }

  private void validatePermitReparenting(
      Long permitNumber,
      ValidatedExemptionBinding targetExemption,
      List<String> errors) {
    String exemptionNumber = targetExemption.detail().exemptionNumber();

    List<Long> linkedApplications =
        repository.findApplicationNumbersByPermitNumberRequired(permitNumber);
    if (!linkedApplications.isEmpty()) {
      Set<Long> targetApplications =
          Set.copyOf(repository.findApplicationNumbersByExemptionNumber(exemptionNumber));
      if (linkedApplications.stream().anyMatch(value -> !targetApplications.contains(value))) {
        errors.add("The permit has applications that do not belong to the selected exemption.");
      }
    }

    Set<String> linkedPackages =
        java.util.stream.Stream.concat(
                repository.findPackageNumbersByPermitNumberRequired(permitNumber).stream(),
                repository.findPackageNumbersByOicPermitNumber(permitNumber).stream())
            .map(this::normalizeIdentifier)
            .filter(value -> value != null)
            .collect(java.util.stream.Collectors.toSet());
    if (!linkedPackages.isEmpty()) {
      Set<String> targetPackages =
          repository.findPackagesByExemptionNumberRequired(exemptionNumber).stream()
              .map(PackageCandidateRow::packageNumber)
              .map(this::normalizeIdentifier)
              .filter(value -> value != null)
              .collect(java.util.stream.Collectors.toSet());
      if (!targetPackages.containsAll(linkedPackages)) {
        errors.add("The permit has packages that do not belong to the selected exemption.");
      }
    }
  }

  private String normalizeIdentifier(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private PermitMutationRpcResponseDto failureMutationResponse(List<String> errors, Long permitNumber) {
    return new PermitMutationRpcResponseDto(
        false, "", errors, List.of(), permitNumber, null, null, null, null, null);
  }

  private PermitMutationRpcResponseDto validationFailureResponse(
      ValidationResult validation, Long permitNumber) {
    PermitMutationRow permit = validation == null ? null : validation.permit();
    return new PermitMutationRpcResponseDto(
        false,
        "",
        validation == null ? List.of("Permit validation failed.") : validation.errors(),
        validation == null ? List.of() : validation.warnings(),
        permitNumber,
        permit == null ? null : permit.permitStatusCode(),
        permit == null ? null : permit.receiptNumber(),
        false,
        false,
        null);
  }

  private PermitPersistenceRpcResponseDto failurePersistenceResponse(
      List<String> errors, Long permitNumber) {
    return new PermitPersistenceRpcResponseDto(false, "", errors, List.of(), permitNumber);
  }

  private boolean isScaleAttachmentLockedStatus(String permitStatusCode) {
    String normalized = trimToNull(permitStatusCode);
    return EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(normalized)
        || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equalsIgnoreCase(normalized)
        || EXPORT_PERMIT_STATUS_EXPIRED.equalsIgnoreCase(normalized)
        || EXPORT_PERMIT_STATUS_CANCELLED.equalsIgnoreCase(normalized);
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
    if (isScaleAttachmentLockedStatus(permit.permitStatusCode())) {
      return List.of(
          "Applications cannot be changed for a completed, payment-pending, expired, or cancelled permit.");
    }

    String exemptionNumber = trimToNull(permit.exemptionNumber());
    if (exemptionNumber == null) {
      return List.of("Permit exemption is unavailable.");
    }
    Set<Long> eligibleApplicationNumbers =
        findUnassignedScalesByApplication(exemptionNumber, ignored -> true).entrySet().stream()
            .filter(entry -> !entry.getValue().isEmpty())
            .map(Map.Entry::getKey)
            .collect(java.util.stream.Collectors.toSet());
    List<Long> ineligibleApplications =
        applicationNumbers.stream()
            .filter(applicationNumber -> !eligibleApplicationNumbers.contains(applicationNumber))
            .toList();
    if (!ineligibleApplications.isEmpty()) {
      return List.of(
          "Applications are not eligible for this permit: "
              + ineligibleApplications.stream()
                  .map(String::valueOf)
                  .collect(java.util.stream.Collectors.joining(", "))
              + ".");
    }
    return List.of();
  }

  private boolean isScaleEligibleForPermit(
      ScaleMutationRow scale, PermitMutationRow permit) {
    if (scale == null || permit == null || scale.applicationNumber() == null) {
      return false;
    }
    String packageNumber = trimToNull(scale.packageNumber());
    if (packageNumber == null) {
      return false;
    }
    if (isBlanketOicPermit(permit)) {
      return isOicApplicationBoundToExemption(
              permit.oicApplicationNumber(), permit.exemptionNumber())
          && scale.applicationNumber().equals(permit.oicApplicationNumber())
          && repository.findPackageNumbersByOicPermitNumber(permit.permitNumber()).stream()
              .map(TextUtils::trimToNull)
              .anyMatch(packageNumber::equals);
    }

    String exemptionNumber = trimToNull(permit.exemptionNumber());
    String normalizedPackageNumber = normalizeIdentifier(packageNumber);
    if (exemptionNumber == null || normalizedPackageNumber == null) {
      return false;
    }
    boolean belongsToExemption =
        repository.findPackagesByExemptionNumberRequired(exemptionNumber).stream()
            .anyMatch(
                row ->
                    scale.applicationNumber().equals(row.applicationNumber())
                        && normalizedPackageNumber.equals(
                            normalizeIdentifier(row.packageNumber())));
    return belongsToExemption
        && (scale.exportPermitDetailNumber() == null
            || permit.permitNumber().equals(scale.exportPermitDetailNumber()));
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
        && repository
            .findExemptionTypeCode(exemptionNumber)
            .map(EXEMPTION_TYPE_BLANKET_OIC::equalsIgnoreCase)
            .orElse(false);
  }

  private boolean updatePermitTotals(Long permitNumber, String userId) {
    Optional<PermitMutationRow> existing = repository.findPermitMutationByPermitNumber(permitNumber);
    if (existing.isEmpty()) {
      return false;
    }

    List<PermitScaleDetailRow> permitScales = repository.findScaleDetailsByPermitNumber(permitNumber);
    double totalVolume =
        permitScales.stream().mapToDouble(PermitScaleDetailRow::speciesGradeVolume).sum();
    long totalPieces = permitScales.stream().mapToLong(PermitScaleDetailRow::piecesCount).sum();

    PermitMutationRow current = existing.get();
    Double currentVolume = firstNonNull(current.permitVolume(), 0.0d);
    Long currentPieces = firstNonNull(current.numberOfPieces(), 0L);
    if (Double.compare(currentVolume, totalVolume) == 0 && currentPieces == totalPieces) {
      return true;
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
    return repository.updatePermitDetail(updated, userId, null);
  }

  private boolean updateLinkedApplicationStatusesForPermitTransition(
      Long permitNumber, String previousStatus, String targetStatus, String userId) {
    String normalizedPrevious = normalizeCode(previousStatus);
    String normalizedTarget = normalizeCode(targetStatus);

    // Preserve legacy cancellation behavior: applications remain permitted when a payment-pending
    // permit is cancelled.
    if (EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(normalizedPrevious)
        && EXPORT_PERMIT_STATUS_CANCELLED.equals(normalizedTarget)) {
      return true;
    }

    String requiredApplicationStatus;
    String newApplicationStatus;
    boolean deriveStatusFromEffectiveRelationships = false;

    if (EFFECTIVE_EXPORT_PERMIT_STATUSES.contains(normalizedPrevious)
        && EXPORT_PERMIT_STATUS_CANCELLED.equals(normalizedTarget)) {
      requiredApplicationStatus = null;
      newApplicationStatus = null;
      deriveStatusFromEffectiveRelationships = true;
    } else if (EXPORT_PERMIT_STATUS_CANCELLED.equals(normalizedPrevious)
        && EFFECTIVE_EXPORT_PERMIT_STATUSES.contains(normalizedTarget)) {
      requiredApplicationStatus = null;
      newApplicationStatus = null;
      deriveStatusFromEffectiveRelationships = true;
    } else if (EXPORT_PERMIT_STATUS_ACTIVE.equals(normalizedPrevious)
        && (EXPORT_PERMIT_STATUS_COMPLETE.equals(normalizedTarget)
            || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(normalizedTarget))) {
      requiredApplicationStatus = APPLICATION_STATUS_EXEMPTED;
      newApplicationStatus = APPLICATION_STATUS_PERMITTED;
    } else {
      return true;
    }

    for (Long applicationNumber :
        repository.findApplicationNumbersByPermitNumberRequired(permitNumber)) {
      Optional<String> currentStatus =
          repository.findApplicationStatusCodeByNumber(applicationNumber);
      if (currentStatus.isEmpty()) {
        return false;
      }
      String normalizedApplicationStatus = normalizeCode(currentStatus.get());
      if (deriveStatusFromEffectiveRelationships) {
        Optional<Boolean> effectivePermitRelationship =
            resolveEffectivePermitRelationship(
                applicationNumber, permitNumber, normalizedTarget, true);
        if (effectivePermitRelationship.isEmpty()) {
          return false;
        }
        requiredApplicationStatus =
            effectivePermitRelationship.get()
                ? APPLICATION_STATUS_EXEMPTED
                : APPLICATION_STATUS_PERMITTED;
        newApplicationStatus =
            effectivePermitRelationship.get()
                ? APPLICATION_STATUS_PERMITTED
                : APPLICATION_STATUS_EXEMPTED;
      }
      if (newApplicationStatus.equals(normalizedApplicationStatus)) {
        continue;
      }
      if (!requiredApplicationStatus.equals(normalizedApplicationStatus)) {
        return false;
      }
      if (!transitionApplicationStatus(
          applicationNumber,
          requiredApplicationStatus,
          newApplicationStatus,
          userId)) {
        return false;
      }
    }
    return true;
  }

  private boolean synchronizePermitTransitionState(
      PermitMutationRow previous, PermitMutationRow target, String userId) {
    if (isBlanketOicPermit(target)
        && (!java.util.Objects.equals(
                trimToNull(previous.clientNumber()), trimToNull(target.clientNumber()))
            || !java.util.Objects.equals(
                trimToNull(previous.clientLocationCode()),
                trimToNull(target.clientLocationCode())))) {
      Long applicationNumber = target.oicApplicationNumber();
      if (applicationNumber == null
          || applicationDetailsRpcService == null
          || !applicationDetailsRpcService.synchronizeApplicationOwner(
              applicationNumber,
              target.clientNumber(),
              target.clientLocationCode(),
              userId)) {
        return false;
      }
    }

    String targetStatus = normalizeCode(target.permitStatusCode());
    boolean volumeMayChange =
        EXPORT_PERMIT_STATUS_ACTIVE.equals(targetStatus)
            || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(targetStatus)
            || EXPORT_PERMIT_STATUS_COMPLETE.equals(targetStatus);

    List<String> packageNumbers =
        repository.findPackageNumbersByPermitNumberRequired(target.permitNumber()).stream()
            .filter(packageNumber -> trimToNull(packageNumber) != null)
            .distinct()
            .sorted()
            .toList();
    for (String packageNumber : packageNumbers) {
      PackageInfoRow packageInfo =
          repository.findPackageInfoByPackageNumber(packageNumber).orElse(null);
      if (packageInfo == null || packageInfo.applicationNumber() == null) {
        return false;
      }
      ApplicationInfoRow application =
          repository.findApplicationInfoByNumber(packageInfo.applicationNumber()).orElse(null);
      if (application == null || trimToNull(application.exemptionNumber()) == null) {
        return false;
      }
      String exemptionType =
          repository.findExemptionTypeCode(application.exemptionNumber()).orElse(null);
      if (trimToNull(exemptionType) == null) {
        return false;
      }
      boolean ministerial = EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(exemptionType);
      boolean blanketOic = EXEMPTION_TYPE_BLANKET_OIC.equalsIgnoreCase(exemptionType);
      boolean synchronizePackage =
          ministerial
              || (blanketOic && EXPORT_PERMIT_STATUS_COMPLETE.equals(targetStatus));
      if (!synchronizePackage) {
        continue;
      }

      if (applicationDetailsRpcService == null) {
        return false;
      }

      Double derivedPackageVolume = null;
      if (!ministerial || volumeMayChange) {
        derivedPackageVolume =
            repository.findScaleDetailsByPackageNumber(packageNumber).stream()
                .filter(
                    scale ->
                        target.permitNumber().toString().equals(
                            trimToNull(scale.exportPermitDetailNumber())))
                .mapToDouble(PermitScaleDetailRow::speciesGradeVolume)
                .sum();
      }
      boolean synchronizedPackage =
          ministerial
              ? applicationDetailsRpcService.synchronizePackageForPermitTransition(
                  packageNumber,
                  derivedPackageVolume,
                  application.growthTypeCode(),
                  application.productTypeCode(),
                  userId)
              : applicationDetailsRpcService.synchronizePackageVolumeForPermitTransition(
                  packageNumber, derivedPackageVolume, userId);
      if (!synchronizedPackage) {
        return false;
      }
    }
    return true;
  }

  private boolean requiresInvoiceOrchestration(String previousStatus, String targetStatus) {
    return isEnteringInvoiceStatus(previousStatus, targetStatus)
        || isLeavingInvoiceStatus(previousStatus, targetStatus);
  }

  private boolean isEnteringInvoiceStatus(String previousStatus, String targetStatus) {
    String normalizedPrevious = normalizeCode(previousStatus);
    String normalizedTarget = normalizeCode(targetStatus);
    return (EXPORT_PERMIT_STATUS_CANCELLED.equals(normalizedPrevious)
            || EXPORT_PERMIT_STATUS_ACTIVE.equals(normalizedPrevious))
        && (EXPORT_PERMIT_STATUS_COMPLETE.equals(normalizedTarget)
            || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(normalizedTarget));
  }

  private boolean isLeavingInvoiceStatus(String previousStatus, String targetStatus) {
    String normalizedPrevious = normalizeCode(previousStatus);
    String normalizedTarget = normalizeCode(targetStatus);
    return (EXPORT_PERMIT_STATUS_COMPLETE.equals(normalizedPrevious)
            || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(normalizedPrevious))
        && (EXPORT_PERMIT_STATUS_CANCELLED.equals(normalizedTarget)
            || EXPORT_PERMIT_STATUS_ACTIVE.equals(normalizedTarget));
  }

  private boolean isInvoicedPermitStatus(String status) {
    String normalized = normalizeCode(status);
    return EXPORT_PERMIT_STATUS_COMPLETE.equals(normalized)
        || EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(normalized);
  }

  private boolean hasFeeOverrideDelta(PermitMutationRow current, PermitMutationRow target) {
    boolean currentEnabled = current.overrideFee() != null && current.overrideFee() > 0.0d;
    boolean targetEnabled = target.overrideFee() != null && target.overrideFee() > 0.0d;
    return currentEnabled != targetEnabled
        || !java.util.Objects.equals(current.overrideFee(), target.overrideFee())
        || !java.util.Objects.equals(current.overrideComment(), target.overrideComment());
  }

  private boolean hasInvoiceMaterialDelta(
      PermitMutationRow current, PermitMutationRow target) {
    boolean paymentPendingCompletion = isPaymentPendingCompletion(current, target);
    return hasStringChanged(current.countryCode(), target.countryCode())
        || hasStringChanged(current.exemptionNumber(), target.exemptionNumber())
        || !java.util.Objects.equals(current.orgUnitNo(), target.orgUnitNo())
        || !java.util.Objects.equals(current.applicationDate(), target.applicationDate())
        || !java.util.Objects.equals(current.permitIssueDate(), target.permitIssueDate())
        || (!paymentPendingCompletion
            && hasStringChanged(current.receiptNumber(), target.receiptNumber()))
        || !java.util.Objects.equals(current.permitVolume(), target.permitVolume())
        || !java.util.Objects.equals(current.numberOfPieces(), target.numberOfPieces())
        || hasStringChanged(current.clientNumber(), target.clientNumber())
        || hasStringChanged(current.clientLocationCode(), target.clientLocationCode())
        || hasStringChanged(current.agentNumber(), target.agentNumber())
        || hasStringChanged(current.agentLocationCode(), target.agentLocationCode())
        || hasStringChanged(current.growthTypeCode(), target.growthTypeCode())
        || hasStringChanged(current.productTypeCode(), target.productTypeCode())
        || !java.util.Objects.equals(
            current.oicApplicationNumber(), target.oicApplicationNumber())
        || !java.util.Objects.equals(current.oicRequestPieces(), target.oicRequestPieces())
        || !java.util.Objects.equals(current.oicRequestVolume(), target.oicRequestVolume());
  }

  private boolean hasInvoicePolicyContextDelta(
      PermitMutationRow current, PermitMutationRow target) {
    return hasStringChanged(current.countryCode(), target.countryCode())
        || hasStringChanged(current.exemptionNumber(), target.exemptionNumber())
        || !java.util.Objects.equals(current.orgUnitNo(), target.orgUnitNo())
        || !java.util.Objects.equals(current.applicationDate(), target.applicationDate())
        || hasStringChanged(current.clientNumber(), target.clientNumber())
        || hasStringChanged(current.clientLocationCode(), target.clientLocationCode())
        || hasStringChanged(current.agentNumber(), target.agentNumber())
        || hasStringChanged(current.agentLocationCode(), target.agentLocationCode());
  }

  private boolean targetOrganizationMatchesLinkedApplications(PermitMutationRow target) {
    if (target == null || target.permitNumber() == null || target.orgUnitNo() == null) {
      return false;
    }
    try {
      java.util.SortedSet<Long> applicationNumbers =
          new java.util.TreeSet<>(
              repository.findApplicationNumbersByPermitNumberRequired(
                  target.permitNumber()));
      if (target.oicApplicationNumber() != null) {
        if (target.oicApplicationNumber() < 1) {
          return false;
        }
        applicationNumbers.add(target.oicApplicationNumber());
      }
      for (Long applicationNumber : applicationNumbers) {
        ApplicationInfoRow application =
            repository.findApplicationInfoByNumber(applicationNumber).orElse(null);
        if (application == null
            || !target.orgUnitNo().equals(application.orgUnitNo())
            || !sameIgnoreCase(
                target.exemptionNumber(), application.exemptionNumber())) {
          return false;
        }
      }
      return true;
    } catch (RuntimeException ex) {
      LOGGER.warn(
          "event=lexis_permit_mutation operation=verify_linked_organizations outcome=failed permitFingerprint={} failureType={}",
          fingerprint(Long.toString(target.permitNumber())),
          exceptionType(ex));
      return false;
    }
  }

  private boolean isPaymentPendingCompletion(
      PermitMutationRow current, PermitMutationRow target) {
    return EXPORT_PERMIT_STATUS_PAYMENT_PENDING.equals(
            normalizeCode(current.permitStatusCode()))
        && EXPORT_PERMIT_STATUS_COMPLETE.equals(normalizeCode(target.permitStatusCode()))
        && trimToNull(current.receiptNumber()) == null
        && trimToNull(target.receiptNumber()) != null
        && java.util.Objects.equals(
            current.permitIssueDate(), target.permitIssueDate());
  }

  private boolean orchestrateInvoiceTransition(
      PermitInvoiceOrchestrationService service,
      PermitMutationRow previous,
      PermitMutationRow target,
      String userId) {
    try {
      InternalInvoiceSnapshot internalInvoice =
          isCanadaCountryCode(target.countryCode())
                  && isEnteringInvoiceStatus(
                      previous.permitStatusCode(), target.permitStatusCode())
              ? buildCanadianInternalInvoiceSnapshot(target)
              : null;
      PermitInvoiceOrchestrationService.TransitionResult result =
          service.orchestrate(
              new PermitInvoiceOrchestrationService.Transition(
                  target.permitNumber(),
                  previous.permitStatusCode(),
                  target.permitStatusCode(),
                  target.countryCode(),
                  target.exemptionNumber(),
                  target.orgUnitNo(),
                  target.clientNumber(),
                  target.clientLocationCode(),
                  target.receiptNumber(),
                  internalInvoice),
              userId);
      if (result == null || !result.success()) {
        LOGGER.warn(
            "event=lexis_permit_invoice operation=orchestrate outcome=rejected permitFingerprint={} fromStatus={} toStatus={} resultState={}",
            fingerprint(Long.toString(target.permitNumber())),
            controlSafe(previous.permitStatusCode()),
            controlSafe(target.permitStatusCode()),
            result == null ? "missing" : "failed");
        return false;
      }
      return true;
    } catch (RuntimeException ex) {
      LOGGER.warn(
          "event=lexis_permit_invoice operation=orchestrate outcome=failed permitFingerprint={} fromStatus={} toStatus={} failureType={}",
          fingerprint(Long.toString(target.permitNumber())),
          controlSafe(previous.permitStatusCode()),
          controlSafe(target.permitStatusCode()),
          exceptionType(ex));
      return false;
    }
  }

  private boolean supportsInvoiceDestination(
      PermitInvoiceOrchestrationService service, String countryCode) {
    try {
      return service.supportsCountry(countryCode);
    } catch (RuntimeException ex) {
      LOGGER.warn(
          "event=lexis_permit_invoice operation=destination_check outcome=failed country={} failureType={}",
          controlSafe(countryCode),
          exceptionType(ex));
      return false;
    }
  }

  private InternalInvoiceSnapshot buildCanadianInternalInvoiceSnapshot(
      PermitMutationRow permit) {
    if (permit == null
        || permit.permitNumber() == null
        || permit.permitNumber() < 1
        || permit.applicationDate() == null
        || !isCanadaCountryCode(permit.countryCode())) {
      throw new DataRetrievalFailureException(
          "A valid Canadian permit is required for internal invoicing.");
    }

    List<PermitScaleDetailRow> scales =
        repository.findScaleDetailsByPermitNumber(permit.permitNumber());
    if (scales == null || scales.isEmpty()) {
      throw new DataRetrievalFailureException(
          "At least one permit scale is required for internal invoicing.");
    }

    FeeCalculationContext context = buildFeeContext(permit);
    String expectedPermitNumber = permit.permitNumber().toString();
    List<InternalInvoiceDetail> details = new ArrayList<>(scales.size());
    Set<String> scaleIds = new HashSet<>();
    Map<Long, ApplicationInfoRow> applicationByNumber = new HashMap<>();
    BigDecimal total = BigDecimal.ZERO;
    for (PermitScaleDetailRow scale : scales) {
      String scaleId = scale == null ? null : trimToNull(scale.exportScaleDetailId());
      if (scale == null
          || !expectedPermitNumber.equals(trimToNull(scale.exportPermitDetailNumber()))
          || scaleId == null
          || !scaleIds.add(scaleId)
          || trimToNull(scale.timberMark()) == null
          || trimToNull(scale.exportSpeciesCode()) == null
          || trimToNull(scale.exportGradeCode()) == null
          || !Double.isFinite(scale.speciesGradeVolume())
          || scale.speciesGradeVolume() <= 0.0d) {
        throw new DataRetrievalFailureException(
            "Oracle returned an invalid scale for internal permit invoicing.");
      }
      Long applicationNumber = scale.applicationNumber();
      if (applicationNumber == null || applicationNumber < 1) {
        throw new DataRetrievalFailureException(
            "A scale application is required for internal permit invoicing.");
      }
      ApplicationInfoRow application =
          applicationByNumber.computeIfAbsent(
              applicationNumber,
              key ->
                  repository
                      .findApplicationInfoByNumber(key)
                      .orElseThrow(
                          () ->
                              new DataRetrievalFailureException(
                                  "The scale application was unavailable for invoicing.")));
      if (!java.util.Objects.equals(permit.orgUnitNo(), application.orgUnitNo())
          || !sameIgnoreCase(permit.exemptionNumber(), application.exemptionNumber())) {
        throw new DataRetrievalFailureException(
            "The permit organization or exemption does not match its scale applications.");
      }

      BigDecimal amount = calculateRoundedFeeForScale(scale, context);
      BigDecimal amvRate =
          getAverageMarketValueForScale(scale, context).setScale(2, RoundingMode.HALF_UP);
      BigDecimal feePolicyAdmin =
          context.fixedExemptionRate() == null
              ? context.feePolicyPercentIncrease()
              : BigDecimal.ZERO;
      BigDecimal feePercentage = invoiceFeePercentage(scale, context);
      details.add(
          new InternalInvoiceDetail(
              trimToNull(scale.timberMark()),
              normalizeCode(scale.exportSpeciesCode()),
              normalizeCode(scale.exportGradeCode()),
              BigDecimal.valueOf(scale.speciesGradeVolume()),
              amount,
              amvRate,
              feePolicyAdmin,
              feePercentage));
      total = total.add(amount);
    }

    String billingClientNumber =
        firstNonNull(trimToNull(permit.agentNumber()), trimToNull(permit.clientNumber()));
    String billingClientLocationCode =
        firstNonNull(
            trimToNull(permit.agentLocationCode()), trimToNull(permit.clientLocationCode()));
    if (billingClientNumber == null
        || billingClientLocationCode == null
        || permit.orgUnitNo() == null
        || permit.orgUnitNo() < 1) {
      throw new DataRetrievalFailureException(
          "Permit billing client or organization data was unavailable for invoicing.");
    }

    BigDecimal invoiceTotal =
        shouldMaskFees(permit.countryCode(), permit.applicationDate())
            ? BigDecimal.ZERO
            : total;
    return new InternalInvoiceSnapshot(
        invoiceTotal,
        billingClientNumber,
        billingClientLocationCode,
        context.fixedExemptionRate() == null
            ? BigDecimal.ZERO
            : context.fixedExemptionRate(),
        permit.overrideFee() == null ? BigDecimal.ZERO : BigDecimal.valueOf(permit.overrideFee()),
        permit.orgUnitNo(),
        permit.orgUnitNo(),
        null,
        details);
  }

  private BigDecimal invoiceFeePercentage(
      PermitScaleDetailRow scale, FeeCalculationContext context) {
    if (context.fixedExemptionRate() != null
        || isApplicationUnmanufactured(scale.applicationNumber(), context)
        || !isGeneralCoastalRegion(context.orgUnitNo())
        || DECIDUOUS_SPECIES_CODES.contains(normalizeCode(scale.exportSpeciesCode()))) {
      return BigDecimal.ZERO;
    }
    return rcoFeePercentage(scale.exportSpeciesCode(), scale.exportGradeCode());
  }

  private boolean matchesInsertedPermit(PermitMutationRow row, PermitMutationRow expected) {
    return row != null
        && row.permitNumber() != null
        && row.permitNumber() > 0
        && sameText(row.destinationCompanyName(), expected.destinationCompanyName())
        && sameText(row.transportName(), expected.transportName())
        && java.util.Objects.equals(
            row.estimatedShippingDate(), expected.estimatedShippingDate())
        && sameText(row.otherPortOfExport(), expected.otherPortOfExport())
        && sameText(row.exemptionNumber(), expected.exemptionNumber())
        && java.util.Objects.equals(row.oicApplicationNumber(), expected.oicApplicationNumber())
        && sameText(row.clientNumber(), expected.clientNumber())
        && sameText(row.clientLocationCode(), expected.clientLocationCode())
        && sameText(row.agentNumber(), expected.agentNumber())
        && sameText(row.agentLocationCode(), expected.agentLocationCode())
        && java.util.Objects.equals(row.orgUnitNo(), expected.orgUnitNo())
        && sameText(row.permitStatusCode(), expected.permitStatusCode())
        && sameText(row.countryCode(), expected.countryCode())
        && sameText(row.portOfExportCode(), expected.portOfExportCode())
        && sameText(row.transportTypeCode(), expected.transportTypeCode())
        && sameText(row.scaleMethodCode(), expected.scaleMethodCode())
        && java.util.Objects.equals(row.applicationDate(), expected.applicationDate())
        && java.util.Objects.equals(row.receivedDate(), expected.receivedDate())
        && java.util.Objects.equals(row.permitIssueDate(), expected.permitIssueDate())
        && java.util.Objects.equals(row.expiryDate(), expected.expiryDate())
        && sameText(row.receiptNumber(), expected.receiptNumber())
        && sameNumber(row.permitVolume(), expected.permitVolume())
        && java.util.Objects.equals(row.numberOfPieces(), expected.numberOfPieces())
        && java.util.Objects.equals(row.feeInLieuVolume(), expected.feeInLieuVolume())
        && sameText(row.federalPermitNumber(), expected.federalPermitNumber())
        && sameText(row.remarks(), expected.remarks())
        && java.util.Objects.equals(row.oicRequestPieces(), expected.oicRequestPieces())
        && sameNumber(row.oicRequestVolume(), expected.oicRequestVolume())
        && sameNumber(row.overrideFee(), expected.overrideFee())
        && sameText(row.overrideComment(), expected.overrideComment())
        && sameText(row.growthTypeCode(), expected.growthTypeCode())
        && sameText(row.productTypeCode(), expected.productTypeCode());
  }

  private boolean matchesInsertedBoicScale(
      PermitScaleDetailRow row, BoicScaleMutationRecord expected) {
    return row != null
        && parsePositiveLong(row.exportScaleDetailId()) != null
        && java.util.Objects.equals(row.applicationNumber(), expected.applicationNumber())
        && java.util.Objects.equals(
            parsePositiveLong(row.exportPermitDetailNumber()),
            expected.exportPermitDetailNumber())
        && sameText(row.packageNumber(), expected.packageNumber())
        && sameText(row.timberMark(), expected.timberMark())
        && sameText(row.exportSpeciesCode(), expected.exportSpeciesCode())
        && sameText(row.exportGradeCode(), expected.exportGradeCode())
        && expected.piecesCount() != null
        && row.piecesCount() == expected.piecesCount()
        && sameNumber(row.speciesGradeVolume(), expected.speciesGradeVolume());
  }

  private boolean matchesInsertedSalesInvoice(
      SalesInvoiceRow row,
      String expectedInvoiceNumber,
      BigDecimal expectedExportValue,
      BigDecimal expectedConversionRate,
      BigDecimal expectedFeeInLieu) {
    return row != null
        && java.util.Objects.equals(
            trimToNull(row.salesInvoiceNumber()), trimToNull(expectedInvoiceNumber))
        && sameDecimal(row.exportValue(), expectedExportValue)
        && sameDecimal(row.currencyConversionRate(), expectedConversionRate)
        && sameDecimal(row.feeInLieu(), expectedFeeInLieu);
  }

  private boolean sameText(String actual, String expected) {
    return java.util.Objects.equals(trimToNull(actual), trimToNull(expected));
  }

  private boolean sameNumber(Double actual, Double expected) {
    if (actual == null || expected == null) {
      return actual == null && expected == null;
    }
    return BigDecimal.valueOf(actual).compareTo(BigDecimal.valueOf(expected)) == 0;
  }

  private boolean sameDecimal(double actual, BigDecimal expected) {
    return expected != null && BigDecimal.valueOf(actual).compareTo(expected) == 0;
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit calls do not have a surrounding Spring transaction.
    }
  }

  private boolean hasStringChanged(String stored, String formValue) {
    return !java.util.Objects.equals(trimToNull(stored), trimToNull(formValue));
  }

  private boolean sameIgnoreCase(String first, String second) {
    String normalizedFirst = trimToNull(first);
    String normalizedSecond = trimToNull(second);
    return normalizedFirst == null
        ? normalizedSecond == null
        : normalizedSecond != null && normalizedFirst.equalsIgnoreCase(normalizedSecond);
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

  private String mergeSubmittedText(String submitted, String current) {
    return submitted == null ? current : trimToNull(submitted);
  }

  private LocalDate mergeSubmittedDate(String submitted, LocalDate current) {
    return submitted == null ? current : parseDate(submitted);
  }

  private boolean isInvalidSubmittedDouble(String submitted, Double parsed) {
    return trimToNull(submitted) != null && parsed == null;
  }

  private void validateSubmittedOicRequestLimits(
      PermitMutationRequestDto request, boolean blanketOic, List<String> errors) {
    if (request == null) {
      return;
    }

    String submittedPieces = trimToNull(request.oicPermitTotalPieces());
    String submittedVolume = trimToNull(request.oicPermitTotalVolume());
    if (!blanketOic) {
      if (submittedPieces != null || submittedVolume != null) {
        errors.add(
            "Blanket OIC request limits can only be changed on Blanket OIC permits.");
      }
      return;
    }

    if (submittedPieces != null) {
      Long pieces = parsePositiveLong(submittedPieces);
      if (pieces == null || pieces > MAX_OIC_REQUEST_PIECES) {
        errors.add(
            "Permit Request Pieces must be a positive whole number no greater than 9999999999.");
      }
    }

    Double volume = parseDouble(submittedVolume);
    if (submittedVolume == null || volume == null) {
      return;
    }
    if (volume <= 0.0d
        || submittedVolume.length() > MAX_OIC_REQUEST_VOLUME_LENGTH
        || !OIC_REQUEST_VOLUME_PATTERN.matcher(submittedVolume).matches()) {
      errors.add(
          "Permit Request Volume must be a positive number of 9 characters or fewer with no more than 2 decimal places.");
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
      throw new DataRetrievalFailureException(
          "Oracle returned a non-numeric permit fee factor.", ex);
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

  private record ValidatedExemptionBinding(
      ExemptionDetailDto detail, String exemptionTypeCode, boolean blanketOic) {}

  private record ApplicationScaleAttachmentPlan(
      Long applicationNumber, String sourceStatus, List<ScaleMutationRow> unassignedScales) {}
}

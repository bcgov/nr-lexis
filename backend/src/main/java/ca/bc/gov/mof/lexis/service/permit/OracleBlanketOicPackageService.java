package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class OracleBlanketOicPackageService implements BlanketOicPackageService {

  private static final String EXEMPTION_TYPE_BLANKET_OIC = "B";
  private static final Set<String> LOCKED_PERMIT_STATUSES = Set.of("COM", "PPD", "EXP", "CAN");
  private static final String APPLICATION_STATUS_EXEMPTED = "EXE";
  private static final String APPLICANT_TYPE_OWNER = "O";
  private static final String EXEMPTION_REASON_SCHEDULE = "S";
  private static final String PRODUCT_TYPE_STANDING = "S";
  private static final String GROWTH_TYPE_OLD = "O";
  private static final String JURISDICTION_PROVINCIAL = "P";
  private static final String OIC_INDICATOR_YES = "Y";
  private static final String OTHER_END_USE = "OT";
  private static final String DEFAULT_PRODUCT_LOCATION = "NA";
  private static final String DEFAULT_CONTACT = "No contacts on file for this location";
  private static final double HIDDEN_APPLICATION_VOLUME = 9_999_999.0d;
  private static final double HIDDEN_APPLICATION_AVERAGE_LOG_VOLUME = 99.9d;
  private static final long HIDDEN_APPLICATION_TERM_DAYS = 180L;

  private final PermitRpcRepository permitRepository;
  private final ApplicationDetailsRpcService applicationService;

  public OracleBlanketOicPackageService(
      PermitRpcRepository permitRepository, ApplicationDetailsRpcService applicationService) {
    this.permitRepository = permitRepository;
    this.applicationService = applicationService;
  }

  @Override
  @Transactional(readOnly = true)
  public Optional<Long> findHiddenApplicationNumber(Long permitNumber) {
    return permitRepository
        .findPermitMutationByPermitNumber(permitNumber)
        .map(PermitMutationRow::oicApplicationNumber)
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0);
  }

  @Override
  @Transactional
  public MutationResult addPackage(PackageMutationRequest request, String userId) {
    PermitMutationRow permit =
        requireEditableBlanketOicPermit(request == null ? null : request.permitNumber());
    if (permit == null) {
      return failure(
          request == null ? null : request.permitNumber(),
          null,
          null,
          "A valid editable Blanket OIC permit is required.");
    }

    List<String> volumeErrors = validatePermitRequestVolume(permit, request, null);
    if (!volumeErrors.isEmpty()) {
      return failure(
          permit.permitNumber(),
          permit.oicApplicationNumber(),
          request.packageNumber(),
          volumeErrors);
    }

    Long applicationNumber = permit.oicApplicationNumber();
    if (applicationNumber == null || applicationNumber < 1) {
      CreateApplicationResult applicationResult =
          applicationService.addHiddenBlanketOicApplication(hiddenApplication(permit), userId);
      applicationNumber = applicationResult.applicationNumber();
      if (!applicationResult.valid() || applicationNumber == null || applicationNumber < 1) {
        markRollbackOnly();
        return failure(
            permit.permitNumber(),
            null,
            request.packageNumber(),
            firstError(
                applicationResult.errors(),
                applicationResult.message(),
                "Unable to create the hidden OIC application."));
      }
      if (!assignOicApplication(permit, applicationNumber, userId)) {
        markRollbackOnly();
        return failure(
            permit.permitNumber(),
            applicationNumber,
            request.packageNumber(),
            "Unable to associate the hidden OIC application with the permit.");
      }
    }

    PackagePersistenceResult result =
        applicationService.addHiddenBlanketOicPackage(
            toApplicationPackage(request, applicationNumber), userId);
    if (!result.valid()) {
      markRollbackOnly();
      return fromPersistenceFailure(permit.permitNumber(), applicationNumber, result);
    }

    return success(
        permit.permitNumber(),
        applicationNumber,
        result.packageNumber(),
        "Blanket OIC package was created.",
        result.warnings());
  }

  @Override
  @Transactional
  public MutationResult updatePackage(PackageMutationRequest request, String userId) {
    PermitMutationRow permit =
        requireEditableBlanketOicPermit(request == null ? null : request.permitNumber());
    if (permit == null
        || permit.oicApplicationNumber() == null
        || permit.oicApplicationNumber() < 1) {
      return failure(
          request == null ? null : request.permitNumber(),
          null,
          request == null ? null : request.packageNumber(),
          "The Blanket OIC permit does not have a hidden OIC application.");
    }
    Long applicationNumber = permit.oicApplicationNumber();
    if (!packageBelongsToApplication(request.packageNumber(), applicationNumber)) {
      return failure(
          permit.permitNumber(),
          applicationNumber,
          request.packageNumber(),
          "Package is not associated with this Blanket OIC permit.");
    }

    List<String> volumeErrors = validatePermitRequestVolume(permit, request, request.packageNumber());
    if (!volumeErrors.isEmpty()) {
      return failure(permit.permitNumber(), applicationNumber, request.packageNumber(), volumeErrors);
    }

    PackagePersistenceResult result =
        applicationService.updateHiddenBlanketOicPackage(
            toApplicationPackage(request, applicationNumber), userId);
    if (!result.valid()) {
      markRollbackOnly();
      return fromPersistenceFailure(permit.permitNumber(), applicationNumber, result);
    }

    return success(
        permit.permitNumber(),
        applicationNumber,
        result.packageNumber(),
        "Blanket OIC package was updated.",
        result.warnings());
  }

  @Override
  @Transactional
  public MutationResult deletePackage(
      Long permitNumber, String packageNumber, String userId) {
    PermitMutationRow permit = requireEditableBlanketOicPermit(permitNumber);
    String normalizedPackageNumber = trimToNull(packageNumber);
    if (permit == null
        || permit.oicApplicationNumber() == null
        || permit.oicApplicationNumber() < 1) {
      return failure(
          permitNumber,
          null,
          normalizedPackageNumber,
          "A valid editable Blanket OIC permit is required.");
    }
    Long applicationNumber = permit.oicApplicationNumber();
    if (!packageBelongsToApplication(normalizedPackageNumber, applicationNumber)) {
      return failure(
          permitNumber,
          applicationNumber,
          normalizedPackageNumber,
          "Package is not associated with this Blanket OIC permit.");
    }
    if (!applicationService.getScalesForPackage(normalizedPackageNumber).isEmpty()) {
      return failure(
          permitNumber,
          applicationNumber,
          normalizedPackageNumber,
          "A Blanket OIC package cannot be deleted while it has scale details.");
    }
    if (!applicationService.deleteHiddenBlanketOicPackageById(
        normalizedPackageNumber, applicationNumber, userId)) {
      markRollbackOnly();
      return failure(
          permitNumber,
          applicationNumber,
          normalizedPackageNumber,
          "Unable to delete the Blanket OIC package.");
    }
    return success(
        permitNumber,
        applicationNumber,
        normalizedPackageNumber,
        "Blanket OIC package was deleted.",
        List.of());
  }

  private PermitMutationRow requireEditableBlanketOicPermit(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return null;
    }
    Optional<PermitMutationRow> found =
        permitRepository.findPermitMutationByPermitNumber(permitNumber);
    if (found.isEmpty()) {
      return null;
    }
    PermitMutationRow permit = found.get();
    String permitStatus = trimToNull(permit.permitStatusCode());
    if (permitStatus != null
        && LOCKED_PERMIT_STATUSES.contains(permitStatus.toUpperCase(Locale.ROOT))) {
      return null;
    }
    boolean blanketOic =
        permitRepository
            .findExemptionTypeCode(permit.exemptionNumber())
            .map(EXEMPTION_TYPE_BLANKET_OIC::equalsIgnoreCase)
            .orElse(false);
    return blanketOic ? permit : null;
  }

  private boolean packageBelongsToApplication(String packageNumber, Long applicationNumber) {
    String normalizedPackageNumber = trimToNull(packageNumber);
    return normalizedPackageNumber != null
        && applicationNumber != null
        && applicationService
            .findApplicationNumberForPackage(normalizedPackageNumber)
            .map(applicationNumber::equals)
            .orElse(false);
  }

  private CreateApplicationRequest hiddenApplication(PermitMutationRow permit) {
    LocalDate today = LexisBusinessTime.today();
    return new CreateApplicationRequest(
        null,
        today,
        HIDDEN_APPLICATION_TERM_DAYS,
        today,
        HIDDEN_APPLICATION_VOLUME,
        HIDDEN_APPLICATION_AVERAGE_LOG_VOLUME,
        DEFAULT_PRODUCT_LOCATION,
        null,
        permit.agentNumber(),
        permit.agentLocationCode(),
        permit.clientNumber(),
        permit.clientLocationCode(),
        permit.exemptionNumber(),
        EXEMPTION_REASON_SCHEDULE,
        APPLICATION_STATUS_EXEMPTED,
        APPLICANT_TYPE_OWNER,
        permit.orgUnitNo(),
        PRODUCT_TYPE_STANDING,
        JURISDICTION_PROVINCIAL,
        GROWTH_TYPE_OLD,
        null,
        DEFAULT_CONTACT,
        OIC_INDICATOR_YES,
        OTHER_END_USE,
        List.of(),
        null,
        true);
  }

  private boolean assignOicApplication(
      PermitMutationRow current, Long applicationNumber, String userId) {
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
            applicationNumber,
            current.oicRequestPieces(),
            current.oicRequestVolume(),
            current.productTypeCode());
    return permitRepository.updatePermitDetail(updated, userId, null);
  }

  private ApplicationDetailsRpcService.PackageMutationRequest toApplicationPackage(
      PackageMutationRequest request, Long applicationNumber) {
    return new ApplicationDetailsRpcService.PackageMutationRequest(
        request.packageNumber(),
        request.newPackageNumber(),
        applicationNumber,
        request.volume(),
        request.averageLength(),
        request.averageDiameter(),
        request.status(),
        request.comments(),
        request.reprocessed(),
        request.ageClass(),
        request.productType(),
        request.endUseCode(),
        request.speciesCodes() == null ? List.of() : request.speciesCodes());
  }

  private List<String> validatePermitRequestVolume(
      PermitMutationRow permit, PackageMutationRequest request, String packageToReplace) {
    if (request == null || request.volume() == null) {
      return List.of();
    }
    if (permit.oicRequestVolume() == null) {
      return List.of("The permit request volume is unavailable; package volume cannot be verified.");
    }
    BigDecimal total = BigDecimal.ZERO;
    for (String packageNumber :
        permitRepository.findPackageNumbersByOicPermitNumber(permit.permitNumber())) {
      if (packageNumber.equalsIgnoreCase(trimToNull(packageToReplace))) {
        continue;
      }
      String volume = applicationService.getPackageDetails(packageNumber).volume();
      try {
        total = total.add(new BigDecimal(volume));
      } catch (NumberFormatException ignored) {
        return List.of("Unable to verify the existing Blanket OIC package volume.");
      }
    }
    BigDecimal requested =
        total.add(BigDecimal.valueOf(request.volume())).setScale(1, RoundingMode.HALF_UP);
    BigDecimal permitted =
        BigDecimal.valueOf(permit.oicRequestVolume()).setScale(1, RoundingMode.HALF_UP);
    if (requested.compareTo(permitted) > 0) {
      return List.of(
          "The total package volume must not exceed the permit request volume ("
              + permitted.toPlainString() + ").");
    }
    return List.of();
  }

  private MutationResult fromPersistenceFailure(
      Long permitNumber, Long applicationNumber, PackagePersistenceResult result) {
    List<String> errors = result.errors() == null || result.errors().isEmpty()
            ? List.of("Unable to save the Blanket OIC package.")
            : result.errors();
    return failure(permitNumber, applicationNumber, result.packageNumber(), errors);
  }

  private MutationResult success(
      Long permitNumber,
      Long applicationNumber,
      String packageNumber,
      String message,
      List<String> warnings) {
    return new MutationResult(
        true,
        message,
        permitNumber,
        applicationNumber,
        packageNumber,
        List.of(),
        warnings == null ? List.of() : List.copyOf(warnings));
  }

  private MutationResult failure(
      Long permitNumber, Long applicationNumber, String packageNumber, String error) {
    return failure(permitNumber, applicationNumber, packageNumber, List.of(error));
  }

  private MutationResult failure(
      Long permitNumber, Long applicationNumber, String packageNumber, List<String> errors) {
    List<String> normalizedErrors = errors == null ? new ArrayList<>() : List.copyOf(errors);
    String message =
        normalizedErrors.isEmpty()
            ? "Unable to change the Blanket OIC package."
            : normalizedErrors.get(0);
    return new MutationResult(
        false,
        message,
        permitNumber,
        applicationNumber,
        packageNumber,
        normalizedErrors,
        List.of());
  }

  private String firstError(List<String> errors, String message, String fallback) {
    if (errors != null && !errors.isEmpty() && trimToNull(errors.get(0)) != null) {
      return errors.get(0);
    }
    return trimToNull(message) == null ? fallback : message;
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit tests may invoke this service without a transactional proxy.
    }
  }
}

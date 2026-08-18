package ca.bc.gov.mof.lexis.service.review;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationUpdateRecord;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.EndUseRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ExcolValidationRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.PackageMutationRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ScaleMutationRow;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Applies the legacy domain gate before an application approval can set status APP. */
@Service
@Profile("oracle")
public class ApplicationApprovalEligibilityService {

  private static final Set<String> REVIEWABLE_STATUS_CODES = Set.of("NEW", "PND");
  private static final Set<String> PRODUCT_TYPE_CODES = Set.of("H", "S", "T");
  private static final Set<String> APPLICANT_TYPE_CODES = Set.of("O", "A");
  private static final Set<String> APPROVABLE_JURISDICTIONS = Set.of("P", "F");
  private static final String PRODUCT_HARVESTED = "H";
  private static final String PRODUCT_STANDING = "S";
  private static final String PRODUCT_UNMANUFACTURED = "T";
  private static final String APPLICANT_AGENT = "A";
  private static final String DEFAULT_END_USE = "OT";
  private static final BigDecimal MAX_APPLICATION_VOLUME = new BigDecimal("9999999.99");
  private static final BigDecimal MAX_AVERAGE_LOG_VOLUME = new BigDecimal("99.9");

  private final ApplicationDetailsRpcRepository applicationRepository;
  private final ClientLookupRepository clientRepository;

  public ApplicationApprovalEligibilityService(
      ApplicationDetailsRpcRepository applicationRepository,
      ClientLookupRepository clientRepository) {
    this.applicationRepository = applicationRepository;
    this.clientRepository = clientRepository;
  }

  @Transactional(readOnly = true)
  public Eligibility evaluate(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Eligibility.denied("Application number must be a positive value.");
    }

    ApplicationUpdateRecord application =
        applicationRepository.findApplicationUpdateRecord(applicationNumber).orElse(null);
    if (application == null) {
      return Eligibility.denied("Application was not found.");
    }

    List<String> errors = new ArrayList<>();
    validateApplicationFields(application, errors);
    validateCodes(application, errors);
    validateClients(application, errors);
    validateSpeciesEndUses(application, errors);
    validatePackageVolume(application, errors);
    validateScaleRegion(application, errors);
    validateUnlinked(application, errors);
    return errors.isEmpty() ? Eligibility.allowed() : new Eligibility(false, List.copyOf(errors));
  }

  private void validateApplicationFields(ApplicationUpdateRecord application, List<String> errors) {
    if (!REVIEWABLE_STATUS_CODES.contains(normalizeCode(application.applicationStatusCode()))) {
      errors.add("Only new or pending applications can be approved.");
    }
    if (!APPROVABLE_JURISDICTIONS.contains(normalizeCode(application.jurisdictionCode()))) {
      errors.add("Only provincial or federal applications can be approved.");
    }
    if (application.applicationDate() == null) {
      errors.add("Application date is required.");
    }
    if (application.receivedDate() == null) {
      errors.add("Application received date is required.");
    }
    if (application.termDays() == null
        || application.termDays() < 1
        || application.termDays() > 99_999) {
      errors.add("Application term days must be between 1 and 99999.");
    }

    BigDecimal applicationVolume = decimal(application.applicationVolume());
    if (applicationVolume == null
        || applicationVolume.compareTo(BigDecimal.ZERO) <= 0
        || applicationVolume.compareTo(MAX_APPLICATION_VOLUME) > 0) {
      errors.add("Application volume must be greater than zero and no more than 9999999.99.");
    }

    String productType = normalizeCode(application.productTypeCode());
    if (!PRODUCT_TYPE_CODES.contains(productType)) {
      errors.add("Application product type is invalid.");
    }
    if ((PRODUCT_HARVESTED.equals(productType) || PRODUCT_STANDING.equals(productType))
        && trimToNull(application.growthTypeCode()) == null) {
      errors.add("Application growth type is required.");
    }
    if (PRODUCT_HARVESTED.equals(productType)) {
      if (trimToNull(application.productLocation()) == null) {
        errors.add("Application product location is required.");
      }
      BigDecimal averageLogVolume = decimal(application.averageLogVolume());
      if (averageLogVolume == null
          || averageLogVolume.compareTo(BigDecimal.ZERO) < 0
          || averageLogVolume.compareTo(MAX_AVERAGE_LOG_VOLUME) > 0) {
        errors.add("Application average log volume must be between 0 and 99.9.");
      }
    }

    if (application.orgUnitNumber() == null || application.orgUnitNumber() < 1) {
      errors.add("Application region is required.");
    }
    if (trimToNull(application.ownerClientNumber()) == null) {
      errors.add("Application owner number is required.");
    }
    if (trimToNull(application.ownerClientLocationCode()) == null) {
      errors.add("Application owner location is required.");
    }
    if (trimToNull(application.ownerContactName()) == null) {
      errors.add("Application owner contact is required.");
    }

    String applicantType = normalizeCode(application.applicantTypeCode());
    if (!APPLICANT_TYPE_CODES.contains(applicantType)) {
      errors.add("Application applicant type is invalid.");
    }
    if (APPLICANT_AGENT.equals(applicantType)) {
      if (trimToNull(application.agentClientNumber()) == null) {
        errors.add("Application agent number is required.");
      }
      if (trimToNull(application.agentClientLocationCode()) == null) {
        errors.add("Application agent location is required.");
      }
      if (trimToNull(application.agentContactName()) == null) {
        errors.add("Application agent contact is required.");
      }
    }
  }

  private void validateCodes(ApplicationUpdateRecord application, List<String> errors) {
    if (!applicationRepository.isProductTypeCodeValidRequired(application.productTypeCode())) {
      errors.add("Application product type code does not exist.");
    }
    String productType = normalizeCode(application.productTypeCode());
    if ((PRODUCT_HARVESTED.equals(productType) || PRODUCT_STANDING.equals(productType))
        && !applicationRepository.isGrowthTypeCodeValidRequired(application.growthTypeCode())) {
      errors.add("Application growth type code does not exist.");
    }
    if (!applicationRepository.isExemptionReasonCodeValidRequired(
        application.exemptionReasonCode())) {
      errors.add("Application exemption reason code does not exist.");
    }
    // REVIEWABLE_STATUS_CODES is authoritative here; the legacy single-code lookup omits PND.
    if (!applicationRepository.isApplicantTypeCodeValidRequired(application.applicantTypeCode())) {
      errors.add("Application applicant type code does not exist.");
    }
    if (!applicationRepository.isJurisdictionCodeValidRequired(application.jurisdictionCode())) {
      errors.add("Application jurisdiction code does not exist.");
    }
    if (!applicationRepository.isOrgUnitValidRequired(application.orgUnitNumber())) {
      errors.add("Application region does not exist.");
    }
  }

  private void validateClients(ApplicationUpdateRecord application, List<String> errors) {
    String ownerNumber = trimToNull(application.ownerClientNumber());
    String ownerLocation = trimToNull(application.ownerClientLocationCode());
    if (ownerNumber != null
        && ownerLocation != null
        && clientRepository
            .findLocationByClientNumberCodeRequired(ownerNumber, ownerLocation)
            .isEmpty()) {
      errors.add("Application owner location does not exist.");
    }

    if (APPLICANT_AGENT.equals(normalizeCode(application.applicantTypeCode()))) {
      String agentNumber = trimToNull(application.agentClientNumber());
      String agentLocation = trimToNull(application.agentClientLocationCode());
      if (agentNumber != null
          && agentLocation != null
          && clientRepository
              .findLocationByClientNumberCodeRequired(agentNumber, agentLocation)
              .isEmpty()) {
        errors.add("Application agent location does not exist.");
      }
    }
  }

  private void validateSpeciesEndUses(
      ApplicationUpdateRecord application, List<String> errors) {
    List<EndUseRow> endUses =
        applicationRepository.findEndUsesByApplicationNumberRequired(
            application.applicationNumber());
    if (endUses.isEmpty()) {
      errors.add("Application species and end use are required.");
      return;
    }

    List<String> speciesCodes =
        endUses.stream()
            .map(EndUseRow::speciesCode)
            .map(ApplicationApprovalEligibilityService::normalizeCode)
            .filter(value -> value != null)
            .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new))
            .stream()
            .toList();
    if (speciesCodes.isEmpty()) {
      errors.add("Application species and end use are required.");
      return;
    }

    String endUseCode = normalizeCode(endUses.get(0).endUseCode());
    if (endUseCode == null) {
      endUseCode = DEFAULT_END_USE;
    }
    List<ExcolValidationRow> candidates =
        applicationRepository.findCandidateExcolCodesRequired(
            speciesCodes.size(), speciesCodes.get(0), endUseCode, application.orgUnitNumber());
    String finalEndUseCode = endUseCode;
    boolean valid =
        candidates.stream()
            .map(ExcolValidationRow::excolCode)
            .map(ApplicationApprovalEligibilityService::normalizeCode)
            .filter(value -> value != null)
            .anyMatch(
                candidate ->
                    speciesCodes.stream().allMatch(candidate::contains)
                        && (PRODUCT_UNMANUFACTURED.equals(
                                normalizeCode(application.productTypeCode()))
                            || candidate.contains(finalEndUseCode)));
    if (!valid) {
      errors.add("Application species and end use are invalid for the selected region.");
    }
  }

  private void validatePackageVolume(ApplicationUpdateRecord application, List<String> errors) {
    BigDecimal applicationVolume = decimal(application.applicationVolume());
    if (applicationVolume == null) {
      return;
    }
    BigDecimal packageTotal = BigDecimal.ZERO;
    for (PackageMutationRow row :
        applicationRepository.findPackageMutationsByApplicationNumber(
            application.applicationNumber())) {
      BigDecimal volume = decimal(row.packageVolume());
      if (volume != null) {
        packageTotal = packageTotal.add(volume);
      }
    }
    if (packageTotal.setScale(1, RoundingMode.HALF_UP).compareTo(applicationVolume) > 0) {
      errors.add("Application volume cannot be less than the total package volume.");
    }
  }

  private void validateScaleRegion(ApplicationUpdateRecord application, List<String> errors) {
    List<ScaleMutationRow> scales =
        applicationRepository.findScaleMutationsByApplicationNumber(
            application.applicationNumber());
    if (scales.isEmpty()) {
      return;
    }
    String timberMark = trimToNull(scales.get(0).timberMark());
    if (timberMark == null
        || applicationRepository
            .findTimberMarkByOrgUnitRequired(timberMark, application.orgUnitNumber())
            .isEmpty()) {
      errors.add("The first scale timber mark is not valid for the application region.");
    }
  }

  private void validateUnlinked(ApplicationUpdateRecord application, List<String> errors) {
    if (trimToNull(application.exemptionNumber()) != null) {
      errors.add("Applications linked to an exemption cannot be approved.");
    }
    if (!applicationRepository
        .findPermitsByApplicationNumberRequired(application.applicationNumber())
        .isEmpty()) {
      errors.add("Applications linked to a permit cannot be approved.");
    }
    if (applicationRepository
        .findPermitByOicApplicationNumberRequired(application.applicationNumber())
        .isPresent()) {
      errors.add("Applications linked to a Blanket OIC permit cannot be approved.");
    }
  }

  private static String normalizeCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(java.util.Locale.ROOT);
  }

  private static BigDecimal decimal(Double value) {
    return value == null ? null : BigDecimal.valueOf(value);
  }

  public record Eligibility(boolean eligible, List<String> errors) {
    private static Eligibility allowed() {
      return new Eligibility(true, List.of());
    }

    private static Eligibility denied(String error) {
      return new Eligibility(false, List.of(error));
    }

    public String message() {
      return errors == null || errors.isEmpty()
          ? "Application is eligible for approval."
          : String.join(" ", errors);
    }
  }
}

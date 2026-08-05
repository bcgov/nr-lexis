package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Enforces the legacy invariants every time an exemption is persisted as active. */
@Component
@Profile("oracle")
public class ExemptionActivationEligibilityValidator {

  private static final String ACTIVE_STATUS = "ACT";
  private static final String APPROVED_APPLICATION_STATUS = "APP";
  private static final String EXEMPTED_APPLICATION_STATUS = "EXE";
  private static final String OIC_TYPE = "O";
  private static final String BLANKET_OIC_TYPE = "B";
  private static final double MAX_APPROVED_VOLUME = 9_999_999.99d;
  private static final Set<Long> NATURAL_RESOURCE_REGION_NUMBERS =
      Set.of(1903L, 1904L, 1905L, 1906L, 1907L, 1908L, 1909L, 1910L);

  private final ExemptionDetailsRpcRepository repository;

  public ExemptionActivationEligibilityValidator(ExemptionDetailsRpcRepository repository) {
    this.repository = repository;
  }

  public List<String> validate(ActivationCandidate candidate) {
    if (candidate == null) {
      return List.of("A valid active exemption is required.");
    }

    List<String> errors = new ArrayList<>();
    String exemptionNumber = trimToNull(candidate.exemptionNumber());
    String exemptionTypeCode = trimToNull(candidate.exemptionTypeCode());
    String exemptionStatusCode = trimToNull(candidate.exemptionStatusCode());
    boolean oicLike = isOicLike(exemptionTypeCode);

    validateApprovedVolume(candidate.approvedVolume(), errors);
    validateAuthoritativeCodes(exemptionTypeCode, exemptionStatusCode, errors);
    validateDates(candidate.approvalDate(), candidate.expiryDate(), errors);

    // Legacy exempts OIC/BOIC activation from the approval role check. The dedicated permission
    // applies only when a Ministerial exemption transitions to Active.
    if (!oicLike
        && candidate.activationTransition()
        && !candidate.canApproveExemption()) {
      errors.add("Insufficient privileges to set this Exemption as Active.");
    }
    if (oicLike && exemptionNumber == null) {
      errors.add("A valid exemption number is required for an active OIC exemption.");
    }

    List<Long> regions = resolveRegions(candidate, exemptionNumber);
    validateRegions(exemptionTypeCode, regions, errors);

    List<ApplicationState> applications = loadApplications(candidate, exemptionNumber, errors);
    validateApplications(
        applications,
        exemptionNumber,
        candidate.pendingApplicationLinks(),
        candidate.activationTransition(),
        oicLike,
        candidate.approvedVolume(),
        errors);

    return List.copyOf(errors);
  }

  /**
   * Validates the authoritative reference data used by an exemption mutation that is not being
   * persisted as active. Active mutations use {@link #validate(ActivationCandidate)}, which also
   * enforces the activation-only business rules.
   */
  public List<String> validatePersistenceReferences(PersistenceReferenceCandidate candidate) {
    if (candidate == null) {
      return List.of("Valid exemption reference data is required.");
    }

    List<String> errors = new ArrayList<>();
    String exemptionTypeCode = trimToNull(candidate.exemptionTypeCode());
    String exemptionStatusCode = trimToNull(candidate.exemptionStatusCode());
    validateAuthoritativeCodes(exemptionTypeCode, exemptionStatusCode, false, errors);

    List<Long> regions = resolvePersistenceRegions(candidate, exemptionTypeCode);
    validateRegions(exemptionTypeCode, regions, false, errors);
    return List.copyOf(errors);
  }

  private void validateAuthoritativeCodes(
      String exemptionTypeCode, String exemptionStatusCode, List<String> errors) {
    validateAuthoritativeCodes(exemptionTypeCode, exemptionStatusCode, true, errors);
  }

  private void validateAuthoritativeCodes(
      String exemptionTypeCode,
      String exemptionStatusCode,
      boolean requireActiveStatus,
      List<String> errors) {
    if (!repository.isExemptionTypeCodeValidRequired(exemptionTypeCode)) {
      errors.add("A valid exemption type code is required.");
    }
    boolean statusExists = repository.isExemptionStatusCodeValidRequired(exemptionStatusCode);
    if (!statusExists
        || (requireActiveStatus && !ACTIVE_STATUS.equalsIgnoreCase(exemptionStatusCode))) {
      errors.add(
          requireActiveStatus
              ? "A valid active exemption status code is required."
              : "A valid exemption status code is required.");
    }
  }

  private void validateDates(
      LocalDate approvalDate, LocalDate expiryDate, List<String> errors) {
    if (approvalDate == null) {
      errors.add("A valid approval date is required for an active exemption.");
    }
    if (expiryDate == null) {
      errors.add("A valid expiry date is required for an active exemption.");
      return;
    }
    if (approvalDate != null && !expiryDate.isAfter(approvalDate)) {
      errors.add("The expiry date must be after the approval date.");
    }
    if (expiryDate.isBefore(LexisBusinessTime.today())) {
      errors.add("An active exemption cannot have an expiry date before today.");
    }
  }

  private List<Long> resolveRegions(ActivationCandidate candidate, String exemptionNumber) {
    if (candidate.regionNumbers() != null) {
      return candidate.regionNumbers().stream()
          .distinct()
          .toList();
    }
    if (BLANKET_OIC_TYPE.equalsIgnoreCase(trimToNull(candidate.exemptionTypeCode()))
        && exemptionNumber != null) {
      return repository.findExemptionOrgUnitNumbers(exemptionNumber);
    }
    return List.of();
  }

  private List<Long> resolvePersistenceRegions(
      PersistenceReferenceCandidate candidate, String exemptionTypeCode) {
    if (candidate.regionNumbers() != null) {
      return candidate.regionNumbers().stream().distinct().toList();
    }
    String exemptionNumber = trimToNull(candidate.exemptionNumber());
    if (BLANKET_OIC_TYPE.equalsIgnoreCase(exemptionTypeCode) && exemptionNumber != null) {
      return repository.findExemptionOrgUnitNumbers(exemptionNumber);
    }
    return List.of();
  }

  private void validateRegions(
      String exemptionTypeCode, List<Long> regions, List<String> errors) {
    validateRegions(exemptionTypeCode, regions, true, errors);
  }

  private void validateRegions(
      String exemptionTypeCode,
      List<Long> regions,
      boolean activeMutation,
      List<String> errors) {
    if (!BLANKET_OIC_TYPE.equalsIgnoreCase(exemptionTypeCode)) {
      return;
    }
    if (regions.isEmpty()) {
      errors.add(
          activeMutation
              ? "A valid region is required for an active Blanket OIC exemption."
              : "A valid region is required for a Blanket OIC exemption.");
      return;
    }
    for (Long region : regions) {
      if (region == null) {
        errors.add("A supplied region is not valid.");
      } else if (!NATURAL_RESOURCE_REGION_NUMBERS.contains(region)
          || !repository.isOrgUnitValidRequired(region)) {
        errors.add("Region " + region + " is not valid.");
      }
    }
  }

  private List<ApplicationState> loadApplications(
      ActivationCandidate candidate, String exemptionNumber, List<String> errors) {
    if (candidate.pendingApplicationLinks()) {
      Set<Long> applicationNumbers =
          candidate.applicationNumbers() == null
              ? Set.of()
              : new LinkedHashSet<>(candidate.applicationNumbers());
      List<ApplicationState> applications = new ArrayList<>();
      for (Long applicationNumber : applicationNumbers) {
        loadApplication(applicationNumber, null, errors).ifPresent(applications::add);
      }
      return applications;
    }

    if (exemptionNumber == null) {
      return List.of();
    }
    List<ApplicationState> applications = new ArrayList<>();
    Set<Long> seen = new LinkedHashSet<>();
    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow summary :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      if (!seen.add(summary.applicationNumber())) {
        continue;
      }
      loadApplication(summary.applicationNumber(), summary.requestedVolume(), errors)
          .ifPresent(applications::add);
    }
    return applications;
  }

  private Optional<ApplicationState> loadApplication(
      Long applicationNumber, Double summarizedVolume, List<String> errors) {
    if (applicationNumber == null || applicationNumber < 1) {
      errors.add("An exemption contains an invalid application reference.");
      return Optional.empty();
    }
    Optional<ExemptionDetailsRpcRepository.ApplicationLinkRecord> application =
        repository.findApplicationLinkRecord(applicationNumber);
    if (application.isEmpty()) {
      errors.add("Application " + applicationNumber + " does not exist.");
      return Optional.empty();
    }
    Double volume =
        summarizedVolume == null
            ? application.get().exemptionApplicationVolume()
            : summarizedVolume;
    return Optional.of(new ApplicationState(applicationNumber, application.get(), volume));
  }

  private void validateApplications(
      List<ApplicationState> applications,
      String exemptionNumber,
      boolean pendingApplicationLinks,
      boolean activationTransition,
      boolean oicLike,
      Double approvedVolume,
      List<String> errors) {
    if (!oicLike && applications.isEmpty()) {
      errors.add("Active ministerial exemptions require at least one application.");
      return;
    }

    BigDecimal totalRequestedVolume = BigDecimal.ZERO;
    for (ApplicationState state : applications) {
      ExemptionDetailsRpcRepository.ApplicationLinkRecord application = state.application();
      Long applicationNumber = state.applicationNumber();
      if (!applicationNumber.equals(application.applicationNumber())) {
        errors.add(
            "Application "
                + applicationNumber
                + " returned an inconsistent application identity.");
      }
      if (activationTransition) {
        String expectedStatus =
            pendingApplicationLinks ? APPROVED_APPLICATION_STATUS : EXEMPTED_APPLICATION_STATUS;
        if (!expectedStatus.equalsIgnoreCase(trimToNull(application.applicationStatusCode()))) {
          errors.add(
              "Application "
                  + applicationNumber
                  + " must have a status of "
                  + expectedStatus
                  + " before the exemption can be active.");
        }
      }

      String linkedExemption = trimToNull(application.exemptionNumber());
      if (pendingApplicationLinks) {
        if (linkedExemption != null) {
          errors.add(
              "Application "
                  + applicationNumber
                  + " is already assigned to exemption "
                  + linkedExemption
                  + ".");
        }
      } else if (exemptionNumber == null
          || linkedExemption == null
          || !exemptionNumber.equalsIgnoreCase(linkedExemption)) {
        errors.add(
            "Application "
                + applicationNumber
                + " is not linked to exemption "
                + display(exemptionNumber)
                + ".");
      }

      if (state.requestedVolume() == null || state.requestedVolume() <= 0.0d) {
        errors.add("Application " + applicationNumber + " must have a valid requested volume.");
      } else {
        totalRequestedVolume =
            totalRequestedVolume.add(
                BigDecimal.valueOf(state.requestedVolume()).setScale(1, RoundingMode.HALF_UP));
      }

      validateApplicationPermits(
          applicationNumber,
          exemptionNumber,
          pendingApplicationLinks,
          errors);
    }

    if (!oicLike
        && approvedVolume != null
        && totalRequestedVolume.compareTo(
                BigDecimal.valueOf(approvedVolume).setScale(1, RoundingMode.HALF_UP))
            > 0) {
      errors.add(
          "The approved volume must be greater than or equal to the total requested volume ("
              + totalRequestedVolume.toPlainString()
              + ").");
    }
  }

  private void validateApplicationPermits(
      Long applicationNumber,
      String exemptionNumber,
      boolean pendingApplicationLinks,
      List<String> errors) {
    for (ExemptionDetailsRpcRepository.ApplicationPermitRow permit :
        repository.findPermitsByApplicationNumberRequired(applicationNumber)) {
      String permitExemption = trimToNull(permit.exemptionNumber());
      if (pendingApplicationLinks
          || exemptionNumber == null
          || permitExemption == null
          || !exemptionNumber.equalsIgnoreCase(permitExemption)) {
        errors.add(
            "Application "
                + applicationNumber
                + " is associated with permit "
                + display(permit.permitNumber())
                + " outside this exemption.");
      }
    }
  }

  private void validateApprovedVolume(Double approvedVolume, List<String> errors) {
    if (approvedVolume == null || approvedVolume <= 0.0d) {
      errors.add("The approved volume must be greater than 0");
      return;
    }
    if (approvedVolume > MAX_APPROVED_VOLUME) {
      errors.add("The approved volume must be less than or equal to 9999999.99.");
    }
    if (BigDecimal.valueOf(approvedVolume).stripTrailingZeros().scale() > 2) {
      errors.add("The approved volume must have no more than two decimal places.");
    }
  }

  private boolean isOicLike(String exemptionTypeCode) {
    return OIC_TYPE.equalsIgnoreCase(exemptionTypeCode)
        || BLANKET_OIC_TYPE.equalsIgnoreCase(exemptionTypeCode);
  }

  private String display(Object value) {
    return value == null ? "unknown" : value.toString();
  }

  public record ActivationCandidate(
      String exemptionNumber,
      Double approvedVolume,
      LocalDate approvalDate,
      LocalDate expiryDate,
      String exemptionTypeCode,
      String exemptionStatusCode,
      List<Long> regionNumbers,
      List<Long> applicationNumbers,
      boolean pendingApplicationLinks,
      boolean activationTransition,
      boolean canApproveExemption) {}

  public record PersistenceReferenceCandidate(
      String exemptionNumber,
      String exemptionTypeCode,
      String exemptionStatusCode,
      List<Long> regionNumbers) {}

  private record ApplicationState(
      Long applicationNumber,
      ExemptionDetailsRpcRepository.ApplicationLinkRecord application,
      Double requestedVolume) {}
}

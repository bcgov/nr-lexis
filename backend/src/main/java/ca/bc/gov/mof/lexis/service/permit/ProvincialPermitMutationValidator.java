package ca.bc.gov.mof.lexis.service.permit;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;

/** Server-side parity for the legacy {@code ProvincialPermit.validate()} aggregate rules. */
final class ProvincialPermitMutationValidator {

  static final String PAYMENT_PENDING_WARNING =
      "Fee Receipt Number should not be empty for a complete Permit so it will be saved as Payment Pending.";

  private static final String STATUS_ACTIVE = "ACT";
  private static final String STATUS_COMPLETE = "COM";
  private static final String STATUS_PAYMENT_PENDING = "PPD";
  private static final String EXEMPTION_TYPE_MINISTERIAL = "M";
  private static final String PORT_OTHER = "OT";
  private static final double MAX_PERMIT_DECIMAL_VALUE = 9_999_999.99d;
  private static final long RSK_REGION = 1908L;
  private static final Set<Long> INTERIOR_REGIONS =
      Set.of(1903L, 1904L, 1905L, 1906L, 1907L);

  private final PermitRpcRepository repository;
  private final ClientLookupService clientLookupService;
  private final Clock clock;

  ProvincialPermitMutationValidator(
      PermitRpcRepository repository, ClientLookupService clientLookupService) {
    this(repository, clientLookupService, LexisBusinessTime.systemClock());
  }

  ProvincialPermitMutationValidator(
      PermitRpcRepository repository, ClientLookupService clientLookupService, Clock clock) {
    this.repository = repository;
    this.clientLookupService = clientLookupService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  ValidationResult validate(PermitMutationRow permit, ExemptionDetailDto exemption) {
    List<String> errors = new ArrayList<>();
    List<String> warnings = new ArrayList<>();
    if (permit == null) {
      return new ValidationResult(null, List.of("Permit details are required."), List.of());
    }
    permit = normalizeShipping(permit);

    validateExemption(permit, exemption, errors);
    validateClient(permit, errors);
    validateAgent(permit, errors);
    validateNumericRanges(permit, exemption, errors);
    validateRequiredText(
        permit.destinationCompanyName(),
        "company name on the Shipping tab",
        52,
        errors);
    validateRequiredText(
        permit.transportName(), "transport name on the Shipping tab", 26, errors);
    validateOptionalText(permit.receiptNumber(), "Receipt number", 50, errors);
    validateOptionalText(permit.federalPermitNumber(), "Federal permit number", 10, errors);
    validateOptionalText(permit.remarks(), "Permit remarks", 254, errors);
    validateOptionalText(permit.overrideComment(), "Override comment", 254, errors);
    if (permit.estimatedShippingDate() == null) {
      errors.add("A valid estimated shipping date on the Shipping tab is required.");
    }

    validateCode(
        permit.permitStatusCode(),
        "permit status code",
        repository::isPermitStatusCodeValidRequired,
        errors);
    validateCode(
        permit.countryCode(),
        "country code",
        2,
        repository::isCountryCodeValidRequired,
        errors);
    validateCode(
        permit.portOfExportCode(),
        "port of export code",
        2,
        repository::isPortCodeValidRequired,
        errors);
    validateCode(
        permit.scaleMethodCode(),
        "scale method code",
        repository::isScaleMethodCodeValidRequired,
        errors);
    validateCode(
        permit.transportTypeCode(),
        "transport type code",
        1,
        repository::isTransportTypeCodeValidRequired,
        errors);

    if (PORT_OTHER.equals(normalizeCode(permit.portOfExportCode()))) {
      validateRequiredText(
          permit.otherPortOfExport(), "other port of export description", 34, errors);
    }

    validateDates(permit, exemption, errors);

    PermitMutationRow resolvedPermit = permit;
    if (STATUS_COMPLETE.equals(normalizeCode(permit.permitStatusCode()))) {
      validateCompletionState(permit, exemption, errors);
      if (isInterior(permit) && trimToNull(permit.receiptNumber()) == null) {
        warnings.add(PAYMENT_PENDING_WARNING);
        resolvedPermit = withStatus(permit, STATUS_PAYMENT_PENDING);
      }
    }

    return new ValidationResult(resolvedPermit, errors, warnings);
  }

  private void validateExemption(
      PermitMutationRow permit, ExemptionDetailDto exemption, List<String> errors) {
    String permitExemption = trimToNull(permit.exemptionNumber());
    String authoritativeExemption = exemption == null ? null : trimToNull(exemption.exemptionNumber());
    if (permitExemption == null) {
      errors.add("A valid exemption number is required.");
    } else if (authoritativeExemption == null
        || !permitExemption.equalsIgnoreCase(authoritativeExemption)) {
      errors.add("The permit exemption could not be verified.");
    }
  }

  private void validateClient(PermitMutationRow permit, List<String> errors) {
    String clientNumber = trimToNull(permit.clientNumber());
    String clientLocationCode = trimToNull(permit.clientLocationCode());
    if (clientNumber == null) {
      errors.add("A valid client number is required.");
    }
    if (clientLocationCode == null) {
      errors.add("A valid client location code is required.");
    }
    if (clientNumber != null
        && clientLocationCode != null
        && clientLookupService.getClientDataRequired(clientNumber, clientLocationCode).isEmpty()) {
      errors.add("The client number and location code could not be verified.");
    }
  }

  private void validateAgent(PermitMutationRow permit, List<String> errors) {
    String agentNumber = trimToNull(permit.agentNumber());
    String agentLocationCode = trimToNull(permit.agentLocationCode());
    if (agentNumber == null && agentLocationCode == null) {
      return;
    }
    if (agentNumber == null) {
      errors.add("A valid agent client number is required when an agent location is provided.");
      return;
    }
    if (agentLocationCode == null) {
      errors.add("A valid agent location code is required when an agent client is provided.");
      return;
    }
    if (clientLookupService.getClientDataRequired(agentNumber, agentLocationCode).isEmpty()) {
      errors.add("The agent client number and location code could not be verified.");
    }
  }

  private void validateDates(
      PermitMutationRow permit, ExemptionDetailDto exemption, List<String> errors) {
    String status = normalizeCode(permit.permitStatusCode());

    // ProvincialPermit.validate() applied this relationship block only to active permits.
    if (!STATUS_ACTIVE.equals(status)) {
      return;
    }
    validateDateRelationships(permit, exemption, false, errors);
  }

  List<String> validateCompletionDateRelationships(
      PermitMutationRow permit, ExemptionDetailDto exemption) {
    List<String> errors = new ArrayList<>();
    validateDateRelationships(permit, exemption, true, errors);
    return List.copyOf(errors);
  }

  private void validateDateRelationships(
      PermitMutationRow permit,
      ExemptionDetailDto exemption,
      boolean requireSubmitDate,
      List<String> errors) {
    LocalDate submitDate = permit.applicationDate();
    LocalDate issueDate = permit.permitIssueDate();
    LocalDate expiryDate = permit.expiryDate();
    if (requireSubmitDate && submitDate == null) {
      errors.add("A valid submit date is required to complete a permit.");
    }
    if (submitDate != null && submitDate.isAfter(LocalDate.now(clock))) {
      errors.add("Submit Date can't be in the future.");
    }
    if (submitDate != null && issueDate != null && issueDate.isBefore(submitDate)) {
      errors.add("Issued Date must be after or equal to Submit Date.");
    }
    if (expiryDate != null
        && ((submitDate != null && !expiryDate.isAfter(submitDate))
            || (issueDate != null && !expiryDate.isAfter(issueDate)))) {
      errors.add("Permit Expiry Date must be after Submit Date and Issue Date.");
    }

    if (exemption != null
        && EXEMPTION_TYPE_MINISTERIAL.equalsIgnoreCase(
            trimToNull(exemption.exemptionTypeCode()))
        && exemption.expiryDate() != null
        && expiryDate != null
        && expiryDate.isAfter(exemption.expiryDate())) {
      errors.add("Permit Expiry Date cannot be after the Exemption Expiry Date.");
    }
  }

  private void validateNumericRanges(
      PermitMutationRow permit, ExemptionDetailDto exemption, List<String> errors) {
    if (permit.permitVolume() != null
        && (!Double.isFinite(permit.permitVolume()) || permit.permitVolume() < 0.0d)) {
      errors.add("Permit Volume must be greater than or equal to 0.");
    } else {
      validateOracleDecimal(
          permit.permitVolume(), "Permit Volume", MAX_PERMIT_DECIMAL_VALUE, errors);
    }
    if (permit.overrideFee() != null
        && (!Double.isFinite(permit.overrideFee()) || permit.overrideFee() <= 0.0d)) {
      errors.add("Override fee must be greater than zero.");
    } else {
      validateOracleDecimal(
          permit.overrideFee(), "Override fee", MAX_PERMIT_DECIMAL_VALUE, errors);
    }
    if (exemption != null && exemption.blanketOic()) {
      boolean complete = STATUS_COMPLETE.equals(normalizeCode(permit.permitStatusCode()));
      if (!complete
          && permit.oicRequestPieces() != null
          && permit.oicRequestPieces() < 0L) {
        errors.add("Permit Request Pieces must be greater than or equal to 0.");
      }
      if (permit.oicRequestVolume() != null
          && (!Double.isFinite(permit.oicRequestVolume())
              || (!complete && permit.oicRequestVolume() < 0.0d))) {
        errors.add("Permit Request Volume must be greater than or equal to 0.");
      }
    }
  }

  private void validateCompletionState(
      PermitMutationRow permit, ExemptionDetailDto exemption, List<String> errors) {
    if (permit.permitIssueDate() == null) {
      errors.add("A valid permit issue date is required to complete a permit.");
    }
    if (permit.expiryDate() == null) {
      errors.add("A valid expiry date is required to complete a permit.");
    }

    boolean blanketOic = exemption != null && exemption.blanketOic();
    Long permitNumber = permit.permitNumber();
    boolean hasApplication =
        blanketOic
            ? hasValidOicApplication(permit.oicApplicationNumber(), exemption)
            : permitNumber != null
                && repository.hasApplicationForPermitCompletionRequired(permitNumber);
    boolean hasPackage =
        permitNumber != null
            && repository.hasPackageForPermitCompletionRequired(permitNumber, blanketOic);
    boolean hasScale =
        permitNumber != null && repository.hasScaleForPermitCompletionRequired(permitNumber);
    if (!hasApplication) {
      errors.add("At least one application is required before a permit can be completed.");
    }
    if (!hasPackage) {
      errors.add("At least one package is required before a permit can be completed.");
    }
    if (!hasScale) {
      errors.add("At least one scale detail is required before a permit can be completed.");
    }

    if (blanketOic) {
      if (permit.oicRequestPieces() == null || permit.oicRequestPieces() <= 0) {
        errors.add("Permit Request Pieces must be greater than 0 to complete a permit.");
      }
      if (permit.oicRequestVolume() == null
          || (Double.isFinite(permit.oicRequestVolume())
              && permit.oicRequestVolume() <= 0.0d)) {
        errors.add("Permit Request Volume must be greater than 0 to complete a permit.");
      }
    }
  }

  private boolean hasValidOicApplication(
      Long applicationNumber, ExemptionDetailDto exemption) {
    if (applicationNumber == null || applicationNumber < 1 || exemption == null) {
      return false;
    }
    String exemptionNumber = trimToNull(exemption.exemptionNumber());
    return repository
        .findApplicationInfoByNumber(applicationNumber)
        .map(ApplicationInfoRow::exemptionNumber)
        .map(ProvincialPermitMutationValidator::normalizedIdentifier)
        .filter(value -> value.equals(normalizedIdentifier(exemptionNumber)))
        .isPresent();
  }

  private boolean isInterior(PermitMutationRow permit) {
    Long orgUnitNo = permit.orgUnitNo();
    if (INTERIOR_REGIONS.contains(orgUnitNo)) {
      return true;
    }
    return Long.valueOf(RSK_REGION).equals(orgUnitNo)
        && !repository.isPermitMu44Required(permit.permitNumber());
  }

  private void validateCode(
      String value, String description, Predicate<String> exists, List<String> errors) {
    validateCode(value, description, null, exists, errors);
  }

  private void validateCode(
      String value,
      String description,
      Integer requiredLength,
      Predicate<String> exists,
      List<String> errors) {
    String normalized = trimToNull(value);
    if (normalized == null
        || (requiredLength != null && normalized.length() != requiredLength)
        || !exists.test(normalized)) {
      errors.add("A valid " + description + " is required.");
    }
  }

  private void validateRequiredText(String value, String description, List<String> errors) {
    validateRequiredText(value, description, null, errors);
  }

  private void validateRequiredText(
      String value, String description, Integer maxLength, List<String> errors) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      errors.add("A valid " + description + " is required.");
    } else if (!isUsAscii(normalized)) {
      errors.add(
          Character.toUpperCase(description.charAt(0))
              + description.substring(1)
              + " contains characters the current LEXIS database cannot store.");
    } else if (maxLength != null && normalized.length() > maxLength) {
      errors.add(
          Character.toUpperCase(description.charAt(0))
              + description.substring(1)
              + " must not exceed "
              + maxLength
              + " bytes.");
    }
  }

  private void validateOptionalText(
      String value, String description, int maxLength, List<String> errors) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return;
    }
    if (!isUsAscii(normalized)) {
      errors.add(
          description + " contains characters the current LEXIS database cannot store.");
    } else if (normalized.length() > maxLength) {
      errors.add(description + " must not exceed " + maxLength + " bytes.");
    }
  }

  private void validateOracleDecimal(
      Double value, String description, double maximum, List<String> errors) {
    if (value == null) {
      return;
    }
    BigDecimal rounded = BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    if (rounded.compareTo(BigDecimal.valueOf(maximum)) > 0) {
      errors.add(description + " must round to 9999999.99 or less.");
    }
  }

  private boolean isUsAscii(String value) {
    return value.chars().allMatch(character -> character <= 0x7f);
  }

  private static String normalizedIdentifier(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private String normalizeCode(String value) {
    return normalizedIdentifier(value);
  }

  private PermitMutationRow normalizeShipping(PermitMutationRow permit) {
    String portCode = normalizeCode(permit.portOfExportCode());
    return new PermitMutationRow(
        permit.permitNumber(),
        trimToNull(permit.destinationCompanyName()),
        trimToNull(permit.transportName()),
        permit.estimatedShippingDate(),
        PORT_OTHER.equals(portCode) ? trimToNull(permit.otherPortOfExport()) : null,
        permit.applicationDate(),
        permit.receivedDate(),
        permit.permitIssueDate(),
        permit.receiptNumber(),
        permit.expiryDate(),
        permit.permitVolume(),
        permit.numberOfPieces(),
        permit.feeInLieuVolume(),
        permit.federalPermitNumber(),
        permit.remarks(),
        permit.entryUserId(),
        permit.entryTimestamp(),
        normalizeCode(permit.transportTypeCode()),
        permit.scaleMethodCode(),
        permit.clientNumber(),
        permit.clientLocationCode(),
        permit.agentNumber(),
        permit.agentLocationCode(),
        permit.exemptionNumber(),
        permit.orgUnitNo(),
        portCode,
        permit.permitStatusCode(),
        permit.growthTypeCode(),
        normalizeCode(permit.countryCode()),
        permit.overrideFee(),
        permit.overrideComment(),
        permit.oicApplicationNumber(),
        permit.oicRequestPieces(),
        permit.oicRequestVolume(),
        permit.productTypeCode());
  }

  private PermitMutationRow withStatus(PermitMutationRow permit, String status) {
    return new PermitMutationRow(
        permit.permitNumber(),
        permit.destinationCompanyName(),
        permit.transportName(),
        permit.estimatedShippingDate(),
        permit.otherPortOfExport(),
        permit.applicationDate(),
        permit.receivedDate(),
        permit.permitIssueDate(),
        permit.receiptNumber(),
        permit.expiryDate(),
        permit.permitVolume(),
        permit.numberOfPieces(),
        permit.feeInLieuVolume(),
        permit.federalPermitNumber(),
        permit.remarks(),
        permit.entryUserId(),
        permit.entryTimestamp(),
        permit.transportTypeCode(),
        permit.scaleMethodCode(),
        permit.clientNumber(),
        permit.clientLocationCode(),
        permit.agentNumber(),
        permit.agentLocationCode(),
        permit.exemptionNumber(),
        permit.orgUnitNo(),
        permit.portOfExportCode(),
        status,
        permit.growthTypeCode(),
        permit.countryCode(),
        permit.overrideFee(),
        permit.overrideComment(),
        permit.oicApplicationNumber(),
        permit.oicRequestPieces(),
        permit.oicRequestVolume(),
        permit.productTypeCode());
  }

  record ValidationResult(
      PermitMutationRow permit, List<String> errors, List<String> warnings) {

    ValidationResult {
      errors = errors == null ? List.of() : List.copyOf(errors);
      warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    boolean valid() {
      return errors.isEmpty();
    }
  }
}

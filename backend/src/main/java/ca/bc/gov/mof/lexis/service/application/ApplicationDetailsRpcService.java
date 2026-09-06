package ca.bc.gov.mof.lexis.service.application;

import java.io.IOException;
import java.io.OutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

public interface ApplicationDetailsRpcService {

  /** Identifies the application-details section a modern client is saving. */
  enum ApplicationSummarySaveSource {
    FULL,
    SUMMARY,
    OWNER,
    AGENT,
    OWNER_AGENT,
    ITEMS;

    public static Optional<ApplicationSummarySaveSource> fromWireValue(String value) {
      if (value == null || value.trim().isEmpty()) {
        return Optional.of(FULL);
      }
      return switch (value.trim().toLowerCase(Locale.ROOT)) {
        case "summary" -> Optional.of(SUMMARY);
        case "owner" -> Optional.of(OWNER);
        case "agent" -> Optional.of(AGENT);
        case "owner-agent" -> Optional.of(OWNER_AGENT);
        case "items" -> Optional.of(ITEMS);
        default -> Optional.empty();
      };
    }

    public boolean updatesSummaryFields() {
      return this == FULL || this == SUMMARY;
    }

    public boolean updatesOwnerFields() {
      return this == FULL || this == OWNER || this == OWNER_AGENT;
    }

    public boolean updatesAgentFields() {
      return this == FULL || this == AGENT || this == OWNER_AGENT;
    }

    public boolean updatesApplicantType() {
      return this == FULL || this == OWNER || this == OWNER_AGENT;
    }

    public boolean updatesItemFields() {
      return this == FULL || this == ITEMS;
    }
  }

  List<DocumentItem> getDocumentDetails(Long applicationNumber);

  Optional<DocumentStreamer> streamDocument(Long fileId);

  boolean removeDocument(Long documentId);

  Optional<String> getRemark(Long remarkId);

  default Optional<Long> findApplicationNumberForRemark(Long remarkId) {
    return Optional.empty();
  }

  default Optional<Long> findApplicationNumberForPackage(String packageNumber) {
    return Optional.empty();
  }

  default Optional<Long> findApplicationNumberForScale(String scaleDetailId) {
    return Optional.empty();
  }

  default boolean documentBelongsToApplication(Long documentId, Long applicationNumber) {
    return findDocumentForApplication(documentId, applicationNumber).isPresent();
  }

  default Optional<DocumentItem> findDocumentForApplication(
      Long documentId, Long applicationNumber) {
    if (documentId == null || documentId < 1 || applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    List<DocumentItem> matches = getDocumentDetails(applicationNumber).stream()
        .filter(item -> documentId.equals(item.id()))
        .limit(2)
        .toList();
    return matches.size() == 1 ? Optional.of(matches.getFirst()) : Optional.empty();
  }

  Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId);

  CreateApplicationResult addApplication(CreateApplicationRequest request, String userId);

  /**
   * Creates a federal application from the authenticated, dedicated federal submission ingress.
   * This trusted boundary is deliberately separate from user-facing provincial creation so source
   * workflow status and the external federal application number cannot be injected through the
   * public application RPC.
   */
  CreateApplicationResult addFederalImportedApplication(
      CreateApplicationRequest request, String userId);

  /** Creates the internal application used to store Blanket OIC packages. */
  CreateApplicationResult addHiddenBlanketOicApplication(
      CreateApplicationRequest request, String userId);

  CreateApplicationResult updateApplicationSummary(ApplicationSummaryUpdateRequest request, String userId);

  /** Keeps the hidden Blanket OIC application owner aligned with its permit. */
  boolean synchronizeApplicationOwner(
      Long applicationNumber,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String userId);

  Optional<ApplicationSummarySnapshot> getApplicationSummarySnapshot(Long applicationNumber);

  /**
   * Loads the database facts used by the legacy application edit policy. Implementations must
   * return an empty result, or propagate a lookup failure, rather than substituting permissive
   * defaults.
   */
  default Optional<ApplicationEditContext> getApplicationEditContext(Long applicationNumber) {
    return Optional.empty();
  }

  boolean isApplicationVolumeUsed(Long applicationNumber);

  Optional<ApplicationClientSnapshot> getApplicationClientSnapshot(Long applicationNumber);

  List<CodeItem> getSpeciesCodes();

  List<CodeItem> getPackageStatusCodes();

  List<CodeItem> getGradeCodes(String orgUnitNumber, String speciesCode);

  List<CodeItem> getEndUsesForSpeciesRegion(String orgUnitNumber, List<String> speciesCodes);

  List<SpeciesCodeItem> getRemainingSpecies(
      String orgUnitNumber, String productTypeCode, List<String> selectedSpeciesCodes);

  Optional<String> getSelectedEndUse(Long applicationNumber);

  Optional<String> getPackageSelectedEndUse(String packageNumber);

  /** Returns the canonical legacy EXCOL species/end-use sort for an application. */
  default String getApplicationSpeciesEndUseSort(Long applicationNumber) {
    return "";
  }

  List<SpeciesEndUseItem> getSpeciesForApplication(Long applicationNumber);

  List<SpeciesEndUseItem> getSpeciesForPackage(String packageNumber);

  List<ApplicationScaleItem> getUniqueScalesForApplication(Long applicationNumber);

  List<ApplicationPermitItem> findPermits(Long applicationNumber);

  /** Loads every permit key that must be serialized before mutating application children. */
  List<Long> getPermitNumbersForApplicationMutation(Long applicationNumber);

  List<ApplicationPackageScaleItem> getScalesForPackage(String packageNumber);

  PackageDetailsItem getPackageDetails(String packageNumber);

  ApplicationScaleDetailItem getScaleById(String scaleDetailId);

  PackageValidityItem isPackageValid(String packageNumber);

  CreateApplicationResult validateApplication(CreateApplicationRequest request);

  SubmissionImportValidationResult validateApplicationSubmissionImport(
      CreateApplicationRequest applicationRequest,
      PackageMutationRequest packageRequest,
      List<ScaleMutationRequest> scaleRequests);

  PackagePersistenceResult addPackage(PackageMutationRequest request, String userId);

  /**
   * Adds a package to the system-owned application backing a Blanket OIC permit. This trusted
   * service-to-service path must not be exposed as a generic application endpoint.
   */
  PackagePersistenceResult addHiddenBlanketOicPackage(
      PackageMutationRequest request, String userId);

  PackagePersistenceResult updatePackage(PackageMutationRequest request, String userId);

  /** Updates a package through the trusted Blanket OIC workflow only. */
  PackagePersistenceResult updateHiddenBlanketOicPackage(
      PackageMutationRequest request, String userId);

  /**
   * Synchronizes package fields derived during a permit transition. Existing growth and product
   * codes win; supplied codes only fill missing values. Implementations must preserve every other
   * package field and all package end-use rows.
   */
  boolean synchronizePackageForPermitTransition(
      String packageNumber,
      Double volume,
      String growthTypeCode,
      String productTypeCode,
      String userId);

  /** Updates only permit-derived package volume while preserving classification and end uses. */
  boolean synchronizePackageVolumeForPermitTransition(
      String packageNumber, Double volume, String userId);

  ScalePersistenceResult addScaleToPackage(ScaleMutationRequest request, String userId);

  boolean deleteScaleById(String scaleDetailId, String userId);

  boolean deletePackageById(String packageNumber, String userId);

  /** Deletes an empty package from the expected system-owned Blanket OIC application. */
  boolean deleteHiddenBlanketOicPackageById(
      String packageNumber, Long applicationNumber, String userId);

  record DocumentItem(
      long id,
      String name,
      String description,
      String type,
      String source,
      Long sourceApplicationNumber,
      Long sourcePermitNumber,
      boolean deletable) {

    public DocumentItem(long id, String name, String description, String type) {
      this(id, name, description, type, "application", null, null, true);
    }
  }

  @FunctionalInterface
  interface DocumentStreamer {
    void writeTo(OutputStream outputStream) throws IOException;
  }

  record PersistedRemark(
      long remarkId, String remark, String displayRemark, String user, Instant date) {}

  record CodeItem(String code, String description) {}

  record SpeciesCodeItem(String code) {}

  record SpeciesEndUseItem(String species, String endUse, String endUseDescription) {}

  record ApplicationScaleItem(String timberMark) {}

  record ApplicationPermitItem(Long permitNumber, String permitStatusDescription) {}

  record ApplicationPackageScaleItem(
      boolean permitted,
      String timberMark,
      String species,
      long pieces,
      String grade,
      String volume,
      String id,
      String cascadeSplitCode) {}

  record ApplicationScaleDetailItem(
      boolean success,
      String timberMark,
      String species,
      String pieces,
      String grade,
      String volume,
      String id) {}

  record PackageDetailsItem(
      boolean success,
      String packageNumber,
      String volume,
      double scaledVolume,
      String length,
      String diameter,
      String status,
      String comments,
      String statusDescription,
      String reprocessed,
      String ageClass,
      String ageClassDescription,
      String productType,
      String productTypeDescription) {}

  record PackageValidityItem(boolean valid, String message) {}

  record SubmissionImportValidationResult(
      boolean valid,
      List<String> errors,
      List<String> warnings) {}

  record PackageMutationRequest(
      String packageNumber,
      String newPackageNumber,
      Long applicationNumber,
      Double volume,
      Double averageLength,
      Double averageDiameter,
      String status,
      String comments,
      Long federalPermitNumber,
      Long reservePermitNumber,
      String reprocessed,
      String ageClass,
      String productType,
      String endUseCode,
      List<String> speciesCodes) {

    public PackageMutationRequest(
        String packageNumber,
        String newPackageNumber,
        Long applicationNumber,
        Double volume,
        Double averageLength,
        Double averageDiameter,
        String status,
        String comments,
        String reprocessed,
        String ageClass,
        String productType,
        String endUseCode,
        List<String> speciesCodes) {
      this(
          packageNumber,
          newPackageNumber,
          applicationNumber,
          volume,
          averageLength,
          averageDiameter,
          status,
          comments,
          null,
          null,
          reprocessed,
          ageClass,
          productType,
          endUseCode,
          speciesCodes);
    }
  }

  record PackagePersistenceResult(
      boolean valid,
      String packageNumber,
      String volume,
      String length,
      String diameter,
      String status,
      List<String> errors,
      List<String> warnings) {}

  record ScaleMutationRequest(
      String timberMark,
      String packageNumber,
      String gradeCode,
      String speciesCode,
      Long applicationNumber,
      Long pieces,
      Double volume) {}

  record ScalePersistenceResult(
      boolean valid,
      ApplicationPackageScaleItem result,
      List<String> errors,
      List<String> warnings) {}

  record ApplicationClientSnapshot(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName) {}

  record ApplicationSummarySnapshot(
      Long applicationNumber,
      Long federalApplicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator) {}

  record ApplicationEditContext(
      Long applicationNumber,
      String applicationStatusCode,
      String jurisdictionCode,
      String productTypeCode,
      Long exportScheduleId,
      LocalDate advertisingDate,
      boolean hasPackageBeforeApproval,
      boolean hasScaleBeforeApproval,
      boolean hasCompletePermit,
      String oicIndicator,
      boolean interiorMinisterialItemOverrideEligible) {}

  record CreateApplicationRequest(
      Long federalApplicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String productLocation,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String exemptionNumber,
      String exemptionReasonCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator,
      String endUseCode,
      List<String> speciesCodes,
      String remarkBody,
      boolean validationEnabled) {
    public CreateApplicationRequest(
        Long federalApplicationNumber,
        LocalDate applicationDate,
        Long termDays,
        LocalDate receivedDate,
        Double applicationVolume,
        Double averageLogVolume,
        String productLocation,
        Long exportScheduleId,
        String agentClientNumber,
        String agentClientLocationCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String exemptionNumber,
        String exemptionReasonCode,
        String applicantTypeCode,
        Long orgUnitNumber,
        String productTypeCode,
        String jurisdictionCode,
        String growthTypeCode,
        String agentContactName,
        String ownerContactName,
        String oicIndicator,
        String endUseCode,
        List<String> speciesCodes,
        String remarkBody,
        boolean validationEnabled) {
      this(
          federalApplicationNumber,
          applicationDate,
          termDays,
          receivedDate,
          applicationVolume,
          averageLogVolume,
          productLocation,
          exportScheduleId,
          agentClientNumber,
          agentClientLocationCode,
          ownerClientNumber,
          ownerClientLocationCode,
          exemptionNumber,
          exemptionReasonCode,
          null,
          applicantTypeCode,
          orgUnitNumber,
          productTypeCode,
          jurisdictionCode,
          growthTypeCode,
          agentContactName,
          ownerContactName,
          oicIndicator,
          endUseCode,
          speciesCodes,
          remarkBody,
          validationEnabled);
    }

    public CreateApplicationRequest(
        Long federalApplicationNumber,
        LocalDate applicationDate,
        Long termDays,
        LocalDate receivedDate,
        Double applicationVolume,
        Double averageLogVolume,
        String productLocation,
        Long exportScheduleId,
        String agentClientNumber,
        String agentClientLocationCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String exemptionNumber,
        String exemptionReasonCode,
        String applicantTypeCode,
        Long orgUnitNumber,
        String productTypeCode,
        String jurisdictionCode,
        String growthTypeCode,
        String agentContactName,
        String ownerContactName,
        String oicIndicator,
        String endUseCode,
        List<String> speciesCodes,
        boolean validationEnabled) {
      this(
          federalApplicationNumber,
          applicationDate,
          termDays,
          receivedDate,
          applicationVolume,
          averageLogVolume,
          productLocation,
          exportScheduleId,
          agentClientNumber,
          agentClientLocationCode,
          ownerClientNumber,
          ownerClientLocationCode,
          exemptionNumber,
          exemptionReasonCode,
          null,
          applicantTypeCode,
          orgUnitNumber,
          productTypeCode,
          jurisdictionCode,
          growthTypeCode,
          agentContactName,
          ownerContactName,
          oicIndicator,
          endUseCode,
          speciesCodes,
          null,
          validationEnabled);
    }

    public CreateApplicationRequest(
        Long federalApplicationNumber,
        LocalDate applicationDate,
        Long termDays,
        LocalDate receivedDate,
        Double applicationVolume,
        Double averageLogVolume,
        String productLocation,
        Long exportScheduleId,
        String agentClientNumber,
        String agentClientLocationCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String exemptionNumber,
        String exemptionReasonCode,
        String applicantTypeCode,
        Long orgUnitNumber,
        String productTypeCode,
        String jurisdictionCode,
        String growthTypeCode,
        String agentContactName,
        String ownerContactName,
        String oicIndicator,
        boolean validationEnabled) {
      this(
          federalApplicationNumber,
          applicationDate,
          termDays,
          receivedDate,
          applicationVolume,
          averageLogVolume,
          productLocation,
          exportScheduleId,
          agentClientNumber,
          agentClientLocationCode,
          ownerClientNumber,
          ownerClientLocationCode,
          exemptionNumber,
          exemptionReasonCode,
          null,
          applicantTypeCode,
          orgUnitNumber,
          productTypeCode,
          jurisdictionCode,
          growthTypeCode,
          agentContactName,
          ownerContactName,
          oicIndicator,
          null,
          null,
          null,
          validationEnabled);
    }
  }

  record ApplicationSummaryUpdateRequest(
      Long applicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String exemptionReasonCode,
      String productLocation,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator,
      String endUseCode,
      List<String> speciesCodes,
      boolean validationEnabled,
      ApplicationSummarySaveSource saveSource) {
    public ApplicationSummaryUpdateRequest(
        Long applicationNumber,
        LocalDate applicationDate,
        Long termDays,
        LocalDate receivedDate,
        Double applicationVolume,
        Double averageLogVolume,
        String exemptionReasonCode,
        String productLocation,
        Long exportScheduleId,
        String agentClientNumber,
        String agentClientLocationCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String applicationStatusCode,
        String applicantTypeCode,
        Long orgUnitNumber,
        String productTypeCode,
        String jurisdictionCode,
        String growthTypeCode,
        String agentContactName,
        String ownerContactName,
        String oicIndicator,
        String endUseCode,
        List<String> speciesCodes,
        boolean validationEnabled) {
      this(
          applicationNumber,
          applicationDate,
          termDays,
          receivedDate,
          applicationVolume,
          averageLogVolume,
          exemptionReasonCode,
          productLocation,
          exportScheduleId,
          agentClientNumber,
          agentClientLocationCode,
          ownerClientNumber,
          ownerClientLocationCode,
          applicationStatusCode,
          applicantTypeCode,
          orgUnitNumber,
          productTypeCode,
          jurisdictionCode,
          growthTypeCode,
          agentContactName,
          ownerContactName,
          oicIndicator,
          endUseCode,
          speciesCodes,
          validationEnabled,
          ApplicationSummarySaveSource.FULL);
    }

    public ApplicationSummaryUpdateRequest(
        Long applicationNumber,
        LocalDate applicationDate,
        Long termDays,
        LocalDate receivedDate,
        Double applicationVolume,
        Double averageLogVolume,
        String exemptionReasonCode,
        String productLocation,
        Long exportScheduleId,
        String agentClientNumber,
        String agentClientLocationCode,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String applicationStatusCode,
        String applicantTypeCode,
        Long orgUnitNumber,
        String productTypeCode,
        String jurisdictionCode,
        String growthTypeCode,
        String agentContactName,
        String ownerContactName,
        String oicIndicator,
        boolean validationEnabled) {
      this(
          applicationNumber,
          applicationDate,
          termDays,
          receivedDate,
          applicationVolume,
          averageLogVolume,
          exemptionReasonCode,
          productLocation,
          exportScheduleId,
          agentClientNumber,
          agentClientLocationCode,
          ownerClientNumber,
          ownerClientLocationCode,
          applicationStatusCode,
          applicantTypeCode,
          orgUnitNumber,
          productTypeCode,
          jurisdictionCode,
          growthTypeCode,
          agentContactName,
          ownerContactName,
          oicIndicator,
          null,
          null,
          validationEnabled,
          ApplicationSummarySaveSource.FULL);
    }
  }

  record CreateApplicationResult(
      boolean valid,
      String message,
      Long applicationNumber,
      List<String> errors,
      List<String> warnings) {}

}

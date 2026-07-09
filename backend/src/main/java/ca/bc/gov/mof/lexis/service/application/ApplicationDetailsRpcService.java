package ca.bc.gov.mof.lexis.service.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public interface ApplicationDetailsRpcService {

  static String toSpeciesEndUseSort(List<SpeciesEndUseItem> items) {
    if (items == null || items.isEmpty()) {
      return "";
    }

    List<String> speciesCodes = new ArrayList<>();
    String endUseCode = null;
    for (SpeciesEndUseItem item : items) {
      if (item == null) {
        continue;
      }
      String speciesCode = trimToNull(item.species());
      if (speciesCode != null && !speciesCodes.contains(speciesCode)) {
        speciesCodes.add(speciesCode);
      }
      if (endUseCode == null) {
        endUseCode = trimToNull(item.endUse());
      }
    }

    if (speciesCodes.isEmpty()) {
      return endUseCode == null ? "" : endUseCode;
    }
    String speciesSort = String.join("/", speciesCodes);
    return endUseCode == null ? speciesSort : speciesSort + "/" + endUseCode;
  }

  private static String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  List<DocumentItem> getDocumentDetails(Long applicationNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  Optional<String> getRemark(Long remarkId);

  Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId);

  CreateApplicationResult addApplication(CreateApplicationRequest request, String userId);

  CreateApplicationResult updateApplicationSummary(ApplicationSummaryUpdateRequest request, String userId);

  Optional<ApplicationSummarySnapshot> getApplicationSummarySnapshot(Long applicationNumber);

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

  List<SpeciesEndUseItem> getSpeciesForApplication(Long applicationNumber);

  List<SpeciesEndUseItem> getSpeciesForPackage(String packageNumber);

  List<ApplicationScaleItem> getUniqueScalesForApplication(Long applicationNumber);

  List<ApplicationPermitItem> findPermits(Long applicationNumber);

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

  PackagePersistenceResult updatePackage(PackageMutationRequest request, String userId);

  ScalePersistenceResult addScaleToPackage(ScaleMutationRequest request, String userId);

  boolean deleteScaleById(String scaleDetailId, String userId);

  boolean deletePackageById(String packageNumber, String userId);

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}

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
      boolean validationEnabled) {
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
          validationEnabled);
    }
  }

  record CreateApplicationResult(
      boolean valid,
      String message,
      Long applicationNumber,
      List<String> errors,
      List<String> warnings) {}
}

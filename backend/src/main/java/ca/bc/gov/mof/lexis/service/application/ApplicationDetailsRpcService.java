package ca.bc.gov.mof.lexis.service.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ApplicationDetailsRpcService {

  List<DocumentItem> getDocumentDetails(Long applicationNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  Optional<String> getRemark(Long remarkId);

  Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId);

  CreateApplicationResult addApplication(CreateApplicationRequest request, String userId);

  Optional<ApplicationClientSnapshot> getApplicationClientSnapshot(Long applicationNumber);

  List<CodeItem> getSpeciesCodes();

  List<CodeItem> getGradeCodes(String orgUnitNumber, String speciesCode);

  Optional<String> getSelectedEndUse(Long applicationNumber);

  Optional<String> getPackageSelectedEndUse(String packageNumber);

  List<SpeciesEndUseItem> getSpeciesForApplication(Long applicationNumber);

  List<SpeciesEndUseItem> getSpeciesForPackage(String packageNumber);

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}

  record PersistedRemark(
      long remarkId, String remark, String displayRemark, String user, Instant date) {}

  record CodeItem(String code, String description) {}

  record SpeciesEndUseItem(String species, String endUse, String endUseDescription) {}

  record ApplicationClientSnapshot(
      String agentClientNumber,
      String agentClientLocationCode,
      String agentContactName,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String ownerContactName) {}

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
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator,
      boolean validationEnabled) {}

  record CreateApplicationResult(
      boolean valid,
      String message,
      Long applicationNumber,
      List<String> errors,
      List<String> warnings) {}
}

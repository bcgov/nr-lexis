package ca.bc.gov.mof.lexis.service.exemption;

import java.util.List;
import java.util.Optional;

public interface ExemptionDetailsRpcService {

  ExemptionApplicationsResponse getApplications(
      String exemptionNumber, boolean canViewFederalApplications, boolean canViewReserveApplications);

  List<PermitItem> getPermits(
      String exemptionNumber, boolean ministryUser, boolean privilegedUser, String forestClientNumber);

  BlanketOicTotalsResponse getBlanketOicTotals(String exemptionNumber);

  List<DocumentItem> getDocumentDetails(String exemptionNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  record ExemptionApplicationsResponse(
      List<ApplicationItem> applications, boolean containsUnmanu, String ownerNumber) {}

  record ApplicationItem(
      long applicationNumber,
      String requestedVolume,
      String scaleVolume,
      boolean locked,
      String jurisdiction) {}

  record PermitItem(
      long permitNumber,
      String permitVolume,
      String permitStatus,
      String permitIssueDate,
      boolean canViewPermit) {}

  record BlanketOicTotalsResponse(String requestedVolume, String completedVolume) {}

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}
}

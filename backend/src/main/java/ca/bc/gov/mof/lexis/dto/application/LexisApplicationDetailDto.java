package ca.bc.gov.mof.lexis.dto.application;

import java.time.LocalDate;
import java.util.List;

public record LexisApplicationDetailDto(
    long applicationNumber,
    String exemptionNumber,
    String applicationStatusCode,
    String statusDescription,
    String ownerClientNumber,
    String agentClientNumber,
    Long orgUnitNumber,
    String orgUnitName,
    String productTypeCode,
    String exemptionReasonCode,
    LocalDate applicationDate,
    LocalDate receivedDate,
    LocalDate listingDate,
    Long termDays,
    double applicationVolume,
    double averageLogVolume,
    boolean canCreateOffers,
    boolean industryUser,
    boolean readOnly,
    boolean exemptionApprover,
    boolean locked,
    List<LexisPackageDto> packages,
    List<LexisRemarkDto> remarks,
    List<LexisOfferDto> offers) {

  public record LexisPackageDto(String packageNumber, double volume, long pieceCount) {}

  public record LexisRemarkDto(Long remarkId, String title, String remark) {}

  public record LexisOfferDto(
      String offerNumber, String companyName, LocalDate receivedDate, boolean validOffer, LocalDate withdrawalDate) {}
}

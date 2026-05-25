package ca.bc.gov.mof.lexis.dto.offer;

import java.time.LocalDate;

public record PurchaseOfferDetailDto(
    Long offerNumber,
    Long applicationNumber,
    String packageNumber,
    String companyName,
    String contactName,
    double purchaseOfferAmount,
    LocalDate purchaseOfferDate,
    LocalDate offerWithdrawalDate,
    LocalDate teacReviewDate,
    String approvalIndicator,
    String validOfferIndicator,
    String fairOfferIndicator,
    String offerRemark,
    String withdrawReason,
    String exportJurisdictionCode,
    String manufacturingFacilityInfo,
    String offeringClientNumber,
    String pickupLocation,
    String offerCondition,
    LocalDate advertisingDate,
    LocalDate offerEndDate,
    double offerVolume,
    String region) {}

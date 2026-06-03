package ca.bc.gov.mof.lexis.service.offer;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PurchaseOfferService {

  PurchaseOfferSearchOptionsDto searchOptions();

  PurchaseOfferSearchResponseDto search(PurchaseOfferSearchCriteria criteria);

  Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber);

  CreateOfferResult addOffer(CreateOfferRequest request, String userId);

  CreateOfferResult updateOffer(CreateOfferRequest request, String userId);

  record CreateOfferRequest(
      Long applicationNumber,
      Long exportPurchaseOfferNumber,
      String packageNumber,
      String companyName,
      String contactName,
      Double purchaseOfferAmount,
      LocalDate purchaseOfferDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacReviewDate,
      String fairOfferIndicator,
      String validOfferIndicator,
      String offerRemark,
      String approvalIndicator,
      String withdrawReason,
      String exportJurisdictionCode,
      String manufacturingFacilityInfo,
      String offeringClientNumber,
      String pickupLocation,
      String offerCondition,
      Double offerVolume) {}

  record CreateOfferResult(
      boolean success,
      String message,
      Long applicationNumber,
      Long exportPurchaseOfferNumber,
      boolean clientHasEmail,
      String toEmails,
      boolean sendEmail,
      boolean update,
      List<String> errors,
      List<String> warnings) {}
}

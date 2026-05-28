package ca.bc.gov.mof.lexis.service.offer;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import java.util.Optional;

public interface PurchaseOfferService {

  PurchaseOfferSearchOptionsDto searchOptions();

  PurchaseOfferSearchResponseDto search(PurchaseOfferSearchCriteria criteria);

  Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber);
}

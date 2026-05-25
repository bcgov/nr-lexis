package ca.bc.gov.mof.lexis.repository.offer;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PurchaseOfferRepository {

  public List<CodeNameDto> loadRegionOptions() {
    // TODO: Port legacy offer-search region lookup used by PurchaseOfferSearchAction.
    return List.of();
  }

  public List<PurchaseOfferSearchResultDto> search(PurchaseOfferSearchCriteria criteria) {
    // TODO: Port legacy PurchaseOfferSearchAction + OraclePurchaseOfferDAO search behavior.
    return List.of();
  }

  public Optional<PurchaseOfferDetailDto> findByOfferNumber(Long offerNumber) {
    // TODO: Port legacy PurchaseOffersDetailsAction + OraclePurchaseOfferDAO detail behavior.
    return Optional.empty();
  }
}

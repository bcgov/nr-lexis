package ca.bc.gov.mof.lexis.dto.offer;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.util.List;

public record PurchaseOfferSearchOptionsDto(List<CodeNameDto> regions) {}

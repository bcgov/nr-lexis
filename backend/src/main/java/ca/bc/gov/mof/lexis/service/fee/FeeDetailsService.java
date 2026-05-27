package ca.bc.gov.mof.lexis.service.fee;

import ca.bc.gov.mof.lexis.dto.fee.FeePermitSummaryDto;
import java.util.Optional;

public interface FeeDetailsService {

  Optional<FeePermitSummaryDto> getPermitSummary(Long permitNumber);
}

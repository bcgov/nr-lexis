package ca.bc.gov.mof.lexis.service.fee;

import ca.bc.gov.mof.lexis.dto.fee.FeePermitSummaryDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleFeeDetailsService implements FeeDetailsService {

  private final PermitService permitService;

  public OracleFeeDetailsService(PermitService permitService) {
    this.permitService = permitService;
  }

  @Override
  public Optional<FeePermitSummaryDto> getPermitSummary(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return permitService.findByPermitNumber(permitNumber).map(this::toPermitSummary);
  }

  private FeePermitSummaryDto toPermitSummary(PermitDetailDto detail) {
    // Temporary parity baseline: fees are derived from permit volume until package-level policy calculations are ported.
    double feeValue = detail.permitVolume();

    return new FeePermitSummaryDto(
        detail.permitNumber(),
        detail.exemptionNumber(),
        detail.permitVolume(),
        detail.numberOfPieces(),
        feeValue,
        detail.receiptNumber());
  }
}

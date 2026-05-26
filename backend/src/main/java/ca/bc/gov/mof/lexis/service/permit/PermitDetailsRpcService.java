package ca.bc.gov.mof.lexis.service.permit;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;

public interface PermitDetailsRpcService {

  PermitSummaryRpcResponseDto getPermitSummary(
      Long permitNumber,
      String countryCode,
      String applicationDate,
      String packageNumber,
      boolean ministryUser);

  PermitTotalFeesRpcResponseDto getTotalFeesForPermit(
      Long permitNumber,
      String countryCode,
      String applicationDate);

  PermitScaleFeesRpcResponseDto getScaleFeesForPackage(
      String packageNumber,
      Long permitNumber,
      boolean ministryUser);
}

package ca.bc.gov.mof.lexis.dto.federal;

import java.time.LocalDate;
import java.util.List;

public record FederalApplicationDetailDto(
    Long applicationNumber,
    String federalApplicationNumber,
    String statusCode,
    String statusDescription,
    String ownerClientNumber,
    String ownerClientLocationCode,
    String agentClientNumber,
    String agentClientLocationCode,
    String exemptionNumber,
    String exemptionType,
    String exemptionReason,
    LocalDate receivedDate,
    LocalDate listingDate,
    boolean readOnly,
    List<String> packages,
    List<String> remarks,
    List<String> offers,
    FederalApplicationPermitDto federalPermit) {}

package ca.bc.gov.mof.lexis.dto.exemption;

import java.time.LocalDate;
import java.util.List;

public record ExemptionDetailDto(
    String exemptionNumber,
    String exemptionTypeCode,
    String exemptionTypeDescription,
    String exemptionStatusCode,
    String exemptionStatusDescription,
    String ownerClientNumber,
    String agentClientNumber,
    Long applicationNumber,
    String applicationStatus,
    LocalDate approvalDate,
    LocalDate expiryDate,
    double approvedVolume,
    double usedVolume,
    double remainingVolume,
    String otherConditions,
    boolean blanketOic,
    List<String> permitNumbers,
    List<ExemptionRemarkDto> remarks) {

  public record ExemptionRemarkDto(String title, String remark) {}
}

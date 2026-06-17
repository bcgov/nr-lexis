package ca.bc.gov.mof.lexis.dto.upload;

import java.util.List;

public record ApplicationSubmissionSummaryDto(
    String ownerClientNumber,
    String ownerClientLocationCode,
    String ownerContactName,
    String jurisdictionCode,
    Long orgUnitNumber,
    String sourceApplicationStatusCode,
    String exemptionReasonCode,
    String applicantTypeCode,
    String productTypeCode,
    String packageNumber,
    String productLocation,
    String ageClass,
    Double averageLength,
    Double averageDiameter,
    Double applicationVolume,
    Double averageLogVolume,
    String endUseCode,
    List<String> speciesCodes,
    int scaleRows) {}

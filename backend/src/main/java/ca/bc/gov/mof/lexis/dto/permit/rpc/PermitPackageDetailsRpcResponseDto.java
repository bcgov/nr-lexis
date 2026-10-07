package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitPackageDetailsRpcResponseDto(
    boolean success,
    String packageNumber,
    String volume,
    double scaledVolume,
    String length,
    String diameter,
    String status,
    String comments,
    String statusDesc,
    String reprocessed,
    String ageClass,
    // Exact package volume less its scales, unlike the rounded volumes above.
    String remainingVolume) {}

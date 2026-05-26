package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitPackageInfoRpcResponseDto(
    String region,
    String enduse,
    String ageclass,
    String volume,
    String length,
    String diameter,
    String productType) {}

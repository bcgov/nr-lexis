package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.util.List;

public record PermitPackageInfoRpcResponseDto(
    String region,
    String enduse,
    String ageclass,
    String volume,
    String length,
    String diameter,
    String productType,
    List<String> speciesCodes,
    List<String> endUseCodes) {}

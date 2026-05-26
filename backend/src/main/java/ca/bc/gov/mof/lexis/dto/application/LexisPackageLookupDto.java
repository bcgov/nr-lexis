package ca.bc.gov.mof.lexis.dto.application;

public record LexisPackageLookupDto(
    String packageNumber,
    Long applicationNumber,
    double packageVolume,
    String growthTypeCode) {}

package ca.bc.gov.mof.lexis.dto.application;

import java.time.LocalDate;

public record LexisApplicationSearchResultDto(
    long application,
    String status,
    String client,
    String ownerClientNumber,
    String exemptionNumber,
    LocalDate listingDate,
    String region,
    double applicationVolume,
    boolean showCheckbox,
    boolean locked,
    String exemptionTypeDescription) {}

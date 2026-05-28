package ca.bc.gov.mof.lexis.dto.exemption;

import java.time.LocalDate;
import java.util.List;

public record ExemptionSearchCriteria(
    String applicationNumber,
    String packageNumber,
    String exemptionNumber,
    String exemptionType,
    String exemptionStatus,
    String applicantClientNumber,
    String ownerClientNumber,
    LocalDate approvalFromDate,
    LocalDate approvalToDate,
    LocalDate listingFromDate,
    LocalDate listingToDate,
    List<Long> regionNumbers,
    int page,
    int size) {}

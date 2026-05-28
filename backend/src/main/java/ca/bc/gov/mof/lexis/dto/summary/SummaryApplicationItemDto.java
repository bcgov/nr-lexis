package ca.bc.gov.mof.lexis.dto.summary;

import java.time.LocalDate;
import java.util.List;

public record SummaryApplicationItemDto(
    long application,
    String status,
    String reason,
    String exemptionType,
    String exemptionNumber,
    LocalDate receivedDate,
    LocalDate listingDate,
    List<String> packageNumberAry) {}

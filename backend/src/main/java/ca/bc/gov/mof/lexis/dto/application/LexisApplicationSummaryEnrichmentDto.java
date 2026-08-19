package ca.bc.gov.mof.lexis.dto.application;

import java.time.LocalDate;
import java.util.List;

/** The application fields needed to render a provincial summary row. */
public record LexisApplicationSummaryEnrichmentDto(
    long applicationNumber, String reason, LocalDate receivedDate, List<String> packageNumbers) {

  public LexisApplicationSummaryEnrichmentDto {
    packageNumbers = packageNumbers == null ? List.of() : List.copyOf(packageNumbers);
  }
}

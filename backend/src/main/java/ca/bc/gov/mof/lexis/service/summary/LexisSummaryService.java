package ca.bc.gov.mof.lexis.service.summary;

import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;

public interface LexisSummaryService {

  SummaryApplicationsResponseDto applications(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);

  SummaryOffersResponseDto offers(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);

  SummaryExemptionsResponseDto exemptions(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);

  SummaryPermitsResponseDto permits(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);

  SummaryFeesResponseDto fees(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);

  SummaryOffersResponseDto offersPlaced(
      String clientNumber,
      Integer page,
      Integer size,
      String sortField);
}

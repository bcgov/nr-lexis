package ca.bc.gov.mof.lexis.dto.federal;

import java.util.List;

public record FederalSubmissionPrevalidationDto(
    String boomNumber,
    String clientNumber,
    List<String> errors,
    String locationCode,
    List<String> timberMark) {}

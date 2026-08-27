package ca.bc.gov.mof.lexis.dto.federal;

import com.fasterxml.jackson.annotation.JsonAlias;
import java.util.List;

public record FederalSubmissionPrevalidationDto(
    @JsonAlias("BoomNumber") String boomNumber,
    @JsonAlias("ClientNumber") String clientNumber,
    @JsonAlias("Errors") List<String> errors,
    @JsonAlias("LocationCode") String locationCode,
    @JsonAlias("TimberMark") List<String> timberMark) {}

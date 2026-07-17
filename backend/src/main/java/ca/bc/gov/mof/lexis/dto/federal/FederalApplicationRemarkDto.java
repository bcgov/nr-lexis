package ca.bc.gov.mof.lexis.dto.federal;

import java.time.Instant;

public record FederalApplicationRemarkDto(
    Long remarkId, String remark, String user, Instant date) {}

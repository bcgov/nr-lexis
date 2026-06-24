package ca.bc.gov.mof.lexis.dto.rtm;

import java.math.BigDecimal;

public record RtmEmsLogAmvRowDto(
    String species,
    String grade,
    String growthIndicator,
    String retrievalDate,
    String updateDate,
    BigDecimal currentValue,
    BigDecimal newValue,
    String returnCode) {}

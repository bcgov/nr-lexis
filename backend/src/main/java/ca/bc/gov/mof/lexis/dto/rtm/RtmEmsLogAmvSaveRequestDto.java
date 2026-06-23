package ca.bc.gov.mof.lexis.dto.rtm;

import java.math.BigDecimal;

public record RtmEmsLogAmvSaveRequestDto(
    String species,
    String grade,
    String growthIndicator,
    String retrievalDate,
    String updateDate,
    BigDecimal newValue,
    String saveMode) {

  public String effectiveSaveMode() {
    return saveMode == null ? "create" : saveMode.trim().toLowerCase();
  }
}

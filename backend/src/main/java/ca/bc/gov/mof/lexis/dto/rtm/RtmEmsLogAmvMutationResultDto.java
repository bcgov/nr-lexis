package ca.bc.gov.mof.lexis.dto.rtm;

import java.util.List;

public record RtmEmsLogAmvMutationResultDto(
    String status,
    String message,
    List<String> errors,
    List<RtmEmsLogAmvRowDto> rows,
    RtmEmsLogAmvLastSavedDto lastSaved) {

  public RtmEmsLogAmvMutationResultDto(
      String status,
      String message,
      List<String> errors,
      List<RtmEmsLogAmvRowDto> rows) {
    this(status, message, errors, rows, null);
  }
}

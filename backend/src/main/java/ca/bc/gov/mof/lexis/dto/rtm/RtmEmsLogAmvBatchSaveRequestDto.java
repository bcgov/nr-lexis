package ca.bc.gov.mof.lexis.dto.rtm;

import java.util.List;

/** A single atomic AMV grid submission. */
public record RtmEmsLogAmvBatchSaveRequestDto(List<RtmEmsLogAmvSaveRequestDto> values) {

  public RtmEmsLogAmvBatchSaveRequestDto {
    values = values == null ? List.of() : List.copyOf(values);
  }
}

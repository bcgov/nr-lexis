package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.math.BigDecimal;
import java.util.List;

public record PermitScaleUploadSubmitRequestDto(
    Long permitNumber,
    List<ScaleRow> rows) {

  public record ScaleRow(
      int lineNumber,
      String timberMark,
      String speciesCode,
      String gradeCode,
      Long pieces,
      BigDecimal volume,
      String packageNumber,
      Long applicationNumber,
      Long permitNumber) {}
}

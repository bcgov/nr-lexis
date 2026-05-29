package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.math.BigDecimal;
import java.util.List;

public record PermitScaleUploadRowDto(
    int lineNumber,
    String timberMark,
    String speciesCode,
    String speciesDescription,
    String gradeCode,
    String gradeDescription,
    Long pieces,
    BigDecimal volume,
    String packageNumber,
    Long applicationNumber,
    Long permitNumber,
    boolean valid,
    List<String> errors,
    List<String> warnings) {}

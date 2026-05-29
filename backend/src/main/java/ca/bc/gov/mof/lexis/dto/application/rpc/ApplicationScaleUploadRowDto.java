package ca.bc.gov.mof.lexis.dto.application.rpc;

import java.math.BigDecimal;
import java.util.List;

public record ApplicationScaleUploadRowDto(
    int lineNumber,
    String sourceFileName,
    String timberMark,
    String speciesCode,
    String speciesDescription,
    String gradeCode,
    String gradeDescription,
    Long pieces,
    BigDecimal volume,
    String packageNumber,
    Long applicationNumber,
    boolean valid,
    List<String> errors,
    List<String> warnings) {}

package ca.bc.gov.mof.lexis.dto.application.rpc;

import java.math.BigDecimal;
import java.util.List;

public record ApplicationScaleUploadPreviewResponseDto(
    String fileName,
    int totalRows,
    int validRows,
    long totalPieces,
    BigDecimal totalVolume,
    List<String> errors,
    List<String> warnings,
    List<ApplicationScaleUploadRowDto> rows) {}

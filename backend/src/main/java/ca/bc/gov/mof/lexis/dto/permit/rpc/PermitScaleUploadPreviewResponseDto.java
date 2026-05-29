package ca.bc.gov.mof.lexis.dto.permit.rpc;

import java.math.BigDecimal;
import java.util.List;

public record PermitScaleUploadPreviewResponseDto(
    String fileName,
    int totalRows,
    int validRows,
    long totalPieces,
    BigDecimal totalVolume,
    List<String> errors,
    List<String> warnings,
    List<PermitScaleUploadRowDto> rows) {}

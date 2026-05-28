package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitScaleItemRpcResponseDto(
    String timbermark,
    long pieces,
    String species,
    String grade,
    String volume,
    String permit,
    String id,
    String cascadeSplitCode,
    String region) {}

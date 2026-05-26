package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitRpcScaleItemDto(
    String timbermark,
    String species,
    String grade,
    String amv,
    String volume,
    boolean ministryUser,
    String ewb,
    long pieces,
    String fil,
    String mf,
    String fee,
    String cascadeSplitCode,
    String id,
    String permit) {}

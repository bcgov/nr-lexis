package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitDocumentItemRpcResponseDto(
    String name, String description, String type, String typeCode, long id) {}

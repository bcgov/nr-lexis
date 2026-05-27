package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitInvoiceDetailsRpcResponseDto(
    boolean invoicefound,
    String rate,
    String fee,
    String value) {}

package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitGbmsInvoiceHistoryItemRpcResponseDto(
    String gbmsInvoiceNumber,
    String cancelledByInvoice,
    String replacedByInvoice,
    String invoiceAmount,
    String printedDate,
    String entryDate,
    String updateDate) {}

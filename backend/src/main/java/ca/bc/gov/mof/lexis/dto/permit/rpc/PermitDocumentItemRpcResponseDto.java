package ca.bc.gov.mof.lexis.dto.permit.rpc;

public record PermitDocumentItemRpcResponseDto(
    String name,
    String description,
    String type,
    String typeCode,
    long id,
    String source,
    Long sourceApplicationNumber,
    Long sourcePermitNumber,
    boolean deletable) {

  public PermitDocumentItemRpcResponseDto(
      String name, String description, String type, String typeCode, long id) {
    this(name, description, type, typeCode, id, "permit", null, null, true);
  }
}

package ca.bc.gov.mof.lexis.dto.admin;

import java.util.Map;

public record LexisAdminRpcResponseDto(
    boolean success,
    String message,
    Map<String, String> payload) {}


package ca.bc.gov.mof.lexis.dto.admin;

import java.util.Map;

public record LexisAdminRpcRequestDto(String action, Map<String, String> parameters) {}


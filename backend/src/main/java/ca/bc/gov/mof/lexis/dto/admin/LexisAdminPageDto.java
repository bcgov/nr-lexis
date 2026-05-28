package ca.bc.gov.mof.lexis.dto.admin;

import java.util.Map;

public record LexisAdminPageDto(String page, String legacyAction, Map<String, String> metadata) {}


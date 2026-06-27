package ca.bc.gov.mof.lexis.dto.admin;

import java.util.List;

public record LexisAdminPagedResponseDto<T>(List<T> results, int total, int page, int size) {}

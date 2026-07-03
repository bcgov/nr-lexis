package ca.bc.gov.mof.lexis.dto.admin;

import java.util.List;

public record LexisFamUserRoleAssignmentSearchResponseDto(
    List<LexisFamUserRoleAssignmentDto> results,
    int total,
    int pageNumber,
    int pageSize,
    int pageCount,
    boolean configured,
    String message) {}

package ca.bc.gov.mof.lexis.dto.admin;

public record LexisFamUserRoleAssignmentDto(
    Long assignmentId,
    Long userId,
    String userName,
    String userTypeCode,
    String userTypeDescription,
    String firstName,
    String lastName,
    String fullName,
    String email,
    Long roleId,
    String roleName,
    String roleDisplayName,
    String roleTypeCode,
    String forestClientNumber,
    String forestClientName,
    String forestClientStatusCode,
    String forestClientStatusDescription,
    String createDate,
    String expiryDate) {}

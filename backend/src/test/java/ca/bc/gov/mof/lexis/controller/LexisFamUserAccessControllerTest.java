package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import ca.bc.gov.mof.lexis.service.admin.LexisFamUserAccessService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
class LexisFamUserAccessControllerTest {

  @Mock private LexisFamUserAccessService service;

  @Test
  void searchRoleAssignmentsShouldDelegateToService() {
    LexisFamUserAccessController controller = new LexisFamUserAccessController(service);
    LexisFamUserRoleAssignmentSearchResponseDto payload =
        new LexisFamUserRoleAssignmentSearchResponseDto(List.of(), 0, 1, 10, 0, true, null);
    when(service.searchRoleAssignments("smith", 1, 10, "user_name", "asc")).thenReturn(payload);

    ResponseEntity<LexisFamUserRoleAssignmentSearchResponseDto> response =
        controller.searchRoleAssignments("smith", 1, 10, "user_name", "asc");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(service).searchRoleAssignments("smith", 1, 10, "user_name", "asc");
  }

  @Test
  void searchRoleAssignmentsShouldReturnBadRequestForInvalidSearch() {
    LexisFamUserAccessController controller = new LexisFamUserAccessController(service);
    when(service.searchRoleAssignments("ab", 1, 10, null, null))
        .thenThrow(new IllegalArgumentException("Enter at least 3 characters to search FAM users."));

    ResponseEntity<LexisFamUserRoleAssignmentSearchResponseDto> response =
        controller.searchRoleAssignments("ab", 1, 10, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("Enter at least 3 characters to search FAM users.");
    assertThat(response.getBody().results()).isEmpty();
  }
}

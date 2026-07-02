package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import ca.bc.gov.mof.lexis.service.admin.LexisFamUserAccessService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/admin/fam-users")
public class LexisFamUserAccessController {

  private final LexisFamUserAccessService service;

  public LexisFamUserAccessController(LexisFamUserAccessService service) {
    this.service = service;
  }

  @GetMapping
  public ResponseEntity<LexisFamUserRoleAssignmentSearchResponseDto> searchRoleAssignments(
      @RequestParam(required = false) String search,
      @RequestParam(defaultValue = "1") int pageNumber,
      @RequestParam(defaultValue = "10") int pageSize,
      @RequestParam(required = false) String sortBy,
      @RequestParam(required = false) String sortOrder) {
    try {
      return ResponseEntity.ok(
          service.searchRoleAssignments(search, pageNumber, pageSize, sortBy, sortOrder));
    } catch (IllegalArgumentException ex) {
      return ResponseEntity.status(HttpStatus.BAD_REQUEST)
          .body(
              new LexisFamUserRoleAssignmentSearchResponseDto(
                  List.of(),
                  0,
                  Math.max(pageNumber, 1),
                  Math.max(pageSize, 10),
                  0,
                  true,
                  ex.getMessage()));
    }
  }
}

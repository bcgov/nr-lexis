package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionCapabilitiesDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/session")
@Validated
public class LexisSessionController {

  private static final String ROLES_HEADER = "X-Lexis-Roles";

  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public LexisSessionController(
      LexisSessionService sessionService, LexisAuthorizationService authorizationService) {
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping({"/welcome", "/showWelcome"})
  public ResponseEntity<LexisSessionWelcomeDto> showWelcome(
      @RequestParam(name = "role", required = false) List<String> roleFilters,
      @RequestHeader(name = ROLES_HEADER, required = false) String roleHeader,
      HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principal == null ? null : principal.getName();
    List<String> roles = resolveRoles(roleFilters, roleHeader);
    return ResponseEntity.ok(sessionService.resolveWelcomeRoute(principalName, roles));
  }

  @GetMapping("/capabilities")
  public ResponseEntity<LexisSessionCapabilitiesDto> capabilities(
      @RequestParam(name = "role", required = false) List<String> roleFilters,
      @RequestHeader(name = ROLES_HEADER, required = false) String roleHeader,
      HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principal == null ? null : principal.getName();
    List<String> roles = resolveRoles(roleFilters, roleHeader);

    LexisSessionWelcomeDto welcome = sessionService.resolveWelcomeRoute(principalName, roles);
    List<String> grantedActions = authorizationService.resolveGrantedActions(welcome.roles());

    return ResponseEntity.ok(
        new LexisSessionCapabilitiesDto(
            welcome.authenticated(),
            welcome.principal(),
            welcome.roles(),
            welcome.welcomeTarget(),
            welcome.legacyPath(),
            grantedActions));
  }

  @RequestMapping(path = "/logoff", method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<LexisSessionLogoutDto> logoff(HttpServletRequest request)
      throws ServletException {
    boolean invalidated = false;
    HttpSession session = request.getSession(false);

    if (session != null) {
      session.invalidate();
      invalidated = true;
    }

    if (request.getUserPrincipal() != null) {
      request.logout();
    }

    return ResponseEntity.ok(new LexisSessionLogoutDto(invalidated));
  }

  @GetMapping("/accessDenied")
  public ResponseEntity<LexisSessionMessageDto> accessDenied() {
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
        .body(new LexisSessionMessageDto("ACCESS_DENIED", "User is not authorized for this action."));
  }

  @GetMapping("/errorPage")
  public ResponseEntity<LexisSessionMessageDto> errorPage() {
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(new LexisSessionMessageDto("GENERIC_ERROR", "An unexpected server error occurred."));
  }

  private List<String> resolveRoles(List<String> roleFilters, String roleHeader) {
    List<String> roles = roleFilters;
    if (roles == null || roles.isEmpty()) {
      roles = sessionService.parseRoleHeader(roleHeader);
    }
    return roles;
  }
}

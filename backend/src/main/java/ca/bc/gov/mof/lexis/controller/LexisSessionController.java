package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionCapabilitiesDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionActionAccessDto;
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
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/session")
@Validated
public class LexisSessionController {

  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;

  public LexisSessionController(
      LexisSessionService sessionService, LexisAuthorizationService authorizationService) {
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
  }

  @GetMapping({"/welcome", "/showWelcome"})
  public ResponseEntity<LexisSessionWelcomeDto> showWelcome(HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principal == null ? null : principal.getName();
    List<String> roles = resolveRoles(principal);
    return ResponseEntity.ok(sessionService.resolveWelcomeRoute(principalName, roles));
  }

  @GetMapping("/capabilities")
  public ResponseEntity<LexisSessionCapabilitiesDto> capabilities(HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principal == null ? null : principal.getName();
    List<String> roles = resolveRoles(principal);

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

  @GetMapping("/canPerformAction")
  public ResponseEntity<LexisSessionActionAccessDto> canPerformAction(
      @RequestParam(name = "action") String action,
      HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principal == null ? null : principal.getName();
    List<String> roles = resolveRoles(principal);
    boolean granted = authorizationService.canPerformAction(roles, action);

    return ResponseEntity.ok(
        new LexisSessionActionAccessDto(
            principalName != null && !principalName.isBlank(),
            principalName,
            roles,
            action,
            granted));
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

  private List<String> resolveRoles(Principal principal) {
    if (principal instanceof Authentication authentication) {
      List<String> tokenRoles = sessionService.parseRolesFromPrincipal(authentication);
      if (!tokenRoles.isEmpty()) {
        return tokenRoles;
      }
    }

    return List.of();
  }
}

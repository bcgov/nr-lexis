package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionCapabilitiesDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionActionAccessDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService.ForestClientScope;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
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

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisSessionController.class);

  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisPrincipalService principalService;

  public LexisSessionController(
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisPrincipalService principalService) {
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.principalService = principalService;
  }

  @GetMapping({"/welcome", "/showWelcome"})
  public ResponseEntity<LexisSessionWelcomeDto> showWelcome(HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principalService.resolvePrincipalName(principal);
    List<String> roles = resolveRoles(principal);
    return ResponseEntity.ok(sessionService.resolveWelcomeRoute(principalName, roles));
  }

  @GetMapping("/capabilities")
  public ResponseEntity<LexisSessionCapabilitiesDto> capabilities(HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principalService.resolvePrincipalName(principal);
    List<String> roles = resolveRoles(principal);

    LexisSessionWelcomeDto welcome = sessionService.resolveWelcomeRoute(principalName, roles);
    List<String> grantedActions = authorizationService.resolveGrantedActions(welcome.roles());
    ForestClientScope forestClientScope =
        principal instanceof Authentication authentication
            ? sessionService.resolveForestClientScope(authentication)
            : sessionService.resolveForestClientScope(List.of());
    if (forestClientScope.invalid()
        && forestClientScope.availableClientNumbers().isEmpty()) {
      throw new AccessDeniedException(forestClientScope.failureReason());
    }
    String forestClientNumber =
        forestClientScope.invalid() ? null : forestClientScope.clientNumber();
    boolean forestClientSelectionRequired =
        forestClientScope.selectionRequired() || forestClientScope.invalid();
    String orgUnitNo = principalService.resolveOrgUnitNo(principal);

    LOGGER.debug(
        "Resolved LEXIS session capabilities: authenticated={}, principalPresent={}, roles={}, welcomeTarget={}, grantedActionCount={}, forestClientScoped={}, orgUnitNo={}",
        welcome.authenticated(),
        welcome.principal() != null && !welcome.principal().isBlank(),
        welcome.roles(),
        welcome.welcomeTarget(),
        grantedActions.size(),
        forestClientNumber != null,
        orgUnitNo);

    return ResponseEntity.ok(
        new LexisSessionCapabilitiesDto(
            welcome.authenticated(),
            welcome.principal(),
            welcome.roles(),
            welcome.welcomeTarget(),
            welcome.legacyPath(),
            grantedActions,
            forestClientNumber,
            forestClientScope.availableClientNumbers(),
            forestClientSelectionRequired,
            orgUnitNo));
  }

  @GetMapping("/canPerformAction")
  public ResponseEntity<LexisSessionActionAccessDto> canPerformAction(
      @RequestParam(name = "action") String action,
      HttpServletRequest request) {

    Principal principal = request.getUserPrincipal();
    String principalName = principalService.resolvePrincipalName(principal);
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

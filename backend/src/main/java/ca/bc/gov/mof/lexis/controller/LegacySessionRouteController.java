package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis")
@Validated
public class LegacySessionRouteController {

  private final LexisSessionController sessionController;

  public LegacySessionRouteController(LexisSessionController sessionController) {
    this.sessionController = sessionController;
  }

  @GetMapping({"/showWelcome", "/showWelcome.do"})
  public ResponseEntity<LexisSessionWelcomeDto> showWelcome(HttpServletRequest request) {
    return sessionController.showWelcome(request);
  }

  @RequestMapping(path = {"/logoff", "/logoff.do"}, method = {RequestMethod.GET, RequestMethod.POST})
  public ResponseEntity<LexisSessionLogoutDto> logoff(HttpServletRequest request)
      throws ServletException {
    return sessionController.logoff(request);
  }

  @GetMapping({"/accessDenied", "/accessDenied.do"})
  public ResponseEntity<LexisSessionMessageDto> accessDenied() {
    return sessionController.accessDenied();
  }

  @GetMapping({"/errorPage", "/errorPage.do"})
  public ResponseEntity<LexisSessionMessageDto> errorPage() {
    return sessionController.errorPage();
  }
}

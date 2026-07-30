package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LegacySessionRouteController")
class LegacySessionRouteControllerTest {

  @Mock private LexisSessionController sessionController;
  @Mock private HttpServletRequest request;

  @InjectMocks private LegacySessionRouteController controller;

  @Test
  void showWelcomeShouldDelegateToSessionController() {
    LexisSessionWelcomeDto welcome =
        new LexisSessionWelcomeDto(
            true,
            "idir\\jsmith",
            List.of("LEXIS_ADMIN"),
            "adminUser",
            "/provincial/review");
    when(sessionController.showWelcome(request)).thenReturn(ResponseEntity.ok(welcome));

    ResponseEntity<LexisSessionWelcomeDto> response = controller.showWelcome(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(welcome);
    verify(sessionController).showWelcome(request);
  }

  @Test
  void logoffShouldDelegateToSessionController() throws ServletException {
    LexisSessionLogoutDto logout = new LexisSessionLogoutDto(true);
    when(sessionController.logoff(request)).thenReturn(ResponseEntity.ok(logout));

    ResponseEntity<LexisSessionLogoutDto> response = controller.logoff(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(logout);
    verify(sessionController).logoff(request);
  }

  @Test
  void accessDeniedShouldDelegateToSessionController() {
    LexisSessionMessageDto message =
        new LexisSessionMessageDto("ACCESS_DENIED", "User is not authorized for this action.");
    when(sessionController.accessDenied()).thenReturn(ResponseEntity.status(HttpStatus.FORBIDDEN).body(message));

    ResponseEntity<LexisSessionMessageDto> response = controller.accessDenied();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(response.getBody()).isEqualTo(message);
    verify(sessionController).accessDenied();
  }

  @Test
  void errorPageShouldDelegateToSessionController() {
    LexisSessionMessageDto message =
        new LexisSessionMessageDto("GENERIC_ERROR", "An unexpected server error occurred.");
    when(sessionController.errorPage())
        .thenReturn(ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(message));

    ResponseEntity<LexisSessionMessageDto> response = controller.errorPage();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(response.getBody()).isEqualTo(message);
    verify(sessionController).errorPage();
  }
}

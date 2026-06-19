package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.session.LexisSessionActionAccessDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionCapabilitiesDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionLogoutDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionMessageDto;
import ca.bc.gov.mof.lexis.dto.session.LexisSessionWelcomeDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.security.Principal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisSessionController")
class LexisSessionControllerTest {

  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private LexisPrincipalService principalService;

  @InjectMocks private LexisSessionController controller;

  @Test
  void welcomeShouldUseTokenRolesWhenAvailable() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a", "LEXIS_PROVINCIAL_SUBMITTER");
    request.setUserPrincipal(authentication);

    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));

    LexisSessionWelcomeDto dto =
        new LexisSessionWelcomeDto(
            true,
            "idir\\jsmith",
            List.of("LEXIS_PROVINCIAL_SUBMITTER"),
            "industryUser",
            "/applicationSearch.do?actionMapping=view");

    when(sessionService.resolveWelcomeRoute("idir\\jsmith", List.of("LEXIS_PROVINCIAL_SUBMITTER")))
        .thenReturn(dto);

    ResponseEntity<LexisSessionWelcomeDto> response = controller.showWelcome(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(sessionService).parseRolesFromPrincipal(authentication);
    verify(sessionService).resolveWelcomeRoute("idir\\jsmith", List.of("LEXIS_PROVINCIAL_SUBMITTER"));
  }

  @Test
  void welcomeShouldResolveWithoutRolesWhenNoAuthenticationAuthoritiesExist() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    Principal principal = () -> "idir\\jsmith";
    request.setUserPrincipal(principal);

    LexisSessionWelcomeDto dto =
        new LexisSessionWelcomeDto(
            true,
            "idir\\jsmith",
            List.of(),
            "mofrUser",
            "/applicationsReview.do?actionMapping=view");

    when(principalService.resolvePrincipalName(principal)).thenReturn("idir\\jsmith");
    when(sessionService.resolveWelcomeRoute("idir\\jsmith", List.of())).thenReturn(dto);

    ResponseEntity<LexisSessionWelcomeDto> response = controller.showWelcome(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(sessionService, never()).parseRolesFromPrincipal(org.mockito.ArgumentMatchers.any());
    verify(sessionService).resolveWelcomeRoute("idir\\jsmith", List.of());
  }

  @Test
  void capabilitiesShouldUseWelcomeAndAuthorizationServices() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a", "LEXIS_READ_ONLY", "LEXIS_ADMIN");
    request.setUserPrincipal(authentication);

    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN"));

    LexisSessionWelcomeDto welcome =
        new LexisSessionWelcomeDto(
            true,
            "idir\\jsmith",
            List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN"),
            "readOnly",
            "/applicationSearch.do?actionMapping=view");

    when(sessionService.resolveWelcomeRoute("idir\\jsmith", List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN")))
        .thenReturn(welcome);
    when(authorizationService.resolveGrantedActions(List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN")))
        .thenReturn(List.of("/applicationSearch", "/applicationDetails"));
    when(principalService.resolveOrgUnitNo(authentication)).thenReturn("76");

    ResponseEntity<LexisSessionCapabilitiesDto> response = controller.capabilities(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            new LexisSessionCapabilitiesDto(
                true,
                "idir\\jsmith",
                List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN"),
                "readOnly",
                "/applicationSearch.do?actionMapping=view",
                List.of("/applicationSearch", "/applicationDetails"),
                "76"));

    verify(sessionService).parseRolesFromPrincipal(authentication);
    verify(sessionService).resolveWelcomeRoute("idir\\jsmith", List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN"));
    verify(authorizationService).resolveGrantedActions(List.of("LEXIS_READ_ONLY", "LEXIS_ADMIN"));
    verify(principalService).resolveOrgUnitNo(authentication);
  }

  @Test
  void canPerformActionShouldEvaluateAgainstResolvedRoles() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken("idir\\jsmith", "n/a", "LEXIS_PROVINCIAL_SUBMITTER");
    request.setUserPrincipal(authentication);

    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offersSearch"))
        .thenReturn(true);

    ResponseEntity<LexisSessionActionAccessDto> response =
        controller.canPerformAction("/offersSearch", request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            new LexisSessionActionAccessDto(
                true,
                "idir\\jsmith",
                List.of("LEXIS_PROVINCIAL_SUBMITTER"),
                "/offersSearch",
                true));

    verify(sessionService).parseRolesFromPrincipal(authentication);
    verify(authorizationService).canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offersSearch");
  }

  @Test
  void canPerformActionShouldUseEmptyRolesWhenNoAuthenticationAuthoritiesExist() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    Principal principal = () -> "idir\\jsmith";
    request.setUserPrincipal(principal);

    when(principalService.resolvePrincipalName(principal)).thenReturn("idir\\jsmith");
    when(authorizationService.canPerformAction(List.of(), "/applicationSearch")).thenReturn(false);

    ResponseEntity<LexisSessionActionAccessDto> response =
        controller.canPerformAction("/applicationSearch", request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            new LexisSessionActionAccessDto(
                true,
                "idir\\jsmith",
                List.of(),
                "/applicationSearch",
                false));

    verify(authorizationService).canPerformAction(List.of(), "/applicationSearch");
  }

  @Test
  void logoffShouldInvalidateSessionWhenPresent() throws ServletException {
    HttpServletRequest request = org.mockito.Mockito.mock(HttpServletRequest.class);
    HttpSession session = org.mockito.Mockito.mock(HttpSession.class);
    when(request.getSession(false)).thenReturn(session);
    when(request.getUserPrincipal()).thenReturn(null);

    ResponseEntity<LexisSessionLogoutDto> response = controller.logoff(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new LexisSessionLogoutDto(true));
    verify(session).invalidate();
    verify(request, never()).logout();
  }

  @Test
  void logoffShouldCallServletLogoutWhenPrincipalExists() throws ServletException {
    HttpServletRequest request = org.mockito.Mockito.mock(HttpServletRequest.class);
    Principal principal = org.mockito.Mockito.mock(Principal.class);
    when(request.getSession(false)).thenReturn(null);
    when(request.getUserPrincipal()).thenReturn(principal);

    ResponseEntity<LexisSessionLogoutDto> response = controller.logoff(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new LexisSessionLogoutDto(false));
    verify(request).logout();
  }

  @Test
  void accessDeniedShouldReturnForbidden() {
    ResponseEntity<LexisSessionMessageDto> response = controller.accessDenied();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(response.getBody())
        .isEqualTo(
            new LexisSessionMessageDto("ACCESS_DENIED", "User is not authorized for this action."));
  }

  @Test
  void errorPageShouldReturnInternalServerError() {
    ResponseEntity<LexisSessionMessageDto> response = controller.errorPage();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    assertThat(response.getBody())
        .isEqualTo(
            new LexisSessionMessageDto("GENERIC_ERROR", "An unexpected server error occurred."));
  }
}

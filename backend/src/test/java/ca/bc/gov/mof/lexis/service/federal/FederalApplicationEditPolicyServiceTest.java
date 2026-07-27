package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
class FederalApplicationEditPolicyServiceTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 7, 10);

  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;

  private final TestingAuthenticationToken authentication =
      new TestingAuthenticationToken("user", "password");
  private FederalApplicationEditPolicyService policyService;

  @BeforeEach
  void setUp() {
    policyService =
        new FederalApplicationEditPolicyService(
            sessionService,
            authorizationService,
            Clock.fixed(
                Instant.parse("2026-07-10T19:00:00Z"), LexisBusinessTime.ZONE));
  }

  @ParameterizedTest
  @ValueSource(strings = {"APP", "EXE"})
  void completedApplicationsRequireTheLegacyCompletedEditAction(String status) {
    allowManage("LEXIS_APPLICATION_APPROVER");

    assertThat(policyService.canEdit(authentication, status, TODAY.minusDays(30)))
        .isFalse();

    when(
            authorizationService.canPerformAction(
                List.of("LEXIS_APPLICATION_APPROVER"),
                "/editCompletedApplications"))
        .thenReturn(true);

    assertThat(policyService.canEdit(authentication, status, TODAY.minusDays(30)))
        .isTrue();
  }

  @ParameterizedTest
  @ValueSource(strings = {"EXP", "REJ", "WDN"})
  void terminalApplicationsUseTheLegacySevenDayMinistryWindow(String status) {
    allowManage("LEXIS_APPLICATION_APPROVER");

    assertThat(policyService.canEdit(authentication, status, TODAY.minusDays(6)))
        .isTrue();
    assertThat(policyService.canEdit(authentication, status, TODAY.minusDays(7)))
        .isFalse();
  }

  @Test
  void terminalApplicationWindowRequiresAnApproverOrAdministratorRole() {
    allowManage("LEXIS_READ_ONLY");

    assertThat(policyService.canEdit(authentication, "REJ", TODAY))
        .isFalse();
  }

  @Test
  void missingScheduleDatePreservesTheLegacyMinistryWindowDefault() {
    allowManage("LEXIS_ADMIN");

    assertThat(policyService.canEdit(authentication, "EXP", null))
        .isTrue();
  }

  @Test
  void activeApplicationsStillRequireFederalManagementAuthority() {
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_READ_ONLY"));

    assertThat(policyService.canEdit(authentication, "NEW", TODAY.plusDays(1)))
        .isFalse();
  }

  @Test
  void unknownStatusFailsClosed() {
    allowManage("LEXIS_APPLICATION_APPROVER");

    assertThat(policyService.canEdit(authentication, null, TODAY)).isFalse();
    assertThatThrownBy(
            () ->
                policyService.requireEdit(
                    authentication,
                    new FederalApplicationService.FederalApplicationEditContext(
                        null, TODAY)))
        .isInstanceOf(AccessDeniedException.class);
  }

  private void allowManage(String role) {
    List<String> roles = List.of(role);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(
            authorizationService.canPerformAction(
                roles, "manageFederalApplication"))
        .thenReturn(true);
  }
}

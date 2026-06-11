package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.LexisApiApplication;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    classes = LexisApiApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE)
class LexisAuthorizationMatrixParityTest {

  @Autowired
  private LexisAuthorizationService authorizationService;

  @Test
  void everyLegacyActionShouldHaveAtLeastOneConfiguredRole() {
    List<String> uncoveredActions =
        authorizationService.getKnownActions().stream()
            .filter(action -> authorizationService.resolveRolesForAction(action).isEmpty())
            .toList();

    assertThat(uncoveredActions).isEmpty();
  }

  @Test
  void configuredRolesShouldContainFinalFamRoleModel() {
    assertThat(authorizationService.getConfiguredRoles())
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_EXEMPTION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER",
            "LEXIS_FEDERAL_SUBMITTER");
  }

  @Test
  void applicationRemarksShouldMatchLegacyApplicationRemarkRoles() {
    assertThat(authorizationService.resolveRolesForAction("/applicationRemarks"))
        .contains(
            "LEXIS_ADMIN",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER")
        .doesNotContain(
            "LEXIS_READ_ONLY",
            "LEXIS_EXEMPTION_APPROVER",
            "LEXIS_FEDERAL_SUBMITTER",
            "LEXIS_DELEGATED_ADMIN");
  }
}

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
            "ADMIN",
            "READ_ONLY",
            "APPLICATION_APPROVER",
            "EXEMPTION_APPROVER",
            "PROVINCIAL_SUBMITTER",
            "FEDERAL_SUBMITTER");
  }
}

package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.LexisApiApplication;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(
    classes = LexisApiApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito-idp.ca-central-1.amazonaws.com/test",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito-idp.ca-central-1.amazonaws.com/test/.well-known/jwks.json"
    })
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

  @Test
  void readOnlyRoleShouldNotHaveMutatingActions() {
    assertThat(authorizationService.resolveGrantedActions(List.of("LEXIS_READ_ONLY")))
        .doesNotContain(
            "/applicationRemarks",
            "/applicationsReview",
            "/createExemption",
            "/fileApplicationUpload",
            "/fileExemptionUpload",
            "/fileInvoiceUpload",
            "/filePermitUpload",
            "/lexisAgentAdmin",
            "/lexisFILAdmin",
            "/lexisPolicyAdmin",
            "approveExemption",
            "createApplication",
            "createOffer",
            "createPermit",
            "saveExemption",
            "savePermit");
  }
}

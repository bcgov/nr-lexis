package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.admin.LexisAdminPageDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | OracleLexisAdminService")
class OracleLexisAdminServiceTest {

  @Test
  void shouldReturnFeePolicyAdminPageMetadata() {
    OracleLexisAdminService service = new OracleLexisAdminService();

    LexisAdminPageDto page = service.feePolicyAdminPage().orElseThrow();

    assertThat(page.page()).isEqualTo("policy");
    assertThat(page.legacyAction()).isEqualTo("/lexisPolicyAdmin.do?actionMapping=view");
    assertThat(page.metadata()).containsEntry("mode", "oracle");
  }

  @Test
  void shouldReturnFilPolicyAdminPageMetadata() {
    OracleLexisAdminService service = new OracleLexisAdminService();

    LexisAdminPageDto page = service.filPolicyAdminPage().orElseThrow();

    assertThat(page.page()).isEqualTo("filPolicy");
    assertThat(page.legacyAction()).isEqualTo("/lexisFILAdmin.do?actionMapping=view");
    assertThat(page.metadata()).containsEntry("section", "filPolicy");
  }
}

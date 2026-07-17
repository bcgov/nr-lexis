package ca.bc.gov.mof.lexis.service.mail;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;

class EmailTemplateRendererTest {

  private final EmailTemplateRenderer renderer = new EmailTemplateRenderer();

  @Test
  void shouldRenderNamedPlaceholdersWithoutInterpretingReplacementCharacters() {
    String body =
        renderer.render(
            "application_status",
            Map.of(
                "applicationNumber", "999000001",
                "statusDescription", "REJECTED",
                "remark", "Cost is $5 at C:\\temp"));

    assertThat(body)
        .isEqualTo(
            "Application #999000001 status was changed to REJECTED with the following reason:\n\n"
                + "Cost is $5 at C:\\temp\n");
  }

  @Test
  void shouldRenderPermitApprovalTemplate() {
    String body =
        renderer.render(
            "permit_approval",
            Map.of(
                "permitNumber", "7000123",
                "approvalDescription", "has been approved as Payment Pending.",
                "packageNumbers", "PKG-1, PKG-2"));

    assertThat(body)
        .isEqualTo(
            "Permit #7000123 has been approved as Payment Pending.\n\n"
                + "Package(s): PKG-1, PKG-2\n\n"
                + "This is an automated notification; do not reply.\n");
  }
}

package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class DocumentUploadMutationPolicyTest {

  @Mock private ObjectProvider<LexisApplicationService> applicationServiceProvider;
  @Mock private ObjectProvider<ExemptionService> exemptionServiceProvider;
  @Mock private ObjectProvider<PermitService> permitServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private ExemptionService exemptionService;
  @Mock private PermitService permitService;
  private DocumentUploadMutationPolicy policy;

  @BeforeEach
  void setup() {
    policy =
        new DocumentUploadMutationPolicy(
            applicationServiceProvider, exemptionServiceProvider, permitServiceProvider);
  }

  @Test
  void missingCanonicalServicesShouldFailClosed() {
    assertThatThrownBy(() -> policy.requireApplicationMutable(1000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Application status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requireExemptionMutable("EX-205"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Exemption status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requirePermitMutable(7000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Permit status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requireInvoicePermitActive(7000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Permit status is unavailable for mutation.");
  }

  @Test
  void missingCanonicalRecordsAndStatusesShouldFailClosed() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1000123L)).thenReturn(Optional.empty());
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption(null)));
    when(permitService.findByPermitNumber(7000123L)).thenReturn(Optional.of(permit(null)));

    assertThatThrownBy(() -> policy.requireApplicationMutable(1000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Application status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requireExemptionMutable("EX-205"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Exemption status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requirePermitMutable(7000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Permit status is unavailable for mutation.");
    assertThatThrownBy(() -> policy.requireInvoicePermitActive(7000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Permit status is unavailable for mutation.");
  }

  @Test
  void expiredCanonicalRecordsShouldBeReadOnly() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1000123L))
        .thenReturn(Optional.of(application(" exp ")));
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EXP")));
    when(permitService.findByPermitNumber(7000123L)).thenReturn(Optional.of(permit("exp")));

    assertThatThrownBy(() -> policy.requireApplicationMutable(1000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired applications are read-only.");
    assertThatThrownBy(() -> policy.requireExemptionMutable("EX-205"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired exemptions are read-only.");
    assertThatThrownBy(() -> policy.requirePermitMutable(7000123L))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Expired permits are read-only.");
  }

  @Test
  void nonExpiredCanonicalRecordsShouldRemainMutable() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(exemptionServiceProvider.getIfAvailable()).thenReturn(exemptionService);
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);
    when(applicationService.findByApplicationNumber(1000123L))
        .thenReturn(Optional.of(application("NEW")));
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("CAN")));
    when(permitService.findByPermitNumber(7000123L)).thenReturn(Optional.of(permit("ACT")));

    assertThatCode(() -> policy.requireApplicationMutable(1000123L)).doesNotThrowAnyException();
    assertThatCode(() -> policy.requireExemptionMutable(" EX-205 ")).doesNotThrowAnyException();
    assertThatCode(() -> policy.requirePermitMutable(7000123L)).doesNotThrowAnyException();
    assertThatCode(() -> policy.requireInvoicePermitActive(7000123L)).doesNotThrowAnyException();
  }

  @Test
  void invoiceUploadsShouldRejectEveryNonActivePermitStatus() {
    when(permitServiceProvider.getIfAvailable()).thenReturn(permitService);

    for (String status : List.of("COM", "PPD", "CAN", "EXP")) {
      when(permitService.findByPermitNumber(7000123L))
          .thenReturn(Optional.of(permit(status)));

      assertThatThrownBy(() -> policy.requireInvoicePermitActive(7000123L))
          .isInstanceOf(AccessDeniedException.class)
          .hasMessage("Invoices can only be added to active permits.");
    }
  }

  private LexisApplicationDetailDto application(String status) {
    return new LexisApplicationDetailDto(
        1000123L,
        null,
        status,
        status,
        "00012345",
        null,
        11L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0d,
        0d,
        false,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(),
        List.of(),
        List.of());
  }

  private ExemptionDetailDto exemption(String status) {
    return new ExemptionDetailDto(
        "EX-205",
        "A",
        null,
        status,
        status,
        "00012345",
        null,
        1000123L,
        null,
        null,
        null,
        0d,
        0d,
        0d,
        null,
        false,
        List.of(),
        List.of());
  }

  private PermitDetailDto permit(String status) {
    return new PermitDetailDto(
        7000123L,
        1000123L,
        "PKG-1",
        "EX-205",
        status,
        status,
        "00012345",
        "01",
        "00012345",
        "01",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0d,
        0L,
        null,
        null,
        null,
        null,
        null,
        null);
  }
}

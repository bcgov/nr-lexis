package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleExemptionDetailsRpcService")
class OracleExemptionDetailsRpcServiceTest {

  @Mock private ExemptionDetailsRpcRepository repository;

  @InjectMocks private OracleExemptionDetailsRpcService service;

  @Test
  void getApplicationsShouldBuildOwnerAndUnmanuFlags() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, 94.96d, "00077881", "P", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "P", "S")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications("EX-205", true, true);

    assertThat(response.applications()).hasSize(2);
    assertThat(response.applications().get(0).requestedVolume()).isEqualTo("95.0");
    assertThat(response.containsUnmanu()).isTrue();
    assertThat(response.ownerNumber()).isEqualTo("00077881");
  }

  @Test
  void getPermitsShouldUseOicVolumeForOicExemptions() {
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205")).thenReturn(Optional.of("O"));
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000123L,
                    95.0d,
                    12.4d,
                    "Active",
                    "ACT",
                    LocalDate.of(2026, 3, 10),
                    "00077881",
                    "00055667")));

    List<ExemptionDetailsRpcService.PermitItem> response =
        service.getPermits("EX-205", false, false, "00077881");

    assertThat(response).hasSize(1);
    assertThat(response.get(0).permitVolume()).isEqualTo("12.4");
    assertThat(response.get(0).permitIssueDate()).isEqualTo("03/10/2026");
    assertThat(response.get(0).canViewPermit()).isTrue();
  }

  @Test
  void getBlanketTotalsShouldSumRequestedAndCompletedVolume() {
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    1L, 20.0d, 0.0d, "Complete", "COM", null, "", ""),
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    2L, 35.0d, 0.0d, "Active", "ACT", null, "", "")));

    ExemptionDetailsRpcService.BlanketOicTotalsResponse response =
        service.getBlanketOicTotals("EX-205");

    assertThat(response.requestedVolume()).isEqualTo("55.0");
    assertThat(response.completedVolume()).isEqualTo("20.0");
  }

  @Test
  void getDocumentDetailsShouldMergeExemptionAndApplicationDocs() {
    when(repository.findExemptionDocumentDetailsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.DocumentRow(
                    10L, "exemption.pdf", "", "UPLOAD")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 0.0d, 0.0d, "00077881", "P", "S")));
    when(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.DocumentRow(20L, "application.pdf", "desc", "UPLOAD")));
    when(repository.findAttachmentTypeDescription("UPLOAD")).thenReturn(Optional.of("Uploaded document"));

    List<ExemptionDetailsRpcService.DocumentItem> response = service.getDocumentDetails("EX-205");

    assertThat(response).hasSize(2);
    assertThat(response.get(0).description()).isEqualTo("Not on file");
    assertThat(response.get(0).type()).isEqualTo("Uploaded document");
    verify(repository).findApplicationDocumentDetailsByApplicationNumber(1000456L);
  }
}

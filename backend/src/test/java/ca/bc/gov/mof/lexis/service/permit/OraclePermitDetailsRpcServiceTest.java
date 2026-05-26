package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OraclePermitDetailsRpcService")
class OraclePermitDetailsRpcServiceTest {

  @Mock private PermitRpcRepository repository;
  @Mock private LexisApplicationService applicationService;

  @InjectMocks private OraclePermitDetailsRpcService service;

  @Test
  void permitSummaryShouldAggregateScaffoldFeesAndSelectedPackageRows() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 10.25d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitSummaryRpcResponseDto response =
        service.getPermitSummary(7000123L, "US", "2026-03-15", "PKG-903", true);

    assertThat(response.volume()).isEqualTo("15.8");
    assertThat(response.pieces()).isEqualTo(20L);
    assertThat(response.totalFees()).isEqualTo("$15.75");
    assertThat(response.totalFeeForPackage()).isEqualTo("$10.25");
    assertThat(response.growthType()).isEqualTo("Standing");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).timbermark()).isEqualTo("TM1");
    assertThat(response.scaleList().get(0).permit()).isEqualTo("7000123");
  }

  @Test
  void totalFeesShouldMaskForCanadaAfterCutoverDate() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 12.40d, 5L, "7000123", "PKG-903")));

    PermitTotalFeesRpcResponseDto response =
        service.getTotalFeesForPermit(7000123L, "CA", "2024-06-27");

    assertThat(response.totalFees()).isEqualTo("$");
  }

  @Test
  void scaleFeesShouldUseDescriptionsAndScaffoldFeeFormatting() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 7.60d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitScaleFeesRpcResponseDto response =
        service.getScaleFeesForPackage("PKG-903", 7000123L, true);

    assertThat(response.totalFeeForPackage()).isEqualTo("$7.60");
    assertThat(response.growthType()).isEqualTo("Standing");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).species()).isEqualTo("Hemlock");
    assertThat(response.scaleList().get(0).grade()).isEqualTo("Grade J");
    assertThat(response.scaleList().get(0).fee()).isEqualTo("$7.60");
  }

  @Test
  void invalidInputsShouldReturnEmptyDefaults() {
    PermitSummaryRpcResponseDto summary = service.getPermitSummary(null, null, null, null, true);
    PermitTotalFeesRpcResponseDto total = service.getTotalFeesForPermit(null, null, null);
    PermitScaleFeesRpcResponseDto packageFees = service.getScaleFeesForPackage(null, null, true);

    assertThat(summary.totalFees()).isEqualTo("$0.00");
    assertThat(total.totalFees()).isEqualTo("$0.00");
    assertThat(packageFees.totalFeeForPackage()).isEqualTo("$0.00");
    assertThat(packageFees.scaleList()).isEmpty();
  }

  private PermitScaleDetailRow scale(
      String id,
      String timbermark,
      String species,
      String grade,
      double volume,
      long pieces,
      String permitNumber,
      String packageNumber) {
    return new PermitScaleDetailRow(
        id,
        timbermark,
        species,
        grade,
        volume,
        pieces,
        permitNumber,
        packageNumber,
        "C",
        "100.00",
        "12.0",
        "1.5");
  }
}

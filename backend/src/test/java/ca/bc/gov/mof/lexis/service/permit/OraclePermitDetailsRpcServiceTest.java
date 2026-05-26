package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.EndUsePairRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import java.math.BigDecimal;
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
@DisplayName("Unit Test | OraclePermitDetailsRpcService")
class OraclePermitDetailsRpcServiceTest {

  @Mock private PermitRpcRepository repository;
  @Mock private LexisApplicationService applicationService;
  @Mock private ExemptionService exemptionService;

  @InjectMocks private OraclePermitDetailsRpcService service;

  @Test
  void permitSummaryShouldAggregateVolumeAndSelectedPackageRows() {
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
  void permitSummaryShouldApplyFixedExemptionRateWhenPolicyContextRequiresIt() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), "EX-700", "US", 0.0d)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findFixedExemptionRate("EX-700")).thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenReturn(BigDecimal.ZERO);
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 10.25d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitSummaryRpcResponseDto response =
        service.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", true);

    assertThat(response.totalFees()).isEqualTo("$39.38");
    assertThat(response.totalFeeForPackage()).isEqualTo("$25.63");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).fee()).isEqualTo("$25.63");
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
  void scaleFeesShouldUseDescriptionsAndFeeFormatting() {
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

  @Test
  void permitDataAfterScaleUpdateShouldAggregateVolumePiecesFeesAndExemptionVolume() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), "EX-700", "US", 0.0d)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findFixedExemptionRate("EX-700")).thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenReturn(BigDecimal.ZERO);
    when(exemptionService.findByExemptionNumber("EX-700")).thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitDataAfterScaleUpdateRpcResponseDto response =
        service.getPermitDataAfterScaleUpdate(7000123L);

    assertThat(response.packageVolume()).isEqualTo("15.8");
    assertThat(response.pieces()).isEqualTo(20L);
    assertThat(response.totalFees()).isEqualTo("$39.38");
    assertThat(response.exemptionVolume()).isEqualTo(55.5d);
  }

  @Test
  void packageVolumeSumShouldOnlyIncludeSelectedPackageOnPermit() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));

    PermitPackageVolumeSumRpcResponseDto response =
        service.getPackageVolumeSum(7000123L, "PKG-903");

    assertThat(response.volume()).isEqualTo("10.3");
  }

  @Test
  void packageVolumeSumShouldReturnZeroForInvalidInput() {
    PermitPackageVolumeSumRpcResponseDto response = service.getPackageVolumeSum(null, null);
    assertThat(response.volume()).isEqualTo("0.0");
  }

  @Test
  void packageListShouldReturnNoPackagesWhenPermitHasNone() {
    when(repository.findPackageNumbersByPermitNumber(7000123L)).thenReturn(List.of());

    PermitPackageListRpcResponseDto response = service.getPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("No Packages");
  }

  @Test
  void packageListShouldReturnRepositoryPackageNumbers() {
    when(repository.findPackageNumbersByPermitNumber(7000123L))
        .thenReturn(List.of("PKG-200", "PKG-100"));

    PermitPackageListRpcResponseDto response = service.getPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("PKG-200", "PKG-100");
  }

  @Test
  void permitHasApplicationsShouldReflectPackageAssignments() {
    when(repository.findPackageNumbersByPermitNumber(7000123L)).thenReturn(List.of("PKG-100"));

    PermitHasApplicationsRpcResponseDto response = service.getPermitHasApplications(7000123L);

    assertThat(response.hasApplications()).isTrue();
  }

  @Test
  void permitHasApplicationsShouldBeFalseWhenNoPackagesFound() {
    when(repository.findPackageNumbersByPermitNumber(7000123L)).thenReturn(List.of());

    PermitHasApplicationsRpcResponseDto response = service.getPermitHasApplications(7000123L);

    assertThat(response.hasApplications()).isFalse();
  }

  @Test
  void packageInfoShouldReturnBlankFieldsWhenPackageNotFound() {
    when(repository.findPackageInfoByPackageNumber("PKG-903")).thenReturn(Optional.empty());

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.region()).isEmpty();
    assertThat(response.enduse()).isEmpty();
    assertThat(response.ageclass()).isEmpty();
    assertThat(response.volume()).isEmpty();
  }

  @Test
  void packageInfoShouldMapApplicationAndCodeDescriptions() {
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(new PackageInfoRow("PKG-903", 1000456L, 10.25d, 6.0d, 24.0d, "S", "T")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "Coast Region", "T", "S", "HE/UT")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("T")).thenReturn(Optional.of("Unmanufactured Timber"));

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.region()).isEqualTo("Coast Region");
    assertThat(response.enduse()).isEqualTo("HE/UT");
    assertThat(response.ageclass()).isEqualTo("Standing");
    assertThat(response.volume()).isEqualTo("10.3");
    assertThat(response.length()).isEqualTo("6.0");
    assertThat(response.diameter()).isEqualTo("24.0");
    assertThat(response.productType()).isEqualTo("Unmanufactured Timber");
  }

  @Test
  void packageInfoShouldUsePackageEndUseForBlanketOic() {
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(new PackageInfoRow("PKG-903", 1000456L, 10.25d, 6.0d, 24.0d, "S", "T")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-701", 1835L, "Coast Region", "T", "O", "APP-ENDUSE")));
    when(repository.findExemptionTypeCode("EX-701")).thenReturn(Optional.of("B"));
    when(repository.findEndUsesByPackageNumber("PKG-903"))
        .thenReturn(List.of(new EndUsePairRow("HE", "UT")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("T")).thenReturn(Optional.of("Unmanufactured Timber"));

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.enduse()).isEqualTo("HE/UT\n");
    assertThat(response.ageclass()).isEqualTo("Standing");
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
        1000456L,
        permitNumber,
        packageNumber,
        "C",
        "100.00",
        "12.0",
        "1.5");
  }

  private ExemptionDetailDto exemptionDetail(String exemptionNumber, double remainingVolume) {
    return new ExemptionDetailDto(
        exemptionNumber,
        "M",
        "Ministerial",
        "ACT",
        "Active",
        "00077881",
        "00055667",
        1000456L,
        "APP",
        LocalDate.of(2026, 1, 1),
        LocalDate.of(2026, 12, 31),
        100.0d,
        44.5d,
        remainingVolume,
        "",
        false,
        List.of(),
        List.of());
  }
}

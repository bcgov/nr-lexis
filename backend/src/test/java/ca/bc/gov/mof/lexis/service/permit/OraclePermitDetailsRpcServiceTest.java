package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.AttachmentTypeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.CountryCodeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.DocumentRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.EndUsePairRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageDetailsRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageCandidateRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.SalesInvoiceRow;
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
  void scaleFeesShouldResolveRepeatedSpeciesAndGradeDescriptionsOncePerRequest() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "HEM", "J", 3.40d, 5L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 11.0d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitScaleFeesRpcResponseDto response =
        service.getScaleFeesForPackage("PKG-903", 7000123L, true);

    assertThat(response.totalFeeForPackage()).isEqualTo("$11.00");
    assertThat(response.scaleList()).hasSize(2);
    verify(repository, times(1)).findSpeciesDescription("HEM");
    verify(repository, times(1)).findGradeDescription("J");
  }

  @Test
  void scalesForPackageShouldMapScaleDetailsDescriptionsAndRegion() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "RCO", "T", "S", "HE/UT")));

    PermitScalesForPackageRpcResponseDto response = service.getScalesForPackage("PKG-903");

    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).timbermark()).isEqualTo("TM1");
    assertThat(response.scaleList().get(0).pieces()).isEqualTo(11L);
    assertThat(response.scaleList().get(0).species()).isEqualTo("Hemlock");
    assertThat(response.scaleList().get(0).grade()).isEqualTo("Grade J");
    assertThat(response.scaleList().get(0).volume()).isEqualTo("7.6");
    assertThat(response.scaleList().get(0).permit()).isEqualTo("7000123");
    assertThat(response.scaleList().get(0).cascadeSplitCode()).isEqualTo("C");
    assertThat(response.scaleList().get(0).region()).isEqualTo("RCO");
  }

  @Test
  void scalesForPackageShouldResolveRepeatedSpeciesAndGradeDescriptionsOncePerRequest() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "HEM", "J", 3.40d, 5L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "RCO", "T", "S", "HE/UT")));

    PermitScalesForPackageRpcResponseDto response = service.getScalesForPackage("PKG-903");

    assertThat(response.scaleList()).hasSize(2);
    verify(repository, times(1)).findSpeciesDescription("HEM");
    verify(repository, times(1)).findGradeDescription("J");
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
  void oicPackageListShouldReturnNoPackagesWhenOicPermitHasNone() {
    when(repository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of());

    PermitPackageListRpcResponseDto response = service.getOicPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("No Packages");
  }

  @Test
  void oicPackageListShouldReturnRepositoryPackageNumbers() {
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-OIC-2", "PKG-OIC-1"));

    PermitPackageListRpcResponseDto response = service.getOicPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("PKG-OIC-2", "PKG-OIC-1");
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
  void checkPermitNumberShouldReturnAvailableWhenPermitMissing() {
    when(repository.findPermitPolicyContextByPermitNumber(7000123L)).thenReturn(Optional.empty());

    PermitNumberAvailabilityRpcResponseDto response = service.checkPermitNumber(7000123L);

    assertThat(response.available()).isTrue();
  }

  @Test
  void applicationListShouldReturnDistinctSortedApplicationsForPermit() {
    when(repository.findApplicationNumbersByPermitNumber(7000123L))
        .thenReturn(List.of(1000456L, 1000457L));

    PermitApplicationListRpcResponseDto response = service.getApplicationList(7000123L);

    assertThat(response.applicationList()).containsExactly("1000456", "1000457");
  }

  @Test
  void availableApplicationListShouldExcludeSelectedAndAssignedApplications() {
    when(repository.findPackagesByExemptionNumber("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901", 0L),
                new PackageCandidateRow(1000457L, "PKG-902", 7000123L),
                new PackageCandidateRow(1000458L, "PKG-903", 0L)));

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList("EX-700", "1000458");

    assertThat(response.applicationList()).containsExactly("1000456");
    assertThat(response.errorMessage()).isNull();
  }

  @Test
  void availablePackageListShouldExcludeSelectedAndAssignedPackages() {
    when(repository.findPackagesByExemptionNumber("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901", 0L),
                new PackageCandidateRow(1000456L, "PKG-902", 7000123L),
                new PackageCandidateRow(1000457L, "PKG-903", 0L)));

    PermitAvailablePackageListRpcResponseDto response =
        service.getAvailablePackageList("EX-700", "PKG-903");

    assertThat(response.packageList()).containsExactly("PKG-901");
    assertThat(response.errorMessage()).isNull();
    verify(repository, times(1)).findPackagesByExemptionNumber("EX-700");
    verify(repository, never()).findApplicationNumbersByExemptionNumber("EX-700");
    verify(repository, never()).findPackagesByApplicationNumber(anyLong());
  }

  @Test
  void approvedExemptionVolumeShouldReturnValueFromExemptionService() {
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitApprovedExemptionVolumeRpcResponseDto response =
        service.getApprovedExemptionVolume("EX-700");

    assertThat(response.approvedExemptionVolume()).isEqualTo(100.0d);
  }

  @Test
  void exemptionVolumeRemainingShouldReturnValueFromExemptionService() {
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitExemptionVolumeRemainingRpcResponseDto response =
        service.getExemptionVolumeRemaining("EX-700");

    assertThat(response.exemptionVolumeRemaining()).isEqualTo(55.5d);
  }

  @Test
  void countryListShouldReturnSortedCountryItems() {
    when(repository.findAllCountryCodes())
        .thenReturn(
            List.of(
                new CountryCodeRow("US", "United States", 2L, 2L),
                new CountryCodeRow("CA", "Canada", 1L, 1L),
                new CountryCodeRow("GB", "United Kingdom", 0L, 1L)));

    PermitCountryListRpcResponseDto response = service.getCountryList();

    assertThat(response.countryList()).hasSize(3);
    assertThat(response.countryList().get(0).code()).isEqualTo("CA");
    assertThat(response.countryList().get(1).code()).isEqualTo("US");
    assertThat(response.countryList().get(2).code()).isEqualTo("GB");
  }

  @Test
  void invoicesForPermitShouldReturnInvoiceList() {
    when(repository.findInvoiceNumbersByPermit(7000123L)).thenReturn(List.of("INV-100", "INV-101"));

    PermitInvoiceListRpcResponseDto response = service.getInvoicesForPermit(7000123L);

    assertThat(response.invoiceList()).containsExactly("INV-100", "INV-101");
  }

  @Test
  void invoiceDetailsShouldReturnComputedCadAmounts() {
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 20.0d)));

    PermitInvoiceDetailsRpcResponseDto response =
        service.getInvoiceDetails(7000123L, "INV-100");

    assertThat(response.invoicefound()).isTrue();
    assertThat(response.rate()).isEqualTo("1.25");
    assertThat(response.fee()).isEqualTo("$25.00");
    assertThat(response.value()).isEqualTo("$125.00");
  }

  @Test
  void gbmsInvoiceHistoryShouldReturnLegacyFormattedRows() {
    when(repository.findGbmsInvoiceHistory("RCPT-1", 7000123L, true))
        .thenReturn(
            List.of(
                new GbmsInvoiceHistoryRow(
                    "GBMS-1",
                    null,
                    "GBMS-2",
                    125.0d,
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 3, 2))));

    List<PermitGbmsInvoiceHistoryItemRpcResponseDto> response =
        service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true);

    assertThat(response).hasSize(1);
    assertThat(response.get(0).gbmsInvoiceNumber()).isEqualTo("GBMS-1");
    assertThat(response.get(0).cancelledByInvoice()).isEmpty();
    assertThat(response.get(0).replacedByInvoice()).isEqualTo("GBMS-2");
    assertThat(response.get(0).invoiceAmount()).isEqualTo("125.00");
    assertThat(response.get(0).printedDate()).isEqualTo("03/01/2026");
    assertThat(response.get(0).entryDate()).isEqualTo("03/01/2026");
    assertThat(response.get(0).updateDate()).isEqualTo("03/02/2026");
  }

  @Test
  void addPermitShouldPersistWhenInputIsValid() {
    PermitMutationRequestDto request =
        new PermitMutationRequestDto(
            "7000123",
            "ACT",
            "2026-05-27",
            "2026-05-27",
            "2026-06-27",
            null,
            "EX-700",
            "Acme Lumber",
            "US",
            "TRUCK",
            "Hauler 1",
            "2026-06-01",
            "VA",
            null,
            null,
            null,
            "S",
            "100.0",
            "25",
            "1835",
            "00070001",
            "01",
            "00070002",
            "02",
            null,
            null,
            null,
            null,
            "S",
            "T",
            null,
            null,
            null);
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));
    when(repository.findApplicationNumbersByExemptionNumber("EX-700")).thenReturn(List.of());
    when(repository.insertPermitDetail(org.mockito.ArgumentMatchers.any(PermitMutationRow.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            Optional.of(
                new PermitMutationRow(
                    7000123L,
                    "Acme Lumber",
                    "Hauler 1",
                    LocalDate.of(2026, 6, 1),
                    null,
                    LocalDate.of(2026, 5, 27),
                    LocalDate.of(2026, 5, 27),
                    LocalDate.of(2026, 5, 27),
                    null,
                    LocalDate.of(2026, 6, 27),
                    100.0d,
                    25L,
                    0L,
                    null,
                    null,
                    "idir\\jsmith",
                    null,
                    "TRUCK",
                    "W",
                    "00070001",
                    "01",
                    "00070002",
                    "02",
                    "EX-700",
                    1835L,
                    "VA",
                    "ACT",
                    "S",
                    "US",
                    null,
                    null,
                    null,
                    null,
                    null,
                    "T")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.permitNumber()).isEqualTo(7000123L);
    assertThat(response.permitStatus()).isEqualTo("ACT");
  }

  @Test
  void updateShippingShouldRejectInvalidDate() {
    PermitMutationRequestDto request = updateShippingRequest("bad-date");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitMutationRow(
                    7000123L,
                    null,
                    null,
                    null,
                    null,
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 2),
                    null,
                    LocalDate.of(2026, 6, 1),
                    10.0d,
                    10L,
                    0L,
                    null,
                    null,
                    "idir\\jsmith",
                    null,
                    "TRUCK",
                    "W",
                    "00070001",
                    "01",
                    null,
                    null,
                    "EX-700",
                    1835L,
                    null,
                    "ACT",
                    "S",
                    "US",
                    null,
                    null,
                    null,
                    null,
                    null,
                    "T")));

    PermitMutationRpcResponseDto response = service.updateShipping(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Invalid Date Format");
  }

  @Test
  void addInvoiceShouldPersistWhenInputIsValid() {
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L)).thenReturn(Optional.empty());
    when(repository.insertSalesInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 12.0d)));

    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The sales invoice was saved successfully.");
    assertThat(response.errors()).isEmpty();
  }

  @Test
  void addInvoiceShouldReturnValidationErrors() {
    PermitPersistenceRpcResponseDto response =
        service.addInvoice(null, "", null, null, null, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).isNotEmpty();
  }

  @Test
  void addInvoiceShouldRejectOversizedSalesInvoiceNumberBeforeOracleInsert() {
    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-123456",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The sales invoice number must be 9 characters or fewer.");
  }

  @Test
  void addInvoiceShouldRejectDuplicateInvoice() {
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 12.0d)));

    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Sales invoice INV-100 already exists.");
  }

  @Test
  void conversionRateShouldReturnSuccessWhenRateExists() {
    when(repository.findCurrencyConversionRateByDate(LocalDate.now(), "USD"))
        .thenReturn(Optional.of(1.333d));

    PermitConversionRateRpcResponseDto response = service.getConversionRate();

    assertThat(response.success()).isTrue();
    assertThat(response.conversionRate()).isEqualTo("1.33");
  }

  @Test
  void fileTypesShouldReturnSortedFileTypeItems() {
    when(repository.findAllAttachmentTypes())
        .thenReturn(
            List.of(
                new AttachmentTypeRow("INS", "Application Document", 2L, 1L),
                new AttachmentTypeRow("INV", "Invoice", 1L, 1L)));

    List<PermitFileTypeRpcResponseDto> response = service.getFileTypes();

    assertThat(response).hasSize(2);
    assertThat(response.get(0).code()).isEqualTo("INV");
    assertThat(response.get(1).code()).isEqualTo("INS");
  }

  @Test
  void documentDetailsShouldIncludePermitAndApplicationDocuments() {
    when(repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(new DocumentRow(50L, "permit.pdf", "", "INV")));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 2.35d, 4L, "7000123", "PKG-903")));
    when(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(new DocumentRow(75L, "application.pdf", "", "INS")));
    when(repository.findAttachmentTypeDescription("INV")).thenReturn(Optional.of("Invoice"));
    when(repository.findAttachmentTypeDescription("INS")).thenReturn(Optional.of("Insurance"));

    List<PermitDocumentItemRpcResponseDto> response = service.getDocumentDetails(7000123L);

    assertThat(response).hasSize(2);
    assertThat(response.get(0).name()).isEqualTo("permit.pdf");
    assertThat(response.get(0).type()).isEqualTo("Invoice");
    assertThat(response.get(1).name()).isEqualTo("application.pdf");
    assertThat(response.get(1).type()).isEqualTo("Insurance");
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

  @Test
  void packageDetailsShouldReturnEmptyDefaultsWhenPackageNotFound() {
    when(repository.findPackageDetailsByPackageNumber("PKG-903")).thenReturn(Optional.empty());

    PermitPackageDetailsRpcResponseDto response = service.getPackageDetails("PKG-903");

    assertThat(response.success()).isFalse();
    assertThat(response.packageNumber()).isEmpty();
    assertThat(response.scaledVolume()).isEqualTo(0.0d);
  }

  @Test
  void packageDetailsShouldMapPackageFieldsAndScaledVolume() {
    when(repository.findPackageDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 10.25d, 6.0d, 24.0d, "ACT", "Reviewed", "N", "S")));
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 2.35d, 4L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 1.24d, 2L, "7000123", "PKG-903")));
    when(repository.findPackageStatusDescription("ACT")).thenReturn(Optional.of("Active"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitPackageDetailsRpcResponseDto response = service.getPackageDetails("PKG-903");

    assertThat(response.success()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.volume()).isEqualTo("10.3");
    assertThat(response.scaledVolume()).isEqualTo(3.6d);
    assertThat(response.length()).isEqualTo("6.0");
    assertThat(response.diameter()).isEqualTo("24.0");
    assertThat(response.status()).isEqualTo("ACT");
    assertThat(response.comments()).isEqualTo("Reviewed");
    assertThat(response.statusDesc()).isEqualTo("Active");
    assertThat(response.reprocessed()).isEqualTo("N");
    assertThat(response.ageClass()).isEqualTo("Standing");
  }

  @Test
  void hasFormChangesShouldReturnFalseWhenTrackedFieldsMatch() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));

    PermitMutationRequestDto request = formCheckRequest(" ACT ", "42", " Legacy notes ");

    boolean changed = service.hasFormChanges(request);

    assertThat(changed).isFalse();
  }

  @Test
  void hasFormChangesShouldReturnTrueWhenTrackedFieldDiffers() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));

    PermitMutationRequestDto request = formCheckRequest("ACT", "43", "Legacy notes");

    boolean changed = service.hasFormChanges(request);

    assertThat(changed).isTrue();
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

  private PermitMutationRow permitMutationRow() {
    return new PermitMutationRow(
        7000123L,
        "Destination Co",
        "MV North",
        LocalDate.of(2026, 4, 1),
        null,
        LocalDate.of(2026, 3, 15),
        LocalDate.of(2026, 3, 15),
        LocalDate.of(2026, 3, 16),
        "RCPT-100",
        LocalDate.of(2026, 12, 31),
        100.0d,
        42L,
        0L,
        null,
        "Legacy notes",
        "idir\\jsmith",
        null,
        "SEA",
        "W",
        "00077881",
        "01",
        "00077880",
        "01",
        "EX-700",
        1835L,
        "VAN",
        "ACT",
        "S",
        "US",
        null,
        null,
        null,
        null,
        null,
        "T");
  }

  private PermitMutationRequestDto formCheckRequest(
      String permitStatus, String permitNumberOfPieces, String permitRemarks) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
        "03/15/2026",
        "03/16/2026",
        "12/31/2026",
        null,
        null,
        "Destination Co",
        "US",
        "SEA",
        "MV North",
        "04/01/2026",
        "VAN",
        null,
        "RCPT-100",
        permitRemarks,
        null,
        null,
        permitNumberOfPieces,
        "1835",
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
        null,
        null,
        null);
  }

  private PermitMutationRequestDto updateShippingRequest(String estimatedShippingDate) {
    return new PermitMutationRequestDto(
        "7000123",
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
        estimatedShippingDate,
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
        null);
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

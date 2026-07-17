package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OracleBlanketOicPackageServiceTest {

  @Mock private PermitRpcRepository permitRepository;
  @Mock private ApplicationDetailsRpcService applicationService;

  @Test
  void hiddenApplicationLookupReturnsOnlyPositiveAssignedApplicationNumber() {
    OracleBlanketOicPackageService service = service();
    when(permitRepository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit(1000456L, 250.0d)));

    assertThat(service.findHiddenApplicationNumber(7000123L)).contains(1000456L);
  }

  @Test
  void addPackageCreatesAndAssignsHiddenApplicationBeforeSavingPackage() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(null, 250.0d);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(applicationService.addHiddenBlanketOicApplication(any(), eq("idir\\jsmith")))
        .thenReturn(new ApplicationDetailsRpcService.CreateApplicationResult(
            true, "saved", 1000456L, List.of(), List.of()));
    when(permitRepository.updatePermitDetail(any(), eq("idir\\jsmith"), eq(null))).thenReturn(true);
    when(permitRepository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of());
    when(applicationService.addHiddenBlanketOicPackage(any(), eq("idir\\jsmith")))
        .thenReturn(new ApplicationDetailsRpcService.PackagePersistenceResult(
            true, "PKG-1", "100.0", "10.0", "20.0", "ACT", List.of(), List.of()));

    BlanketOicPackageService.MutationResult result =
        service.addPackage(request("PKG-1", null, 100.0d), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    assertThat(result.applicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(applicationService)
        .addHiddenBlanketOicApplication(applicationCaptor.capture(), eq("idir\\jsmith"));
    assertThat(applicationCaptor.getValue().oicIndicator()).isEqualTo("Y");
    assertThat(applicationCaptor.getValue().applicationStatusCode()).isEqualTo("EXE");
    assertThat(applicationCaptor.getValue().validationEnabled()).isTrue();

    ArgumentCaptor<PermitMutationRow> permitCaptor = ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(permitRepository).updatePermitDetail(permitCaptor.capture(), eq("idir\\jsmith"), eq(null));
    assertThat(permitCaptor.getValue().oicApplicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> packageCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(applicationService)
        .addHiddenBlanketOicPackage(packageCaptor.capture(), eq("idir\\jsmith"));
    assertThat(packageCaptor.getValue().applicationNumber()).isEqualTo(1000456L);
    assertThat(packageCaptor.getValue().speciesCodes()).containsExactly("FI", "HE");
    assertThat(packageCaptor.getValue().endUseCode()).isEqualTo("LU");
  }

  @Test
  void addPackageRejectsTotalAbovePermitRequestVolume() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, 125.0d);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(permitRepository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of("PKG-OLD"));
    when(applicationService.getPackageDetails("PKG-OLD"))
        .thenReturn(packageDetails("PKG-OLD", "50.0"));

    BlanketOicPackageService.MutationResult result =
        service.addPackage(request("PKG-NEW", null, 100.0d), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "The total package volume must not exceed the permit request volume (125.0).");
    verify(applicationService, never()).addHiddenBlanketOicPackage(any(), any());
  }

  @Test
  void updatePackageBindsRenameToPermitsHiddenApplication() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, 250.0d);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(applicationService.findApplicationNumberForPackage("PKG-OLD"))
        .thenReturn(Optional.of(1000456L));
    when(permitRepository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-OLD"));
    when(applicationService.updateHiddenBlanketOicPackage(any(), eq("idir\\jsmith")))
        .thenReturn(new ApplicationDetailsRpcService.PackagePersistenceResult(
            true, "PKG-NEW", "100.0", "10.0", "20.0", "ACT", List.of(), List.of()));

    BlanketOicPackageService.MutationResult result =
        service.updatePackage(request("PKG-OLD", "PKG-NEW", 100.0d), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> captor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(applicationService)
        .updateHiddenBlanketOicPackage(captor.capture(), eq("idir\\jsmith"));
    assertThat(captor.getValue().packageNumber()).isEqualTo("PKG-OLD");
    assertThat(captor.getValue().newPackageNumber()).isEqualTo("PKG-NEW");
    assertThat(captor.getValue().applicationNumber()).isEqualTo(1000456L);
  }

  @Test
  void deletePackageRejectsAnyDependentScaleRows() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, 250.0d);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(applicationService.findApplicationNumberForPackage("PKG-1"))
        .thenReturn(Optional.of(1000456L));
    when(applicationService.getScalesForPackage("PKG-1"))
        .thenReturn(List.of(new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
            false, "TM-1", "Fir", 0L, "A", "0.0", "S-1", "")));

    BlanketOicPackageService.MutationResult result =
        service.deletePackage(7000123L, "PKG-1", "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "A Blanket OIC package cannot be deleted while it has scale details.");
    verify(applicationService, never())
        .deleteHiddenBlanketOicPackageById(any(), any(), any());
  }

  @Test
  void deletePackageUsesTheExpectedHiddenApplication() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, 250.0d);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(applicationService.findApplicationNumberForPackage("PKG-1"))
        .thenReturn(Optional.of(1000456L));
    when(applicationService.getScalesForPackage("PKG-1")).thenReturn(List.of());
    when(
            applicationService.deleteHiddenBlanketOicPackageById(
                "PKG-1", 1000456L, "idir\\jsmith"))
        .thenReturn(true);

    BlanketOicPackageService.MutationResult result =
        service.deletePackage(7000123L, "PKG-1", "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(applicationService)
        .deleteHiddenBlanketOicPackageById("PKG-1", 1000456L, "idir\\jsmith");
  }

  @Test
  void addPackageFailsClosedWhenPermitRequestVolumeIsUnavailable() {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, null);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));
    when(permitRepository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));

    BlanketOicPackageService.MutationResult result =
        service.addPackage(request("PKG-1", null, 100.0d), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "The permit request volume is unavailable; package volume cannot be verified.");
    verify(applicationService, never()).addHiddenBlanketOicPackage(any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD", "EXP", "CAN"})
  void packageMutationsRejectLockedPermitStatuses(String permitStatus) {
    OracleBlanketOicPackageService service = service();
    PermitMutationRow permit = permit(1000456L, 250.0d, permitStatus);
    when(permitRepository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.of(permit));

    BlanketOicPackageService.MutationResult result =
        service.updatePackage(request("PKG-1", null, 100.0d), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(permitRepository, never()).findExemptionTypeCode(any());
    verify(applicationService, never()).updateHiddenBlanketOicPackage(any(), any());
  }

  private OracleBlanketOicPackageService service() {
    return new OracleBlanketOicPackageService(permitRepository, applicationService);
  }

  private BlanketOicPackageService.PackageMutationRequest request(
      String packageNumber, String newPackageNumber, Double volume) {
    return new BlanketOicPackageService.PackageMutationRequest(
        7000123L, packageNumber, newPackageNumber, volume, 10.0d, 20.0d, "ACT",
        "Package", "N", "O", "H", "LU", List.of("FI", "HE"));
  }

  private PermitMutationRow permit(Long applicationNumber, Double requestVolume) {
    return permit(applicationNumber, requestVolume, "ACT");
  }

  private PermitMutationRow permit(
      Long applicationNumber, Double requestVolume, String permitStatus) {
    return new PermitMutationRow(
        7000123L, "Destination Co", "MV North", LocalDate.of(2026, 4, 1), null,
        LocalDate.of(2026, 3, 15), LocalDate.of(2026, 3, 15),
        LocalDate.of(2026, 3, 16), "RCPT-100", LocalDate.of(2026, 12, 31),
        100.0d, 42L, 0L, null, "Legacy notes", "idir\\jsmith", null, "SEA", "W",
        "00077881", "01", "00077880", "01", "EX-700", 1835L, "VAN", permitStatus,
        "S", "US", null, null, applicationNumber, null, requestVolume, "T");
  }

  private ApplicationDetailsRpcService.PackageDetailsItem packageDetails(
      String packageNumber, String volume) {
    return new ApplicationDetailsRpcService.PackageDetailsItem(
        true, packageNumber, volume, 0.0d, "10.0", "20.0", "ACT", "", "Active",
        "N", "O", "Old growth", "H", "Harvested");
  }
}

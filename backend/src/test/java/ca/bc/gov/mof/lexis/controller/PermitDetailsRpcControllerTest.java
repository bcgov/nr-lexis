package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | PermitDetailsRpcController")
class PermitDetailsRpcControllerTest {

  @Mock private ObjectProvider<PermitDetailsRpcService> serviceProvider;
  @Mock private PermitDetailsRpcService service;

  private PermitDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller =
        new PermitDetailsRpcController(
            serviceProvider, "LEXIS_INDUSTRY,LOG_EXPORT_INDUSTRY");
  }

  @Test
  void permitSummaryShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitSummaryRpcResponseDto> response =
        controller.getPermitSummary(7000123L, null, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void permitSummaryShouldForwardRequestAndResolveIndustryUserFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitSummaryRpcResponseDto dto =
        new PermitSummaryRpcResponseDto("10.0", 12L, "$10.00", List.of(), "$10.00", "");
    when(service.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", false)).thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("LEXIS_INDUSTRY_00077881")));

    ResponseEntity<PermitSummaryRpcResponseDto> response =
        controller.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", false);
  }

  @Test
  void totalFeesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitTotalFeesRpcResponseDto dto = new PermitTotalFeesRpcResponseDto("$12.00");
    when(service.getTotalFeesForPermit(7000123L, "US", "2026-01-15")).thenReturn(dto);

    ResponseEntity<PermitTotalFeesRpcResponseDto> response =
        controller.getTotalFeesForPermit(7000123L, "US", "2026-01-15");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getTotalFeesForPermit(7000123L, "US", "2026-01-15");
  }

  @Test
  void scaleFeesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitScaleFeesRpcResponseDto dto = new PermitScaleFeesRpcResponseDto("$7.60", List.of(), "Standing");
    when(service.getScaleFeesForPackage("PKG-903", 7000123L, true)).thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("READ_ONLY")));

    ResponseEntity<PermitScaleFeesRpcResponseDto> response =
        controller.getScaleFeesForPackage("PKG-903", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getScaleFeesForPackage("PKG-903", 7000123L, true);
  }

  @Test
  void permitDataAfterScaleUpdateShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitDataAfterScaleUpdateRpcResponseDto dto =
        new PermitDataAfterScaleUpdateRpcResponseDto("12.4", 7L, "$11.11", 80.0d);
    when(service.getPermitDataAfterScaleUpdate(7000123L)).thenReturn(dto);

    ResponseEntity<PermitDataAfterScaleUpdateRpcResponseDto> response =
        controller.getPermitDataAfterScaleUpdate(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitDataAfterScaleUpdate(7000123L);
  }

  @Test
  void packageVolumeSumShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageVolumeSumRpcResponseDto dto = new PermitPackageVolumeSumRpcResponseDto("12.4");
    when(service.getPackageVolumeSum(7000123L, "PKG-903")).thenReturn(dto);

    ResponseEntity<PermitPackageVolumeSumRpcResponseDto> response =
        controller.getPackageVolumeSum(7000123L, "PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageVolumeSum(7000123L, "PKG-903");
  }

  @Test
  void packageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageListRpcResponseDto dto =
        new PermitPackageListRpcResponseDto(List.of("PKG-100", "PKG-101"));
    when(service.getPackageList(7000123L)).thenReturn(dto);

    ResponseEntity<PermitPackageListRpcResponseDto> response =
        controller.getPackageList(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageList(7000123L);
  }

  @Test
  void permitHasApplicationsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitHasApplicationsRpcResponseDto dto = new PermitHasApplicationsRpcResponseDto(true);
    when(service.getPermitHasApplications(7000123L)).thenReturn(dto);

    ResponseEntity<PermitHasApplicationsRpcResponseDto> response =
        controller.getPermitHasApplications(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPermitHasApplications(7000123L);
  }

  @Test
  void packageInfoShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageInfoRpcResponseDto dto =
        new PermitPackageInfoRpcResponseDto("Coast", "HE/UT", "Standing", "10.3", "5.5", "30.0", "Unmanufactured");
    when(service.getPackageInfo("PKG-903")).thenReturn(dto);

    ResponseEntity<PermitPackageInfoRpcResponseDto> response =
        controller.getPackageInfo("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageInfo("PKG-903");
  }

  @Test
  void packageDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageDetailsRpcResponseDto dto =
        new PermitPackageDetailsRpcResponseDto(
            true,
            "PKG-903",
            "10.3",
            8.9d,
            "5.5",
            "30.0",
            "ACT",
            "Reviewed",
            "Active",
            "N",
            "Standing");
    when(service.getPackageDetails("PKG-903")).thenReturn(dto);

    ResponseEntity<PermitPackageDetailsRpcResponseDto> response =
        controller.getPackageDetails("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getPackageDetails("PKG-903");
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
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
  @Mock private LexisSessionService sessionService;
  @Mock private HttpServletRequest request;
  @Mock private HttpSession session;

  private PermitDetailsRpcController controller;

  @BeforeEach
  void setup() {
    when(sessionService.getConfiguredIndustryRoles())
        .thenReturn(Set.of("PROVINCIAL_SUBMITTER", "FEDERAL_SUBMITTER"));
    controller =
        new PermitDetailsRpcController(serviceProvider, sessionService);
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
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("PROVINCIAL_SUBMITTER"));

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
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("READ_ONLY"));

    ResponseEntity<PermitScaleFeesRpcResponseDto> response =
        controller.getScaleFeesForPackage("PKG-903", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getScaleFeesForPackage("PKG-903", 7000123L, true);
  }

  @Test
  void scalesForPackageShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitScalesForPackageRpcResponseDto dto =
        new PermitScalesForPackageRpcResponseDto(
            List.of(
                new PermitScaleItemRpcResponseDto(
                    "TM1", 11L, "Hemlock", "Grade J", "7.6", "7000123", "101", "W", "RCO")));
    when(service.getScalesForPackage("PKG-903")).thenReturn(dto);

    ResponseEntity<PermitScalesForPackageRpcResponseDto> response =
        controller.getScalesForPackage("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getScalesForPackage("PKG-903");
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
  void oicPackageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPackageListRpcResponseDto dto =
        new PermitPackageListRpcResponseDto(List.of("PKG-OIC-1", "PKG-OIC-2"));
    when(service.getOicPackageList(7000123L)).thenReturn(dto);

    ResponseEntity<PermitPackageListRpcResponseDto> response =
        controller.getOicPackageList(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getOicPackageList(7000123L);
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

  @Test
  void checkPermitNumberShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitNumberAvailabilityRpcResponseDto dto = new PermitNumberAvailabilityRpcResponseDto(true);
    when(service.checkPermitNumber(7000123L)).thenReturn(dto);

    ResponseEntity<PermitNumberAvailabilityRpcResponseDto> response =
        controller.checkPermitNumber(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).checkPermitNumber(7000123L);
  }

  @Test
  void applicationListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitApplicationListRpcResponseDto dto =
        new PermitApplicationListRpcResponseDto(List.of("1000456", "1000457"));
    when(service.getApplicationList(7000123L)).thenReturn(dto);

    ResponseEntity<PermitApplicationListRpcResponseDto> response =
        controller.getApplicationList(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getApplicationList(7000123L);
  }

  @Test
  void availableApplicationListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitAvailableApplicationListRpcResponseDto dto =
        new PermitAvailableApplicationListRpcResponseDto(List.of("1000456"), null);
    when(service.getAvailableApplicationList("EX-700", "1000458")).thenReturn(dto);

    ResponseEntity<PermitAvailableApplicationListRpcResponseDto> response =
        controller.getAvailableApplicationList("EX-700", "1000458");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getAvailableApplicationList("EX-700", "1000458");
  }

  @Test
  void availablePackageListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitAvailablePackageListRpcResponseDto dto =
        new PermitAvailablePackageListRpcResponseDto(List.of("PKG-900"), null);
    when(service.getAvailablePackageList("EX-700", "PKG-901")).thenReturn(dto);

    ResponseEntity<PermitAvailablePackageListRpcResponseDto> response =
        controller.getAvailablePackageList("EX-700", "PKG-901");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getAvailablePackageList("EX-700", "PKG-901");
  }

  @Test
  void approvedExemptionVolumeShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitApprovedExemptionVolumeRpcResponseDto dto =
        new PermitApprovedExemptionVolumeRpcResponseDto(100.5d);
    when(service.getApprovedExemptionVolume("EX-700")).thenReturn(dto);

    ResponseEntity<PermitApprovedExemptionVolumeRpcResponseDto> response =
        controller.getApprovedExemptionVolume("EX-700");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getApprovedExemptionVolume("EX-700");
  }

  @Test
  void exemptionVolumeRemainingShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitExemptionVolumeRemainingRpcResponseDto dto =
        new PermitExemptionVolumeRemainingRpcResponseDto(55.25d);
    when(service.getExemptionVolumeRemaining("EX-700")).thenReturn(dto);

    ResponseEntity<PermitExemptionVolumeRemainingRpcResponseDto> response =
        controller.getExemptionVolumeRemaining("EX-700");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getExemptionVolumeRemaining("EX-700");
  }

  @Test
  void countryListShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitCountryListRpcResponseDto dto =
        new PermitCountryListRpcResponseDto(
            List.of(new PermitCountryItemRpcResponseDto("Canada", "CA")));
    when(service.getCountryList()).thenReturn(dto);

    ResponseEntity<PermitCountryListRpcResponseDto> response = controller.getCountryList();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getCountryList();
  }

  @Test
  void invoicesForPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitInvoiceListRpcResponseDto dto =
        new PermitInvoiceListRpcResponseDto(List.of("INV-100", "INV-101"));
    when(service.getInvoicesForPermit(7000123L)).thenReturn(dto);

    ResponseEntity<PermitInvoiceListRpcResponseDto> response =
        controller.getInvoicesForPermit(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getInvoicesForPermit(7000123L);
  }

  @Test
  void invoiceDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitInvoiceDetailsRpcResponseDto dto =
        new PermitInvoiceDetailsRpcResponseDto(true, "1.25", "$50.00", "$125.00");
    when(service.getInvoiceDetails(7000123L, "INV-101")).thenReturn(dto);

    ResponseEntity<PermitInvoiceDetailsRpcResponseDto> response =
        controller.getInvoiceDetails(7000123L, "INV-101");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getInvoiceDetails(7000123L, "INV-101");
  }

  @Test
  void gbmsInvoiceHistoryShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitGbmsInvoiceHistoryItemRpcResponseDto> dto =
        List.of(
            new PermitGbmsInvoiceHistoryItemRpcResponseDto(
                "GBMS-1", "", "", "125.00", "03/01/2026", "03/01/2026", "03/02/2026"));
    when(service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true)).thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("READ_ONLY")));
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("READ_ONLY"));

    ResponseEntity<List<PermitGbmsInvoiceHistoryItemRpcResponseDto>> response =
        controller.getGbmsInvoiceHistory("RCPT-1", 7000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getGbmsInvoiceHistory("RCPT-1", 7000123L, true);
  }

  @Test
  void addInvoiceShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitPersistenceRpcResponseDto dto =
        new PermitPersistenceRpcResponseDto(
            true, "The sales invoice was saved successfully.", List.of(), List.of(), 7000123L);
    when(service.addInvoice(
            7000123L,
            "INV-100",
            new java.math.BigDecimal("100.00"),
            new java.math.BigDecimal("1.25"),
            new java.math.BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("ADMIN")));

    ResponseEntity<PermitPersistenceRpcResponseDto> response =
        controller.addInvoice(
            7000123L, "INV-100", "100.00", "1.25", "12.00", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .addInvoice(
            7000123L,
            "INV-100",
            new java.math.BigDecimal("100.00"),
            new java.math.BigDecimal("1.25"),
            new java.math.BigDecimal("12.00"),
            "idir\\jsmith");
  }

  @Test
  void addPermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameter(org.mockito.ArgumentMatchers.anyString())).thenReturn(null);
    when(request.getParameter("permitNumber")).thenReturn("7000123");
    when(request.getParameter("permitStatus")).thenReturn("ACT");
    when(request.getParameter("permitSubmitDate")).thenReturn("2026-05-27");
    when(request.getParameter("permitIssueDate")).thenReturn("2026-05-27");
    when(request.getParameter("permitExpiryDate")).thenReturn("2026-06-27");
    when(request.getParameter("exemptionNumber")).thenReturn("EX-700");
    when(request.getParameter("region")).thenReturn("1835");
    when(request.getParameter("permitTotalVolume")).thenReturn("100.0");
    when(request.getParameter("permitTotalPieces")).thenReturn("25");

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was saved successfully.",
            List.of(),
            List.of(),
            7000123L,
            "ACT",
            null,
            false,
            false,
            null);
    when(service.addPermit(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("ADMIN")));

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .addPermit(
            org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
  }

  @Test
  void updatePermitShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameter(org.mockito.ArgumentMatchers.anyString())).thenReturn(null);
    when(request.getParameter("permitNumber")).thenReturn("7000123");
    when(request.getParameter("permitStatus")).thenReturn("PPD");

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was updated successfully.",
            List.of(),
            List.of(),
            7000123L,
            "PPD",
            "RCP-100",
            false,
            false,
            null);
    when(service.updatePermit(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("ADMIN")));

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updatePermit(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .updatePermit(
            org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
  }

  @Test
  void updateShippingShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(request.getParameter(org.mockito.ArgumentMatchers.anyString())).thenReturn(null);
    when(request.getParameter("permitNumber")).thenReturn("7000123");
    when(request.getParameter("estimatedShippingDate")).thenReturn("2026-06-10");

    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "The permit was saved successfully.",
            List.of(),
            List.of(),
            7000123L,
            "ACT",
            null,
            false,
            false,
            null);
    when(service.updateShipping(org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(dto);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith", "n/a", List.of(new SimpleGrantedAuthority("ADMIN")));

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.updateShipping(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service)
        .updateShipping(
            org.mockito.ArgumentMatchers.any(PermitMutationRequestDto.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
  }

  @Test
  void conversionRateShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitConversionRateRpcResponseDto dto = new PermitConversionRateRpcResponseDto(true, "1.23");
    when(service.getConversionRate()).thenReturn(dto);

    ResponseEntity<PermitConversionRateRpcResponseDto> response =
        controller.getConversionRate();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getConversionRate();
  }

  @Test
  void fileTypesShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitFileTypeRpcResponseDto> dto = List.of(new PermitFileTypeRpcResponseDto("INV", "Invoice"));
    when(service.getFileTypes()).thenReturn(dto);

    ResponseEntity<List<PermitFileTypeRpcResponseDto>> response = controller.getFileTypes();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getFileTypes();
  }

  @Test
  void documentDetailsShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    List<PermitDocumentItemRpcResponseDto> dto =
        List.of(new PermitDocumentItemRpcResponseDto("file.pdf", "", "Invoice", "INV", 77L));
    when(service.getDocumentDetails(7000123L)).thenReturn(dto);

    ResponseEntity<List<PermitDocumentItemRpcResponseDto>> response =
        controller.getDocumentDetails("7000123");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).getDocumentDetails(7000123L);
  }

  @Test
  void documentShouldReturnNoContentWhenMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocument(77L)).thenReturn(Optional.empty());

    ResponseEntity<byte[]> response = controller.getDocument("77", "file.pdf");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verify(service).getDocument(77L);
  }

  @Test
  void removePermitDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removePermitDocument(33L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removePermitDocument("33");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removePermitDocument(33L);
  }

  @Test
  void removeApplicationDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeApplicationDocument(44L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeApplicationDocument("44");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeApplicationDocument(44L);
  }

  @Test
  void removeInvoiceDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeInvoiceDocument(55L)).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeInvoiceDocument("55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeInvoiceDocument(55L);
  }

  @Test
  void checkFormChangesShouldReturnLegacyNoOpPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().permitChanged()).isFalse();
  }

  @Test
  void checkFormChangesShouldReturnServicePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.hasFormChanges(any(PermitMutationRequestDto.class))).thenReturn(true);

    ResponseEntity<PermitDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().permitChanged()).isTrue();
    verify(service).hasFormChanges(any(PermitMutationRequestDto.class));
  }

  @Test
  void releaseLockShouldReturnLegacyOkPayloadAndClearSessionLock() {
    when(request.getSession(false)).thenReturn(session);

    ResponseEntity<PermitDetailsRpcController.ReleaseLockResponseDto> response =
        controller.releaseLock(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().release()).isEqualTo("ok");
    verify(session).removeAttribute("PERMIT_LOCK");
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OfferDetailsRpcController")
class OfferDetailsRpcControllerTest {

  @Mock private ObjectProvider<LexisApplicationService> applicationServiceProvider;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<FederalApplicationService> federalApplicationServiceProvider;
  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ObjectProvider<PurchaseOfferService> purchaseOfferServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private FederalApplicationService federalApplicationService;
  @Mock private ClientLookupService clientLookupService;
  @Mock private PurchaseOfferService purchaseOfferService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private Authentication authentication;

  private OfferDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller =
        new OfferDetailsRpcController(
            applicationServiceProvider,
            applicationDetailsServiceProvider,
            federalApplicationServiceProvider,
            clientLookupServiceProvider,
            purchaseOfferServiceProvider,
            sessionService,
            authorizationService);
  }

  @Test
  void validateShouldReturnInvalidWhenApplicationServiceMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isFalse();
    verifyNoInteractions(applicationService, federalApplicationService);
  }

  @Test
  void validateShouldRejectFederalApplicationNumbers() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(federalApplicationServiceProvider.getIfAvailable()).thenReturn(federalApplicationService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", LocalDate.now(), true, List.of())));
    when(federalApplicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationDetailDto(
                    1000456L,
                    "FED-1",
                    "APP",
                    "Approved",
                    "00077881",
                    "00",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    false,
                    List.of(),
                    List.of(),
                    List.of(),
                    null)));

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isFalse();
    assertThat(response.getBody().errors()).hasSize(1);
    assertThat(response.getBody().errors().get(0)).contains("valid jurisdiction");
    verify(applicationService).findByApplicationNumber(1000456L);
    verify(federalApplicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void validateShouldReturnValidWhenApplicationEligible() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(federalApplicationServiceProvider.getIfAvailable()).thenReturn(federalApplicationService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", LocalDate.now(), true, List.of())));
    when(federalApplicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isTrue();
    assertThat(response.getBody().errors()).isEmpty();
  }

  @Test
  void applicationDetailsShouldReturnSuccessPayload() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                application(1000456L, "APP", LocalDate.of(2026, 2, 26), true, List.of())));
    when(applicationDetailsService.getSpeciesForApplication(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.SpeciesEndUseItem("FI", "LUM", "Lumber"),
                new ApplicationDetailsRpcService.SpeciesEndUseItem("HE", "LUM", "Lumber")));

    ResponseEntity<OfferDetailsRpcController.OfferApplicationDetailsResponseDto> response =
        controller.getApplicationDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().speciesGradeCode()).isEqualTo("FI/HE/LUM");
    assertThat(response.getBody().advertisingDate()).isEqualTo("02/26/2026");
    assertThat(response.getBody().teacReviewDate()).isEqualTo("2026-03-05");
  }

  @Test
  void packageListShouldReturnNoPackagesWhenDetailsMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferPackageListResponseDto> response =
        controller.getPackageList("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().packageList()).containsExactly("No Packages");
  }

  @Test
  void packageVolumeShouldReturnFormattedVolume() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 95.04d, "S")));

    ResponseEntity<OfferDetailsRpcController.OfferVolumeResponseDto> response =
        controller.getPackageVolume("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volume()).isEqualTo("95.0");
  }

  @Test
  void applicationVolumeShouldReturnZeroWhenApplicationMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferVolumeResponseDto> response =
        controller.getApplicationVolume("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volume()).isEqualTo("0.0");
  }

  @Test
  void clientDataShouldReturnNotfoundWhenClientDoesNotExist() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00")).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferClientDataResponseDto> response =
        controller.getClientData("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isEqualTo("true");
  }

  @Test
  void clientLocationsShouldReturnLocationRows() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientLocations("77881"))
        .thenReturn(List.of(new ClientLookupService.ClientLocation("00 - Main", "00", true)));

    ResponseEntity<List<OfferDetailsRpcController.OfferClientLocationResponseDto>> response =
        controller.getClientLocations("77881");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).locationCode()).isEqualTo("00");
    assertThat(response.getBody().get(0).selected()).isTrue();
  }

  @Test
  void addOfferLegacyShouldMapAliasesAndReturnPersistencePayload() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.addOffer(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true,
                "The purchase offer was saved successfully.",
                1000456L,
                81001L,
                false,
                null,
                true,
                false,
                List.of(),
                List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("offerNumber", "81001");
    params.add("packageNumber", " PKG-903 ");
    params.add("companyName", "Example Lumber");
    params.add("contactName", "Alex Example");
    params.add("purchaseOfferAmount", "12500.25");
    params.add("purchaseOfferDate", "03/02/2026");
    params.add("offerEndDate", "2026-03-18");
    params.add("clientNumber", "00077881");
    params.add("pickupLocation", "Port Moody");
    params.add("offerCondition", "Condition notes");
    params.add("offerVolume", "99.99");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(response.getBody().sendEmail()).isTrue();
    assertThat(response.getBody().isUpdate()).isFalse();

    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .addOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    PurchaseOfferService.CreateOfferRequest request = requestCaptor.getValue();
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.offerWithdrawalDate()).isEqualTo(LocalDate.of(2026, 3, 18));
    assertThat(request.offeringClientNumber()).isEqualTo("00077881");
    assertThat(request.offerVolume()).isEqualTo(99.99d);
  }

  @Test
  void updateOfferLegacyShouldMapAliasesAndReturnUpdatePayload() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.updateOffer(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true,
                "The purchase offer was updated successfully.",
                1000456L,
                81001L,
                false,
                null,
                true,
                true,
                List.of(),
                List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("purchaseOfferAmount", "13000.00");
    params.add("purchaseOfferDate", "2026-03-03");
    params.add("offerWithdrawalDate", "03/19/2026");
    params.add("withdrawReason", "Withdrawn by buyer");
    params.add("pickupLocation", "Port Moody");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().isUpdate()).isTrue();
    assertThat(response.getBody().sendEmail()).isTrue();

    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    PurchaseOfferService.CreateOfferRequest request = requestCaptor.getValue();
    assertThat(request.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(request.purchaseOfferAmount()).isEqualTo(13000.00d);
    assertThat(request.offerWithdrawalDate()).isEqualTo(LocalDate.of(2026, 3, 19));
    assertThat(request.withdrawReason()).isEqualTo("Withdrawn by buyer");
  }

  @Test
  void updateOfferLegacyShouldAllowOfferingClientAndPreserveApproverFields() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("bceid\\buyer");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(false);
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offerDetails"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOffer(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("bceid\\buyer")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true,
                "The purchase offer was updated successfully.",
                1000456L,
                81001L,
                false,
                null,
                true,
                true,
                List.of(),
                List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("purchaseOfferAmount", "13000.00");
    params.add("purchaseOfferDate", "2026-04-01");
    params.add("teacReviewDate", "2026-04-02");
    params.add("approvalIndicator", "Y");
    params.add("offerRemark", "Approver-only change");
    params.add("offerWithdrawalDate", "2026-07-30");
    params.add("withdrawReason", "Withdrawn by buyer");
    params.add("pickupLocation", "Updated pickup");
    params.add("offerCondition", "Updated condition");
    params.add("offerVolume", "55.5");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("bceid\\buyer"));
    PurchaseOfferService.CreateOfferRequest request = requestCaptor.getValue();
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(request.purchaseOfferAmount()).isEqualTo(13000.00d);
    assertThat(request.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.teacReviewDate()).isEqualTo(LocalDate.of(2026, 3, 5));
    assertThat(request.approvalIndicator()).isEqualTo("N");
    assertThat(request.offerRemark()).isEqualTo("Initial offer");
    assertThat(request.offerWithdrawalDate()).isEqualTo(LocalDate.of(2026, 7, 30));
    assertThat(request.withdrawReason()).isEqualTo("Withdrawn by buyer");
    assertThat(request.pickupLocation()).isEqualTo("Updated pickup");
    assertThat(request.offerCondition()).isEqualTo("Updated condition");
    assertThat(request.offerVolume()).isEqualTo(55.5d);
  }

  @Test
  void updateOfferLegacyShouldRejectNonOfferingClientWithoutCreateOfferAccess() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(false);
    when(authorizationService.canPerformAction(List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offerDetails"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00099999");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("purchaseOfferAmount", "13000.00");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(purchaseOfferService).findByOfferNumber(81001L);
  }

  private LexisApplicationDetailDto application(
      long applicationNumber,
      String statusCode,
      LocalDate listingDate,
      boolean canCreateOffers,
      List<LexisApplicationDetailDto.LexisPackageDto> packages) {
    return new LexisApplicationDetailDto(
        applicationNumber,
        "EX-205",
        statusCode,
        "Status",
        "00077881",
        "00055667",
        12L,
        "R2",
        "S",
        "ER02",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 21),
        listingDate,
        LocalDate.of(2026, 3, 5),
        120L,
        95.0d,
        1.6d,
        canCreateOffers,
        false,
        false,
        false,
        false,
        null,
        null,
        packages,
        List.of(),
        List.of());
  }

  private PurchaseOfferDetailDto offerDetailForRestrictedUpdate() {
    return new PurchaseOfferDetailDto(
        81001L,
        1000456L,
        "PKG-903",
        45.5,
        "FI/HE/LUM",
        "Original Buyer",
        "Buyer Contact",
        12500.25,
        LocalDate.of(2026, 3, 2),
        null,
        LocalDate.of(2026, 3, 5),
        "N",
        "Y",
        "N",
        "Initial offer",
        null,
        "P",
        "Mill details",
        "00077881",
        "Port Moody",
        "Condition notes",
        LocalDate.of(2026, 2, 25),
        LocalDate.of(2026, 12, 31),
        90.0,
        "12");
  }
}

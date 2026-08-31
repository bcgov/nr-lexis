package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.OfferWithdrawalPolicy;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
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
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private OfferWithdrawalPolicy offerWithdrawalPolicy;
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
            authorizationService,
            new ApplicationPermitOperationCoordinator(new PermitOperationMutex()),
            editLockService,
            offerWithdrawalPolicy);
    lenient().when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    lenient().when(federalApplicationServiceProvider.getIfAvailable()).thenReturn(federalApplicationService);
    lenient()
        .when(applicationService.findByApplicationNumber(anyLong()))
        .thenAnswer(
            invocation ->
                Optional.of(
                    application(
                        invocation.getArgument(0),
                        "APP",
                        LexisBusinessTime.today(),
                        true,
                        List.of())));
    lenient()
        .when(federalApplicationService.findByApplicationNumber(anyLong()))
        .thenReturn(Optional.empty());
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
    when(applicationDetailsService.getApplicationSpeciesEndUseSort(1000456L))
        .thenReturn("FI/HE/LUM");

    ResponseEntity<OfferDetailsRpcController.OfferApplicationDetailsResponseDto> response =
        controller.getApplicationDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().speciesGradeCode()).isEqualTo("FI/HE/LUM");
    assertThat(response.getBody().advertisingDate()).isEqualTo("02/26/2026");
    assertThat(response.getBody().teacReviewDate()).isEqualTo("2026-03-05");
    assertThat(response.getBody().region()).isEqualTo("R2");
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
  void packageVolumeShouldUseLegacyHalfEvenFormatting() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.findApplicationNumberForPackage("PKG-903"))
        .thenReturn(Optional.of(1000456L));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 95.55d, "S")));

    ResponseEntity<OfferDetailsRpcController.OfferVolumeResponseDto> response =
        controller.getPackageVolume("PKG-903", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volume()).isEqualTo("95.5");
    verify(provincialAuthorizationService).requireApplication(authentication, 1000456L);
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
    params.add("contactName", "Sample Contact");
    params.add("purchaseOfferAmount", "12500.25");
    params.add("purchaseOfferDate", "03/02/2026");
    params.add("offerEndDate", "2026-03-18");
    params.add("clientNumber", "00077881");
    params.add("pickupLocation", "Port Moody");
    params.add("offerCondition", "Condition notes");
    params.add("offerVolume", "99.99");
    params.add("fairOfferIndicator", "Y");
    params.add("validOfferIndicator", "N");
    params.add("approvalIndicator", "Y");
    params.add("offerRemark", "Forged review note");

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
    assertThat(request.fairOfferIndicator()).isEqualTo("N");
    assertThat(request.validOfferIndicator()).isEqualTo("Y");
    assertThat(request.approvalIndicator()).isEqualTo("N");
    assertThat(request.offerRemark()).isNull();
  }

  @Test
  void addOfferLegacyShouldPreserveInvalidOracleDecimalsForServiceRejection() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.addOffer(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                false, null, 1000456L, null, false, null, false, false, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("purchaseOfferAmount", "1.230");
    params.add("offerVolume", "Infinity");

    controller.addOfferLegacy(params, authentication);

    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .addOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(requestCaptor.getValue().purchaseOfferAmount()).isNaN();
    assertThat(requestCaptor.getValue().offerVolume()).isNaN();
  }

  @Test
  void addOfferLegacyShouldRejectInvalidDatesBeforePersistence() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("purchaseOfferDate", "2026-02-31");
    params.add("offerWithdrawalDate", "not-a-date");
    params.add("teacReviewDate", "2026-13-01");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly(
            "Offer received date must be a valid date in YYYY-MM-DD format.",
            "Offer withdrawal date must be a valid date in YYYY-MM-DD format.",
            "TEAC review date must be a valid date in YYYY-MM-DD format.");
    verify(purchaseOfferService, never())
        .addOffer(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void addOfferLegacyShouldAuthorizeParentApplicationAndOfferingClient() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\approver");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "createOffer"))
        .thenReturn(true);
    when(provincialAuthorizationService.canCreateForClient(
            authentication, "00077881", null))
        .thenReturn(true);
    when(purchaseOfferService.addOffer(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\approver")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "saved", 1000456L, 81001L, false, null, false, false, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("clientNumber", "00077881");
    params.add("offerRemark", "Approver review note");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(provincialAuthorizationService)
        .canCreateForClient(authentication, "00077881", null);
    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .addOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\approver"));
    assertThat(requestCaptor.getValue().offerRemark()).isEqualTo("Approver review note");
  }

  @Test
  void addOfferLegacyShouldRejectOfferingClientOutsideCallerScope() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "createOffer"))
        .thenReturn(true);
    when(provincialAuthorizationService.canCreateForClient(
            authentication, "00077881", null))
        .thenReturn(false);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("clientNumber", "00077881");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
    verify(purchaseOfferService, never())
        .addOffer(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void addOfferLegacyShouldDeriveScopedBidderAndAllowAnOpenUnownedApplication() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("bceid\\buyer");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00077881",
                    "Authoritative Buyer Ltd.",
                    "1 Main St",
                    "Victoria",
                    "BC",
                    "V8V 1V1",
                    "CA",
                    "250-555-0100",
                    null,
                    "buyer@example.test")));
    when(provincialAuthorizationService.canCreateForClient(
            authentication, "00077881", null))
        .thenReturn(true);
    when(purchaseOfferService.addOffer(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("bceid\\buyer")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "saved", 1000456L, 81001L, false, null, false, false, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("clientNumber", "00099999");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.CreateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.CreateOfferRequest.class);
    verify(purchaseOfferService)
        .addOffer(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("bceid\\buyer"));
    assertThat(requestCaptor.getValue().offeringClientNumber()).isEqualTo("00077881");
    assertThat(requestCaptor.getValue().companyName()).isEqualTo("Authoritative Buyer Ltd.");
    verify(provincialAuthorizationService, never())
        .requireApplication(authentication, 1000456L);
  }

  @Test
  void addOfferLegacyShouldRejectClosedApplicationForScopedBidder() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                application(
                    1000456L,
                    "APP",
                    LexisBusinessTime.today().minusDays(1),
                    false,
                    List.of())));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");

    assertThatThrownBy(() -> controller.addOfferLegacy(params, authentication))
        .isInstanceOf(org.springframework.security.access.AccessDeniedException.class)
        .hasMessageContaining("not currently available");
    verify(purchaseOfferService, never())
        .addOffer(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldMapAliasesAndPreserveOmittedSnapshotFields() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\jsmith");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(List.of("LEXIS_APPLICATION_APPROVER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOfferSnapshot(
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
    params.add("offerNumber", "81001");
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

    ArgumentCaptor<PurchaseOfferService.UpdateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.UpdateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOfferSnapshot(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    PurchaseOfferService.UpdateOfferRequest request = requestCaptor.getValue();
    assertThat(request.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(request.purchaseOfferAmount()).isEqualTo(13000.00d);
    assertThat(request.offerWithdrawalDate()).isEqualTo(LocalDate.of(2026, 3, 19));
    assertThat(request.withdrawReason()).isEqualTo("Withdrawn by buyer");
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.companyName()).isEqualTo("Original Buyer");
    assertThat(request.contactName()).isEqualTo("Buyer Contact");
    assertThat(request.teacReviewDate()).isEqualTo(LocalDate.of(2026, 3, 5));
    assertThat(request.offerCondition()).isEqualTo("Condition notes");
    assertThat(request.offerVolume()).isEqualTo(90.0d);
    verify(provincialAuthorizationService)
        .requireApplication(authentication, 1000456L);
  }

  @Test
  void updateOfferLegacyShouldRejectAnInvalidTeacDateBeforePersistence() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("offerNumber", "81001");
    params.add("teacReviewDate", "2026-02-31");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().isUpdate()).isTrue();
    assertThat(response.getBody().errors())
        .containsExactly("TEAC review date must be a valid date in YYYY-MM-DD format.");
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldPreserveAnOmittedNullOfferVolume() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\admin");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate(null)));
    when(purchaseOfferService.updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\admin")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "updated", 1000456L, 81001L, false, null, false, true, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("offerNumber", "81001");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.UpdateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.UpdateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOfferSnapshot(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\admin"));
    assertThat(requestCaptor.getValue().offerVolume()).isNull();
  }

  @Test
  void addOfferLegacyShouldRejectNonCurrentWithdrawalDateForScopedOfferingClient() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("offeringClientNumber", "00077881");
    params.add("offerWithdrawalDate", LexisBusinessTime.today().plusDays(1).toString());
    params.add("withdrawReason", "Withdrawn by buyer");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.addOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().isUpdate()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly("Offer withdrawn date must be the current date.");
    verify(purchaseOfferService, never())
        .addOffer(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldFailClosedWhenCurrentOfferCannotBeLoaded() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L)).thenReturn(Optional.empty());
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldAllowAdminToManageApproverFields() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\admin");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\admin")))
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
    params.add("teacReviewDate", "2026-04-02");
    params.add("fairOfferIndicator", "Y");
    params.add("validOfferIndicator", "N");
    params.add("approvalIndicator", "Y");
    params.add("offerRemark", "Approver-only change");
    params.add("pickupLocation", "Port Moody");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.UpdateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.UpdateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOfferSnapshot(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\admin"));
    PurchaseOfferService.UpdateOfferRequest request = requestCaptor.getValue();
    assertThat(request.purchaseOfferAmount()).isEqualTo(13000.00d);
    assertThat(request.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 3));
    assertThat(request.teacReviewDate()).isEqualTo(LocalDate.of(2026, 4, 2));
    assertThat(request.fairOfferIndicator()).isEqualTo("Y");
    assertThat(request.validOfferIndicator()).isEqualTo("N");
    assertThat(request.approvalIndicator()).isEqualTo("Y");
    assertThat(request.offerRemark()).isEqualTo("Approver-only change");
  }

  @Test
  void updateOfferLegacyShouldPassBlankOptionalFieldsAsAFullSnapshot() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\admin");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(List.of("LEXIS_ADMIN"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailWithOptionalValues()));
    when(purchaseOfferService.updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\admin")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "updated", 1000456L, 81001L, false, null, true, true, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("packageNumber", "PKG-903");
    params.add("companyName", "Original Buyer");
    params.add("contactName", "Buyer Contact");
    params.add("purchaseOfferAmount", "12500.25");
    params.add("purchaseOfferDate", "2026-03-02");
    params.add("offerWithdrawalDate", "");
    params.add("offerEndDate", "2026-12-31");
    params.add("withdrawReason", "");
    params.add("teacReviewDate", "");
    params.add("fairOfferIndicator", "N");
    params.add("validOfferIndicator", "Y");
    params.add("approvalIndicator", "N");
    params.add("offerRemark", "");
    params.add("pickupLocation", "Port Moody");
    params.add("offerCondition", "");
    params.add("offerVolume", "");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.UpdateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.UpdateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOfferSnapshot(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\admin"));
    PurchaseOfferService.UpdateOfferRequest request = requestCaptor.getValue();
    assertThat(request.offerWithdrawalDate()).isNull();
    assertThat(request.withdrawReason()).isEmpty();
    assertThat(request.teacReviewDate()).isNull();
    assertThat(request.offerRemark()).isEmpty();
    assertThat(request.offerCondition()).isEmpty();
    assertThat(request.offerVolume()).isNull();
  }

  @Test
  void updateOfferLegacyShouldNotDependOnTheRemovedInteractiveEditLock() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("idir\\reviewer2");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_APPLICATION_APPROVER"), "createOffer"))
        .thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\reviewer2")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "updated", 1000456L, 81001L, false, null, true, true, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("purchaseOfferAmount", "13000.00");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(purchaseOfferService)
        .updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\reviewer2"));
  }

  @Test
  void releaseLockShouldAuthorizeTheOfferAndReleaseOnlyForTheCurrentPrincipal() {
    controller.setProvincialAuthorizationService(provincialAuthorizationService);
    when(authentication.getName()).thenReturn("idir\\reviewer1");
    when(provincialAuthorizationService.canAccessOffer(authentication, 81001L)).thenReturn(true);
    when(editLockService.releaseOffer(81001L, "idir\\reviewer1")).thenReturn(true);

    ResponseEntity<OfferDetailsRpcController.ReleaseLockResponseDto> response =
        controller.releaseLock(81001L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new OfferDetailsRpcController.ReleaseLockResponseDto("ok"));
    verify(editLockService).releaseOffer(81001L, "idir\\reviewer1");
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
    when(offerWithdrawalPolicy.canWithdraw(1000456L)).thenReturn(true);
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOfferSnapshot(
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
    params.add("offerWithdrawalDate", LexisBusinessTime.today().toString());
    params.add("withdrawReason", "Withdrawn by buyer");
    params.add("pickupLocation", "Updated pickup");
    params.add("offerCondition", "Updated condition");
    params.add("offerVolume", "55.5");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    ArgumentCaptor<PurchaseOfferService.UpdateOfferRequest> requestCaptor =
        ArgumentCaptor.forClass(PurchaseOfferService.UpdateOfferRequest.class);
    verify(purchaseOfferService)
        .updateOfferSnapshot(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("bceid\\buyer"));
    PurchaseOfferService.UpdateOfferRequest request = requestCaptor.getValue();
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(request.purchaseOfferAmount()).isEqualTo(13000.00d);
    assertThat(request.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.teacReviewDate()).isEqualTo(LocalDate.of(2026, 3, 5));
    assertThat(request.approvalIndicator()).isEqualTo("N");
    assertThat(request.offerRemark()).isEqualTo("Initial offer");
    assertThat(request.offerWithdrawalDate()).isEqualTo(LexisBusinessTime.today());
    assertThat(request.withdrawReason()).isEqualTo("Withdrawn by buyer");
    assertThat(request.pickupLocation()).isEqualTo("Updated pickup");
    assertThat(request.offerCondition()).isEqualTo("Updated condition");
    assertThat(request.offerVolume()).isEqualTo(55.5d);
  }

  @Test
  void updateOfferLegacyShouldRejectScopedWithdrawalWhenTheScheduleDeadlineCannotBeResolved() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(false);
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offerDetails"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(offerWithdrawalPolicy.canWithdraw(1000456L)).thenReturn(false);
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("offerWithdrawalDate", LexisBusinessTime.today().toString());
    params.add("withdrawReason", "Withdrawn by buyer");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly("The offer is no longer eligible for withdrawal.");
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldRejectNonCurrentWithdrawalDateForScopedOfferingClient() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(false);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("offerWithdrawalDate", LexisBusinessTime.today().minusDays(1).toString());
    params.add("withdrawReason", "Withdrawn by buyer");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly("Offer withdrawn date must be the current date.");
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateOfferLegacyShouldApplyIndustryWithdrawalRuleToDualRoleOfferingClient() {
    List<String> roles =
        List.of("LEXIS_APPLICATION_APPROVER", "LEXIS_PROVINCIAL_SUBMITTER");
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "createOffer")).thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("offerWithdrawalDate", LexisBusinessTime.today().minusDays(1).toString());
    params.add("withdrawReason", "Withdrawn by buyer");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().errors())
        .containsExactly("Offer withdrawn date must be the current date.");
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
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
    verify(purchaseOfferService, times(2)).findByOfferNumber(81001L);
  }

  @Test
  void updateOfferLegacyShouldRejectApplicationOwnerWhoDoesNotOwnTheOffer() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
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
    verify(purchaseOfferService, never())
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    verify(provincialAuthorizationService, never())
        .requireApplication(authentication, 1000456L);
  }

  @Test
  void updateOfferLegacyShouldAllowScopedOwnerEvenWithCreateOfferAccess() {
    when(purchaseOfferServiceProvider.getIfAvailable()).thenReturn(purchaseOfferService);
    when(authentication.getName()).thenReturn("bceid\\buyer");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "createOffer"))
        .thenReturn(true);
    when(authorizationService.canPerformAction(
            List.of("LEXIS_PROVINCIAL_SUBMITTER"), "/offerDetails"))
        .thenReturn(true);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(purchaseOfferService.findByOfferNumber(81001L))
        .thenReturn(Optional.of(offerDetailForRestrictedUpdate()));
    when(purchaseOfferService.updateOfferSnapshot(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("bceid\\buyer")))
        .thenReturn(
            new PurchaseOfferService.CreateOfferResult(
                true, "updated", 1000456L, 81001L, false, null, false, true, List.of(), List.of()));
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("exportPurchaseOfferNumber", "81001");
    params.add("purchaseOfferAmount", "13000.00");
    params.add("pickupLocation", "Updated pickup");

    ResponseEntity<OfferDetailsRpcController.OfferPersistenceResponseDto> response =
        controller.updateOfferLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    verify(purchaseOfferService)
        .updateOfferSnapshot(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("bceid\\buyer"));
    verify(provincialAuthorizationService, never())
        .requireApplication(authentication, 1000456L);
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
    return offerDetailForRestrictedUpdate(90.0d);
  }

  private PurchaseOfferDetailDto offerDetailForRestrictedUpdate(Double offerVolume) {
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
        offerVolume,
        "12");
  }

  private PurchaseOfferDetailDto offerDetailWithOptionalValues() {
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
        LocalDate.of(2026, 3, 10),
        LocalDate.of(2026, 3, 5),
        "N",
        "Y",
        "N",
        "Initial offer",
        "Withdrawn by buyer",
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

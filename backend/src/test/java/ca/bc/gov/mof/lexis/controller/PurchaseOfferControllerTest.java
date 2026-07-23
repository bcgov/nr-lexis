package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.SearchCountResponseDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.offer.OfferWithdrawalPolicy;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitSurface;
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

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | PurchaseOfferController")
class PurchaseOfferControllerTest {

  @Mock private ObjectProvider<PurchaseOfferService> serviceProvider;
  @Mock private PurchaseOfferService service;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private LexisApplicationService applicationService;
  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private OfferWithdrawalPolicy offerWithdrawalPolicy;
  @Mock private Authentication authentication;

  private PurchaseOfferController controller;

  @BeforeEach
  void setup() {
    controller =
        new PurchaseOfferController(
            serviceProvider,
            sessionService,
            authorizationService,
            applicationService,
            applicationDetailsServiceProvider,
            provincialAuthorizationService,
            editLockService,
            offerWithdrawalPolicy);
    lenient()
        .when(
            provincialAuthorizationService.constrainOrgUnits(
                any(), any(), eq(OrgUnitSurface.OFFER_SEARCH)))
        .thenAnswer(
            invocation -> {
              List<Long> requested = invocation.getArgument(1);
              return new OrgUnitConstraint(
                  false, requested == null ? List.of() : requested);
            });
    lenient()
        .when(
            provincialAuthorizationService.canAccessOffer(
                org.mockito.ArgumentMatchers.nullable(Authentication.class),
                any(PurchaseOfferDetailDto.class)))
        .thenReturn(true);
    lenient()
        .when(
            editLockService.acquireOffer(
                anyLong(), nullable(String.class), nullable(String.class), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient()
        .when(
            editLockService.snapshotOffer(
                anyLong(), nullable(String.class), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
  }

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PurchaseOfferSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PurchaseOfferSearchOptionsDto dto =
        new PurchaseOfferSearchOptionsDto(List.of(new CodeNameDto("12", "Coast")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<PurchaseOfferSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PurchaseOfferSearchResponseDto> response =
        controller.search(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of(),
            null,
            0,
            25,
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    PurchaseOfferSearchResponseDto dto =
        new PurchaseOfferSearchResponseDto(
            List.of(
                new PurchaseOfferSearchResultDto(
                    81009L,
                    1000456L,
                    "PKG-903",
                    LocalDate.of(2026, 2, 26),
                    "R2",
                    LocalDate.of(2026, 3, 15))),
            1,
            0,
            25);
    when(service.search(any(PurchaseOfferSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<PurchaseOfferSearchResponseDto> response =
        controller.search(
            "1000456",
            "PKG-903",
            "2026-02-01",
            null,
            "02/28/2026",
            null,
            "2026-03-01",
            "03/31/2026",
            "00077881",
            List.of(12L),
            "offerNumber DESC",
            0,
            25,
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    PurchaseOfferSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicationNumber()).isEqualTo("1000456");
    assertThat(criteria.packageNumber()).isEqualTo("PKG-903");
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 1));
    assertThat(criteria.listingToDate()).isEqualTo(LocalDate.of(2026, 2, 28));
    assertThat(criteria.withdrawalFromDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(criteria.withdrawalToDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    assertThat(criteria.clientNumber()).isEqualTo("00077881");
    assertThat(criteria.accessClientNumber()).isNull();
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("offerNumber DESC");
  }

  @Test
  void searchShouldAddScopedAccessWithoutForcingAnOwnerOrAgentFilter() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(new PurchaseOfferSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    assertThat(criteriaCaptor.getValue().clientNumber()).isNull();
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00077881");
  }

  @Test
  void searchShouldKeepRequestedClientFilterInsideMandatoryScopedAccess() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(new PurchaseOfferSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "00099999",
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    assertThat(criteriaCaptor.getValue().clientNumber()).isEqualTo("00099999");
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00077881");
  }

  @Test
  void countShouldKeepRequestedClientFilterInsideMandatoryScopedAccess() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.count(any(PurchaseOfferSearchCriteria.class))).thenReturn(3);

    ResponseEntity<SearchCountResponseDto> response =
        controller.count(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "00099999",
            List.of(),
            authentication);

    assertThat(response.getBody()).isEqualTo(new SearchCountResponseDto(3));
    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(service).count(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().clientNumber()).isEqualTo("00099999");
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00077881");
  }

  @Test
  void searchShouldUseReadOnlyIdentityOrganizationUnits() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(
            provincialAuthorizationService.constrainOrgUnits(
                authentication, List.of(), OrgUnitSurface.OFFER_SEARCH))
        .thenReturn(new OrgUnitConstraint(true, List.of(76L, 1826L)));
    when(service.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(new PurchaseOfferSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().regionNumbers()).containsExactly(76L, 1826L);
  }

  @Test
  void detailShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PurchaseOfferDetailDto> response = controller.getByOfferNumber(81009L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.empty());

    ResponseEntity<PurchaseOfferDetailDto> response = controller.getByOfferNumber(81009L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByOfferNumber(81009L);
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PurchaseOfferDetailDto dto =
        offerDetail();
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(dto));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00077881", null)));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response = controller.getByOfferNumber(81009L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            dto.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(false, false, false, false));
    assertThat(response.getBody().offerRemark()).isNull();
    verify(service).findByOfferNumber(81009L);
    verify(applicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnPayloadWhenScopedUserOwnsParentApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00099999");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00077881", null)));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            offer.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(false, false, false, false));
    assertThat(response.getBody().offerRemark()).isNull();
    verify(service).findByOfferNumber(81009L);
    verify(applicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldRedactOfferRemarkWhenScopedUserOwnsParentApplicationAsAgent() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00099999");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00077881")));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody().offerRemark()).isNull();
    assertThat(response.getBody().canEditOfferRemarks()).isFalse();
  }

  @Test
  void detailShouldReturnPayloadWhenScopedUserIsOfferingClient() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            offer.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(false, false, true, false));
    assertThat(response.getBody().offerRemark()).isNull();
    verify(service).findByOfferNumber(81009L);
    verify(applicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldAllowScopedOfferingClientToWithdrawThroughTheScheduleDeadline() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    when(offerWithdrawalPolicy.canWithdraw(1000456L)).thenReturn(true);
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().canEditWithdrawFields()).isTrue();
    verify(offerWithdrawalPolicy).canWithdraw(1000456L);
  }

  @Test
  void detailShouldReturnFullEditPermissionsWhenUserIsApplicationApprover() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            offer.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(true, true, true, true));
    assertThat(response.getBody().offerRemark()).isEqualTo("Initial offer");
  }

  @Test
  void detailShouldExposeAnExistingOfferLockAfterAuthorization() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(authentication.getName()).thenReturn("idir\\reviewer2");
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    mockApplicationSpeciesGradeCode();
    when(editLockService.acquireOffer(
            81009L, "idir\\reviewer2", "idir\\reviewer2", true))
        .thenReturn(
            new ApplicationEditLockDto(
                true,
                false,
                "Reviewer One",
                "This offer is currently locked for editing by Reviewer One.",
                null));

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().locked()).isTrue();
    assertThat(response.getBody().lockedBy()).isEqualTo("Reviewer One");
    assertThat(response.getBody().lockMessage()).contains("Reviewer One");
    verify(provincialAuthorizationService).canAccessOffer(authentication, offer);
    verify(editLockService)
        .acquireOffer(81009L, "idir\\reviewer2", "idir\\reviewer2", true);
  }

  @Test
  void detailShouldReturnFullEditPermissionsForWithdrawnOfferWhenUserIsApplicationApprover() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(authentication))
        .thenReturn(List.of("LEXIS_APPLICATION_APPROVER"));
    PurchaseOfferDetailDto offer = withdrawnOfferDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            offer.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(true, true, true, true));
    assertThat(response.getBody().offerRemark()).isEqualTo("Initial offer");
  }

  @Test
  void detailShouldReturnFullEditPermissionsForAdmin() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(List.of("LEXIS_ADMIN"));
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    mockApplicationSpeciesGradeCode();

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody())
        .isEqualTo(
            offer.withApplicationContext(45.5, "FI/HE/LUM")
                .withEditPermissions(true, true, true, true));
  }

  @Test
  void detailShouldReturnNotFoundWhenScopedUserDoesNotOwnParentApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offerDetail("00077777")));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByOfferNumber(81009L);
    verify(applicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnNotFoundWhenOrganizationAuthorizationRejectsTheOffer() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));
    when(provincialAuthorizationService.canAccessOffer(authentication, offer)).thenReturn(false);

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(provincialAuthorizationService).canAccessOffer(authentication, offer);
  }

  private static PurchaseOfferDetailDto offerDetail() {
    return offerDetail("00077881");
  }

  private static PurchaseOfferDetailDto offerDetail(String offeringClientNumber) {
    return offerDetail(offeringClientNumber, null, null);
  }

  private static PurchaseOfferDetailDto withdrawnOfferDetail(String offeringClientNumber) {
    return offerDetail(offeringClientNumber, LocalDate.of(2026, 3, 5), "Buyer withdrew");
  }

  private static PurchaseOfferDetailDto offerDetail(
      String offeringClientNumber, LocalDate offerWithdrawalDate, String withdrawReason) {
    return new PurchaseOfferDetailDto(
        81009L,
        1000456L,
        "PKG-903",
        null,
        null,
        "Example Lumber",
        "Sample Contact",
        12500.25,
        LocalDate.of(2026, 3, 2),
        offerWithdrawalDate,
        LocalDate.of(2026, 3, 18),
        "N",
        "Y",
        "N",
        "Initial offer",
        withdrawReason,
        "P",
        "Mill details",
        offeringClientNumber,
        "Port Moody",
        "Condition notes",
        LocalDate.of(2026, 2, 26),
        LocalDate.of(2026, 3, 19),
        90.0,
        "R2");
  }

  private static LexisApplicationDetailDto applicationDetail(
      String ownerClientNumber, String agentClientNumber) {
    return new LexisApplicationDetailDto(
        1000456L,
        null,
        "NEW",
        "New",
        ownerClientNumber,
        agentClientNumber,
        12L,
        "R2",
        "H",
        "S",
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 2),
        null,
        180L,
        90.0,
        0.5,
        true,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(new LexisApplicationDetailDto.LexisPackageDto("PKG-903", 45.5, 12L)),
        List.of(),
        List.of());
  }

  private void mockApplicationSpeciesGradeCode() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.getApplicationSpeciesEndUseSort(1000456L))
        .thenReturn("FI/HE/LUM");
  }
}

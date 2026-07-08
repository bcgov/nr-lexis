package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
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
  @Mock private LexisApplicationService applicationService;
  @Mock private Authentication authentication;

  @InjectMocks private PurchaseOfferController controller;

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
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("offerNumber DESC");
  }

  @Test
  void searchShouldOverrideClientFilterWhenUserHasScopedForestClient() {
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

    assertThat(criteriaCaptor.getValue().clientNumber()).isEqualTo("00077881");
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

    ResponseEntity<PurchaseOfferDetailDto> response = controller.getByOfferNumber(81009L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).findByOfferNumber(81009L);
  }

  @Test
  void detailShouldReturnPayloadWhenScopedUserOwnsParentApplication() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00099999");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00077881", null)));

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(offer);
    verify(service).findByOfferNumber(81009L);
    verify(applicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnPayloadWhenScopedUserIsOfferingClient() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    PurchaseOfferDetailDto offer = offerDetail("00077881");
    when(service.findByOfferNumber(81009L)).thenReturn(Optional.of(offer));

    ResponseEntity<PurchaseOfferDetailDto> response =
        controller.getByOfferNumber(81009L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(offer);
    verify(service).findByOfferNumber(81009L);
    verifyNoInteractions(applicationService);
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

  private static PurchaseOfferDetailDto offerDetail() {
    return offerDetail("00077881");
  }

  private static PurchaseOfferDetailDto offerDetail(String offeringClientNumber) {
    return new PurchaseOfferDetailDto(
        81009L,
        1000456L,
        "PKG-903",
        "Example Lumber",
        "Alex Example",
        12500.25,
        LocalDate.of(2026, 3, 2),
        null,
        LocalDate.of(2026, 3, 18),
        "N",
        "Y",
        "N",
        "Initial offer",
        null,
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
        List.of(),
        List.of(),
        List.of());
  }
}

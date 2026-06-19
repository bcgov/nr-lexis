package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
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
@DisplayName("Unit Test | PermitController")
class PermitControllerTest {

  @Mock private ObjectProvider<PermitService> serviceProvider;
  @Mock private PermitService service;
  @Mock private LexisSessionService sessionService;
  @Mock private Authentication authentication;

  @InjectMocks private PermitController controller;

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitSearchOptionsDto dto =
        new PermitSearchOptionsDto(
            List.of(new CodeNameDto("ISS", "Issued")),
            List.of(new CodeNameDto("12", "Coast")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<PermitSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitSearchResponseDto> response =
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

    PermitSearchResponseDto dto =
        new PermitSearchResponseDto(
            List.of(
                new PermitSearchResultDto(
                    9000123L,
                    "Issued",
                    "00055667",
                    "00077881",
                    80.0,
                    LocalDate.of(2026, 3, 10),
                    "R2")),
            1,
            0,
            25);
    when(service.search(any(PermitSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<PermitSearchResponseDto> response =
        controller.search(
            "1000456",
            "PKG-903",
            "9000123",
            "2026-03-01",
            "03/31/2026",
            "ISS",
            "SI-99881",
            "00055667",
            "00077881",
            List.of(12L),
            "permitNumber DESC",
            0,
            25,
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicationNumber()).isEqualTo("1000456");
    assertThat(criteria.packageNumber()).isEqualTo("PKG-903");
    assertThat(criteria.permitNumber()).isEqualTo("9000123");
    assertThat(criteria.issuedFromDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(criteria.issuedToDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    assertThat(criteria.permitStatus()).isEqualTo("ISS");
    assertThat(criteria.invoiceNumber()).isEqualTo("SI-99881");
    assertThat(criteria.applicantClientNumber()).isEqualTo("00055667");
    assertThat(criteria.ownerClientNumber()).isEqualTo("00077881");
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("permitNumber DESC");
  }

  @Test
  void searchShouldOverrideClientFiltersWhenUserHasScopedForestClient() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(PermitSearchCriteria.class)))
        .thenReturn(new PermitSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "00099999",
        "00088888",
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<PermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PermitSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    PermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicantClientNumber()).isNull();
    assertThat(criteria.ownerClientNumber()).isEqualTo("00077881");
  }

  @Test
  void searchShouldPassKnownTotalWhenProvided() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitSearchResponseDto dto = new PermitSearchResponseDto(List.of(), 91, 2, 30);
    when(service.search(any(PermitSearchCriteria.class), eq(91))).thenReturn(dto);

    ResponseEntity<PermitSearchResponseDto> response =
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
            2,
            30,
            91,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).search(any(PermitSearchCriteria.class), eq(91));
  }

  @Test
  void detailShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitDetailDto> response = controller.getByPermitNumber(9000123L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByPermitNumber(9000123L)).thenReturn(Optional.empty());

    ResponseEntity<PermitDetailDto> response = controller.getByPermitNumber(9000123L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByPermitNumber(9000123L);
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitDetailDto dto = permitDetail("00077881", "00055667");
    when(service.findByPermitNumber(9000123L)).thenReturn(Optional.of(dto));

    ResponseEntity<PermitDetailDto> response = controller.getByPermitNumber(9000123L, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).findByPermitNumber(9000123L);
  }

  @Test
  void detailShouldReturnNotFoundWhenScopedUserDoesNotOwnPermit() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.findByPermitNumber(9000123L))
        .thenReturn(Optional.of(permitDetail("00099999", "00088888")));

    ResponseEntity<PermitDetailDto> response =
        controller.getByPermitNumber(9000123L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByPermitNumber(9000123L);
  }

  private static PermitDetailDto permitDetail(
      String ownerClientNumber, String applicantClientNumber) {
    return new PermitDetailDto(
        9000123L,
        1000456L,
        "PKG-903",
        "EX-205",
        "ISS",
        "Issued",
        applicantClientNumber,
        ownerClientNumber,
        "Example Dest Co",
        "US",
        "SEA",
        "MV Example",
        "VAN",
        null,
        LocalDate.of(2026, 3, 10),
        LocalDate.of(2026, 4, 10),
        LocalDate.of(2026, 3, 2),
        LocalDate.of(2026, 3, 15),
        80.0,
        1450L,
        "RC-12345",
        "FED-1122",
        "SI-99881",
        "Permit remarks",
        "R2");
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationValidationDto;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
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

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | FederalApplicationController")
class FederalApplicationControllerTest {

  @Mock private ObjectProvider<FederalApplicationService> serviceProvider;
  @Mock private FederalApplicationService service;

  @InjectMocks private FederalApplicationController controller;

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<FederalApplicationSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationSearchOptionsDto dto =
        new FederalApplicationSearchOptionsDto(
            List.of(new CodeNameDto("APR", "Approved")),
            List.of(new CodeNameDto("F", "Federal")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<FederalApplicationSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<FederalApplicationSearchResponseDto> response =
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
            null,
            null,
            0,
            25,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationSearchResponseDto dto =
        new FederalApplicationSearchResponseDto(
            List.of(
                new FederalApplicationSearchResultDto(
                    1000456L,
                    "FED-1000456",
                    "Approved",
                    "00077881",
                    "Federal request",
                    "Federal",
                    "EX-300",
                    LocalDate.of(2026, 2, 20),
                    LocalDate.of(2026, 2, 26),
                    true)),
            1,
            0,
            25);
    when(service.search(any(FederalApplicationSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<FederalApplicationSearchResponseDto> response =
        controller.search(
            null,
            " FED-1000456 ",
            " PKG-901 ",
            " EX-300 ",
            " APR ",
            "2026-02-20",
            "03/10/2026",
            "2026-02-26",
            null,
            " 00077881 ",
            " 00055667 ",
            0,
            25,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<FederalApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    FederalApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.federalApplicationNumber()).isEqualTo(" FED-1000456 ");
    assertThat(criteria.packageNumber()).isEqualTo(" PKG-901 ");
    assertThat(criteria.exemptionNumber()).isEqualTo(" EX-300 ");
    assertThat(criteria.applicationStatus()).isEqualTo(" APR ");
    assertThat(criteria.receivedFromDate()).isEqualTo(LocalDate.of(2026, 2, 20));
    assertThat(criteria.receivedToDate()).isEqualTo(LocalDate.of(2026, 3, 10));
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 26));
    assertThat(criteria.ownerClientNumber()).isEqualTo(" 00077881 ");
    assertThat(criteria.agentClientNumber()).isEqualTo(" 00055667 ");
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<FederalApplicationDetailDto> response = controller.getByApplicationNumber(1000456L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByApplicationNumber(1000456L);
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            "00055667",
            "00",
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of("PKG-901"),
            List.of("Reviewed"),
            List.of("OF-800"),
            null);
    when(service.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));

    ResponseEntity<FederalApplicationDetailDto> response = controller.getByApplicationNumber(1000456L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
  }

  @Test
  void permitShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FederalApplicationPermitDto dto =
        new FederalApplicationPermitDto(
            99123L,
            LocalDate.of(2026, 3, 12),
            "US",
            "SEA",
            "MV Federal",
            LocalDate.of(2026, 3, 15),
            "VAN",
            null);
    when(service.findPermitByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));

    ResponseEntity<FederalApplicationPermitDto> response = controller.getFederalPermit(1000456L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
  }

  @Test
  void verifyClientsShouldReturnValidationPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.verifyApplicationClients(List.of(1000456L, 1000999L))).thenReturn(true);

    ResponseEntity<FederalApplicationValidationDto> response =
        controller.verifyClients("1000456,1000999");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(new FederalApplicationValidationDto(true));
    verify(service).verifyApplicationClients(List.of(1000456L, 1000999L));
  }
}

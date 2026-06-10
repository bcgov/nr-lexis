package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitDetailDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.reserve.IndianReservePermitSearchResultDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.service.reserve.IndianReservePermitService;
import ca.bc.gov.mof.lexis.service.reserve.IndianReservePermitService.CreatePermitRequest;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
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
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | IndianReservePermitController")
class IndianReservePermitControllerTest {

  @Mock private ObjectProvider<IndianReservePermitService> serviceProvider;
  @Mock private IndianReservePermitService service;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;

  @InjectMocks private IndianReservePermitController controller;

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<IndianReservePermitSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    IndianReservePermitSearchOptionsDto dto =
        new IndianReservePermitSearchOptionsDto(
            List.of(new CodeNameDto("APR", "Approved")),
            List.of(new CodeNameDto("O", "Order in Council")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<IndianReservePermitSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<IndianReservePermitSearchResponseDto> response =
        controller.search(
            null,
            null,
            null,
            null,
            null,
            null,
            0,
            25);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    IndianReservePermitSearchResponseDto dto =
        new IndianReservePermitSearchResponseDto(
            List.of(
                new IndianReservePermitSearchResultDto(
                    "IR-123",
                    "00077881",
                    LocalDate.of(2026, 3, 2),
                    LocalDate.of(2026, 3, 15))),
            1,
            0,
            25);
    when(service.search(any(IndianReservePermitSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<IndianReservePermitSearchResponseDto> response =
        controller.search(
            " IR-123 ",
            " PKG-904 ",
            "2026-03-01",
            "03/31/2026",
            "2026-03-10",
            null,
            0,
            25);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<IndianReservePermitSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(IndianReservePermitSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    IndianReservePermitSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.permitNumber()).isEqualTo(" IR-123 ");
    assertThat(criteria.packageNumber()).isEqualTo(" PKG-904 ");
    assertThat(criteria.issuedFromDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(criteria.issuedToDate()).isEqualTo(LocalDate.of(2026, 3, 31));
    assertThat(criteria.shippingFromDate()).isEqualTo(LocalDate.of(2026, 3, 10));
  }

  @Test
  void detailShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<IndianReservePermitDetailDto> response = controller.getByPermitNumber("IR-123");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByPermitNumber("IR-123")).thenReturn(Optional.empty());

    ResponseEntity<IndianReservePermitDetailDto> response = controller.getByPermitNumber("IR-123");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    IndianReservePermitDetailDto dto =
        new IndianReservePermitDetailDto(
            "IR-123",
            "00077881",
            "00",
            12L,
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 3, 2),
            LocalDate.of(2026, 3, 15),
            "US",
            "SEA",
            "MV Reserve",
            "VAN",
            null,
            List.of("PKG-904"));
    when(service.findByPermitNumber("IR-123")).thenReturn(Optional.of(dto));

    ResponseEntity<IndianReservePermitDetailDto> response = controller.getByPermitNumber("IR-123");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
  }

  @Test
  void addPermitShouldReturnNoContentWhenServiceMissing() {
    TestingAuthenticationToken authentication = authorizedSaveIndianReservePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(new LinkedMultiValueMap<>(), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void addPermitShouldMapLegacyParametersAndAuthentication() {
    TestingAuthenticationToken authentication = authorizedSaveIndianReservePermit();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    PermitMutationRpcResponseDto dto =
        new PermitMutationRpcResponseDto(
            true,
            "saved",
            List.of(),
            List.of(),
            900L,
            "ACT",
            null,
            false,
            false,
            null);
    when(service.addPermit(any(CreatePermitRequest.class), org.mockito.Mockito.eq("idir\\jsmith")))
        .thenReturn(dto);

    MultiValueMap<String, String> parameters = new LinkedMultiValueMap<>();
    parameters.add("permitNumber", "111");
    parameters.add("packageNumber", "PKG-1");
    parameters.add("clientNumber", "00012345");
    parameters.add("applicationDate", "2026-04-04");
    parameters.add("permitIssueDate", "2026-04-05");
    parameters.add("estShippingDate", "2026-04-06");
    parameters.add("destinationCountry", "CA");
    parameters.add("transportTypeCode", "TRK");
    parameters.add("transportName", "Truck");
    parameters.add("portOfExport", "VAN");
    parameters.add("permitRemarks", "Ready");

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(parameters, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<CreatePermitRequest> requestCaptor =
        ArgumentCaptor.forClass(CreatePermitRequest.class);
    verify(service).addPermit(requestCaptor.capture(), org.mockito.Mockito.eq("idir\\jsmith"));
    CreatePermitRequest request = requestCaptor.getValue();
    assertThat(request.permitNumber()).isEqualTo("111");
    assertThat(request.packageNumber()).isEqualTo("PKG-1");
    assertThat(request.clientNumber()).isEqualTo("00012345");
    assertThat(request.estimatedShippingDate()).isEqualTo("2026-04-06");
    assertThat(request.remarks()).isEqualTo("Ready");
  }

  @Test
  void addPermitShouldRejectWithoutSaveAndOicActions() {
    TestingAuthenticationToken authentication = unauthorizedSaveIndianReservePermit();

    ResponseEntity<PermitMutationRpcResponseDto> response =
        controller.addPermit(new LinkedMultiValueMap<>(), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  private TestingAuthenticationToken authorizedSaveIndianReservePermit() {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "savePermit")).thenReturn(true);
    when(authorizationService.canPerformAction(roles, "viewOICApplication")).thenReturn(true);
    return authentication;
  }

  private TestingAuthenticationToken unauthorizedSaveIndianReservePermit() {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\readonly", "n/a");
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, "savePermit")).thenReturn(false);
    return authentication;
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationDetailsRpcController")
class ApplicationDetailsRpcControllerTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ApplicationDetailsRpcService service;
  @Mock private ClientLookupService clientLookupService;

  private ApplicationDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller = new ApplicationDetailsRpcController(serviceProvider, clientLookupServiceProvider);
  }

  @Test
  void documentDetailsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void documentDetailsShouldMapServiceResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(
            List.of(new ApplicationDetailsRpcService.DocumentItem(7L, "test.pdf", "Not on file", "Uploaded")));

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).id()).isEqualTo(7L);
    assertThat(response.getBody().get(0).name()).isEqualTo("test.pdf");
    verify(service).getDocumentDetails(1000456L);
  }

  @Test
  void getDocumentShouldReturnAttachmentPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocument(55L))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.DocumentContent("test-content".getBytes())));

    ResponseEntity<byte[]> response = controller.getDocument("55", "../unsafe/path/test.pdf");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentDisposition().isAttachment()).isTrue();
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("test.pdf");
    assertThat(response.getBody()).isNotNull();
    assertThat(new String(response.getBody())).isEqualTo("test-content");
    verify(service).getDocument(55L);
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeDocument(55L);
  }

  @Test
  void getRemarkShouldReturnNotFoundWhenRemarkMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemark(999L)).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.GetRemarkResponseDto> response =
        controller.getRemark("999");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isTrue();
    verify(service).getRemark(999L);
  }

  @Test
  void persistRemarkShouldReturnOkStatus() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    Instant now = Instant.parse("2026-05-27T17:00:00Z");
    when(service.persistRemark("new", 1000456L, "Long remark", "idir\\jsmith"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.PersistedRemark(
                    44L, "Long remark", "Long remark", "idir\\jsmith", now)));

    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("ok");
    assertThat(response.getBody().remarkId()).isEqualTo(44L);
    assertThat(response.getBody().user()).isEqualTo("idir\\jsmith");
    verify(service).persistRemark("new", 1000456L, "Long remark", "idir\\jsmith");
  }

  @Test
  void addApplicationLegacyShouldMapAliasesAndReturnLegacyPersistencePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "The application was saved successfully.", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationDate", "2026-03-01");
    params.add("exemptionTerm", "30");
    params.add("receivedDate", "2026-03-02");
    params.add("applicationVolume", "125.5");
    params.add("averageLogVolume", "2.4");
    params.add("productLocation", "Camp 1");
    params.add("applicantClientNumber", "00022222");
    params.add("agentClientLocationCode", "01");
    params.add("ownerClientNumber", "00011111");
    params.add("ownerClientLocationCode", "02");
    params.add("exemptionTypeCode", "U");
    params.add("applicantType", "A");
    params.add("region", "11");
    params.add("productTypeCode", "H");
    params.add("growthTypeCode", "O");
    params.add("ownerContactName", "Owner Contact");

    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().applicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service).addApplication(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.CreateApplicationRequest request = requestCaptor.getValue();
    assertThat(request.applicationDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.receivedDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.agentClientNumber()).isEqualTo("00022222");
    assertThat(request.exemptionReasonCode()).isEqualTo("U");
    assertThat(request.productTypeCode()).isEqualTo("H");
  }

  @Test
  void getClientDataLegacyShouldReturnLegacyClientPayload() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00077881",
                    "Acme Forestry",
                    "123 Main St",
                    "Victoria",
                    "BC",
                    "V8W 1A1",
                    "CA",
                    "250-555-0100",
                    "250-555-0199",
                    "contact@example.com")));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().clientNumber()).isEqualTo("00077881");
    assertThat(response.getBody().companyName()).isEqualTo("Acme Forestry");
    assertThat(response.getBody().notfound()).isNull();
    verify(clientLookupService).getClientData("77881", "00");
  }

  @Test
  void getClientDataLegacyShouldReturnNotFoundFlagWhenClientMissing() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00")).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isEqualTo("true");
  }

  @Test
  void getClientLocationsLegacyShouldMarkSavedLocationSelected() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientLocations("22222"))
        .thenReturn(
            List.of(
                new ClientLookupService.ClientLocation("Main Office", "01", false),
                new ClientLookupService.ClientLocation("Reload Yard", "02", false)));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientLocationResponseDto>>
        response = controller.getClientLocationsLegacy("22222", "1000456", "agent");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::locationCode,
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::selected)
        .containsExactly(tuple("01", true), tuple("02", false));
  }

  @Test
  void getContactsForLocationLegacyShouldPreferSavedApplicationContactAndIncludeClientData() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientData("11111", "02"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00011111",
                    "Owner Forestry",
                    "456 Forest Rd",
                    "Nanaimo",
                    "BC",
                    "V9R 1A1",
                    "CA",
                    "250-555-0200",
                    null,
                    "owner@example.com")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    ApplicationDetailsRpcController.ApplicationClientContactResponseDto contact =
        response.getBody().get(0);
    assertThat(contact.contactName()).isEqualTo("Owner Contact");
    assertThat(contact.contactId()).isEqualTo("-1");
    assertThat(contact.clientNumber()).isEqualTo("00011111");
    assertThat(contact.companyName()).isEqualTo("Owner Forestry");
    verify(clientLookupService).getClientData("11111", "02");
  }

  @Test
  void getContactsForLocationLegacyShouldFallbackToClientContacts() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L)).thenReturn(Optional.empty());
    when(clientLookupService.getContactsForLocation("11111", "02"))
        .thenReturn(List.of(new ClientLookupService.ClientContact("Fallback Contact", "22")));
    when(clientLookupService.getClientData("11111", "02")).thenReturn(Optional.empty());

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).contactName()).isEqualTo("Fallback Contact");
    assertThat(response.getBody().get(0).contactId()).isEqualTo("22");
    verify(clientLookupService).getContactsForLocation("11111", "02");
  }
}

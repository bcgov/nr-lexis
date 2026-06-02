package ca.bc.gov.mof.lexis.service.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository.ClientLocationRow;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleClientLookupService")
class OracleClientLookupServiceTest {

  @Mock private ClientLookupRepository repository;

  @InjectMocks private OracleClientLookupService service;

  @Test
  void getClientDataShouldPadClientNumberAndMapFields() {
    when(repository.findLocationByClientNumberCode("00077881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLocationRow(
                    "00077881",
                    "00",
                    "Main",
                    "Acme Forestry",
                    "123 Main St",
                    null,
                    null,
                    "Victoria",
                    "BC",
                    "V8W1A1",
                    "CA",
                    "250-555-0100",
                    "250-555-0199",
                    "user@example.com")));

    Optional<ClientLookupService.ClientData> response = service.getClientData("77881", null);

    assertThat(response).isPresent();
    assertThat(response.get().clientNumber()).isEqualTo("00077881");
    assertThat(response.get().companyName()).isEqualTo("Acme Forestry");
    assertThat(response.get().address()).isEqualTo("123 Main St");
    verify(repository).findLocationByClientNumberCode("00077881", "00");
  }

  @Test
  void getClientLocationsShouldReturnPlaceholderWhenNoLocationsFound() {
    when(repository.findLocationsByClientNumber("00077881")).thenReturn(List.of());

    List<ClientLookupService.ClientLocation> response = service.getClientLocations("77881");

    assertThat(response).hasSize(1);
    assertThat(response.get(0).locationCode()).isEqualTo("0");
    assertThat(response.get(0).locationName()).isEqualTo("No locations on file");
  }

  @Test
  void getContactsForLocationShouldPadClientNumberAndMapContacts() {
    when(repository.findContactsByClientNumberCode("00077881", "00"))
        .thenReturn(List.of(new ClientLookupRepository.ClientContactRow("Jane Smith", "123")));

    List<ClientLookupService.ClientContact> response =
        service.getContactsForLocation("77881", "00");

    assertThat(response).hasSize(1);
    assertThat(response.get(0).contactName()).isEqualTo("Jane Smith");
    assertThat(response.get(0).contactId()).isEqualTo("123");
    verify(repository).findContactsByClientNumberCode("00077881", "00");
  }

  @Test
  void getContactsForLocationShouldReturnPlaceholderWhenNoContactsFound() {
    when(repository.findContactsByClientNumberCode("00077881", "00")).thenReturn(List.of());

    List<ClientLookupService.ClientContact> response =
        service.getContactsForLocation("77881", "00");

    assertThat(response).hasSize(1);
    assertThat(response.get(0).contactId()).isEqualTo("0");
    assertThat(response.get(0).contactName()).isEqualTo("No contacts on file for this location");
  }
}

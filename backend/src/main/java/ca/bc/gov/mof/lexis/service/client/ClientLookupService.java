package ca.bc.gov.mof.lexis.service.client;

import java.util.List;
import java.util.Optional;

public interface ClientLookupService {

  Optional<ClientData> getClientData(String clientNumber, String locationCode);

  /** Uses a required backing lookup so dependency failures cannot look like an unknown client. */
  Optional<ClientData> getClientDataRequired(String clientNumber, String locationCode);

  List<ClientLocation> getClientLocations(String clientNumber);

  List<ClientContact> getContactsForLocation(String clientNumber, String locationCode);

  /** Returns at most fifteen name or client-number matches for the authorized search scope. */
  List<ClientSuggestion> findClientSuggestions(
      String searchTerm, boolean federalOnly, String allowedClientNumber);

  record ClientData(
      String clientNumber,
      String companyName,
      String address,
      String city,
      String province,
      String postalCode,
      String country,
      String phone,
      String fax,
      String email) {}

  record ClientLocation(String locationName, String locationCode, boolean selected) {}

  record ClientContact(String contactName, String contactId) {}

  record ClientSuggestion(String clientNumber, String companyName, String clientAcronym) {}
}

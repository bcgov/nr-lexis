package ca.bc.gov.mof.lexis.service.client;

import java.util.List;
import java.util.Optional;

public interface ClientLookupService {

  Optional<ClientData> getClientData(String clientNumber, String locationCode);

  List<ClientLocation> getClientLocations(String clientNumber);

  List<ClientContact> getContactsForLocation(String clientNumber, String locationCode);

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
}

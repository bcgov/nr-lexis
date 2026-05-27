package ca.bc.gov.mof.lexis.service.client;

import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository.ClientLocationRow;
import java.util.List;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleClientLookupService implements ClientLookupService {

  private static final String NOT_ON_FILE = "Not on file";

  private final ClientLookupRepository repository;

  public OracleClientLookupService(ClientLookupRepository repository) {
    this.repository = repository;
  }

  @Override
  public Optional<ClientData> getClientData(String clientNumber, String locationCode) {
    String normalizedClientNumber = normalizeClientNumber(clientNumber);
    if (normalizedClientNumber == null) {
      return Optional.empty();
    }

    String normalizedLocationCode = trimToNull(locationCode);
    if (normalizedLocationCode == null) {
      normalizedLocationCode = "00";
    }

    return repository
        .findLocationByClientNumberCode(normalizedClientNumber, normalizedLocationCode)
        .map(this::toClientData);
  }

  @Override
  public List<ClientLocation> getClientLocations(String clientNumber) {
    String normalizedClientNumber = normalizeClientNumber(clientNumber);
    if (normalizedClientNumber == null) {
      return List.of(new ClientLocation("No locations on file", "0", false));
    }

    List<ClientLocation> locations =
        repository.findLocationsByClientNumber(normalizedClientNumber).stream()
            .map(this::toClientLocation)
            .toList();

    if (locations.isEmpty()) {
      return List.of(new ClientLocation("No locations on file", "0", false));
    }
    return locations;
  }

  private ClientData toClientData(ClientLocationRow row) {
    return new ClientData(
        replaceEmptyField(row.clientNumber()),
        replaceEmptyField(row.companyName()),
        replaceEmptyField(buildAddress(row)),
        replaceEmptyField(row.city()),
        replaceEmptyField(row.province()),
        replaceEmptyField(row.postalCode()),
        replaceEmptyField(row.country()),
        replaceEmptyField(row.businessPhone()),
        replaceEmptyField(row.faxNumber()),
        replaceEmptyField(row.emailAddress()));
  }

  private ClientLocation toClientLocation(ClientLocationRow row) {
    String code = trimToNull(row.clientLocationCode());
    if (code == null) {
      code = "0";
    }

    String name = trimToNull(row.clientLocationName());
    String locationName = name == null ? code : code + " - " + name;
    return new ClientLocation(locationName, code, false);
  }

  private String buildAddress(ClientLocationRow row) {
    StringBuilder address = new StringBuilder();
    appendAddressPart(address, row.address1());
    appendAddressPart(address, row.address2());
    appendAddressPart(address, row.address3());
    return address.toString();
  }

  private void appendAddressPart(StringBuilder address, String value) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return;
    }
    if (!address.isEmpty()) {
      address.append(' ');
    }
    address.append(normalized);
  }

  private String replaceEmptyField(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? NOT_ON_FILE : normalized;
  }

  private String normalizeClientNumber(String clientNumber) {
    String normalized = trimToNull(clientNumber);
    if (normalized == null) {
      return null;
    }
    return normalized.length() >= 8 ? normalized : "0".repeat(8 - normalized.length()) + normalized;
  }

  private String trimToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}

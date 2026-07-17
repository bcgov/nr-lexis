package ca.bc.gov.mof.lexis.service.reference;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.ShippingReferenceOptionsDto;
import ca.bc.gov.mof.lexis.repository.reference.ShippingReferenceRepository;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class ShippingReferenceService {

  private final ShippingReferenceRepository repository;

  public ShippingReferenceService(ShippingReferenceRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public ShippingReferenceOptionsDto findActiveOptionsRequired() {
    return new ShippingReferenceOptionsDto(
        validateOptions("country", 2, repository.findActiveCountriesRequired()),
        validateOptions("transport type", 1, repository.findActiveTransportTypesRequired()),
        validateOptions("port", 2, repository.findActivePortsRequired()).stream()
            .sorted(
                Comparator.comparing(CodeNameDto::name, String.CASE_INSENSITIVE_ORDER)
                    .thenComparing(CodeNameDto::code))
            .toList());
  }

  private List<CodeNameDto> validateOptions(
      String optionType, int requiredCodeLength, List<CodeNameDto> options) {
    if (options == null || options.isEmpty()) {
      throw new DataRetrievalFailureException(
          "LEXIS returned no active " + optionType + " shipping reference options.");
    }

    Set<String> seenCodes = new HashSet<>();
    return options.stream()
        .map(
            option -> {
              String code = option == null ? null : TextUtils.trimToNull(option.code());
              String name = option == null ? null : TextUtils.trimToNull(option.name());
              if (code == null || code.length() != requiredCodeLength || name == null) {
                throw new DataRetrievalFailureException(
                    "LEXIS returned an invalid " + optionType + " shipping reference option.");
              }
              String normalizedCode = code.toUpperCase(Locale.ROOT);
              if (!seenCodes.add(normalizedCode)) {
                throw new DataRetrievalFailureException(
                    "LEXIS returned duplicate " + optionType + " shipping reference code "
                        + normalizedCode
                        + ".");
              }
              return new CodeNameDto(normalizedCode, name);
            })
        .toList();
  }
}

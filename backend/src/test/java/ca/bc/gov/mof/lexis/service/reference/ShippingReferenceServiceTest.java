package ca.bc.gov.mof.lexis.service.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.repository.reference.ShippingReferenceRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataRetrievalFailureException;

@ExtendWith(MockitoExtension.class)
class ShippingReferenceServiceTest {

  @Mock private ShippingReferenceRepository repository;

  private ShippingReferenceService service;

  @BeforeEach
  void setUp() {
    service = new ShippingReferenceService(repository);
  }

  @Test
  void shouldPreserveConfiguredOrderingAndSortUnorderedPorts() {
    when(repository.findActiveCountriesRequired())
        .thenReturn(
            List.of(
                new CodeNameDto("US", "United States"),
                new CodeNameDto("CA", "Canada")));
    when(repository.findActiveTransportTypesRequired())
        .thenReturn(List.of(new CodeNameDto("T", "Truck"), new CodeNameDto("S", "Ship")));
    when(repository.findActivePortsRequired())
        .thenReturn(
            List.of(
                new CodeNameDto("ZZ", "Zeballos"),
                new CodeNameDto("VA", "Vancouver"),
                new CodeNameDto("OT", "Other")));

    var result = service.findActiveOptionsRequired();

    assertThat(result.countries()).extracting(CodeNameDto::code).containsExactly("US", "CA");
    assertThat(result.transportTypes()).extracting(CodeNameDto::code).containsExactly("T", "S");
    assertThat(result.ports()).extracting(CodeNameDto::code).containsExactly("OT", "VA", "ZZ");
  }

  @Test
  void shouldFailClosedWhenAnyRequiredOptionListIsEmpty() {
    when(repository.findActiveCountriesRequired()).thenReturn(List.of());

    assertThatThrownBy(service::findActiveOptionsRequired)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("no active country");
  }

  @Test
  void shouldFailClosedForInvalidOrDuplicateCodes() {
    when(repository.findActiveCountriesRequired())
        .thenReturn(
            List.of(
                new CodeNameDto(" us ", " United States "),
                new CodeNameDto("US", "Duplicate")));

    assertThatThrownBy(service::findActiveOptionsRequired)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("duplicate country");
  }
}

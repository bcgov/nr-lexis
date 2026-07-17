package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.ShippingReferenceOptionsDto;
import ca.bc.gov.mof.lexis.service.reference.ShippingReferenceService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;

class ShippingReferenceControllerTest {

  @Test
  void shouldReturnRequiredOracleOptions() {
    @SuppressWarnings("unchecked")
    ObjectProvider<ShippingReferenceService> provider = mock(ObjectProvider.class);
    ShippingReferenceService service = mock(ShippingReferenceService.class);
    ShippingReferenceOptionsDto options =
        new ShippingReferenceOptionsDto(
            List.of(new CodeNameDto("US", "United States")),
            List.of(new CodeNameDto("S", "Ship")),
            List.of(new CodeNameDto("VA", "Vancouver")));
    when(provider.getIfAvailable()).thenReturn(service);
    when(service.findActiveOptionsRequired()).thenReturn(options);

    var response = new ShippingReferenceController(provider).getActiveOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(options);
  }

  @Test
  void shouldFailClosedWhenOracleServiceIsUnavailable() {
    @SuppressWarnings("unchecked")
    ObjectProvider<ShippingReferenceService> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(null);

    var response = new ShippingReferenceController(provider).getActiveOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getBody()).isNull();
  }
}

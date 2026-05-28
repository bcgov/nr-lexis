package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.fee.FeePermitSummaryDto;
import ca.bc.gov.mof.lexis.service.fee.FeeDetailsService;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | FeeDetailsController")
class FeeDetailsControllerTest {

  @Mock private ObjectProvider<FeeDetailsService> serviceProvider;
  @Mock private FeeDetailsService service;

  @InjectMocks private FeeDetailsController controller;

  @Test
  void permitSummaryShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<FeePermitSummaryDto> response = controller.permitSummary(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void permitSummaryShouldReturnNotFoundWhenPermitMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPermitSummary(7000123L)).thenReturn(Optional.empty());

    ResponseEntity<FeePermitSummaryDto> response = controller.permitSummary(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).getPermitSummary(7000123L);
  }

  @Test
  void permitSummaryShouldReturnPayloadWhenPermitExists() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    FeePermitSummaryDto payload =
        new FeePermitSummaryDto(7000123L, "EX-205", 95.0, 28L, 95.0, "RCT-991");
    when(service.getPermitSummary(7000123L)).thenReturn(Optional.of(payload));

    ResponseEntity<FeePermitSummaryDto> response = controller.permitSummary(7000123L);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(service).getPermitSummary(7000123L);
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
class RtmEmsLogAmvControllerTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC);

  @Mock private ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  @Mock private RtmEmsLogAmvService service;

  @Test
  void saveShouldDelegateFutureEffectiveDate() {
    RtmEmsLogAmvSaveRequestDto request = request("2026-07-01", "2026-07-01");
    RtmEmsLogAmvMutationResultDto result =
        new RtmEmsLogAmvMutationResultDto("accepted", "Save completed.", List.of(), List.of());
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.save(request)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response = controller().save(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).save(request);
  }

  @Test
  void saveShouldRejectPastEffectiveDateBeforeInvokingService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response =
        controller().save(request("2026-06-01", "2026-06-22"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("validation_failed");
    assertThat(response.getBody().errors()).containsExactly("Past effective dates are read-only.");
    verify(service, never()).save(any());
  }

  @Test
  void createShouldRejectPastRetrievalDateBeforeInvokingService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    RtmEmsLogAmvSaveRequestDto request =
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-06-22", null, new BigDecimal("10.01"), "create");

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response = controller().save(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors()).containsExactly("Past effective dates are read-only.");
    verify(service, never()).save(any());
  }

  private RtmEmsLogAmvSaveRequestDto request(String retrievalDate, String updateDate) {
    return new RtmEmsLogAmvSaveRequestDto(
        "BA", "A", "O", retrievalDate, updateDate, new BigDecimal("10.01"), "update");
  }

  private RtmEmsLogAmvController controller() {
    return new RtmEmsLogAmvController(serviceProvider, FIXED_CLOCK);
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.math.BigDecimal;
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

  @Mock private ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  @Mock private RtmEmsLogAmvService service;

  @Test
  void findShouldLoadLatestRowsBeforeEffectiveDate() {
    List<RtmEmsLogAmvRowDto> rows = List.of();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findLatestBefore("2026-07-01")).thenReturn(rows);

    ResponseEntity<List<RtmEmsLogAmvRowDto>> response =
        controller().find(null, null, null, null, "2026-07-01");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(rows);
    verify(service).findLatestBefore("2026-07-01");
  }

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
  void saveShouldDelegatePastEffectiveDate() {
    RtmEmsLogAmvSaveRequestDto request = request("2026-06-01", "2026-06-22");
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
  void createShouldDelegatePastRetrievalDate() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    RtmEmsLogAmvSaveRequestDto request =
        new RtmEmsLogAmvSaveRequestDto(
            "BA", "A", "O", "2026-06-22", null, new BigDecimal("10.01"), "create");
    RtmEmsLogAmvMutationResultDto result =
        new RtmEmsLogAmvMutationResultDto("accepted", "Save completed.", List.of(), List.of());
    when(service.save(request)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response = controller().save(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).save(request);
  }

  private RtmEmsLogAmvSaveRequestDto request(String retrievalDate, String updateDate) {
    return new RtmEmsLogAmvSaveRequestDto(
        "BA", "A", "O", retrievalDate, updateDate, new BigDecimal("10.01"), "update");
  }

  private RtmEmsLogAmvController controller() {
    return new RtmEmsLogAmvController(serviceProvider);
  }
}

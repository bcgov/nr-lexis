package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvBatchSaveRequestDto;
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
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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
  void findShouldPropagateAuthoritativeDatabaseFailure() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findLatestBefore("2026-07-01"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () -> controller().find(null, null, null, null, "2026-07-01"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void authoritativeDatabaseFailureShouldUsePublicSafe503Contract() throws Exception {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findLatestBefore("2026-07-01"))
        .thenThrow(
            new DataAccessResourceFailureException(
                "ORA failure for private-business-id=123"));
    MockMvc mockMvc =
        MockMvcBuilders.standaloneSetup(controller())
            .setControllerAdvice(new LexisApiExceptionHandler())
            .build();

    mockMvc
        .perform(get("/api/lexis/rtm/emslogamv").param("latestBeforeDate", "2026-07-01"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.title").value("Service temporarily unavailable"))
        .andExpect(
            jsonPath("$.detail")
                .value("LEXIS could not complete the request. Please try again later."));
  }

  @Test
  void findShouldFailWhenAuthoritativeServiceIsMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    assertThatThrownBy(() -> controller().find(null, null, null, null, null))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("The authoritative RTM AMV service is temporarily unavailable.");
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
  void saveBatchShouldDelegateTheFullGridSubmission() {
    RtmEmsLogAmvSaveRequestDto value = request("2026-07-01", "2026-07-01");
    RtmEmsLogAmvBatchSaveRequestDto request = new RtmEmsLogAmvBatchSaveRequestDto(List.of(value));
    RtmEmsLogAmvMutationResultDto result =
        new RtmEmsLogAmvMutationResultDto("accepted", "Saved grid.", List.of(), List.of());
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.saveBatch(request.values())).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response = controller().saveBatch(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).saveBatch(request.values());
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

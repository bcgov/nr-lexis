package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvBatchSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class RtmEmsLogAmvControllerTest {

  private static final String RTM_AMV_AUDIT_LOGGER = "ca.bc.gov.mof.lexis.audit.rtm";

  @Mock private ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  @Mock private RtmEmsLogAmvService service;
  @Mock private LexisPrincipalService principalService;
  @Mock private Authentication authentication;
  private Logger auditLogger;
  private Level originalAuditLevel;
  private ListAppender<ILoggingEvent> auditAppender;

  @BeforeEach
  void setUpAuditLogger() {
    auditLogger = (Logger) LoggerFactory.getLogger(RTM_AMV_AUDIT_LOGGER);
    originalAuditLevel = auditLogger.getLevel();
    auditLogger.setLevel(Level.INFO);
    auditAppender = new ListAppender<>();
    auditAppender.start();
    auditLogger.addAppender(auditAppender);
  }

  @AfterEach
  void tearDownAuditLogger() {
    auditLogger.detachAppender(auditAppender);
    auditAppender.stop();
    auditLogger.setLevel(originalAuditLevel);
  }

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
  void saveBatchShouldDelegateTheFullGridSubmission() {
    RtmEmsLogAmvSaveRequestDto value = request("2026-07-01", "2026-07-01");
    RtmEmsLogAmvBatchSaveRequestDto request = new RtmEmsLogAmvBatchSaveRequestDto(List.of(value));
    RtmEmsLogAmvMutationResultDto result =
        new RtmEmsLogAmvMutationResultDto("accepted", "Saved grid.", List.of(), List.of());
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\rtm-admin");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.saveBatch(request.values())).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response =
        controller().saveBatch(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).saveBatch(request.values());
  }

  @Test
  void saveBatchShouldAuditAuthenticatedActorAndPhysicalWriteCount() {
    RtmEmsLogAmvSaveRequestDto value = request("2026-07-01", "2026-07-01");
    RtmEmsLogAmvBatchSaveRequestDto request = new RtmEmsLogAmvBatchSaveRequestDto(List.of(value));
    RtmEmsLogAmvMutationResultDto result =
        new RtmEmsLogAmvMutationResultDto(
            "accepted",
            "Saved grid.",
            List.of(),
            List.of(
                new RtmEmsLogAmvRowDto(
                    "BA", "A", "O", "2026-07-01", "2026-07-01", null, null, "0"),
                new RtmEmsLogAmvRowDto(
                    "BA", "A", "S", "2026-07-01", "2026-07-01", null, null, "0")));
    when(principalService.resolvePrincipalName(authentication))
        .thenReturn("idir\\rtm-admin\nforged=true");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.saveBatch(request.values())).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response =
        controller().saveBatch(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(auditAppender.list)
        .singleElement()
        .extracting(ILoggingEvent::getFormattedMessage)
        .asString()
        .contains("event=lexis_rtm_amv_batch")
        .contains("actor=idir\\rtm-admin_forged_true")
        .contains("serverTimestamp=")
        .contains("status=200")
        .contains("outcome=accepted")
        .contains("requestedLogicalCells=1")
        .contains("writtenPhysicalRows=2")
        .doesNotContain("forged=true");
  }

  @Test
  void saveBatchShouldFailClosedWhenStableActorCannotBeResolved() {
    RtmEmsLogAmvBatchSaveRequestDto request =
        new RtmEmsLogAmvBatchSaveRequestDto(List.of(request("2026-07-01", "2026-07-01")));
    when(principalService.resolvePrincipalName(authentication)).thenReturn(null);

    ResponseEntity<RtmEmsLogAmvMutationResultDto> response =
        controller().saveBatch(request, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    assertThat(response.getBody()).isNull();
    verifyNoInteractions(serviceProvider, service);
    assertThat(auditAppender.list)
        .singleElement()
        .extracting(ILoggingEvent::getFormattedMessage)
        .asString()
        .contains("event=lexis_rtm_amv_batch")
        .contains("actor=UNRESOLVED")
        .contains("serverTimestamp=")
        .contains("status=403")
        .contains("outcome=identity_rejected")
        .contains("requestedLogicalCells=1")
        .contains("writtenPhysicalRows=0");
  }

  @Test
  void saveBatchShouldAuditDatabaseFailureBeforePropagatingIt() {
    RtmEmsLogAmvBatchSaveRequestDto request =
        new RtmEmsLogAmvBatchSaveRequestDto(List.of(request("2026-07-01", "2026-07-01")));
    when(principalService.resolvePrincipalName(authentication)).thenReturn("idir\\rtm-admin");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.saveBatch(request.values()))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> controller().saveBatch(request, authentication))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    assertThat(auditAppender.list)
        .singleElement()
        .extracting(ILoggingEvent::getFormattedMessage)
        .asString()
        .contains("event=lexis_rtm_amv_batch")
        .contains("actor=idir\\rtm-admin")
        .contains("status=503")
        .contains("outcome=database_unavailable")
        .contains("requestedLogicalCells=1")
        .contains("writtenPhysicalRows=0");
  }

  private RtmEmsLogAmvSaveRequestDto request(String retrievalDate, String updateDate) {
    return new RtmEmsLogAmvSaveRequestDto(
        "BA", "A", "O", retrievalDate, updateDate, new BigDecimal("10.01"), "update");
  }

  private RtmEmsLogAmvController controller() {
    return new RtmEmsLogAmvController(serviceProvider, principalService);
  }
}

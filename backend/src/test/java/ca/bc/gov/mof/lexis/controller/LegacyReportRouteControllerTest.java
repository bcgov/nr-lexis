package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
class LegacyReportRouteControllerTest {

  @Mock private LexisReportController reportController;

  @Test
  void shouldReturnNoContentForViewAction() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/lexis/offerReport");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of("actionMapping", "view"),
            new LinkedMultiValueMap<>(Map.of("actionMapping", java.util.List.of("view"))),
            request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(reportController);
  }

  @Test
  void shouldDelegateGenerateWithExplicitPdfFormat() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/offerReport.do");

    when(reportController.offerReport(any())).thenReturn(ResponseEntity.ok(new byte[] {1, 2, 3}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("outputFormat", "PDF");
    multi.add("clientNumber", "1234567");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "outputFormat", "PDF",
                "clientNumber", "1234567"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).offerReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("PDF");
    assertThat(delegated.parameters()).containsEntry("clientNumber", "1234567");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void shouldDefaultGenerateToCsvAndJoinMultiValueRegion() {
    LegacyReportRouteController controller = new LegacyReportRouteController(reportController);
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/teacReport");

    when(reportController.teacReport(any())).thenReturn(ResponseEntity.ok(new byte[] {9, 9}));

    MultiValueMap<String, String> multi = new LinkedMultiValueMap<>();
    multi.add("actionMapping", "generate");
    multi.add("region", "1904");
    multi.add("region", "1905");
    multi.add("exportSchedule", "12345");

    ResponseEntity<byte[]> response =
        controller.legacyReport(
            Map.of(
                "actionMapping", "generate",
                "exportSchedule", "12345"),
            multi,
            request);

    ArgumentCaptor<LexisReportRequestDto> requestCaptor =
        ArgumentCaptor.forClass(LexisReportRequestDto.class);
    verify(reportController).teacReport(requestCaptor.capture());

    LexisReportRequestDto delegated = requestCaptor.getValue();
    assertThat(delegated.format()).isEqualTo("CSV");
    assertThat(delegated.parameters()).containsEntry("region", "1904,1905");
    assertThat(delegated.parameters()).containsEntry("exportSchedule", "12345");
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
  }
}

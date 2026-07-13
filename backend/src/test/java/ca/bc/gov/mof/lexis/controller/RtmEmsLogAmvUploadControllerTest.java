package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
class RtmEmsLogAmvUploadControllerTest {

  @Mock private ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  @Mock private RtmEmsLogAmvService service;

  @Test
  void previewShouldRetainWorkbookDelegation() {
    MultipartFile file = sampleWorkbook();
    RtmEmsLogAmvUploadPreviewDto result =
        new RtmEmsLogAmvUploadPreviewDto(
            "accepted",
            "template.xlsx",
            file.getSize(),
            "File parsed for preview.",
            1,
            "2026-06-01",
            "2026-07-01",
            List.of(),
            List.of(),
            List.of());
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.previewUpload(file)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadPreviewDto> response =
        controller().previewUpload(file, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).previewUpload(file);
  }

  @Test
  void uploadShouldRetainWorkbookDelegation() {
    MultipartFile file = sampleWorkbook();
    RtmEmsLogAmvUploadResultDto result =
        new RtmEmsLogAmvUploadResultDto(
            "accepted", "template.xlsx", file.getSize(), "Upload completed.", 1, 1, List.of(), List.of(), List.of());
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.upload(file)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadResultDto> response = controller().upload(file, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).upload(file);
  }

  @Test
  void previewShouldFailWhenAuthoritativeServiceIsMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    assertThatThrownBy(() -> controller().previewUpload(sampleWorkbook(), null))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("The authoritative RTM AMV service is temporarily unavailable.");
  }

  private RtmEmsLogAmvUploadController controller() {
    return new RtmEmsLogAmvUploadController(serviceProvider);
  }

  private MultipartFile sampleWorkbook() {
    return new MockMultipartFile(
        "file",
        "template.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content".getBytes(StandardCharsets.UTF_8));
  }
}

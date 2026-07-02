package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

@ExtendWith(MockitoExtension.class)
class RtmEmsLogAmvControllerTest {

  @Mock private ObjectProvider<RtmEmsLogAmvService> serviceProvider;
  @Mock private RtmEmsLogAmvService service;

  @Test
  void previewShouldReturnAcceptedWorkbookResultWithoutMetadata() {
    MultipartFile file = sampleWorkbook();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
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
    when(service.previewUpload(file)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadPreviewDto> response =
        controller().previewUpload(file, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).previewUpload(file);
  }

  @Test
  void uploadShouldDelegateToServiceWithoutMetadataRequirement() {
    MultipartFile file = sampleWorkbook();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    RtmEmsLogAmvUploadResultDto result =
        new RtmEmsLogAmvUploadResultDto(
            "accepted", "template.xlsx", file.getSize(), "Upload completed.", 1, 1, List.of(), List.of(), List.of());
    when(service.upload(file, null, null)).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadResultDto> response = controller().upload(file, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).upload(file, null, null);
  }

  @Test
  void uploadShouldStillRejectMissingFileBeforePersisting() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ResponseEntity<RtmEmsLogAmvUploadResultDto> response = controller().upload(null, null, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors()).contains("No file provided.");
  }

  private RtmEmsLogAmvController controller() {
    return new RtmEmsLogAmvController(serviceProvider);
  }

  private MultipartFile sampleWorkbook() {
    return new MockMultipartFile(
        "file",
        "template.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content".getBytes(StandardCharsets.UTF_8));
  }
}

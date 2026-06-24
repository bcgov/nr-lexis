package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
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
  void previewShouldReturnAcceptedWorkbookResult() {
    MultipartFile file = sampleWorkbook();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    RtmEmsLogAmvUploadPreviewDto result =
        new RtmEmsLogAmvUploadPreviewDto(
            "accepted", "template.xlsx", file.getSize(), "File parsed for preview.", 1, List.of(), List.of());
    when(service.previewUpload(file))
        .thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadPreviewDto> response =
        controller().previewUpload(file, null, "202601", "S");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).previewUpload(file);
  }

  @Test
  void uploadShouldRejectInvalidMetadataBeforePersisting() {
    MultipartFile file = sampleWorkbook();
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ResponseEntity<RtmEmsLogAmvUploadResultDto> response =
        controller().upload(file, null, "bad-date", "S");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().errors()).contains("Retrieval date must be a valid date.");
    verifyNoInteractions(service);
  }

  @Test
  void uploadShouldDelegateToServiceAfterControllerValidation() {
    MultipartFile file = sampleWorkbook();
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    RtmEmsLogAmvUploadResultDto result =
        new RtmEmsLogAmvUploadResultDto(
            "accepted", "template.xlsx", file.getSize(), "Upload completed.", 1, 1, List.of(), List.of(), List.of());
    when(service.upload(file, "2026-01-01", "S")).thenReturn(result);

    ResponseEntity<RtmEmsLogAmvUploadResultDto> response =
        controller().upload(file, null, "2026-01-01", "S");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
    verify(service).upload(file, "2026-01-01", "S");
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

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.upload.UploadErrorResponseDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

@DisplayName("Unit Test | LexisUploadExceptionHandler")
class LexisUploadExceptionHandlerTest {

  private final LexisUploadExceptionHandler handler = new LexisUploadExceptionHandler();

  @Test
  void handleMaxUploadSizeExceededShouldReturnPlainLanguagePayload() {
    ResponseEntity<UploadErrorResponseDto> response =
        handler.handleMaxUploadSizeExceeded(new MaxUploadSizeExceededException(1_024L));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("The selected file is too large. Choose a smaller file and try again.");
    assertThat(response.getBody().errors())
        .containsExactly("The selected file is too large. Choose a smaller file and try again.");
  }

  @Test
  void handleMultipartExceptionShouldDetectNestedSizeFailures() {
    ResponseEntity<UploadErrorResponseDto> response =
        handler.handleMultipartException(
            new MultipartException(
                "Failed to parse multipart servlet request",
                new MaxUploadSizeExceededException(1_024L)));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("The selected file is too large. Choose a smaller file and try again.");
  }

  @Test
  void handleMultipartExceptionShouldReturnPlainLanguageBadRequestPayload() {
    ResponseEntity<UploadErrorResponseDto> response =
        handler.handleMultipartException(new MultipartException("Request parse failure"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().message())
        .isEqualTo("We were unable to read the upload. Choose the file again and try once more.");
  }
}

package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.upload.UploadErrorResponseDto;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

@RestControllerAdvice
class LexisUploadExceptionHandler {

  private static final String FILE_TOO_LARGE_MESSAGE =
      "The selected file is too large. Choose a smaller file and try again.";

  private static final String MULTIPART_FAILURE_MESSAGE =
      "We were unable to read the upload. Choose the file again and try once more.";

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<UploadErrorResponseDto> handleMaxUploadSizeExceeded(
      MaxUploadSizeExceededException exception) {
    return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
        .body(UploadErrorResponseDto.of(FILE_TOO_LARGE_MESSAGE));
  }

  @ExceptionHandler(MultipartException.class)
  ResponseEntity<UploadErrorResponseDto> handleMultipartException(MultipartException exception) {
    if (isMaxUploadSizeExceeded(exception)) {
      return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
          .body(UploadErrorResponseDto.of(FILE_TOO_LARGE_MESSAGE));
    }
    return ResponseEntity.badRequest().body(UploadErrorResponseDto.of(MULTIPART_FAILURE_MESSAGE));
  }

  private boolean isMaxUploadSizeExceeded(Throwable throwable) {
    Throwable current = throwable;
    while (current != null) {
      if (current instanceof MaxUploadSizeExceededException) {
        return true;
      }
      current = current.getCause();
    }
    return false;
  }
}

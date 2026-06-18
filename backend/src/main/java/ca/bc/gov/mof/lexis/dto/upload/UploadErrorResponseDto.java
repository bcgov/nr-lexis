package ca.bc.gov.mof.lexis.dto.upload;

import java.util.List;

public record UploadErrorResponseDto(String message, List<String> errors, List<String> warnings) {
  public static UploadErrorResponseDto of(String message) {
    return new UploadErrorResponseDto(message, List.of(message), List.of());
  }
}

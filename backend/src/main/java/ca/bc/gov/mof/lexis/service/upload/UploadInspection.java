package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.util.Objects;
import org.springframework.web.multipart.MultipartFile;

/**
 * Outcome of validating, type-checking and virus-scanning an attachment. Controllers inspect an
 * upload before taking aggregate row locks and persist only an accepted inspection inside them, so
 * scanner latency never holds an Oracle connection or blocks other editors of the same record.
 */
public record UploadInspection(
    String uploadType,
    MultipartFile file,
    String description,
    String fileTypeCode,
    LexisUploadResultDto rejection) {

  public static UploadInspection accepted(
      String uploadType, MultipartFile file, String description, String fileTypeCode) {
    return new UploadInspection(
        Objects.requireNonNull(uploadType, "uploadType"),
        Objects.requireNonNull(file, "file"),
        description,
        fileTypeCode,
        null);
  }

  public static UploadInspection rejected(
      String uploadType, MultipartFile file, LexisUploadResultDto rejection) {
    return new UploadInspection(
        Objects.requireNonNull(uploadType, "uploadType"),
        file,
        null,
        null,
        Objects.requireNonNull(rejection, "rejection"));
  }

  public boolean isAccepted() {
    return rejection == null;
  }

  /** Returns the inspected file, refusing a rejected inspection or one made for another target. */
  MultipartFile requireAcceptedFile(String expectedUploadType) {
    if (!isAccepted() || !uploadType.equals(expectedUploadType)) {
      throw new IllegalArgumentException(
          "Only an accepted " + expectedUploadType + " upload inspection can be persisted.");
    }
    return file;
  }
}

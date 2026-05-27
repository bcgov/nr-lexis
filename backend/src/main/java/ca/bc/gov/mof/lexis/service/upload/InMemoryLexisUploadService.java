package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("!oracle")
public class InMemoryLexisUploadService implements LexisUploadService {

  @Override
  public Optional<LexisUploadResultDto> uploadApplication(MultipartFile file) {
    return buildResult("application", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadPermit(MultipartFile file) {
    return buildResult("permit", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadExemption(MultipartFile file) {
    return buildResult("exemption", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadInvoice(MultipartFile file) {
    return buildResult("invoice", file);
  }

  private Optional<LexisUploadResultDto> buildResult(String uploadType, MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return Optional.empty();
    }

    String fileName =
        file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
            ? "uploaded-file"
            : file.getOriginalFilename();

    return Optional.of(
        new LexisUploadResultDto(
            uploadType,
            fileName,
            file.getSize(),
            "accepted",
            "Upload accepted in local profile; persistence pipeline is not enabled."));
  }
}

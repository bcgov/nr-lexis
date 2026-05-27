package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import java.util.Optional;
import org.springframework.web.multipart.MultipartFile;

public interface LexisUploadService {

  Optional<LexisUploadResultDto> uploadApplication(MultipartFile file);

  Optional<LexisUploadResultDto> uploadPermit(MultipartFile file);

  Optional<LexisUploadResultDto> uploadExemption(MultipartFile file);

  Optional<LexisUploadResultDto> uploadInvoice(MultipartFile file);
}


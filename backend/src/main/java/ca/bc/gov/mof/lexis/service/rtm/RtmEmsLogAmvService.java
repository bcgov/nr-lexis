package ca.bc.gov.mof.lexis.service.rtm;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import java.util.List;
import org.springframework.web.multipart.MultipartFile;

public interface RtmEmsLogAmvService {

  List<RtmEmsLogAmvRowDto> find(
      String species,
      String growthIndicator,
      String retrievalDate,
      String updateDate);

  RtmEmsLogAmvMutationResultDto save(RtmEmsLogAmvSaveRequestDto request);

  RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file);

  RtmEmsLogAmvUploadResultDto upload(MultipartFile file, String retrievalDate, String growthIndicator);
}

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

  List<RtmEmsLogAmvRowDto> findLatestBefore(String effectiveDate);

  RtmEmsLogAmvMutationResultDto save(RtmEmsLogAmvSaveRequestDto request);

  RtmEmsLogAmvMutationResultDto saveBatch(List<RtmEmsLogAmvSaveRequestDto> requests);

  RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file);

  RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file, String effectiveMonth);

  RtmEmsLogAmvUploadResultDto upload(MultipartFile file);

  RtmEmsLogAmvUploadResultDto upload(MultipartFile file, String effectiveMonth);
}

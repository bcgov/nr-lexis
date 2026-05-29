package ca.bc.gov.mof.lexis.service.application;

import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitRequestDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitResponseDto;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.web.multipart.MultipartFile;

public interface ApplicationDetailsRpcService {

  List<DocumentItem> getDocumentDetails(Long applicationNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  Optional<String> getRemark(Long remarkId);

  Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId);

  ApplicationScaleUploadPreviewResponseDto previewScaleXmlUpload(
      MultipartFile file, Long applicationNumber, String packageNumber);

  ApplicationScaleUploadSubmitResponseDto submitScaleXmlUpload(
      ApplicationScaleUploadSubmitRequestDto request, String userId);

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}

  record PersistedRemark(
      long remarkId, String remark, String displayRemark, String user, Instant date) {}
}

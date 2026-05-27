package ca.bc.gov.mof.lexis.service.application;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ApplicationDetailsRpcService {

  List<DocumentItem> getDocumentDetails(Long applicationNumber);

  Optional<DocumentContent> getDocument(Long fileId);

  boolean removeDocument(Long documentId);

  Optional<String> getRemark(Long remarkId);

  Optional<PersistedRemark> persistRemark(
      String remarkId, Long applicationNumber, String remarkBody, String userId);

  record DocumentItem(long id, String name, String description, String type) {}

  record DocumentContent(byte[] bytes) {}

  record PersistedRemark(
      long remarkId, String remark, String displayRemark, String user, Instant date) {}
}

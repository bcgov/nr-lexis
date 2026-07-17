package ca.bc.gov.mof.lexis.service.coordination;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
public class OptimisticLockRequestReader {

  public static final String RESPONSE_VERSION_ATTRIBUTE =
      OptimisticLockRequestReader.class.getName() + ".responseVersion";

  public OptimisticLockRequest currentRequest() {
    if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
      return OptimisticLockRequest.none();
    }
    HttpServletRequest request = attributes.getRequest();
    String rawVersion = request.getHeader(OptimisticLockHeaders.RECORD_VERSION);
    if (rawVersion == null || rawVersion.isBlank()) {
      return OptimisticLockRequest.none();
    }
    try {
      return new OptimisticLockRequest(
          Optional.of(OptimisticRecordVersion.parse(rawVersion)));
    } catch (IllegalArgumentException exception) {
      throw new InvalidRecordVersionException(
          "The supplied record version is invalid. Refresh the record and try again.", exception);
    }
  }

  public void publishResponseVersion(OptimisticRecordVersion version) {
    if (version == null
        || !(RequestContextHolder.getRequestAttributes()
            instanceof ServletRequestAttributes attributes)) {
      return;
    }
    attributes.getRequest().setAttribute(RESPONSE_VERSION_ATTRIBUTE, version);
  }
}

package ca.bc.gov.mof.lexis.service.coordination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class OptimisticLockRequestReaderTest {

  private final OptimisticLockRequestReader reader = new OptimisticLockRequestReader();

  @AfterEach
  void clearRequest() {
    RequestContextHolder.resetRequestAttributes();
  }

  @Test
  void shouldReadExpectedVersionHeader() {
    OptimisticRecordVersion version =
        new OptimisticRecordVersion(
            OptimisticRecordType.APPLICATION,
            "10",
            Instant.parse("2026-07-15T18:00:00Z"),
            "editor",
            "abc123");
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(OptimisticLockHeaders.RECORD_VERSION, version.token());
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

    OptimisticLockRequest result = reader.currentRequest();

    assertThat(result.expectedVersion()).get().extracting("token").isEqualTo(version.token());
  }

  @Test
  void invalidVersionHeaderShouldBeRejected() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(OptimisticLockHeaders.RECORD_VERSION, "invalid");
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

    assertThatThrownBy(reader::currentRequest)
        .isInstanceOf(InvalidRecordVersionException.class)
        .hasMessageContaining("Refresh");
  }
}

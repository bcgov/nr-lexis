package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
class OptimisticRecordVersionControllerTest {

  private static final long APPLICATION_NUMBER = 999_000_001L;
  private static final String EXEMPTION_NUMBER = "TEST/0001";

  @Mock private ObjectProvider<OracleOptimisticRecordVersionService> versionServiceProvider;
  @Mock private OracleOptimisticRecordVersionService versionService;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;
  @Mock private Authentication authentication;

  @InjectMocks private OptimisticRecordVersionController controller;

  @Test
  void applicationVersionShouldReturnTheAuthorizedCurrentVersionWithoutABody() {
    OptimisticRecordVersion version =
        version(OptimisticRecordType.APPLICATION, Long.toString(APPLICATION_NUMBER));
    when(provincialAuthorizationService.canAccessApplication(
            authentication, APPLICATION_NUMBER))
        .thenReturn(true);
    when(versionServiceProvider.getIfAvailable()).thenReturn(versionService);
    when(versionService.find(
            OptimisticRecordType.APPLICATION, Long.toString(APPLICATION_NUMBER)))
        .thenReturn(Optional.of(version));

    ResponseEntity<Void> response =
        controller.applicationVersion(APPLICATION_NUMBER, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    assertThat(response.getBody()).isNull();
    assertThat(response.getHeaders().getFirst(OptimisticLockHeaders.RECORD_VERSION))
        .isEqualTo(version.token());
    assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-store");
  }

  @Test
  void exemptionVersionShouldNormalizeTheIdentifierAndReturnTheCurrentVersion() {
    OptimisticRecordVersion version =
        version(OptimisticRecordType.EXEMPTION, EXEMPTION_NUMBER);
    when(provincialAuthorizationService.canAccessExemption(
            authentication, EXEMPTION_NUMBER))
        .thenReturn(true);
    when(versionServiceProvider.getIfAvailable()).thenReturn(versionService);
    when(versionService.find(OptimisticRecordType.EXEMPTION, EXEMPTION_NUMBER))
        .thenReturn(Optional.of(version));

    ResponseEntity<Void> response =
        controller.exemptionVersion("  " + EXEMPTION_NUMBER + "  ", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    assertThat(response.getHeaders().getFirst(OptimisticLockHeaders.RECORD_VERSION))
        .isEqualTo(version.token());
  }

  @Test
  void versionShouldNotBeReadWhenTheRecordIsOutsideTheAuthenticatedScope() {
    when(provincialAuthorizationService.canAccessApplication(
            authentication, APPLICATION_NUMBER))
        .thenReturn(false);

    ResponseEntity<Void> response =
        controller.applicationVersion(APPLICATION_NUMBER, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verifyNoInteractions(versionService);
  }

  private OptimisticRecordVersion version(OptimisticRecordType type, String recordId) {
    return new OptimisticRecordVersion(
        type,
        recordId,
        Instant.parse("2026-07-15T16:00:00Z"),
        "IDIR\\TESTER",
        "abcdef");
  }
}

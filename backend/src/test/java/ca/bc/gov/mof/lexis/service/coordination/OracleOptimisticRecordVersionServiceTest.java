package ca.bc.gov.mof.lexis.service.coordination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RootRecordSnapshot;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class OracleOptimisticRecordVersionServiceTest {

  @Test
  void exemptionLookupShouldKeepStoredCaseAndReturnTheCompatibleCanonicalToken() {
    OracleAggregateLockRepository repository = mock(OracleAggregateLockRepository.class);
    RootRecordSnapshot snapshot =
        new RootRecordSnapshot(
            "current-fingerprint", Instant.parse("2026-07-15T18:00:00Z"), "IDIR\\EDITOR");
    when(repository.findExemptionVersion("test8q4b")).thenReturn(Optional.of(snapshot));
    OracleOptimisticRecordVersionService service =
        new OracleOptimisticRecordVersionService(repository);

    OptimisticRecordVersion version =
        service.find(OptimisticRecordType.EXEMPTION, " test8q4b ").orElseThrow();

    verify(repository).findExemptionVersion("test8q4b");
    verify(repository, never()).findExemptionVersion("TEST8Q4B");
    assertThat(version.recordId()).isEqualTo("TEST8Q4B");
    assertThat(version.token())
        .isEqualTo(service.toVersion(OptimisticRecordType.EXEMPTION, "TEST8Q4B", snapshot).token());
    assertThat(OptimisticRecordVersion.parse(version.token()).recordId()).isEqualTo("TEST8Q4B");
  }
}

package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RootRecordSnapshot;
import ca.bc.gov.mof.lexis.service.coordination.DistributedLockBusyException;
import ca.bc.gov.mof.lexis.service.coordination.InvalidRecordVersionException;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequest;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import ca.bc.gov.mof.lexis.service.coordination.StaleRecordException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.dao.CannotAcquireLockException;

class OracleAggregateRowLockServiceTest {

  private final OracleAggregateLockRepository repository =
      mock(OracleAggregateLockRepository.class);
  private final OptimisticLockRequestReader requestReader =
      mock(OptimisticLockRequestReader.class);
  private final OracleAggregateRowLockService service =
      new OracleAggregateRowLockService(
          repository, requestReader, new OracleOptimisticRecordVersionService(repository));

  OracleAggregateRowLockServiceTest() {
    when(requestReader.currentRequest()).thenReturn(OptimisticLockRequest.none());
  }

  @Test
  void shouldLockDistinctRootsInGlobalOrderBeforeRunningTheMutation() {
    AtomicBoolean invoked = new AtomicBoolean();

    String result =
        service.execute(
            List.of(" z-2 ", "A-1", "a-1"),
            List.of(20L, 10L, 20L),
            List.of(200L, 100L, 200L),
            () -> {
              invoked.set(true);
              return "done";
            });

    InOrder order = inOrder(repository);
    order.verify(repository).lockExemption("A-1");
    order.verify(repository).lockExemption("Z-2");
    order.verify(repository).lockApplication(10L);
    order.verify(repository).lockApplication(20L);
    order.verify(repository).lockPermit(100L);
    order.verify(repository).lockPermit(200L);
    assertThat(invoked).isTrue();
    assertThat(result).isEqualTo("done");
  }

  @Test
  void shouldMapOracleRowContentionWithoutRunningTheMutation() {
    AtomicBoolean invoked = new AtomicBoolean();
    doThrow(new CannotAcquireLockException("simulated row contention"))
        .when(repository)
        .lockApplication(10L);

    assertThatThrownBy(
            () ->
                service.execute(
                    List.of(),
                    List.of(10L),
                    List.of(),
                    () -> {
                      invoked.set(true);
                      return "not-reached";
                    }))
        .isInstanceOf(DistributedLockBusyException.class)
        .hasMessageContaining("same record")
        .hasCauseInstanceOf(CannotAcquireLockException.class);
    assertThat(invoked).isFalse();
  }

  @Test
  void shouldRejectStaleSaveAfterAcquiringTheOracleRowLock() {
    RootRecordSnapshot current =
        new RootRecordSnapshot(
            "current-fingerprint", Instant.parse("2026-07-15T18:01:00Z"), "IDIR\\SECOND");
    when(repository.lockApplication(10L)).thenReturn(Optional.of(current));
    OptimisticRecordVersion expected =
        new OptimisticRecordVersion(
            OptimisticRecordType.APPLICATION,
            "10",
            Instant.parse("2026-07-15T18:00:00Z"),
            "IDIR\\FIRST",
            "original-fingerprint");
    when(requestReader.currentRequest())
        .thenReturn(
            new OptimisticLockRequest(
                Optional.of(OptimisticRecordVersion.parse(expected.token()))));

    assertThatThrownBy(
            () -> service.execute(List.of(), List.of(10L), List.of(), () -> "not-reached"))
        .isInstanceOf(StaleRecordException.class)
        .satisfies(
            error -> {
              StaleRecordException stale = (StaleRecordException) error;
              assertThat(stale.recordId()).isEqualTo("10");
              assertThat(stale.currentVersion()).isNotEqualTo(expected.token());
              assertThat(stale.currentSavedAt())
                  .isEqualTo(Instant.parse("2026-07-15T18:01:00Z"));
              assertThat(stale.currentUpdatedBy()).isEqualTo("IDIR\\SECOND");
            });
  }

  @Test
  void shouldAllowSaveWhenExpectedVersionMatches() {
    RootRecordSnapshot snapshot =
        new RootRecordSnapshot(
            "same-fingerprint", Instant.parse("2026-07-15T18:00:00Z"), "IDIR\\EDITOR");
    when(repository.lockPermit(100L)).thenReturn(Optional.of(snapshot));
    OptimisticRecordVersion expected =
        new OracleOptimisticRecordVersionService(repository)
            .toVersion(OptimisticRecordType.PERMIT, "100", snapshot);
    when(requestReader.currentRequest())
        .thenReturn(
            new OptimisticLockRequest(
                Optional.of(OptimisticRecordVersion.parse(expected.token()))));

    assertThat(service.execute(List.of(), List.of(), List.of(100L), () -> "saved"))
        .isEqualTo("saved");
  }

  @Test
  void staleOverwriteAttemptShouldNotBypassVersionComparison() {
    RootRecordSnapshot current =
        new RootRecordSnapshot(
            "current-fingerprint", Instant.parse("2026-07-15T18:01:00Z"), "IDIR\\SECOND");
    when(repository.lockOffer(44L)).thenReturn(Optional.of(current));
    OptimisticRecordVersion expected =
        new OptimisticRecordVersion(
            OptimisticRecordType.OFFER,
            "44",
            Instant.parse("2026-07-15T18:00:00Z"),
            "IDIR\\FIRST",
            "original-fingerprint");
    when(requestReader.currentRequest())
        .thenReturn(
            new OptimisticLockRequest(
                Optional.of(OptimisticRecordVersion.parse(expected.token()))));

    assertThatThrownBy(() -> service.executeOfferMutation(44L, () -> "not-reached"))
        .isInstanceOf(StaleRecordException.class);
  }

  @Test
  void versionForAnUnrelatedRecordShouldNotBypassTheLockedAggregate() {
    OptimisticRecordVersion unrelated =
        new OptimisticRecordVersion(
            OptimisticRecordType.APPLICATION,
            "11",
            Instant.parse("2026-07-15T18:00:00Z"),
            "editor",
            "fingerprint");
    when(requestReader.currentRequest())
        .thenReturn(
            new OptimisticLockRequest(
                Optional.of(OptimisticRecordVersion.parse(unrelated.token()))));

    assertThatThrownBy(
            () -> service.execute(List.of(), List.of(10L), List.of(), () -> "not-reached"))
        .isInstanceOf(InvalidRecordVersionException.class)
        .hasMessageContaining("does not belong");
  }
}

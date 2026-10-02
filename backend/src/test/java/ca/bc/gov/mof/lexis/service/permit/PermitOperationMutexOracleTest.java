package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RootRecordSnapshot;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class PermitOperationMutexOracleTest {

  @AfterEach
  void clearRequestContext() {
    RequestContextHolder.resetRequestAttributes();
  }

  @Test
  void shouldKeepCanonicalLocalLocksAndPassStoredExemptionCaseToOracle() {
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    doAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get())
        .when(rowLocks)
        .execute(anyList(), anyList(), anyList(), anyList(), any(Supplier.class));
    PermitOperationMutex mutex = new PermitOperationMutex(rowLockProvider);

    String result =
        mutex.executeAggregate(
            List.of(" z-2 ", "A-1", "a-1"),
            List.of(20L, 10L, 20L),
            List.of(40L, 30L, 40L),
            List.of(200L, 100L, 200L),
            () -> {
              assertThat(mutex.trackedExemptionCount()).isEqualTo(2);
              return "done";
            });

    verify(rowLocks)
        .execute(
            eq(List.of("z-2", "A-1", "a-1")),
            eq(List.of(10L, 20L)),
            eq(List.of(30L, 40L)),
            eq(List.of(100L, 200L)),
            any(Supplier.class));
    assertThat(result).isEqualTo("done");
  }

  @Test
  void systemAggregateShouldUseTheExplicitSystemOraclePath() {
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    doAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get())
        .when(rowLocks)
        .executeSystemMutation(anyList(), anyList(), anyList(), anyList(), any(Supplier.class));
    PermitOperationMutex mutex = new PermitOperationMutex(rowLockProvider);

    String result =
        mutex.executeSystemAggregate(
            List.of(" test8q4b "), List.of(10L), List.of(100L), () -> "expired");

    verify(rowLocks)
        .executeSystemMutation(
            eq(List.of("test8q4b")),
            eq(List.of(10L)),
            eq(List.of()),
            eq(List.of(100L)),
            any(Supplier.class));
    assertThat(result).isEqualTo("expired");
  }

  @Test
  void rootCreateAggregateShouldUseTheExplicitRootCreateOraclePath() {
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    doAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get())
        .when(rowLocks)
        .executeRootCreateMutation(anyList(), anyList(), anyList(), anyList(), any(Supplier.class));
    PermitOperationMutex mutex = new PermitOperationMutex(rowLockProvider);

    String result =
        mutex.executeRootCreateAggregate(
            List.of(" test8q4b "), List.of(10L), List.of(), () -> "application-created");

    verify(rowLocks)
        .executeRootCreateMutation(
            eq(List.of("test8q4b")),
            eq(List.of(10L)),
            eq(List.of()),
            eq(List.of()),
            any(Supplier.class));
    assertThat(result).isEqualTo("application-created");
  }

  @Test
  void exemptionCoordinatorShouldKeepCanonicalPunctuationOrderAndStoredCase() {
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider = mock(ObjectProvider.class);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    doAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get())
        .when(rowLocks)
        .execute(anyList(), anyList(), anyList(), anyList(), any(Supplier.class));
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex(rowLockProvider));

    String result =
        coordinator.executeExemptionMutation(
            List.of("[", " test8q4b ", "a", "A"), List::of, List::of, () -> "saved");

    verify(rowLocks)
        .execute(
            eq(List.of("a", "test8q4b", "[")),
            eq(List.of()),
            eq(List.of()),
            eq(List.of()),
            any(Supplier.class));
    assertThat(result).isEqualTo("saved");
  }

  @Test
  void applicationCoordinatorShouldLockTheApplicationAndPermitsInOneOracleTransaction() {
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    OracleAggregateRowLockService rowLocks = mock(OracleAggregateRowLockService.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    doAnswer(invocation -> ((Supplier<?>) invocation.getArgument(4)).get())
        .when(rowLocks)
        .execute(anyList(), anyList(), anyList(), anyList(), any(Supplier.class));
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex(rowLockProvider));

    String result =
        coordinator.executeApplicationMutation(
            10L, () -> List.of(200L, 100L), () -> "done");

    verify(rowLocks, times(1))
        .execute(
            eq(List.of()),
            eq(List.of(10L)),
            eq(List.of()),
            eq(List.of(100L, 200L)),
            any(Supplier.class));
    assertThat(result).isEqualTo("done");
  }

  @Test
  void applicationVersionWithLinkedPermitsShouldPublishFreshVersionFromOneOracleAggregate() {
    OracleAggregateLockRepository repository = mock(OracleAggregateLockRepository.class);
    RootRecordSnapshot expectedSnapshot =
        new RootRecordSnapshot(
            "expected-fingerprint", Instant.parse("2026-07-15T18:00:00Z"), "IDIR\\EDITOR");
    RootRecordSnapshot freshSnapshot =
        new RootRecordSnapshot(
            "fresh-fingerprint", Instant.parse("2026-07-15T18:01:00Z"), "IDIR\\EDITOR");
    when(repository.lockApplication(10L)).thenReturn(Optional.of(expectedSnapshot));
    when(repository.findApplicationVersion(10L)).thenReturn(Optional.of(freshSnapshot));

    OracleOptimisticRecordVersionService versionService =
        new OracleOptimisticRecordVersionService(repository);
    OptimisticRecordVersion expectedVersion =
        versionService.toVersion(OptimisticRecordType.APPLICATION, "10", expectedSnapshot);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(OptimisticLockHeaders.RECORD_VERSION, expectedVersion.token());
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

    CountingOracleAggregateRowLockService rowLocks =
        new CountingOracleAggregateRowLockService(
            repository, new OptimisticLockRequestReader(), versionService);
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider =
        mock(ObjectProvider.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex(rowLockProvider));

    String result =
        coordinator.executeApplicationMutation(
            10L, () -> List.of(200L, 100L), () -> "saved");

    assertThat(rowLocks.executionCount()).isOne();
    verify(repository).lockApplication(10L);
    verify(repository).lockPermit(100L);
    verify(repository).lockPermit(200L);
    assertThat(result).isEqualTo("saved");
    assertThat(
            request.getAttribute(
                OptimisticLockRequestReader.RESPONSE_VERSION_ATTRIBUTE))
        .isEqualTo(
            versionService.toVersion(
                OptimisticRecordType.APPLICATION, "10", freshSnapshot));
  }

  @Test
  void exemptionCoordinatorShouldKeepOracleCaseAndPublishACanonicalFreshVersion() {
    OracleAggregateLockRepository repository = mock(OracleAggregateLockRepository.class);
    RootRecordSnapshot expectedSnapshot =
        new RootRecordSnapshot(
            "expected-fingerprint", Instant.parse("2026-07-15T18:00:00Z"), "IDIR\\EDITOR");
    RootRecordSnapshot freshSnapshot =
        new RootRecordSnapshot(
            "fresh-fingerprint", Instant.parse("2026-07-15T18:01:00Z"), "IDIR\\EDITOR");
    when(repository.findExemptionVersion("test8q4b"))
        .thenReturn(Optional.of(expectedSnapshot), Optional.of(freshSnapshot));
    when(repository.lockExemption("test8q4b")).thenReturn(Optional.of(expectedSnapshot));

    OracleOptimisticRecordVersionService versionService =
        new OracleOptimisticRecordVersionService(repository);
    OptimisticRecordVersion expectedVersion =
        versionService.find(OptimisticRecordType.EXEMPTION, " test8q4b ").orElseThrow();
    assertThat(OptimisticRecordVersion.parse(expectedVersion.token()).recordId())
        .isEqualTo("TEST8Q4B");
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.addHeader(OptimisticLockHeaders.RECORD_VERSION, expectedVersion.token());
    RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

    CountingOracleAggregateRowLockService rowLocks =
        new CountingOracleAggregateRowLockService(
            repository, new OptimisticLockRequestReader(), versionService);
    ObjectProvider<OracleAggregateRowLockService> rowLockProvider = mock(ObjectProvider.class);
    when(rowLockProvider.getIfAvailable()).thenReturn(rowLocks);
    PermitOperationMutex mutex = new PermitOperationMutex(rowLockProvider);
    ApplicationPermitOperationCoordinator coordinator =
        new ApplicationPermitOperationCoordinator(mutex);

    String result =
        coordinator.executeExemptionMutation(
            List.of(" test8q4b "),
            () -> List.of(10L),
            () -> List.of(100L),
            () -> {
              assertThat(mutex.trackedExemptionCount()).isOne();
              return "saved";
            });

    assertThat(result).isEqualTo("saved");
    assertThat(rowLocks.executionCount()).isOne();
    verify(repository).lockExemption("test8q4b");
    verify(repository, never()).lockExemption("TEST8Q4B");
    verify(repository, times(2)).findExemptionVersion("test8q4b");
    verify(repository, never()).findExemptionVersion("TEST8Q4B");
    verify(repository).lockApplication(10L);
    verify(repository).lockPermit(100L);
    assertThat(request.getAttribute(OptimisticLockRequestReader.RESPONSE_VERSION_ATTRIBUTE))
        .isEqualTo(
            versionService.toVersion(OptimisticRecordType.EXEMPTION, "TEST8Q4B", freshSnapshot));
    assertThat(mutex.trackedOperationCount()).isZero();
  }

  private static final class CountingOracleAggregateRowLockService
      extends OracleAggregateRowLockService {

    private int executionCount;

    private CountingOracleAggregateRowLockService(
        OracleAggregateLockRepository repository,
        OptimisticLockRequestReader requestReader,
        OracleOptimisticRecordVersionService versionService) {
      super(repository, requestReader, versionService);
    }

    @Override
    public <T> T execute(
        Collection<String> exemptionNumbers,
        Collection<Long> applicationNumbers,
        Collection<Long> offerNumbers,
        Collection<Long> permitNumbers,
        Supplier<T> operation) {
      executionCount++;
      return super.execute(
          exemptionNumbers, applicationNumbers, offerNumbers, permitNumbers, operation);
    }

    private int executionCount() {
      return executionCount;
    }
  }
}

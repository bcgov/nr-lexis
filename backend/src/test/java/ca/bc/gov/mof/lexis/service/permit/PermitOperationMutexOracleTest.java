package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
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
  void shouldWrapTheMutationInOrderedOracleRowLocks() {
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
            () -> "done");

    verify(rowLocks)
        .execute(
            eq(List.of("A-1", "Z-2")),
            eq(List.of(10L, 20L)),
            eq(List.of(30L, 40L)),
            eq(List.of(100L, 200L)),
            any(Supplier.class));
    assertThat(result).isEqualTo("done");
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

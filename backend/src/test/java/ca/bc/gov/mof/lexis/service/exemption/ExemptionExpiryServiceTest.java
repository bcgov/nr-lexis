package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationUpdateRecord;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository.ExemptionRecord;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository.ExemptionUpdateRecord;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository.PermitSummaryRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
class ExemptionExpiryServiceTest {

  private static final Instant NOW = Instant.parse("2026-07-10T07:00:30Z");

  @Mock private ExemptionDetailsRpcRepository exemptionRepository;
  @Mock private ApplicationDetailsRpcRepository applicationRepository;
  @Mock private PermitRpcRepository permitRepository;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private ExemptionDetailsRpcService exemptionDetailsService;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;

  private ExemptionExpiryService service;
  private ApplicationPermitOperationCoordinator operationCoordinator;

  @BeforeEach
  void setUp() {
    operationCoordinator =
        new ApplicationPermitOperationCoordinator(new PermitOperationMutex());
    service =
        new ExemptionExpiryService(
            exemptionRepository,
            new ExemptionExpiryProcessor(
                exemptionRepository,
                applicationRepository,
                permitRepository,
                editLockService,
                Clock.fixed(NOW, ZoneOffset.UTC)),
            exemptionDetailsService,
            applicationDetailsService,
            operationCoordinator);
    org.mockito.Mockito.lenient()
        .when(exemptionDetailsService.getApplicationNumbersForMutation(any()))
        .thenReturn(List.of());
    org.mockito.Mockito.lenient()
        .when(exemptionDetailsService.getPermitNumbersForMutation(any()))
        .thenReturn(List.of());
    org.mockito.Mockito.lenient()
        .when(applicationDetailsService.getPermitNumbersForApplicationMutation(any()))
        .thenReturn(List.of());
    org.mockito.Mockito.lenient()
        .when(editLockService.acquire(any(), any(), any(), any(Boolean.class)))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    org.mockito.Mockito.lenient()
        .when(editLockService.acquirePermit(any(), any(), any(), any(Boolean.class)))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    org.mockito.Mockito.lenient()
        .when(editLockService.acquireExemption(any(), any(), any(), any(Boolean.class)))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
  }

  @Test
  void shouldExpireLegacyAggregateAndWriteApplicationRemark() {
    discoverApplications(101L);
    discoverPermits(201L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100")).thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    101L, 10.0, 10.0, "00000001", "P", "T")));
    when(applicationRepository.findApplicationUpdateRecord(101L))
        .thenReturn(Optional.of(application()));
    when(applicationRepository.updateApplication(any())).thenReturn(true);
    when(applicationRepository.insertRemark(any(), any(), any(), any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    1L,
                    101L,
                    "Exemption expired, 2026-07-10",
                    "EXPIRY_MONITOR",
                    NOW)));
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100"))
        .thenReturn(List.of(new PermitSummaryRow(201L, 10.0, 0.0, "Active", "ACT", null, null, null)));
    when(permitRepository.findPermitMutationByPermitNumber(201L))
        .thenReturn(Optional.of(permit()));
    when(permitRepository.updatePermitDetail(any(), any(), any())).thenReturn(true);
    when(exemptionRepository.updateExemption(any())).thenReturn(true);

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).containsExactly("EX-100");
    assertThat(result.deferredExemptions()).isEmpty();

    ArgumentCaptor<ApplicationUpdateRecord> applicationCaptor =
        ArgumentCaptor.forClass(ApplicationUpdateRecord.class);
    verify(applicationRepository).updateApplication(applicationCaptor.capture());
    assertThat(applicationCaptor.getValue().applicationStatusCode()).isEqualTo("EXP");
    assertThat(applicationCaptor.getValue().updateUserId()).isEqualTo("EXPIRY_MONITOR");
    verify(applicationRepository)
        .insertRemark(101L, "Exemption expired, 2026-07-10", "EXPIRY_MONITOR", NOW);

    ArgumentCaptor<PermitMutationRow> permitCaptor = ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(permitRepository).updatePermitDetail(permitCaptor.capture(),
        org.mockito.ArgumentMatchers.eq("EXPIRY_MONITOR"),
        org.mockito.ArgumentMatchers.isNull());
    assertThat(permitCaptor.getValue().permitStatusCode()).isEqualTo("EXP");

    verify(exemptionRepository).updateExemption(
        org.mockito.ArgumentMatchers.argThat(row -> "EXP".equals(row.exemptionStatusCode())));
  }

  @Test
  void shouldDeferExemptionWhenChildMutationFails() {
    discoverApplications(101L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100")).thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(List.of(new ExemptionDetailsRpcRepository.ApplicationSummaryRow(101L, 10, 10, null, "P", "T")));
    when(applicationRepository.findApplicationUpdateRecord(101L))
        .thenReturn(Optional.of(application()));
    when(applicationRepository.updateApplication(any())).thenReturn(false);
    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).isEmpty();
    assertThat(result.deferredExemptions()).containsExactly("EX-100");
  }

  @Test
  void shouldRepairMissingExpiryRemarkWhenApplicationStatusWasAlreadyExpired() {
    discoverApplications(101L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100")).thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    101L, 10, 10, null, "P", "T")));
    when(applicationRepository.findApplicationUpdateRecord(101L))
        .thenReturn(Optional.of(application("EXP")));
    when(applicationRepository.findRemarksByApplicationNumber(101L)).thenReturn(List.of());
    when(applicationRepository.insertRemark(any(), any(), any(), any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    1L,
                    101L,
                    "Exemption expired, 2026-07-10",
                    "EXPIRY_MONITOR",
                    NOW)));
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100")).thenReturn(List.of());
    when(exemptionRepository.updateExemption(any())).thenReturn(true);

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).containsExactly("EX-100");
    verify(applicationRepository, never()).updateApplication(any());
    verify(applicationRepository)
        .insertRemark(101L, "Exemption expired, 2026-07-10", "EXPIRY_MONITOR", NOW);
  }

  @Test
  void shouldDeferBeforeWritingWhenRelatedApplicationHasInteractiveLock() {
    discoverApplications(101L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100")).thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    101L, 10, 10, null, "P", "T")));
    when(editLockService.acquire(101L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "locked", NOW));

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(applicationRepository, never()).findApplicationUpdateRecord(any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldDeferBeforeWritingWhenExemptionHasInteractiveLock() {
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(editLockService.acquireExemption("EX-100", "EXPIRY_MONITOR", "EXPIRY_MONITOR", false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "locked", NOW));

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(applicationRepository, never()).findApplicationUpdateRecord(any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldLoadParentEditAndNewLinkOnlyAfterAcquiringExemptionLock() {
    discoverApplications(101L);
    AtomicReference<ExemptionRecord> currentExemption =
        new AtomicReference<>(exemption("conditions before edit"));
    AtomicReference<List<ExemptionDetailsRpcRepository.ApplicationSummaryRow>> applications =
        new AtomicReference<>(List.of());
    ExemptionDetailsRpcRepository.ApplicationSummaryRow newlyLinkedApplication =
        new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            101L, 10, 10, null, "P", "T");

    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(editLockService.acquireExemption("EX-100", "EXPIRY_MONITOR", "EXPIRY_MONITOR", false))
        .thenAnswer(
            ignored -> {
              currentExemption.set(exemption("conditions saved immediately before expiry"));
              applications.set(List.of(newlyLinkedApplication));
              return new ApplicationEditLockDto(false, true, null, null, null);
            });
    when(exemptionRepository.findExemptionRecord("EX-100"))
        .thenAnswer(ignored -> Optional.of(currentExemption.get()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenAnswer(ignored -> applications.get());
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100")).thenReturn(List.of());
    when(applicationRepository.findApplicationUpdateRecord(101L))
        .thenReturn(Optional.of(application()));
    when(applicationRepository.updateApplication(any())).thenReturn(true);
    when(applicationRepository.insertRemark(any(), any(), any(), any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    1L,
                    101L,
                    "Exemption expired, 2026-07-10",
                    "EXPIRY_MONITOR",
                    NOW)));
    when(exemptionRepository.updateExemption(any())).thenReturn(true);

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).containsExactly("EX-100");
    verify(applicationRepository).updateApplication(any());
    ArgumentCaptor<ExemptionUpdateRecord> exemptionCaptor =
        ArgumentCaptor.forClass(ExemptionUpdateRecord.class);
    verify(exemptionRepository).updateExemption(exemptionCaptor.capture());
    assertThat(exemptionCaptor.getValue().otherConditions())
        .isEqualTo("conditions saved immediately before expiry");
  }

  @Test
  void shouldDeferBeforeWritingWhenMembershipDriftsWhileChildLocksAreAcquired() {
    discoverApplications(101L, 102L);
    ExemptionDetailsRpcRepository.ApplicationSummaryRow original =
        new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            101L, 10, 10, null, "P", "T");
    ExemptionDetailsRpcRepository.ApplicationSummaryRow newlyLinked =
        new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            102L, 5, 5, null, "P", "T");
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100"))
        .thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(List.of(original), List.of(original, newlyLinked));
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100")).thenReturn(List.of());

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).isEmpty();
    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(applicationRepository, never()).findApplicationUpdateRecord(any());
    verify(applicationRepository, never()).updateApplication(any());
    verify(permitRepository, never()).updatePermitDetail(any(), any(), any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldDeferBeforeWritingWhenParentDriftsWhileChildLocksAreAcquired() {
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100"))
        .thenReturn(
            Optional.of(exemption("first state")),
            Optional.of(exemption("state changed while locking")));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(List.of());
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100")).thenReturn(List.of());

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(applicationRepository, never()).updateApplication(any());
    verify(permitRepository, never()).updatePermitDetail(any(), any(), any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldAcquireParentThenSortedPermitsThenSortedApplications() {
    discoverApplications(101L, 102L);
    discoverPermits(201L, 202L);
    ExemptionDetailsRpcRepository.ApplicationSummaryRow application101 =
        new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            101L, 10, 10, null, "P", "T");
    ExemptionDetailsRpcRepository.ApplicationSummaryRow application102 =
        new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
            102L, 10, 10, null, "P", "T");
    PermitSummaryRow permit201 =
        new PermitSummaryRow(201L, 10.0, 0.0, "Active", "ACT", null, null, null);
    PermitSummaryRow permit202 =
        new PermitSummaryRow(202L, 10.0, 0.0, "Active", "ACT", null, null, null);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100"))
        .thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(List.of(application102, application101));
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100"))
        .thenReturn(List.of(permit202, permit201));
    when(editLockService.acquire(102L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "locked", NOW));

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    InOrder lockOrder = org.mockito.Mockito.inOrder(editLockService);
    lockOrder
        .verify(editLockService)
        .acquireExemption("EX-100", "EXPIRY_MONITOR", "EXPIRY_MONITOR", false);
    lockOrder
        .verify(editLockService)
        .acquirePermit(201L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false);
    lockOrder
        .verify(editLockService)
        .acquirePermit(202L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false);
    lockOrder
        .verify(editLockService)
        .acquire(101L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false);
    lockOrder
        .verify(editLockService)
        .acquire(102L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false);
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldDeferBeforeWritingWhenRelatedPermitHasInteractiveLock() {
    discoverPermits(201L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionRepository.findExemptionRecord("EX-100")).thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(List.of());
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100"))
        .thenReturn(List.of(new PermitSummaryRow(201L, 10.0, 0.0, "Active", "ACT", null, null, null)));
    when(editLockService.acquirePermit(201L, "EXPIRY_MONITOR", "EXPIRY_MONITOR", false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "locked", NOW));

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(permitRepository, never()).findPermitMutationByPermitNumber(any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldRollBackWhenExpiryRemarkReturnsMapperZeroOrWrongParent() {
    when(exemptionRepository.findExemptionRecord("EX-100"))
        .thenReturn(Optional.of(exemption()));
    when(exemptionRepository.findApplicationSummariesByExemptionNumber("EX-100"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    101L, 10.0, 10.0, "00000001", "P", "T")));
    when(exemptionRepository.findPermitsByExemptionNumber("EX-100"))
        .thenReturn(List.of());
    when(applicationRepository.findApplicationUpdateRecord(101L))
        .thenReturn(Optional.of(application()));
    when(applicationRepository.updateApplication(any())).thenReturn(true);
    when(applicationRepository.insertRemark(any(), any(), any(), any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    0L,
                    999L,
                    "Exemption expired, 2026-07-10",
                    "EXPIRY_MONITOR",
                    NOW)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    boolean expired = transactionalProcessor(transactionManager).expireOne("EX-100");

    assertThat(expired).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(exemptionRepository, never()).updateExemption(any());
  }

  @Test
  void shouldHoldJvmAggregateLockUntilExpiryProcessorReturns() throws Exception {
    discoverApplications(101L);
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(applicationDetailsService.getPermitNumbersForApplicationMutation(101L))
        .thenReturn(List.of(201L));

    CountDownLatch processorEntered = new CountDownLatch(1);
    CountDownLatch releaseProcessor = new CountDownLatch(1);
    ExemptionExpiryProcessor blockingProcessor =
        org.mockito.Mockito.mock(ExemptionExpiryProcessor.class);
    when(blockingProcessor.expireOne("EX-100"))
        .thenAnswer(
            ignored -> {
              processorEntered.countDown();
              if (!releaseProcessor.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to release the expiry processor.");
              }
              return true;
            });
    ExemptionExpiryService blockingService =
        new ExemptionExpiryService(
            exemptionRepository,
            blockingProcessor,
            exemptionDetailsService,
            applicationDetailsService,
            operationCoordinator);

    ExecutorService executor = Executors.newFixedThreadPool(2);
    try {
      Future<ExemptionExpiryService.ExpiryRunResult> expiryRun =
          executor.submit(blockingService::expireDueExemptions);
      assertThat(processorEntered.await(5, TimeUnit.SECONDS)).isTrue();

      Future<Boolean> competingMutation =
          executor.submit(
              () ->
                  operationCoordinator.executeKnownAggregate(
                      List.of(" ex-100 "),
                      List.of(101L),
                      List.of(201L),
                      () -> true));
      assertThatThrownBy(
              () -> competingMutation.get(150, TimeUnit.MILLISECONDS))
          .isInstanceOf(TimeoutException.class);

      releaseProcessor.countDown();
      assertThat(expiryRun.get(5, TimeUnit.SECONDS).expiredExemptions())
          .containsExactly("EX-100");
      assertThat(competingMutation.get(5, TimeUnit.SECONDS)).isTrue();
    } finally {
      releaseProcessor.countDown();
      executor.shutdownNow();
    }
  }

  @Test
  void shouldFailClosedBeforeTransactionWhenPermitDiscoveryIsInvalid() {
    when(exemptionRepository.findAllExpiringExemptionNumbers()).thenReturn(List.of("EX-100"));
    when(exemptionDetailsService.getPermitNumbersForMutation("EX-100"))
        .thenReturn(List.of(0L));

    ExemptionExpiryService.ExpiryRunResult result = service.expireDueExemptions();

    assertThat(result.expiredExemptions()).isEmpty();
    assertThat(result.deferredExemptions()).containsExactly("EX-100");
    verify(exemptionRepository, never()).findExemptionRecord(any());
    verify(applicationRepository, never()).updateApplication(any());
    verify(permitRepository, never()).updatePermitDetail(any(), any(), any());
    verify(exemptionRepository, never()).updateExemption(any());
  }

  private ExemptionRecord exemption() {
    return exemption(null);
  }

  private ExemptionRecord exemption(String otherConditions) {
    return new ExemptionRecord(
        "EX-100", 10.0, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 7, 9), otherConditions,
        "M", "ACT", "CREATOR", Timestamp.from(NOW.minusSeconds(3600)), null, null);
  }

  private ApplicationUpdateRecord application() {
    return application("EXE");
  }

  private ApplicationUpdateRecord application(String status) {
    return new ApplicationUpdateRecord(
        101L, null, LocalDate.of(2026, 1, 1), 30L, LocalDate.of(2026, 1, 1), 10.0,
        1.0, "Yard", "CREATOR", NOW.minusSeconds(3600), null, null, null, null, null,
        "00000001", "00", "EX-100", "R", status, "O", 1L, "T", "P", "S",
        null, "Owner", "N");
  }

  private PermitMutationRow permit() {
    return new PermitMutationRow(
        201L, null, null, null, null, LocalDate.of(2026, 1, 1), null, null, null,
        LocalDate.of(2026, 7, 9), 10.0, 1L, null, null, null, "CREATOR",
        Timestamp.from(NOW.minusSeconds(3600)), null, null, "00000001", "00", null, null,
        "EX-100", 1L, null, "ACT", null, "US", null, null, null, null, null, null);
  }

  private void discoverApplications(Long... applicationNumbers) {
    when(exemptionDetailsService.getApplicationNumbersForMutation("EX-100"))
        .thenReturn(List.of(applicationNumbers));
  }

  private void discoverPermits(Long... permitNumbers) {
    when(exemptionDetailsService.getPermitNumbersForMutation("EX-100"))
        .thenReturn(List.of(permitNumbers));
  }

  private ExemptionExpiryProcessor transactionalProcessor(
      RecordingTransactionManager transactionManager) {
    ExemptionExpiryProcessor processor =
        new ExemptionExpiryProcessor(
            exemptionRepository,
            applicationRepository,
            permitRepository,
            editLockService,
            Clock.fixed(NOW, ZoneOffset.UTC));
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(processor);
    proxyFactory.addAdvice(transactionInterceptor);
    proxyFactory.setProxyTargetClass(true);
    return (ExemptionExpiryProcessor) proxyFactory.getProxy();
  }

  private static final class RecordingTransactionManager
      extends AbstractPlatformTransactionManager {
    private int commits;
    private int rollbacks;

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // Nothing to enlist for this boundary test.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }
}

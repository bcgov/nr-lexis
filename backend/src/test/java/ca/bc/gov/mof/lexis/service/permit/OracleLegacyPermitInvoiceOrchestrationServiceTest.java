package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceUpdate;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceLine;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceDetail;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.Transition;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.TransitionResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataRetrievalFailureException;

@ExtendWith(MockitoExtension.class)
class OracleLegacyPermitInvoiceOrchestrationServiceTest {

  private static final long PERMIT_NUMBER = 7_000_123L;
  private static final long INTERNAL_INVOICE_NUMBER = 900_001L;

  @Mock private PermitInvoiceRepository invoiceRepository;
  @Mock private PermitRpcRepository permitRepository;
  @Mock private OracleGbmsPermitInvoiceService gbmsInvoices;

  @InjectMocks private OracleLegacyPermitInvoiceOrchestrationService service;

  @Test
  void shouldCreateGbmsBeforeTheLinkedInternalInvoice() {
    stubNewInvoicePersistence("GBMS-100", List.of(), List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(), List.of(history("GBMS-100", 10.0d, null, null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(gbmsInvoices, invoiceRepository);
    order.verify(gbmsInvoices)
        .createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith");
    ArgumentCaptor<PermitInvoiceInsert> internal =
        ArgumentCaptor.forClass(PermitInvoiceInsert.class);
    order.verify(invoiceRepository).insertPermitInvoiceRequired(internal.capture());
    assertThat(internal.getValue().gbmsInvoiceNumber()).isEqualTo("GBMS-100");
  }

  @Test
  void shouldKeepCanadianInvoicesInternalInLegacyMode() {
    InternalInvoiceSnapshot snapshot = canadianInternalSnapshot();
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior), List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-OLD", 10.0d, "GBMS-CANCEL", null, null),
                history("GBMS-CANCEL", -10.0d, null, null, null)));
    when(invoiceRepository.insertPermitInvoiceRequired(any()))
        .thenReturn(canadianActiveInternal());
    when(invoiceRepository.insertPermitInvoiceDetailRequired(any()))
        .thenReturn(
            List.of(
                new PermitInvoiceDetailRow(
                    1_000_001L,
                    INTERNAL_INVOICE_NUMBER,
                    "TM-1",
                    "FI",
                    "A",
                    BigDecimal.TEN,
                    BigDecimal.TEN,
                    BigDecimal.ONE,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO)));

    TransitionResult result =
        service.orchestrate(
            new Transition(
                PERMIT_NUMBER,
                "ACT",
                "COM",
                "CA",
                "EX-700",
                1835L,
                "00077881",
                "01",
                "RCPT-1",
                snapshot,
                null),
            "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(permitRepository).findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER);
    verifyNoInteractions(gbmsInvoices);
  }

  @Test
  void shouldBlockCanadianReissueWhilePriorGbmsInvoiceIsActive() {
    InternalInvoiceSnapshot snapshot = canadianInternalSnapshot();
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-OLD", 10.0d, null, null, null)));

    TransitionResult result =
        service.orchestrate(
            new Transition(
                PERMIT_NUMBER,
                "ACT",
                "COM",
                "CA",
                "EX-700",
                1835L,
                "00077881",
                "01",
                "RCPT-1",
                snapshot,
                null),
            "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
    verifyNoInteractions(gbmsInvoices);
  }

  @Test
  void shouldBlockAnUnlinkedPositiveGbmsInvoiceBeforeCreatingAnother() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-ORPHAN", 10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("preflight");
    verify(gbmsInvoices, never()).createInvoice(any(), any(), any());
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldBlockAnActiveGbmsInvoiceLinkedToCancelledInternalHistory() {
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-OLD", 10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("preflight");
    verify(gbmsInvoices, never()).createInvoice(any(), any(), any());
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldRequireReconciliationWhenInternalLinkingFailsAfterGbmsCreation() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(), List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(), List.of(history("GBMS-100", 10.0d, null, null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");
    when(invoiceRepository.insertPermitInvoiceRequired(any()))
        .thenThrow(new DataRetrievalFailureException("simulated internal failure"));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("reconcile before retry");
  }

  @Test
  void shouldRejectACreatedInvoiceThatIsAlreadyInactive() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(),
            List.of(history("GBMS-100", 10.0d, "GBMS-CANCEL", null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("reconcile before retry");
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldCancelTheInternalInvoiceBeforeGbms() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    PermitInvoiceRow cancelled = cancelledInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-100", 10.0d, null, null, LocalDate.of(2026, 3, 20))),
            List.of(
                history(
                    "GBMS-100",
                    10.0d,
                    "GBMS-CANCEL",
                    null,
                    LocalDate.of(2026, 3, 20)),
                history("GBMS-CANCEL", -10.0d, null, null, null)));

    TransitionResult result =
        service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(invoiceRepository, gbmsInvoices);
    order.verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-100", "idir\\jsmith"));
    order.verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldCancelAnUnprintedInvoiceThatDisappearsFromHistory() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    PermitInvoiceRow cancelled = cancelledInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-100", 10.0d, null, null, null)),
            List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldBlockCancellationWhenGbmsContainsAnUnlinkedActiveInvoice() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-100", 10.0d, null, null, null),
                history("GBMS-ORPHAN", 5.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
    verify(gbmsInvoices, never()).cancelInvoice(any(), any());
  }

  @Test
  void shouldBlockCancellationWhenGbmsAmountDoesNotMatch() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active));
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-100", 9.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
    verify(gbmsInvoices, never()).cancelInvoice(any(), any());
  }

  @Test
  void shouldLinkOneCancelledPriorInvoiceAsReplaced() {
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    stubNewInvoicePersistence("GBMS-NEW", List.of(prior), List.of(prior));
    GbmsInvoiceHistoryRow oldBefore =
        history(
            "GBMS-OLD",
            8.0d,
            "GBMS-CANCEL",
            null,
            LocalDate.of(2026, 3, 1));
    GbmsInvoiceHistoryRow oldAfter =
        history(
            "GBMS-OLD",
            8.0d,
            "GBMS-CANCEL",
            "GBMS-NEW",
            LocalDate.of(2026, 3, 1));
    GbmsInvoiceHistoryRow created = history("GBMS-NEW", 10.0d, null, null, null);
    when(permitRepository.findGbmsInvoiceHistoryRequired("RCPT-1", PERMIT_NUMBER))
        .thenReturn(
            List.of(oldBefore),
            List.of(created, oldBefore),
            List.of(created, oldAfter));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-NEW");

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(gbmsInvoices).replaceInvoice("GBMS-NEW", "GBMS-OLD", "idir\\jsmith");
  }

  private void stubNewInvoicePersistence(
      String gbmsInvoiceNumber,
      List<PermitInvoiceRow> firstInternalHistory,
      List<PermitInvoiceRow> secondInternalHistory) {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(firstInternalHistory, secondInternalHistory);
    when(invoiceRepository.insertPermitInvoiceRequired(any()))
        .thenReturn(activeInternal(gbmsInvoiceNumber));
    when(invoiceRepository.insertPermitInvoiceDetailRequired(any()))
        .thenReturn(
            List.of(
                new PermitInvoiceDetailRow(
                    1_000_001L,
                    INTERNAL_INVOICE_NUMBER,
                    "TM-1",
                    "FI",
                    "A",
                    BigDecimal.TEN,
                    BigDecimal.TEN,
                    BigDecimal.ONE,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO)));
  }

  private Transition enteringTransition() {
    return new Transition(
        PERMIT_NUMBER,
        "ACT",
        "COM",
        "US",
        "EX-700",
        1835L,
        "00077881",
        "01",
        "RCPT-1",
        internalSnapshot(),
        gbmsSnapshot());
  }

  private Transition leavingTransition() {
    return new Transition(
        PERMIT_NUMBER,
        "COM",
        "ACT",
        "US",
        "EX-700",
        1835L,
        "00077881",
        "01",
        "RCPT-1",
        null,
        null);
  }

  private InternalInvoiceSnapshot internalSnapshot() {
    return new InternalInvoiceSnapshot(
        BigDecimal.TEN,
        "00077881",
        "01",
        BigDecimal.ZERO,
        BigDecimal.ZERO,
        1835L,
        1835L,
        "FLM",
        List.of(
            new InternalInvoiceDetail(
                "TM-1",
                "FI",
                "A",
                BigDecimal.TEN,
                BigDecimal.TEN,
                BigDecimal.ONE,
                BigDecimal.ZERO,
                BigDecimal.ZERO)));
  }

  private InternalInvoiceSnapshot canadianInternalSnapshot() {
    InternalInvoiceSnapshot snapshot = internalSnapshot();
    return new InternalInvoiceSnapshot(
        snapshot.invoiceTotal(),
        snapshot.billingClientNumber(),
        snapshot.billingClientLocationCode(),
        snapshot.exemptionOverrideRate(),
        snapshot.permitOverrideAmount(),
        snapshot.originOrgNumber(),
        snapshot.adminOrgNumber(),
        null,
        snapshot.details());
  }

  private GbmsInvoiceSnapshot gbmsSnapshot() {
    return new GbmsInvoiceSnapshot(
        BigDecimal.TEN,
        "00077881",
        "01",
        1835L,
        1835L,
        "FLM",
        "EXPORT FEES FOR PERMIT 7000123 ISSUED 2026-03-16",
        List.of(new GbmsInvoiceLine(BigDecimal.TEN, "PACKAGE PKG-1")));
  }

  private PermitInvoiceRow activeInternal(String gbmsInvoiceNumber) {
    return new PermitInvoiceRow(
        INTERNAL_INVOICE_NUMBER,
        PERMIT_NUMBER,
        gbmsInvoiceNumber,
        BigDecimal.TEN,
        "00077881",
        "01",
        BigDecimal.ZERO,
        BigDecimal.ZERO,
        1835L,
        1835L,
        "FLM",
        LocalDateTime.of(2026, 3, 16, 10, 0),
        null,
        "idir\\jsmith",
        null);
  }

  private PermitInvoiceRow cancelledInternal(String gbmsInvoiceNumber) {
    PermitInvoiceRow active = activeInternal(gbmsInvoiceNumber);
    return new PermitInvoiceRow(
        active.permitInvoiceNumber(),
        active.permitDetailNumber(),
        active.gbmsInvoiceNumber(),
        active.invoiceTotal(),
        active.clientNumber(),
        active.clientLocationCode(),
        active.exemptionOverrideRate(),
        active.permitOverrideAmount(),
        active.originOrgNumber(),
        active.adminOrgNumber(),
        active.ackMaskAcode(),
        active.submitTimestamp(),
        LocalDateTime.of(2026, 3, 20, 10, 0),
        active.submitUserId(),
        "idir\\jsmith");
  }

  private PermitInvoiceRow canadianActiveInternal() {
    PermitInvoiceRow active = activeInternal(null);
    return new PermitInvoiceRow(
        active.permitInvoiceNumber(),
        active.permitDetailNumber(),
        null,
        active.invoiceTotal(),
        active.clientNumber(),
        active.clientLocationCode(),
        active.exemptionOverrideRate(),
        active.permitOverrideAmount(),
        active.originOrgNumber(),
        active.adminOrgNumber(),
        null,
        active.submitTimestamp(),
        null,
        active.submitUserId(),
        null);
  }

  private GbmsInvoiceHistoryRow history(
      String invoiceNumber,
      double amount,
      String cancelledBy,
      String replacedBy,
      LocalDate printedDate) {
    return new GbmsInvoiceHistoryRow(
        invoiceNumber,
        cancelledBy,
        replacedBy,
        PERMIT_NUMBER,
        amount,
        printedDate,
        LocalDate.of(2026, 3, 16),
        LocalDate.of(2026, 3, 16));
  }
}

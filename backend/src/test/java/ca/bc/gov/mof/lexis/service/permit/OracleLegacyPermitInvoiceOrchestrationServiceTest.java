package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
  void shouldReadGbmsHistoryWithoutTheTypedReceiptWhenCompleting() {
    stubNewInvoicePersistence("GBMS-100", List.of(), List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(), List.of(history("GBMS-100", 10.0d, null, null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(permitRepository, times(2)).findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER);
    verify(permitRepository, never()).findGbmsInvoiceHistoryRequired(eq("RCPT-1"), any());
  }

  @Test
  void shouldReadGbmsHistoryWithoutTheTypedReceiptWhenLeaving() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-OLD", 10.0d, null, null, LocalDate.of(2010, 3, 1))),
            List.of(
                history("GBMS-OLD", 10.0d, "GBMS-CANCEL", null, LocalDate.of(2010, 3, 1)),
                history("GBMS-CANCEL", -10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(permitRepository, times(3)).findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER);
    verify(permitRepository, never()).findGbmsInvoiceHistoryRequired(eq("RCPT-1"), any());
  }

  @Test
  void shouldKeepCanadianInvoicesInternalInLegacyMode() {
    InternalInvoiceSnapshot snapshot = canadianInternalSnapshot();
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior), List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
    verify(permitRepository).findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER);
    verifyNoInteractions(gbmsInvoices);
  }

  @Test
  void shouldBlockCanadianReissueWhilePriorGbmsInvoiceIsActive() {
    InternalInvoiceSnapshot snapshot = canadianInternalSnapshot();
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-ORPHAN", 10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo(
            "The GBMS invoices for this permit do not match its LEXIS invoices, so its status cannot be changed. Contact the LEXIS administrator.");
    verify(gbmsInvoices, never()).createInvoice(any(), any(), any());
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldBlockAnActiveGbmsInvoiceLinkedToCancelledInternalHistory() {
    PermitInvoiceRow prior = cancelledInternal("GBMS-OLD");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(prior));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-OLD", 10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("Contact the LEXIS administrator");
    verify(gbmsInvoices, never()).createInvoice(any(), any(), any());
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldRequireReconciliationWhenInternalLinkingFailsAfterGbmsCreation() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(), List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(), List.of(history("GBMS-100", 10.0d, null, null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");
    when(invoiceRepository.insertPermitInvoiceRequired(any()))
        .thenThrow(new DataRetrievalFailureException("simulated internal failure"));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo(
            "The permit invoice was only partly processed in GBMS, so the permit was not changed. Contact the LEXIS administrator before trying again.");
  }

  @Test
  void shouldRejectACreatedInvoiceThatIsAlreadyInactive() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(),
            List.of(history("GBMS-100", 10.0d, "GBMS-CANCEL", null, null)));
    when(gbmsInvoices.createInvoice(PERMIT_NUMBER, gbmsSnapshot(), "idir\\jsmith"))
        .thenReturn("GBMS-100");

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message()).contains("only partly processed in GBMS");
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
  }

  @Test
  void shouldCancelTheInternalInvoiceBeforeGbms() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    PermitInvoiceRow cancelled = cancelledInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-100", 10.0d, null, null, null)),
            List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldCancelAnUnlinkedActiveGbmsInvoiceWithTheLinkedOne() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-100", 10.0d, null, null, null),
                history("GBMS-ORPHAN", 5.0d, null, null, null)),
            List.of(history("GBMS-ORPHAN", 5.0d, null, null, null)),
            List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(invoiceRepository, gbmsInvoices);
    order.verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-100", "idir\\jsmith"));
    order.verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
    order.verify(gbmsInvoices).cancelInvoice("GBMS-ORPHAN", "idir\\jsmith");
  }

  @ParameterizedTest
  @CsvSource({"US,ACT", "US,CAN", "CA,ACT", "CA,CAN"})
  void shouldSaveWithNoInvoiceWritesWhenNothingIsActive(String country, String targetStatus) {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(cancelledInternal("GBMS-OLD")));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-OLD", 10.0d, "GBMS-CANCEL", null, LocalDate.of(2026, 3, 1)),
                history("GBMS-CANCEL", -10.0d, null, null, null)));

    TransitionResult result =
        service.orchestrate(leavingTransition(country, targetStatus), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
    verifyNoInteractions(gbmsInvoices);
  }

  @Test
  void shouldSaveWithNoInvoiceWritesWhenThePermitHasNoInvoiceHistory() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
    verifyNoInteractions(gbmsInvoices);
  }

  @Test
  void shouldCancelTheOnlyActiveGbmsInvoiceWhenNoInternalInvoiceIsActive() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-OLD", 10.0d, null, null, LocalDate.of(2010, 3, 1))),
            List.of(
                history("GBMS-OLD", 10.0d, "GBMS-CANCEL", null, LocalDate.of(2010, 3, 1)),
                history("GBMS-CANCEL", -10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(gbmsInvoices).cancelInvoice("GBMS-OLD", "idir\\jsmith");
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
  }

  @Test
  void shouldCancelEveryActiveGbmsInvoiceWhenNoInternalInvoiceIsActive() {
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-1", 10.0d, null, null, LocalDate.of(2010, 3, 1)),
                history("GBMS-2", 5.0d, null, null, null)),
            List.of(
                history("GBMS-1", 10.0d, "GBMS-CANCEL", null, LocalDate.of(2010, 3, 1)),
                history("GBMS-CANCEL", -10.0d, null, null, null),
                history("GBMS-2", 5.0d, null, null, null)),
            List.of(
                history("GBMS-1", 10.0d, "GBMS-CANCEL", null, LocalDate.of(2010, 3, 1)),
                history("GBMS-CANCEL", -10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(gbmsInvoices);
    order.verify(gbmsInvoices).cancelInvoice("GBMS-1", "idir\\jsmith");
    order.verify(gbmsInvoices).cancelInvoice("GBMS-2", "idir\\jsmith");
    verify(invoiceRepository, never()).updatePermitInvoiceRequired(any());
  }

  @Test
  void shouldCancelBothLinkedInvoicesInternallyAndInGbms() {
    PermitInvoiceRow first = activeInternal(INTERNAL_INVOICE_NUMBER, "GBMS-1");
    PermitInvoiceRow second = activeInternal(INTERNAL_INVOICE_NUMBER + 1, "GBMS-2");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(first, second), List.of(cancelled(first), cancelled(second)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-1", 10.0d, null, null, null),
                history("GBMS-2", 10.0d, null, null, null)),
            List.of(history("GBMS-2", 10.0d, null, null, null)),
            List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(invoiceRepository, gbmsInvoices);
    order.verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-1", "idir\\jsmith"));
    order.verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER + 1, "GBMS-2", "idir\\jsmith"));
    order.verify(gbmsInvoices).cancelInvoice("GBMS-1", "idir\\jsmith");
    order.verify(gbmsInvoices).cancelInvoice("GBMS-2", "idir\\jsmith");
  }

  @Test
  void shouldCancelTheReplacementGbmsInvoiceWhenTheLinkedOneWasReplaced() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-100", 10.0d, null, "GBMS-200", LocalDate.of(2026, 3, 1)),
                history("GBMS-200", 10.0d, null, null, null)),
            List.of(history("GBMS-100", 10.0d, null, "GBMS-200", LocalDate.of(2026, 3, 1))));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-100", "idir\\jsmith"));
    verify(gbmsInvoices).cancelInvoice("GBMS-200", "idir\\jsmith");
    verify(gbmsInvoices, never()).cancelInvoice(eq("GBMS-100"), any());
  }

  @Test
  void shouldFailWhenAGbmsInvoiceIsStillActiveAfterCancelling() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(history("GBMS-100", 10.0d, null, null, null)),
            List.of(history("GBMS-300", 10.0d, null, null, null)));

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo(
            "The permit invoice was only partly processed in GBMS, so the permit was not changed. Contact the LEXIS administrator before trying again.");
  }

  @ParameterizedTest
  @CsvSource({"US,ACT", "US,CAN", "CA,ACT", "CA,CAN"})
  void shouldCancelOnlyTheInternalInvoiceWhenItHasNoGbmsLink(
      String country, String targetStatus) {
    PermitInvoiceRow active = canadianActiveInternal();
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of());

    TransitionResult result =
        service.orchestrate(leavingTransition(country, targetStatus), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, null, "idir\\jsmith"));
    verifyNoInteractions(gbmsInvoices);
  }

  @ParameterizedTest
  @CsvSource({"CA,ACT", "CA,CAN", "US,CAN"})
  void shouldCancelTheLinkedGbmsInvoiceWhateverTheCountry(
      String country, String targetStatus) {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelledInternal("GBMS-100")));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
        service.orchestrate(leavingTransition(country, targetStatus), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    InOrder order = inOrder(invoiceRepository, gbmsInvoices);
    order.verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-100", "idir\\jsmith"));
    order.verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @ParameterizedTest
  @ValueSource(strings = {"US", "CA"})
  void shouldCancelAnUnlinkedActiveGbmsInvoiceWithAnInternalOnlyInvoice(String country) {
    PermitInvoiceRow active = canadianActiveInternal();
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-ORPHAN", 10.0d, null, null, null)), List.of());

    TransitionResult result =
        service.orchestrate(leavingTransition(country, "CAN"), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, null, "idir\\jsmith"));
    verify(gbmsInvoices).cancelInvoice("GBMS-ORPHAN", "idir\\jsmith");
  }

  @ParameterizedTest
  @ValueSource(strings = {"US", "CA"})
  void shouldCancelAnInternalOnlyInvoiceAndALinkedInvoiceTogether(String country) {
    PermitInvoiceRow internalOnly = canadianActiveInternal();
    PermitInvoiceRow linked = activeInternal(INTERNAL_INVOICE_NUMBER + 1, "GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(
            List.of(internalOnly, linked), List.of(cancelled(internalOnly), cancelled(linked)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-100", 10.0d, null, null, null)), List.of());

    TransitionResult result =
        service.orchestrate(leavingTransition(country, "ACT"), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, null, "idir\\jsmith"));
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER + 1, "GBMS-100", "idir\\jsmith"));
    verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldCancelALinkedGbmsInvoiceWhoseAmountDiffers() {
    PermitInvoiceRow active = activeInternal("GBMS-100");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled(active)));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(List.of(history("GBMS-100", 9.0d, null, null, null)), List.of());

    TransitionResult result = service.orchestrate(leavingTransition(), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(invoiceRepository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INTERNAL_INVOICE_NUMBER, "GBMS-100", "idir\\jsmith"));
    verify(gbmsInvoices).cancelInvoice("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldBlockAnInvoiceWhenMoreThanOnePriorGbmsInvoiceCouldBeReplaced() {
    PermitInvoiceRow first = cancelledInternal("GBMS-OLD-1");
    PermitInvoiceRow second = cancelledInternal("GBMS-OLD-2");
    when(invoiceRepository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(first, second));
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
        .thenReturn(
            List.of(
                history("GBMS-OLD-1", 8.0d, "GBMS-CANCEL-1", null, LocalDate.of(2026, 3, 1)),
                history("GBMS-OLD-2", 8.0d, "GBMS-CANCEL-2", null, LocalDate.of(2026, 3, 1))));

    TransitionResult result = service.orchestrate(enteringTransition(), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .isEqualTo(
            "More than one earlier GBMS invoice could be replaced by this permit's invoice. Contact the LEXIS administrator.");
    verify(gbmsInvoices, never()).createInvoice(any(), any(), any());
  }

  @Test
  void shouldGiveAPlainMessageWhenTheInvoiceCannotBePrepared() {
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
                null,
                null),
            "idir\\jsmith");

    assertThat(result.success()).isFalse();
    assertThat(result.message())
        .startsWith("The permit invoice could not be prepared, so the permit was not changed.")
        .contains("contact the LEXIS administrator")
        .doesNotContain("preflight");
    verify(invoiceRepository, never()).insertPermitInvoiceRequired(any());
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
    when(permitRepository.findGbmsInvoiceHistoryRequired("", PERMIT_NUMBER))
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
    return leavingTransition("US", "ACT");
  }

  private Transition leavingTransition(String country, String targetStatus) {
    return new Transition(
        PERMIT_NUMBER,
        "COM",
        targetStatus,
        country,
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
    return activeInternal(INTERNAL_INVOICE_NUMBER, gbmsInvoiceNumber);
  }

  private PermitInvoiceRow activeInternal(long invoiceNumber, String gbmsInvoiceNumber) {
    return new PermitInvoiceRow(
        invoiceNumber,
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

  private PermitInvoiceRow cancelled(PermitInvoiceRow active) {
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

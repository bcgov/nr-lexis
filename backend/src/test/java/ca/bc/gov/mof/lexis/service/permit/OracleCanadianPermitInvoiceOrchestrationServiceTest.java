package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceUpdate;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceDetail;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.Transition;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.TransitionResult;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class OracleCanadianPermitInvoiceOrchestrationServiceTest {

  private static final long PERMIT_NUMBER = 7_000_123L;
  private static final long INVOICE_NUMBER = 900_001L;

  @Mock private PermitInvoiceRepository repository;

  @InjectMocks private OracleCanadianPermitInvoiceOrchestrationService service;

  @Test
  void shouldCreateOnlyAnInternalInvoiceForCanadianCompletion() {
    InternalInvoiceSnapshot snapshot = invoiceSnapshot();
    Transition transition = transition("ACT", "COM", "CA", snapshot);
    PermitInvoiceRow inserted = activeInvoice(null);
    PermitInvoiceDetailRow detailRow = persistedDetail(snapshot.details().get(0));
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(repository.insertPermitInvoiceRequired(any())).thenReturn(inserted);
    when(repository.insertPermitInvoiceDetailRequired(any())).thenReturn(List.of(detailRow));

    TransitionResult result = service.orchestrate(transition, "idir\\jsmith");

    assertThat(result.success()).isTrue();
    ArgumentCaptor<PermitInvoiceInsert> headerCaptor =
        ArgumentCaptor.forClass(PermitInvoiceInsert.class);
    verify(repository).insertPermitInvoiceRequired(headerCaptor.capture());
    assertThat(headerCaptor.getValue())
        .isEqualTo(
            new PermitInvoiceInsert(
                PERMIT_NUMBER,
                null,
                BigDecimal.ZERO,
                "00000002",
                "02",
                BigDecimal.valueOf(3.25),
                BigDecimal.valueOf(12.50),
                1835L,
                1835L,
                null,
                "idir\\jsmith"));
    ArgumentCaptor<PermitInvoiceDetailInsert> detailCaptor =
        ArgumentCaptor.forClass(PermitInvoiceDetailInsert.class);
    verify(repository).insertPermitInvoiceDetailRequired(detailCaptor.capture());
    assertThat(detailCaptor.getValue().permitInvoiceNumber()).isEqualTo(INVOICE_NUMBER);
    assertThat(detailCaptor.getValue().amount()).isEqualByComparingTo("32.50");
    assertNoGbmsWrites();
  }

  @Test
  void shouldValidateTheCompleteUnorderedCursorAfterMultipleDetails() {
    InternalInvoiceSnapshot snapshot = invoiceSnapshotWithTwoDetails();
    PermitInvoiceRow inserted = activeInvoice(null);
    PermitInvoiceDetailRow first = persistedDetail(snapshot.details().get(0));
    InternalInvoiceDetail secondDetail = snapshot.details().get(1);
    PermitInvoiceDetailRow second =
        new PermitInvoiceDetailRow(
            1_000_002L,
            INVOICE_NUMBER,
            secondDetail.timberMark(),
            secondDetail.speciesCode(),
            secondDetail.gradeCode(),
            secondDetail.volume(),
            secondDetail.amount(),
            secondDetail.amvRate(),
            secondDetail.feePolicyAdmin(),
            secondDetail.feePercentage());
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(repository.insertPermitInvoiceRequired(any())).thenReturn(inserted);
    when(repository.insertPermitInvoiceDetailRequired(any()))
        .thenReturn(List.of(first), List.of(second, first));

    TransitionResult result =
        service.orchestrate(
            transition("ACT", "COM", "CA", snapshot), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(repository, times(2)).insertPermitInvoiceDetailRequired(any());
    assertNoGbmsWrites();
  }

  @Test
  void shouldCancelTheOnlyActiveInternalInvoice() {
    PermitInvoiceRow active = activeInvoice(null);
    PermitInvoiceRow cancelled =
        new PermitInvoiceRow(
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
            active.ackMaskAcode(),
            active.submitTimestamp(),
            LocalDateTime.of(2026, 7, 11, 10, 0),
            active.submitUserId(),
            "idir\\jsmith");
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled));

    TransitionResult result =
        service.orchestrate(transition("COM", "ACT", "CA", null), "idir\\jsmith");

    assertThat(result.success()).isTrue();
    verify(repository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INVOICE_NUMBER, null, "idir\\jsmith"));
    assertNoGbmsWrites();
  }

  @Test
  void shouldVerifyCancellationAgainstTheOracleEncodedAuditUser() {
    String userId = "bceid\\very-long-external-user-name-12345";
    String oracleUserId = "bceid\\very-long-e~73b6f0007e24";
    PermitInvoiceRow active = activeInvoice(null);
    PermitInvoiceRow cancelled =
        new PermitInvoiceRow(
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
            active.ackMaskAcode(),
            active.submitTimestamp(),
            LocalDateTime.of(2026, 7, 11, 10, 0),
            active.submitUserId(),
            oracleUserId);
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(active), List.of(cancelled));

    TransitionResult result =
        service.orchestrate(transition("COM", "CAN", "CA", null), userId);

    assertThat(result.success()).isTrue();
    verify(repository)
        .updatePermitInvoiceRequired(
            new PermitInvoiceUpdate(INVOICE_NUMBER, null, oracleUserId));
  }

  @Test
  void shouldRejectASecondActiveInvoice() {
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(activeInvoice(null)));

    TransitionResult result =
        service.orchestrate(
            transition("ACT", "PPD", "CA", invoiceSnapshot()), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(repository, never()).insertPermitInvoiceRequired(any());
    verify(repository, never()).insertPermitInvoiceDetailRequired(any());
  }

  @Test
  void shouldRejectGbmsLinkedInvoiceDuringCanadianCancellation() {
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(activeInvoice("GBMS-100")));

    TransitionResult result =
        service.orchestrate(transition("PPD", "CAN", "CA", null), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(repository, never()).updatePermitInvoiceRequired(any());
    assertNoGbmsWrites();
  }

  @Test
  void shouldRejectCancelledGbmsHistoryBeforeCreatingACanadianInvoice() {
    PermitInvoiceRow prior = activeInvoice("GBMS-100");
    PermitInvoiceRow cancelledPrior =
        new PermitInvoiceRow(
            prior.permitInvoiceNumber(),
            prior.permitDetailNumber(),
            prior.gbmsInvoiceNumber(),
            prior.invoiceTotal(),
            prior.clientNumber(),
            prior.clientLocationCode(),
            prior.exemptionOverrideRate(),
            prior.permitOverrideAmount(),
            prior.originOrgNumber(),
            prior.adminOrgNumber(),
            prior.ackMaskAcode(),
            prior.submitTimestamp(),
            LocalDateTime.of(2026, 7, 10, 10, 0),
            prior.submitUserId(),
            "idir\\admin");
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER))
        .thenReturn(List.of(cancelledPrior));

    TransitionResult result =
        service.orchestrate(
            transition("ACT", "COM", "CA", invoiceSnapshot()), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verify(repository, never()).insertPermitInvoiceRequired(any());
    assertNoGbmsWrites();
  }

  @Test
  void shouldFailWhenOracleDoesNotReturnTheSubmittedDetailSet() {
    InternalInvoiceSnapshot snapshot = invoiceSnapshot();
    when(repository.findByPermitDetailNumberRequired(PERMIT_NUMBER)).thenReturn(List.of());
    when(repository.insertPermitInvoiceRequired(any())).thenReturn(activeInvoice(null));
    when(repository.insertPermitInvoiceDetailRequired(any())).thenReturn(List.of());

    TransitionResult result =
        service.orchestrate(
            transition("CAN", "COM", "CA", snapshot), "idir\\jsmith");

    assertThat(result.success()).isFalse();
  }

  @Test
  void shouldValidateEveryDetailBeforeInsertingTheHeader() {
    InternalInvoiceSnapshot valid = invoiceSnapshot();
    InternalInvoiceDetail invalid =
        new InternalInvoiceDetail(
            "TM-2",
            "HE",
            "J",
            BigDecimal.ONE,
            null,
            BigDecimal.ONE,
            BigDecimal.ZERO,
            BigDecimal.ZERO);
    InternalInvoiceSnapshot invalidSnapshot =
        new InternalInvoiceSnapshot(
            valid.invoiceTotal(),
            valid.billingClientNumber(),
            valid.billingClientLocationCode(),
            valid.exemptionOverrideRate(),
            valid.permitOverrideAmount(),
            valid.originOrgNumber(),
            valid.adminOrgNumber(),
            valid.ackMaskAcode(),
            List.of(valid.details().get(0), invalid));

    TransitionResult result =
        service.orchestrate(
            transition("ACT", "COM", "CA", invalidSnapshot), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void shouldRejectNonCanadianPermitsBeforeReadingInvoices() {
    TransitionResult result =
        service.orchestrate(
            transition("ACT", "COM", "US", invoiceSnapshot()), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void shouldRejectReceiptCompletionBecauseItDoesNotCreateAnotherInvoice() {
    TransitionResult result =
        service.orchestrate(
            transition("PPD", "COM", "CA", invoiceSnapshot()), "idir\\jsmith");

    assertThat(result.success()).isFalse();
    verifyNoInteractions(repository);
  }

  private Transition transition(
      String previousStatus,
      String targetStatus,
      String country,
      InternalInvoiceSnapshot snapshot) {
    return new Transition(
        PERMIT_NUMBER,
        previousStatus,
        targetStatus,
        country,
        "EX-700",
        1835L,
        "00000001",
        "01",
        "RCPT-1",
        snapshot);
  }

  private InternalInvoiceSnapshot invoiceSnapshot() {
    return new InternalInvoiceSnapshot(
        BigDecimal.ZERO,
        "00000002",
        "02",
        BigDecimal.valueOf(3.25),
        BigDecimal.valueOf(12.50),
        1835L,
        1835L,
        null,
        List.of(
            new InternalInvoiceDetail(
                "TM-1",
                "FI",
                "A",
                BigDecimal.TEN,
                BigDecimal.valueOf(32.50),
                BigDecimal.valueOf(100.25),
                BigDecimal.valueOf(5),
                BigDecimal.valueOf(0.15))));
  }

  private InternalInvoiceSnapshot invoiceSnapshotWithTwoDetails() {
    InternalInvoiceSnapshot first = invoiceSnapshot();
    return new InternalInvoiceSnapshot(
        first.invoiceTotal(),
        first.billingClientNumber(),
        first.billingClientLocationCode(),
        first.exemptionOverrideRate(),
        first.permitOverrideAmount(),
        first.originOrgNumber(),
        first.adminOrgNumber(),
        first.ackMaskAcode(),
        List.of(
            first.details().get(0),
            new InternalInvoiceDetail(
                "TM-2",
                "HE",
                "J",
                BigDecimal.valueOf(5),
                BigDecimal.valueOf(12.75),
                BigDecimal.valueOf(85.10),
                BigDecimal.valueOf(5),
                BigDecimal.valueOf(0.10))));
  }

  private PermitInvoiceRow activeInvoice(String gbmsInvoiceNumber) {
    return new PermitInvoiceRow(
        INVOICE_NUMBER,
        PERMIT_NUMBER,
        gbmsInvoiceNumber,
        BigDecimal.ZERO,
        "00000002",
        "02",
        BigDecimal.valueOf(3.25),
        BigDecimal.valueOf(12.50),
        1835L,
        1835L,
        null,
        LocalDateTime.of(2026, 7, 11, 9, 0),
        null,
        "idir\\jsmith",
        null);
  }

  private PermitInvoiceDetailRow persistedDetail(InternalInvoiceDetail detail) {
    return new PermitInvoiceDetailRow(
        1_000_001L,
        INVOICE_NUMBER,
        detail.timberMark(),
        detail.speciesCode(),
        detail.gradeCode(),
        detail.volume(),
        detail.amount(),
        detail.amvRate(),
        detail.feePolicyAdmin(),
        detail.feePercentage());
  }

  private void assertNoGbmsWrites() {
    verify(repository, never()).insertGbmsForestInvoiceRequired(any());
    verify(repository, never()).insertGbmsGeneralInvoiceRequired(any());
    verify(repository, never()).insertGbmsInvoiceDetailRequired(any());
    verify(repository, never()).insertGbmsNotationRequired(any());
    verify(repository, never()).cancelGbmsInvoiceRequired(any(), any());
    verify(repository, never()).setGbmsReplacementRequired(any(), any(), any());
  }
}

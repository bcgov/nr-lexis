package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsForestInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsForestInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsGeneralInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsGeneralInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsInvoiceDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsNotationInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsNotationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsReplacementRow;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceLine;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceSnapshot;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@ExtendWith(MockitoExtension.class)
class OracleGbmsPermitInvoiceServiceTest {

  @Mock private PermitInvoiceRepository repository;

  @InjectMocks private OracleGbmsPermitInvoiceService service;

  @Test
  void shouldBoundEachIsolatedGbmsTransaction() {
    Transactional transaction =
        AnnotatedElementUtils.findMergedAnnotation(
            OracleGbmsPermitInvoiceService.class, Transactional.class);

    assertThat(transaction).isNotNull();
    assertThat(transaction.propagation()).isEqualTo(Propagation.REQUIRES_NEW);
    assertThat(transaction.timeoutString())
        .isEqualTo("${lexis.permit-invoice.gbms-timeout-seconds:60}");
  }

  @Test
  void shouldCreateGbmsInvoiceInLegacyOrder() {
    GbmsInvoiceSnapshot snapshot = snapshot();
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow("GBMS-100"));
    when(repository.insertGbmsGeneralInvoiceRequired(any()))
        .thenReturn(new GbmsGeneralInvoiceRow("GBMS-100"));
    when(repository.insertGbmsInvoiceDetailRequired(any()))
        .thenReturn(
            new GbmsInvoiceDetailRow("GBMS-100", 1L),
            new GbmsInvoiceDetailRow("GBMS-100", 2L));
    when(repository.insertGbmsNotationRequired(any()))
        .thenReturn(new GbmsNotationRow("GBMS-100", 2L));

    String invoiceNumber = service.createInvoice(7_000_123L, snapshot, "idir\\jsmith");

    assertThat(invoiceNumber).isEqualTo("GBMS-100");
    ArgumentCaptor<GbmsForestInvoiceInsert> header =
        ArgumentCaptor.forClass(GbmsForestInvoiceInsert.class);
    ArgumentCaptor<GbmsGeneralInvoiceInsert> general =
        ArgumentCaptor.forClass(GbmsGeneralInvoiceInsert.class);
    ArgumentCaptor<GbmsInvoiceDetailInsert> detail =
        ArgumentCaptor.forClass(GbmsInvoiceDetailInsert.class);
    ArgumentCaptor<GbmsNotationInsert> notation =
        ArgumentCaptor.forClass(GbmsNotationInsert.class);
    InOrder order = inOrder(repository);
    order.verify(repository).insertGbmsForestInvoiceRequired(header.capture());
    order.verify(repository).insertGbmsGeneralInvoiceRequired(general.capture());
    order.verify(repository, times(2)).insertGbmsInvoiceDetailRequired(detail.capture());
    order.verify(repository).insertGbmsNotationRequired(notation.capture());

    assertThat(header.getValue())
        .isEqualTo(
            new GbmsForestInvoiceInsert(
                "APP",
                BigDecimal.TEN,
                "MSC",
                "EPT",
                "INT",
                " ",
                null,
                "00077881",
                "01",
                "idir\\jsmith"));
    assertThat(general.getValue())
        .isEqualTo(
            new GbmsGeneralInvoiceInsert(
                "GBMS-100", 1835L, 1835L, null, "7000123", "idir\\jsmith"));
    assertThat(detail.getAllValues())
        .containsExactly(
            new GbmsInvoiceDetailInsert(
                "GBMS-100",
                1835L,
                BigDecimal.ONE,
                "DOL",
                BigDecimal.valueOf(6),
                BigDecimal.valueOf(6),
                " ",
                "FLM",
                "idir\\jsmith",
                "PACKAGE PKG-1",
                "N",
                "N",
                "N"),
            new GbmsInvoiceDetailInsert(
                "GBMS-100",
                1835L,
                BigDecimal.ONE,
                "DOL",
                BigDecimal.valueOf(4),
                BigDecimal.valueOf(4),
                " ",
                "FLM",
                "idir\\jsmith",
                "PACKAGE PKG-2",
                "N",
                "N",
                "N"));
    assertThat(notation.getValue())
        .isEqualTo(
            new GbmsNotationInsert(
                "GBMS-100",
                "EXPORT FEES FOR PERMIT 7000123 ISSUED 2026-03-16",
                "N",
                "idir\\jsmith"));
  }

  @Test
  void shouldStopWhenARequiredGbmsStepFails() {
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow("GBMS-100"));
    when(repository.insertGbmsGeneralInvoiceRequired(any()))
        .thenThrow(new DataRetrievalFailureException("simulated failure"));

    assertThatThrownBy(
            () -> service.createInvoice(7_000_123L, snapshot(), "idir\\jsmith"))
        .isInstanceOf(DataRetrievalFailureException.class);

    verify(repository, never()).insertGbmsInvoiceDetailRequired(any());
    verify(repository, never()).insertGbmsNotationRequired(any());
  }

  @Test
  void shouldRejectABlankGeneratedInvoiceNumber() {
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow(" "));

    assertThatThrownBy(
            () -> service.createInvoice(7_000_123L, snapshot(), "idir\\jsmith"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("no invoice number");

    verify(repository, never()).insertGbmsGeneralInvoiceRequired(any());
  }

  @Test
  void shouldRejectAMismatchedGeneralInvoiceBeforeWritingDetails() {
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow("GBMS-100"));
    when(repository.insertGbmsGeneralInvoiceRequired(any()))
        .thenReturn(new GbmsGeneralInvoiceRow("GBMS-OTHER"));

    assertThatThrownBy(
            () -> service.createInvoice(7_000_123L, snapshot(), "idir\\jsmith"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("general invoice");

    verify(repository, never()).insertGbmsInvoiceDetailRequired(any());
  }

  @Test
  void shouldRejectInvalidDetailAndNotationIdentifiers() {
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow("GBMS-100"));
    when(repository.insertGbmsGeneralInvoiceRequired(any()))
        .thenReturn(new GbmsGeneralInvoiceRow("GBMS-100"));
    when(repository.insertGbmsInvoiceDetailRequired(any()))
        .thenReturn(new GbmsInvoiceDetailRow("GBMS-100", 0L));

    assertThatThrownBy(
            () -> service.createInvoice(7_000_123L, snapshot(), "idir\\jsmith"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid detail number");
    verify(repository, never()).insertGbmsNotationRequired(any());

    org.mockito.Mockito.reset(repository);
    when(repository.insertGbmsForestInvoiceRequired(any()))
        .thenReturn(new GbmsForestInvoiceRow("GBMS-100"));
    when(repository.insertGbmsGeneralInvoiceRequired(any()))
        .thenReturn(new GbmsGeneralInvoiceRow("GBMS-100"));
    when(repository.insertGbmsInvoiceDetailRequired(any()))
        .thenReturn(
            new GbmsInvoiceDetailRow("GBMS-100", 1L),
            new GbmsInvoiceDetailRow("GBMS-100", 2L));
    when(repository.insertGbmsNotationRequired(any()))
        .thenReturn(new GbmsNotationRow("GBMS-100", null));

    assertThatThrownBy(
            () -> service.createInvoice(7_000_123L, snapshot(), "idir\\jsmith"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid notation number");
  }

  @Test
  void shouldDelegateGbmsCancellation() {
    service.cancelInvoice("GBMS-100", "idir\\jsmith");

    verify(repository).cancelGbmsInvoiceRequired("GBMS-100", "idir\\jsmith");
  }

  @Test
  void shouldUseTheLegacyReplacementArgumentOrder() {
    when(repository.setGbmsReplacementRequired("GBMS-NEW", "GBMS-OLD", "idir\\jsmith"))
        .thenReturn(new GbmsReplacementRow("GBMS-OLD", "GBMS-NEW"));

    service.replaceInvoice("GBMS-NEW", "GBMS-OLD", "idir\\jsmith");

    verify(repository)
        .setGbmsReplacementRequired("GBMS-NEW", "GBMS-OLD", "idir\\jsmith");
  }

  private GbmsInvoiceSnapshot snapshot() {
    return new GbmsInvoiceSnapshot(
        BigDecimal.TEN,
        "00077881",
        "01",
        1835L,
        1835L,
        "FLM",
        "EXPORT FEES FOR PERMIT 7000123 ISSUED 2026-03-16",
        List.of(
            new GbmsInvoiceLine(BigDecimal.valueOf(6), "PACKAGE PKG-1"),
            new GbmsInvoiceLine(BigDecimal.valueOf(4), "PACKAGE PKG-2")));
  }
}

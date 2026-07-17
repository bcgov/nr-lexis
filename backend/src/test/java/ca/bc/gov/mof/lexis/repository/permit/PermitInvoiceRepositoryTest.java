package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsForestInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsGeneralInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.GbmsNotationInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceDetailInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceInsert;
import ca.bc.gov.mof.lexis.repository.permit.PermitInvoiceRepository.PermitInvoiceUpdate;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class PermitInvoiceRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void findByPermitDetailNumberShouldBindThePermitDetailNumberAndMapRows() throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.FIND_EXPORT_PERMIT_INVOICE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    stubPermitInvoiceRow(91L, 7000123L, null, null);

    PermitInvoiceRepository repository = repository();

    var rows = repository.findByPermitDetailNumberRequired(7000123L);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).permitInvoiceNumber()).isEqualTo(91L);
    assertThat(rows.get(0).permitDetailNumber()).isEqualTo(7000123L);
    assertThat(rows.get(0).invoiceTotal()).isEqualByComparingTo("125.50");
    assertThat(rows.get(0).submitTimestamp())
        .isEqualTo(LocalDateTime.of(2026, 7, 11, 10, 30));
    verify(callableStatement).setLong(1, 7000123L);
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void findByPermitDetailNumberShouldPropagateOracleFailure() {
    stubOracleFailure("{ call LEXIS_GROUP_9.FIND_EXPORT_PERMIT_INVOICE(?,?) }");

    assertThatThrownBy(() -> repository().findByPermitDetailNumberRequired(7000123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void insertGbmsForestInvoiceShouldBindAllArgumentsAndReturnGeneratedNumber()
      throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.GBMS_INSERT_FRST_INVC_TXN(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn(" A000123 ");
    GbmsForestInvoiceInsert input =
        new GbmsForestInvoiceInsert(
            "APP",
            new BigDecimal("125.50"),
            "MSC",
            "EPT",
            "INT",
            " ",
            null,
            "00077881",
            "01",
            "idir\\jsmith");

    var row = repository().insertGbmsForestInvoiceRequired(input);

    assertThat(row.invoiceNumber()).isEqualTo("A000123");
    verify(callableStatement).setString(1, "APP");
    verify(callableStatement).setBigDecimal(2, new BigDecimal("125.50"));
    verify(callableStatement).setString(3, "MSC");
    verify(callableStatement).setString(4, "EPT");
    verify(callableStatement).setString(5, "INT");
    verify(callableStatement).setString(6, " ");
    verify(callableStatement).setNull(7, Types.VARCHAR);
    verify(callableStatement).setString(8, "00077881");
    verify(callableStatement).setString(9, "01");
    verify(callableStatement).setString(10, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(11, Types.REF_CURSOR);
  }

  @Test
  void insertGbmsForestInvoiceShouldRejectBlankGeneratedNumber() throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.GBMS_INSERT_FRST_INVC_TXN(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("   ");
    GbmsForestInvoiceInsert input =
        new GbmsForestInvoiceInsert(
            "APP",
            BigDecimal.ONE,
            "MSC",
            "EPT",
            "INT",
            null,
            null,
            "00077881",
            "01",
            "idir\\jsmith");

    assertThatThrownBy(() -> repository().insertGbmsForestInvoiceRequired(input))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("blank generated identifier");
  }

  @Test
  void insertGbmsGeneralInvoiceShouldBindNumbersStringsAndTypedNull() throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.GBMS_INSERT_GNRL_INVC_TXN(?,?,?,?,?,?,?) }", 7);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A000123");
    GbmsGeneralInvoiceInsert input =
        new GbmsGeneralInvoiceInsert(
            "A000123", 1909L, 1909L, null, "7000123", "idir\\jsmith");

    var row = repository().insertGbmsGeneralInvoiceRequired(input);

    assertThat(row.invoiceNumber()).isEqualTo("A000123");
    verify(callableStatement).setString(1, "A000123");
    verify(callableStatement).setLong(2, 1909L);
    verify(callableStatement).setLong(3, 1909L);
    verify(callableStatement).setNull(4, Types.VARCHAR);
    verify(callableStatement).setString(5, "7000123");
    verify(callableStatement).setString(6, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(7, Types.REF_CURSOR);
  }

  @Test
  void insertGbmsInvoiceDetailShouldBindAllThirteenInputs() throws Exception {
    stubCursor(
        "{ call LEXIS_GROUP_9.GBMS_INSERT_INVOICE_DTL_TXN(?,?,?,?,?,?,?,?,?,?,?,?,?,?) }",
        14);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A000123");
    when(resultSet.getBigDecimal("LINE_ITEM_NUMBER")).thenReturn(BigDecimal.valueOf(4));
    GbmsInvoiceDetailInsert input =
        new GbmsInvoiceDetailInsert(
            "A000123",
            1909L,
            BigDecimal.ONE,
            "DOL",
            new BigDecimal("125.50"),
            new BigDecimal("125.50"),
            " ",
            "EXF",
            "idir\\jsmith",
            "PACKAGE PKG-1",
            "N",
            "N",
            "N");

    var row = repository().insertGbmsInvoiceDetailRequired(input);

    assertThat(row.invoiceNumber()).isEqualTo("A000123");
    assertThat(row.lineItemNumber()).isEqualTo(4L);
    verify(callableStatement).setString(1, "A000123");
    verify(callableStatement).setLong(2, 1909L);
    verify(callableStatement).setBigDecimal(3, BigDecimal.ONE);
    verify(callableStatement).setString(4, "DOL");
    verify(callableStatement).setBigDecimal(5, new BigDecimal("125.50"));
    verify(callableStatement).setBigDecimal(6, new BigDecimal("125.50"));
    verify(callableStatement).setString(7, " ");
    verify(callableStatement).setString(8, "EXF");
    verify(callableStatement).setString(9, "idir\\jsmith");
    verify(callableStatement).setString(10, "PACKAGE PKG-1");
    verify(callableStatement).setString(11, "N");
    verify(callableStatement).setString(12, "N");
    verify(callableStatement).setString(13, "N");
    verify(callableStatement).registerOutParameter(14, Types.REF_CURSOR);
  }

  @Test
  void insertGbmsNotationShouldBindAllInputsAndReturnGeneratedNumber() throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.GBMS_INSERT_NOTATION_TXN(?,?,?,?,?) }", 5);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A000123");
    when(resultSet.getBigDecimal("NOTATION_NUMBER")).thenReturn(BigDecimal.valueOf(2));
    GbmsNotationInsert input =
        new GbmsNotationInsert("A000123", "LEXIS permit 7000123", "N", "idir\\jsmith");

    var row = repository().insertGbmsNotationRequired(input);

    assertThat(row.notationNumber()).isEqualTo(2L);
    verify(callableStatement).setString(1, "A000123");
    verify(callableStatement).setString(2, "LEXIS permit 7000123");
    verify(callableStatement).setString(3, "N");
    verify(callableStatement).setString(4, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(5, Types.REF_CURSOR);
  }

  @Test
  void cancelGbmsInvoiceShouldBindBothStringsAndPropagateExecution() throws Exception {
    stubExecution("{ call LEXIS_GROUP_9.GBMS_CANCEL_INVOICE(?,?) }");

    repository().cancelGbmsInvoiceRequired("A000123", "idir\\jsmith");

    verify(callableStatement).setString(1, "A000123");
    verify(callableStatement).setString(2, "idir\\jsmith");
    verify(callableStatement).execute();
  }

  @Test
  void setGbmsReplacementShouldBindNewInvoiceBeforeOriginalInvoice() throws Exception {
    stubCursor("{ call LEXIS_GROUP_9.GBMS_SET_REPLACEMENT_INVOICE(?,?,?,?) }", 4);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("INVOICE_NUMBER")).thenReturn("A000122");
    when(resultSet.getString("REPLACED_BY_INVC")).thenReturn("A000123");

    var row =
        repository()
            .setGbmsReplacementRequired("A000123", "A000122", "idir\\jsmith");

    assertThat(row.originalInvoiceNumber()).isEqualTo("A000122");
    assertThat(row.replacementInvoiceNumber()).isEqualTo("A000123");
    verify(callableStatement).setString(1, "A000123");
    verify(callableStatement).setString(2, "A000122");
    verify(callableStatement).setString(3, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(4, Types.REF_CURSOR);
  }

  @Test
  void insertPermitInvoiceShouldBindAllInputsAndSelectTheOnlyActiveRow() throws Exception {
    stubCursor(
        "{ call LEXIS_GROUP_9.INSERT_EXPORT_PERMIT_INVOICE(?,?,?,?,?,?,?,?,?,?,?,?) }",
        12);
    when(resultSet.next()).thenReturn(true, true, false);
    stubPermitInvoiceRowsWithOneActive();
    PermitInvoiceInsert input =
        new PermitInvoiceInsert(
            7000123L,
            "A000123",
            new BigDecimal("125.50"),
            "00077881",
            "01",
            null,
            new BigDecimal("5.00"),
            1909L,
            1909L,
            "EXF",
            "idir\\jsmith");

    var row = repository().insertPermitInvoiceRequired(input);

    assertThat(row.permitInvoiceNumber()).isEqualTo(92L);
    assertThat(row.cancelUserId()).isNull();
    verify(callableStatement).setLong(1, 7000123L);
    verify(callableStatement).setString(2, "A000123");
    verify(callableStatement).setBigDecimal(3, new BigDecimal("125.50"));
    verify(callableStatement).setString(4, "00077881");
    verify(callableStatement).setString(5, "01");
    verify(callableStatement).setNull(6, Types.NUMERIC);
    verify(callableStatement).setBigDecimal(7, new BigDecimal("5.00"));
    verify(callableStatement).setLong(8, 1909L);
    verify(callableStatement).setLong(9, 1909L);
    verify(callableStatement).setString(10, "EXF");
    verify(callableStatement).setString(11, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(12, Types.REF_CURSOR);
  }

  @Test
  void insertPermitInvoiceShouldFailClosedWhenNoActiveGeneratedRowIsReturned()
      throws Exception {
    stubCursor(
        "{ call LEXIS_GROUP_9.INSERT_EXPORT_PERMIT_INVOICE(?,?,?,?,?,?,?,?,?,?,?,?) }",
        12);
    when(resultSet.next()).thenReturn(false);
    PermitInvoiceInsert input =
        new PermitInvoiceInsert(
            7000123L,
            null,
            BigDecimal.ZERO,
            "00077881",
            "01",
            null,
            null,
            1909L,
            1909L,
            null,
            "idir\\jsmith");

    assertThatThrownBy(() -> repository().insertPermitInvoiceRequired(input))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("exactly one active invoice");
  }

  @Test
  void insertPermitInvoiceDetailShouldBindAllInputsAndReturnRequiredCursor()
      throws Exception {
    stubCursor(
        "{ call LEXIS_GROUP_9.INSERT_EXPORT_PERMIT_INV_DET(?,?,?,?,?,?,?,?,?,?,?) }",
        11);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getBigDecimal("PERMIT_INVOICE_DETAIL_NUMBER"))
        .thenReturn(BigDecimal.valueOf(501));
    when(resultSet.getBigDecimal("PERMIT_INVOICE_NUMBER"))
        .thenReturn(BigDecimal.valueOf(92));
    when(resultSet.getString("TIMBER_MARK")).thenReturn("TM-1");
    when(resultSet.getString("EXPORT_SPECIES_CODE")).thenReturn("FI");
    when(resultSet.getString("EXPORT_GRADE_CODE")).thenReturn("J");
    when(resultSet.getBigDecimal("VOLUME")).thenReturn(new BigDecimal("10.25"));
    when(resultSet.getBigDecimal("AMOUNT")).thenReturn(new BigDecimal("125.50"));
    when(resultSet.getBigDecimal("AMV_RATE")).thenReturn(new BigDecimal("45.25"));
    when(resultSet.getBigDecimal("FEE_POLICY_ADMIN")).thenReturn(new BigDecimal("2.50"));
    when(resultSet.getBigDecimal("FEE_PERCENTAGE")).thenReturn(new BigDecimal("0.15"));
    PermitInvoiceDetailInsert input =
        new PermitInvoiceDetailInsert(
            92L,
            "TM-1",
            "FI",
            "J",
            new BigDecimal("10.25"),
            new BigDecimal("125.50"),
            new BigDecimal("45.25"),
            new BigDecimal("2.50"),
            new BigDecimal("0.15"),
            "idir\\jsmith");

    var rows = repository().insertPermitInvoiceDetailRequired(input);

    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).permitInvoiceDetailNumber()).isEqualTo(501L);
    verify(callableStatement).setLong(1, 92L);
    verify(callableStatement).setString(2, "TM-1");
    verify(callableStatement).setString(3, "FI");
    verify(callableStatement).setString(4, "J");
    verify(callableStatement).setBigDecimal(5, new BigDecimal("10.25"));
    verify(callableStatement).setBigDecimal(6, new BigDecimal("125.50"));
    verify(callableStatement).setBigDecimal(7, new BigDecimal("45.25"));
    verify(callableStatement).setBigDecimal(8, new BigDecimal("2.50"));
    verify(callableStatement).setBigDecimal(9, new BigDecimal("0.15"));
    verify(callableStatement).setString(10, "idir\\jsmith");
    verify(callableStatement).registerOutParameter(11, Types.REF_CURSOR);
  }

  @Test
  void updatePermitInvoiceShouldBindNumericIdAndBothStrings() throws Exception {
    stubExecution("{ call LEXIS_GROUP_9.UPDATE_EXPORT_PERMIT_INVOICE(?,?,?) }");
    PermitInvoiceUpdate input =
        new PermitInvoiceUpdate(92L, "A000123", "idir\\jsmith");

    repository().updatePermitInvoiceRequired(input);

    verify(callableStatement).setLong(1, 92L);
    verify(callableStatement).setString(2, "A000123");
    verify(callableStatement).setString(3, "idir\\jsmith");
    verify(callableStatement).execute();
  }

  @Test
  void everyMutationShouldPropagateOracleFailure() {
    when(jdbcTemplate.execute(any(String.class), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    PermitInvoiceRepository repository = repository();

    assertThatThrownBy(
            () ->
                repository.insertGbmsForestInvoiceRequired(
                    new GbmsForestInvoiceInsert(
                        "APP",
                        BigDecimal.ONE,
                        "MSC",
                        "EPT",
                        "INT",
                        null,
                        null,
                        "00077881",
                        "01",
                        "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.insertGbmsGeneralInvoiceRequired(
                    new GbmsGeneralInvoiceInsert(
                        "A000123", 1909L, 1909L, null, "7000123", "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.insertGbmsInvoiceDetailRequired(
                    new GbmsInvoiceDetailInsert(
                        "A000123",
                        1909L,
                        BigDecimal.ONE,
                        "DOL",
                        BigDecimal.ONE,
                        BigDecimal.ONE,
                        " ",
                        "EXF",
                        "user",
                        "PACKAGE PKG-1",
                        "N",
                        "N",
                        "N")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.insertGbmsNotationRequired(
                    new GbmsNotationInsert("A000123", "notation", "N", "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(() -> repository.cancelGbmsInvoiceRequired("A000123", "user"))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.setGbmsReplacementRequired("A000123", "A000122", "user"))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.insertPermitInvoiceRequired(
                    new PermitInvoiceInsert(
                        7000123L,
                        "A000123",
                        BigDecimal.ONE,
                        "00077881",
                        "01",
                        null,
                        null,
                        1909L,
                        1909L,
                        "EXF",
                        "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.insertPermitInvoiceDetailRequired(
                    new PermitInvoiceDetailInsert(
                        92L,
                        "TM-1",
                        "FI",
                        "J",
                        BigDecimal.ONE,
                        BigDecimal.ONE,
                        BigDecimal.ONE,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
    assertThatThrownBy(
            () ->
                repository.updatePermitInvoiceRequired(
                    new PermitInvoiceUpdate(92L, "A000123", "user")))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  private PermitInvoiceRepository repository() {
    return new PermitInvoiceRepository(jdbcTemplate);
  }

  private void stubPermitInvoiceRow(
      long permitInvoiceNumber,
      long permitDetailNumber,
      Timestamp cancelTimestamp,
      String cancelUserId)
      throws Exception {
    when(resultSet.getBigDecimal("PERMIT_INVOICE_NUMBER"))
        .thenReturn(BigDecimal.valueOf(permitInvoiceNumber));
    when(resultSet.getBigDecimal("EXPORT_PERMIT_DETAIL_NUMBER"))
        .thenReturn(BigDecimal.valueOf(permitDetailNumber));
    when(resultSet.getString("GBMS_INVOICE_NUMBER")).thenReturn("A000123");
    when(resultSet.getBigDecimal("INVOICE_TOTAL")).thenReturn(new BigDecimal("125.50"));
    when(resultSet.getString("CLIENT_NUMBER")).thenReturn("00077881");
    when(resultSet.getString("CLIENT_LOCN_CODE")).thenReturn("01");
    when(resultSet.getBigDecimal("EXEMPTION_OVERRIDE_RATE")).thenReturn(null);
    when(resultSet.getBigDecimal("PERMIT_OVERRIDE_AMOUNT")).thenReturn(new BigDecimal("5.00"));
    when(resultSet.getBigDecimal("ORIGIN_ORG_NO")).thenReturn(BigDecimal.valueOf(1909));
    when(resultSet.getBigDecimal("ADMIN_ORG_NO")).thenReturn(BigDecimal.valueOf(1909));
    when(resultSet.getString("ACK_MASK_ACODE")).thenReturn("EXF");
    when(resultSet.getTimestamp("SUBMIT_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf("2026-07-11 10:30:00"));
    when(resultSet.getTimestamp("CANCEL_TIMESTAMP")).thenReturn(cancelTimestamp);
    when(resultSet.getString("SUBMIT_USERID")).thenReturn("idir\\jsmith");
    when(resultSet.getString("CANCEL_USERID")).thenReturn(cancelUserId);
  }

  private void stubPermitInvoiceRowsWithOneActive() throws Exception {
    when(resultSet.getBigDecimal("PERMIT_INVOICE_NUMBER"))
        .thenReturn(BigDecimal.valueOf(92), BigDecimal.valueOf(91));
    when(resultSet.getBigDecimal("EXPORT_PERMIT_DETAIL_NUMBER"))
        .thenReturn(BigDecimal.valueOf(7000123), BigDecimal.valueOf(7000123));
    when(resultSet.getString("GBMS_INVOICE_NUMBER")).thenReturn("A000123", "A000122");
    when(resultSet.getBigDecimal("INVOICE_TOTAL"))
        .thenReturn(new BigDecimal("125.50"), new BigDecimal("100.00"));
    when(resultSet.getString("CLIENT_NUMBER")).thenReturn("00077881", "00077881");
    when(resultSet.getString("CLIENT_LOCN_CODE")).thenReturn("01", "01");
    when(resultSet.getBigDecimal("EXEMPTION_OVERRIDE_RATE")).thenReturn(null, null);
    when(resultSet.getBigDecimal("PERMIT_OVERRIDE_AMOUNT"))
        .thenReturn(new BigDecimal("5.00"), BigDecimal.ZERO);
    when(resultSet.getBigDecimal("ORIGIN_ORG_NO"))
        .thenReturn(BigDecimal.valueOf(1909), BigDecimal.valueOf(1909));
    when(resultSet.getBigDecimal("ADMIN_ORG_NO"))
        .thenReturn(BigDecimal.valueOf(1909), BigDecimal.valueOf(1909));
    when(resultSet.getString("ACK_MASK_ACODE")).thenReturn("EXF", "EXF");
    when(resultSet.getTimestamp("SUBMIT_TIMESTAMP"))
        .thenReturn(
            Timestamp.valueOf("2026-07-11 10:30:00"),
            Timestamp.valueOf("2026-07-10 10:30:00"));
    when(resultSet.getTimestamp("CANCEL_TIMESTAMP"))
        .thenReturn(null, Timestamp.valueOf("2026-07-11 09:00:00"));
    when(resultSet.getString("SUBMIT_USERID")).thenReturn("idir\\jsmith", "idir\\jsmith");
    when(resultSet.getString("CANCEL_USERID")).thenReturn(null, "idir\\jsmith");
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursor(String call, int cursorIndex) throws Exception {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
    when(callableStatement.getObject(cursorIndex)).thenReturn(resultSet);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubExecution(String call) {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubOracleFailure(String call) {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
  }
}

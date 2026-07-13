package ca.bc.gov.mof.lexis.repository.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.sql.Types;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class UploadRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void isFileTypeCodeValidRequiredShouldUseLexisFileTypeLookup() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FILE_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("CODE")).thenReturn("PDF");

    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValidRequired("PDF")).isTrue();
    verify(callableStatement).setString(1, "PDF");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void isFileTypeCodeValidRequiredShouldRejectBlankCodeBeforeCallingOracle() {
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValidRequired(" ")).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void isFileTypeCodeValidRequiredShouldPreserveLegitimateEmptyResult() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FILE_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValidRequired("PDF")).isFalse();
    verify(callableStatement).setString(1, "PDF");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void isFileTypeCodeValidRequiredShouldRejectMismatchedOracleCode() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FILE_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("CODE")).thenReturn("ZIP");
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValidRequired("PDF")).isFalse();
  }

  @Test
  void isFileTypeCodeValidRequiredShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("file type lookup unavailable");
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_CODES.FIND_FILE_TYPE_CODE(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenThrow(failure);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isFileTypeCodeValidRequired("PDF")).isSameAs(failure);
  }

  @Test
  void insertApplicationFileShouldBindContentAsStream() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    stubAttachmentRow(
        9000001L, "document.pdf", "Document", "INS", "PDF", "PDF", "jsmith");
    byte[] bytes = {1, 2, 3};
    InputStream content = new ByteArrayInputStream(bytes);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L, "document.pdf", "Document", "INS", "PDF", "jsmith", content, bytes.length);

    assertThat(result.persisted()).isTrue();
    verify(callableStatement).setBinaryStream(10, content, (long) bytes.length);
    verify(callableStatement).registerOutParameter(11, Types.REF_CURSOR);
  }

  @Test
  void insertInvoiceFileShouldBindContentAsStreamAtInvoiceBlobPosition() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_INVOICE_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) }", 15);
    stubAttachmentRow(
        9000002L, "invoice.pdf", "Invoice", "INV", "PDF", "PDF", "jsmith");
    byte[] bytes = {4, 5, 6, 7};
    InputStream content = new ByteArrayInputStream(bytes);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertInvoiceFile(
            7000123L,
            "123456789",
            "invoice.pdf",
            "Invoice",
            "INV",
            "PDF",
            BigDecimal.TEN,
            BigDecimal.ONE,
            BigDecimal.ONE,
            "jsmith",
            content,
            bytes.length);

    assertThat(result.persisted()).isTrue();
    verify(callableStatement).setBinaryStream(14, content, (long) bytes.length);
    verify(callableStatement).registerOutParameter(15, Types.REF_CURSOR);
  }

  @Test
  void insertApplicationFileShouldRejectNullResultCursor() throws Exception {
    String call =
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }";
    stubProcedure(call);
    when(callableStatement.getObject(11)).thenReturn(null);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "Document",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isFalse();
    assertThat(result.failureReason()).isEqualTo(UploadRepository.UploadFailureReason.UNKNOWN);
  }

  @Test
  void insertApplicationFileShouldRejectEmptyResultCursor() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    when(resultSet.next()).thenReturn(false);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "Document",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isFalse();
  }

  @Test
  void insertApplicationFileShouldRejectDuplicateResultRows() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    stubAttachmentRow(
        9000001L, "document.pdf", "Document", "INS", "PDF", "PDF", "jsmith");
    when(resultSet.next()).thenReturn(true, true);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "Document",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isFalse();
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      value = {
        "different.pdf|Document|INS|PDF|PDF|jsmith",
        "document.pdf|Different description|INS|PDF|PDF|jsmith",
        "document.pdf|Document|PMT|PDF|PDF|jsmith",
        "document.pdf|Document|INS|JPG|PDF|jsmith",
        "document.pdf|Document|INS|PDF|JPG|jsmith",
        "document.pdf|Document|INS|PDF|PDF|different-user"
      })
  void insertApplicationFileShouldRejectMismatchedResultMetadata(
      String returnedFileName,
      String returnedDescription,
      String returnedAttachmentType,
      String returnedFileType,
      String returnedMimeType,
      String returnedEntryUser)
      throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    stubAttachmentRow(
        9000001L,
        returnedFileName,
        returnedDescription,
        returnedAttachmentType,
        returnedFileType,
        returnedMimeType,
        returnedEntryUser);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "Document",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isFalse();
  }

  @Test
  void insertApplicationFileShouldRejectMissingGeneratedMetadata() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    stubAttachmentRow(
        0L, "document.pdf", "Document", "INS", "PDF", "PDF", "jsmith");
    when(resultSet.wasNull()).thenReturn(true);
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "Document",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isFalse();
  }

  @Test
  void insertApplicationFileShouldAcceptOracleNullForEmptyDescription() throws Exception {
    stubCursorProcedure(
        "{ call LEXIS_GROUP_9.INSERT_APPL_FILE_ATTACHMENT(?,?,?,?,?,?,?,?,?,?,?) }", 11);
    stubAttachmentRow(9000001L, "document.pdf", null, "INS", "PDF", "PDF", "jsmith");
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    UploadRepository.UploadPersistenceResult result =
        repository.insertApplicationFile(
            7000123L,
            "document.pdf",
            "",
            "INS",
            "PDF",
            "jsmith",
            new ByteArrayInputStream(new byte[] {1}),
            1);

    assertThat(result.persisted()).isTrue();
  }

  private void stubAttachmentRow(
      long attachmentId,
      String fileName,
      String description,
      String attachmentType,
      String fileType,
      String mimeType,
      String entryUser)
      throws Exception {
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("EXPORT_ATTACHMENT_ID")).thenReturn(attachmentId);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("FILE_NAME")).thenReturn(fileName);
    when(resultSet.getString("DESCRIPTION")).thenReturn(description);
    when(resultSet.getString("EXPORT_FILE_TYPE_CODE")).thenReturn(fileType);
    when(resultSet.getString("EXPORT_ATTACHMENT_TYPE_CODE")).thenReturn(attachmentType);
    when(resultSet.getString("EXPORT_FILE_MIME_TYPE_CODE")).thenReturn(mimeType);
    when(resultSet.getString("ENTRY_USERID")).thenReturn(entryUser);
    when(resultSet.getTimestamp("ENTRY_TIMESTAMP"))
        .thenReturn(new Timestamp(System.currentTimeMillis()));
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubProcedure(String call) {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call, int cursorIndex) throws Exception {
    stubProcedure(call);
    when(callableStatement.getObject(cursorIndex)).thenReturn(resultSet);
  }
}

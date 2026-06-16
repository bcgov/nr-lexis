package ca.bc.gov.mof.lexis.repository.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.Types;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class UploadRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void isFileTypeCodeValidShouldUseLexisFileTypeLookup() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_FILE_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("CODE")).thenReturn("PDF");

    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValid("PDF")).isTrue();
    verify(callableStatement).setString(1, "PDF");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void isFileTypeCodeValidShouldRejectBlankCodeBeforeCallingOracle() {
    UploadRepository repository = new UploadRepository(jdbcTemplate);

    assertThat(repository.isFileTypeCodeValid(" ")).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call, int cursorIndex) throws Exception {
    when(jdbcTemplate.execute(eq(call), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
    when(callableStatement.getObject(cursorIndex)).thenReturn(resultSet);
  }
}

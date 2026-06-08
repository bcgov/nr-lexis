package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
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
class PermitRpcRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void findAllCountryCodesShouldUseOracleRowsWhenAvailable() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }");
    when(resultSet.next()).thenReturn(true, true, false);
    when(resultSet.getString("CODE")).thenReturn("US", "NZ");
    when(resultSet.getString("DESCRIPTION")).thenReturn("United States", "New Zealand");
    when(resultSet.getLong("GROUP_BY")).thenReturn(2L, 2L);
    when(resultSet.getLong("ORDER_BY")).thenReturn(1L, 2L);
    when(resultSet.wasNull()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodes();

    assertThat(rows)
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(
            tuple("US", "United States", 2L, 1L),
            tuple("NZ", "New Zealand", 2L, 2L));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void findAllCountryCodesShouldFallbackWhenCodePackageReturnsEmpty() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }");
    when(resultSet.next()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    var rows = repository.findAllCountryCodes();

    assertThat(rows)
        .extracting("code", "description", "groupBy", "orderBy")
        .containsExactly(
            tuple("CA", "Canada", 1L, 1L),
            tuple("US", "United States", 2L, 1L),
            tuple("JP", "Japan", 2L, 2L),
            tuple("CN", "China", 2L, 3L),
            tuple("NZ", "New Zealand", 2L, 4L),
            tuple("GB", "United Kingdom", 2L, 5L));
    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
  }

  @Test
  void findProductTypeDescriptionShouldFallbackWhenCodePackageReturnsEmpty() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_PRODUCT_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(false);

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findProductTypeDescription("T")).contains("Unmanufactured Timber");
    verify(callableStatement).setString(1, "T");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @Test
  void findGrowthTypeDescriptionShouldUseOracleRowWhenAvailable() throws Exception {
    stubCursorProcedure("{ call LEXIS_CODES.FIND_GROWTH_TYPE_CODE(?,?) }", 2);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString(2)).thenReturn("Oracle Second Growth");

    PermitRpcRepository repository = new PermitRpcRepository(jdbcTemplate);

    assertThat(repository.findGrowthTypeDescription("S")).contains("Oracle Second Growth");
    verify(callableStatement).setString(1, "S");
    verify(callableStatement).registerOutParameter(2, Types.REF_CURSOR);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private void stubCursorProcedure(String call) throws Exception {
    stubCursorProcedure(call, 1);
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

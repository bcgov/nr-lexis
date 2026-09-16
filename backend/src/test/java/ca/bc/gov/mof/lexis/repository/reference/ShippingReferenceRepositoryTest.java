package ca.bc.gov.mof.lexis.repository.reference;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PORTS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_TRANSPORT_TYPES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class ShippingReferenceRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void activeCountriesShouldRemainARequiredCursorLookup() throws Exception {
    when(jdbcTemplate.execute(
            eq("{ call LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?) }"),
            any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback<?> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(callableStatement);
            });
    when(callableStatement.getObject(1)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("CODE")).thenReturn(" US ");
    when(resultSet.getString("DESCRIPTION")).thenReturn(" United States ");
    ShippingReferenceRepository repository = new ShippingReferenceRepository(jdbcTemplate);

    assertThat(repository.findActiveCountriesRequired())
        .containsExactly(new CodeNameDto("US", "United States"));

    verify(callableStatement).registerOutParameter(1, Types.REF_CURSOR);
    verify(resultSet).getString("CODE");
    verify(resultSet).getString("DESCRIPTION");
  }

  @Test
  @SuppressWarnings("unchecked")
  void activeTransportTypesAndPortsShouldUseDirectQueriesAndRequiredColumnMapping()
      throws Exception {
    when(jdbcTemplate.query(
            eq(ACTIVE_TRANSPORT_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              when(resultSet.getString("CODE")).thenReturn(" S ");
              when(resultSet.getString("DESCRIPTION")).thenReturn(" Ship ");
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              when(resultSet.getString("CODE")).thenReturn(" VA ");
              when(resultSet.getString("DESCRIPTION")).thenReturn(" Vancouver ");
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    ShippingReferenceRepository repository = new ShippingReferenceRepository(jdbcTemplate);

    assertThat(repository.findActiveTransportTypesRequired())
        .containsExactly(new CodeNameDto("S", "Ship"));
    assertThat(repository.findActivePortsRequired())
        .containsExactly(new CodeNameDto("VA", "Vancouver"));

    ArgumentCaptor<Object[]> transportBinds = ArgumentCaptor.forClass(Object[].class);
    ArgumentCaptor<Object[]> portBinds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate)
        .query(eq(ACTIVE_TRANSPORT_TYPES), any(RowMapper.class), transportBinds.capture());
    verify(jdbcTemplate).query(eq(ACTIVE_PORTS), any(RowMapper.class), portBinds.capture());
    assertThat(transportBinds.getValue()).isEmpty();
    assertThat(portBinds.getValue()).isEmpty();
    verify(resultSet, times(2)).getString("CODE");
    verify(resultSet, times(2)).getString("DESCRIPTION");
    assertThat(ACTIVE_TRANSPORT_TYPES)
        .contains("INNER JOIN THE.EXPORT_TRNSPRT_TYPE_CODE_ORDER")
        .contains("SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE")
        .contains("ORDER BY O.GROUP_BY, O.ORDER_BY");
    assertThat(ACTIVE_PORTS)
        .contains("SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE")
        .doesNotContain("ORDER BY");
  }

  @Test
  @SuppressWarnings("unchecked")
  void activeTransportTypesShouldFailWhenARequiredDirectQueryColumnCannotBeRead()
      throws Exception {
    when(jdbcTemplate.query(
            eq(ACTIVE_TRANSPORT_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              when(resultSet.getString("CODE")).thenReturn("S");
              when(resultSet.getString("DESCRIPTION")).thenThrow(new SQLException("missing"));
              RowMapper<CodeNameDto> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    ShippingReferenceRepository repository = new ShippingReferenceRepository(jdbcTemplate);

    assertThatThrownBy(repository::findActiveTransportTypesRequired)
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("DESCRIPTION");
  }

  @Test
  @SuppressWarnings("unchecked")
  void activeTransportTypesAndPortsShouldPreserveEmptyDirectQueryResults() {
    when(jdbcTemplate.query(
            eq(ACTIVE_TRANSPORT_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());
    ShippingReferenceRepository repository = new ShippingReferenceRepository(jdbcTemplate);

    assertThat(repository.findActiveTransportTypesRequired()).isEmpty();
    assertThat(repository.findActivePortsRequired()).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void activeTransportTypesAndPortsShouldPropagateDirectQueryFailures() {
    when(jdbcTemplate.query(
            eq(ACTIVE_TRANSPORT_TYPES), any(RowMapper.class), any(Object[].class)))
        .thenThrow(new DataAccessResourceFailureException("transport unavailable"));
    when(jdbcTemplate.query(eq(ACTIVE_PORTS), any(RowMapper.class), any(Object[].class)))
        .thenThrow(new DataAccessResourceFailureException("ports unavailable"));
    ShippingReferenceRepository repository = new ShippingReferenceRepository(jdbcTemplate);

    assertThatThrownBy(repository::findActiveTransportTypesRequired)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("transport unavailable");
    assertThatThrownBy(repository::findActivePortsRequired)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("ports unavailable");
  }
}

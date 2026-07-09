package ca.bc.gov.mof.lexis.repository.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.federal.FederalPermitDetailRepository.FederalPermitDetailRecord;
import ca.bc.gov.mof.lexis.repository.federal.FederalPermitDetailRepository.FederalPermitDetailRow;
import java.sql.CallableStatement;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class FederalPermitDetailRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement callableStatement;
  @Mock private ResultSet resultSet;

  @Test
  void insertFederalPermitDetailShouldUseLegacyGroupThreeProcedureAndBindOrder()
      throws Exception {
    stubCursorProcedure("{ call LEXIS_GROUP_3.INSERT_FEDERAL_PERMIT(?,?,?,?,?,?,?,?,?,?,?,?,?,?) }", 14);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getLong("EXPORT_FED_PERMIT_DETAIL_ID")).thenReturn(7000123L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getTimestamp("EXPORT_PERMIT_ISSUE_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-01 00:00:00"));
    when(resultSet.getTimestamp("ESTIMATED_SHIPPING_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-07 00:00:00"));
    when(resultSet.getTimestamp("APPLICATION_DATE"))
        .thenReturn(Timestamp.valueOf("2026-05-20 00:00:00"));
    when(resultSet.getString("EXPORT_COUNTRY_CODE")).thenReturn("US");
    when(resultSet.getString("EXPORT_TRANSPORT_TYPE_CODE")).thenReturn("VSL");
    when(resultSet.getString("TRANSPORT_NAME")).thenReturn("MV FEDERAL");
    when(resultSet.getString("EXPORT_PORT_OF_EXPORT_CODE")).thenReturn("VAN");
    when(resultSet.getString("OTHER_PORT_OF_EXPORT")).thenReturn("ALT");
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1909L);
    when(resultSet.getString("CLIENT_LOCN_CODE")).thenReturn("01");
    when(resultSet.getString("CLIENT_NUMBER")).thenReturn("00012345");

    FederalPermitDetailRepository repository = new FederalPermitDetailRepository(jdbcTemplate);

    Optional<FederalPermitDetailRow> response =
        repository.insertFederalPermitDetail(
            new FederalPermitDetailRecord(
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 7),
                " ALT ",
                " MV FEDERAL ",
                " idir\\federal ",
                " VSL ",
                " US ",
                " VAN ",
                LocalDate.of(2026, 5, 20),
                1909L,
                " 01 ",
                " 00012345 "));

    assertThat(response).isPresent();
    FederalPermitDetailRow row = response.orElseThrow();
    assertThat(row.permitNumber()).isEqualTo(7000123L);
    assertThat(row.permitIssueDate()).isEqualTo(LocalDate.of(2026, 6, 1));
    assertThat(row.estimatedShippingDate()).isEqualTo(LocalDate.of(2026, 6, 7));
    assertThat(row.countryCode()).isEqualTo("US");
    assertThat(row.transportTypeCode()).isEqualTo("VSL");
    assertThat(row.transportName()).isEqualTo("MV FEDERAL");
    assertThat(row.portOfExportCode()).isEqualTo("VAN");
    assertThat(row.otherPortOfExport()).isEqualTo("ALT");
    assertThat(row.applicationDate()).isEqualTo(LocalDate.of(2026, 5, 20));
    assertThat(row.orgUnitNumber()).isEqualTo(1909L);
    assertThat(row.clientLocationCode()).isEqualTo("01");
    assertThat(row.clientNumber()).isEqualTo("00012345");

    verify(callableStatement).setDate(1, Date.valueOf("2026-06-01"));
    verify(callableStatement).setDate(2, Date.valueOf("2026-06-07"));
    verify(callableStatement).setString(3, "ALT");
    verify(callableStatement).setString(4, "MV FEDERAL");
    verify(callableStatement).setString(5, "idir\\federal");
    verify(callableStatement).setTimestamp(eq(6), any(Timestamp.class));
    verify(callableStatement).setString(7, "VSL");
    verify(callableStatement).setString(8, "US");
    verify(callableStatement).setString(9, "VAN");
    verify(callableStatement).setDate(10, Date.valueOf("2026-05-20"));
    verify(callableStatement).setLong(11, 1909L);
    verify(callableStatement).setString(12, "01");
    verify(callableStatement).setString(13, "00012345");
    verify(callableStatement).registerOutParameter(14, Types.REF_CURSOR);
  }

  @Test
  void insertFederalPermitDetailShouldSkipOracleWhenEntryUserMissing() {
    FederalPermitDetailRepository repository = new FederalPermitDetailRepository(jdbcTemplate);

    Optional<FederalPermitDetailRow> response =
        repository.insertFederalPermitDetail(
            new FederalPermitDetailRecord(
                LocalDate.of(2026, 6, 1),
                LocalDate.of(2026, 6, 7),
                null,
                "MV FEDERAL",
                " ",
                "VSL",
                "US",
                "VAN",
                LocalDate.of(2026, 5, 20),
                1909L,
                "01",
                "00012345"));

    assertThat(response).isEmpty();
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

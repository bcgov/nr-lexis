package ca.bc.gov.mof.lexis.repository.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mockingDetails;
import static org.mockito.Mockito.verify;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.ColumnSnapshot;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RowSetSnapshot;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RowSnapshot;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OracleAggregateLockRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;

  @Test
  void shouldUseBoundedRowLocksForEachAggregateRoot() {
    OracleAggregateLockRepository repository =
        new OracleAggregateLockRepository(jdbcTemplate);

    repository.lockExemption("EX-1");
    repository.lockApplication(10L);
    repository.lockPermit(100L);
    repository.lockOffer(1000L);

    verify(jdbcTemplate)
        .query(
            contains("FROM EXPORT_EXEMPTION WHERE EXEMPTION_NUMBER = ? FOR UPDATE WAIT 30"),
            any(RowMapper.class),
            eq("EX-1"));
    verify(jdbcTemplate)
        .query(
            contains(
                "FROM EXPORT_EXEMPTION_APPLICATION WHERE APPLICATION_NUMBER = ? FOR UPDATE WAIT 30"),
            any(RowMapper.class),
            eq(10L));
    verify(jdbcTemplate)
        .query(
            contains(
                "FROM EXPORT_PERMIT_DETAIL WHERE EXPORT_PERMIT_DETAIL_NUMBER = ? FOR UPDATE WAIT 30"),
            any(RowMapper.class),
            eq(100L));
    verify(jdbcTemplate)
        .query(
            contains(
                "FROM EXPORT_PURCHASE_OFFER WHERE EXPORT_PURCHASE_OFFER_NUMBER = ? FOR UPDATE WAIT 30"),
            any(RowMapper.class),
            eq(1000L));
  }

  @Test
  void childScalarChangesShouldChangeTheAggregateFingerprint() {
    RowSetSnapshot root = rowSet("APPLICATION", row("APPLICATION_NUMBER", "10"));
    RowSetSnapshot originalRemarks =
        rowSet("REMARKS", row("REMARK_NUMBER", "1", "REMARK", "original"));
    RowSetSnapshot changedRemarks =
        rowSet("REMARKS", row("REMARK_NUMBER", "1", "REMARK", "changed"));

    String original = OracleAggregateLockRepository.fingerprint(List.of(root, originalRemarks));
    String changed = OracleAggregateLockRepository.fingerprint(List.of(root, changedRemarks));

    assertThat(changed).isNotEqualTo(original);
    assertThat(OracleAggregateLockRepository.fingerprint(List.of(root, originalRemarks)))
        .isEqualTo(original);
  }

  @Test
  void childInsertAndDeleteShouldChangeTheAggregateFingerprint() {
    RowSetSnapshot root = rowSet("PERMIT", row("PERMIT_NUMBER", "100"));
    RowSnapshot first = row("SCALE_ID", "A", "VOLUME", "5");
    RowSnapshot second = row("SCALE_ID", "B", "VOLUME", "8");

    String oneChild =
        OracleAggregateLockRepository.fingerprint(
            List.of(root, new RowSetSnapshot("SCALES", List.of(first))));
    String twoChildren =
        OracleAggregateLockRepository.fingerprint(
            List.of(root, new RowSetSnapshot("SCALES", List.of(first, second))));
    String noChildren =
        OracleAggregateLockRepository.fingerprint(
            List.of(root, new RowSetSnapshot("SCALES", List.of())));

    assertThat(twoChildren).isNotEqualTo(oneChild);
    assertThat(noChildren).isNotEqualTo(oneChild);
  }

  @Test
  void aggregateVersionShouldDescribeTheLatestAuditedChildSave() {
    stubRoot("EXPORT_EXEMPTION_APPLICATION", 10L);
    doReturn(
            List.of(
                new RowSnapshot(
                    List.of(new ColumnSnapshot("REMARK", "later child save")),
                    Instant.parse("2026-07-15T18:05:00Z"),
                    "IDIR\\SECOND")))
        .when(jdbcTemplate)
        .query(
            contains("FROM EXPORT_EXEMPTION_APP_REMARKS"),
            any(RowMapper.class),
            eq(10L));
    OracleAggregateLockRepository repository =
        new OracleAggregateLockRepository(jdbcTemplate);

    var version = repository.findApplicationVersion(10L).orElseThrow();

    assertThat(version.savedAt()).isEqualTo(Instant.parse("2026-07-15T18:05:00Z"));
    assertThat(version.updatedBy()).isEqualTo("IDIR\\SECOND");
  }

  @Test
  void applicationVersionShouldReadEveryMutableChildSetInStableOrder() {
    stubRoot("EXPORT_EXEMPTION_APPLICATION", 10L);
    OracleAggregateLockRepository repository =
        new OracleAggregateLockRepository(jdbcTemplate);

    repository.findApplicationVersion(10L);

    List<String> sql = executedSql();
    assertThat(sql)
        .anyMatch(value -> value.contains("FROM EXPORT_EXEMPTION_APP_REMARKS"))
        .anyMatch(value -> value.contains("FROM EXPORT_PACKAGE"))
        .anyMatch(value -> value.contains("FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE"))
        .anyMatch(value -> value.contains("FROM EXPORT_SCALE_DETAIL"))
        .anyMatch(value -> value.contains("FROM EXPORT_APPL_FILE_ATTCHMNT"))
        .anyMatch(value -> value.contains("FROM EXPORT_FEDERAL_PERMIT_DETAIL"))
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_DETAIL"))
        .anyMatch(value -> value.contains("FROM EXPORT_PURCHASE_OFFER"));
    assertOrderedChildQueries(sql);
    assertBlobQueriesUseLengthOnly(sql);
  }

  @Test
  void exemptionVersionShouldReadEveryMutableChildSetInStableOrder() {
    stubRoot("EXPORT_EXEMPTION", "EX-1");
    OracleAggregateLockRepository repository =
        new OracleAggregateLockRepository(jdbcTemplate);

    repository.findExemptionVersion("EX-1");

    List<String> sql = executedSql();
    assertThat(sql)
        .anyMatch(value -> value.contains("FROM EXPORT_EXEMPTION_RATE"))
        .anyMatch(value -> value.contains("FROM OIC_EXEMPTION_ORG_UNIT"))
        .anyMatch(value -> value.contains("FROM EXPORT_EXEMPT_FILE_ATTCHMNT"))
        .anyMatch(value -> value.contains("FROM EXPORT_EXEMPTION_APPLICATION"))
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_DETAIL"));
    assertOrderedChildQueries(sql);
    assertBlobQueriesUseLengthOnly(sql);
  }

  @Test
  void permitVersionShouldReadEveryMutableChildSetInStableOrder() {
    stubRoot("EXPORT_PERMIT_DETAIL", 100L);
    OracleAggregateLockRepository repository =
        new OracleAggregateLockRepository(jdbcTemplate);

    repository.findPermitVersion(100L);

    List<String> sql = executedSql();
    assertThat(sql)
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_APPL_SPCS_ENDUSE"))
        .anyMatch(value -> value.contains("FROM EXPORT_SCALE_DETAIL"))
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_FILE_ATTACHMENT"))
        .anyMatch(value -> value.contains("FROM EXPORT_SALES_INVOICE"))
        .anyMatch(value -> value.contains("FROM EXPORT_SALES_INVCE_FILE_ATTACH"))
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_INVOICE"))
        .anyMatch(value -> value.contains("FROM EXPORT_PERMIT_INVOICE_DETAIL"))
        .anyMatch(value -> value.contains("FROM EXPORT_PACKAGE"))
        .anyMatch(value -> value.contains("FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE"));
    assertOrderedChildQueries(sql);
    assertBlobQueriesUseLengthOnly(sql);
  }

  private void stubRoot(String tableName, Object identifier) {
    doReturn(
            List.of(
                new RowSnapshot(
                    List.of(new ColumnSnapshot("ID", identifier.toString())),
                    Instant.parse("2026-07-15T18:00:00Z"),
                    "IDIR\\EDITOR")))
        .when(jdbcTemplate)
        .query(
            contains("SELECT * FROM " + tableName + " WHERE"),
            any(RowMapper.class),
            eq(identifier));
  }

  private List<String> executedSql() {
    return mockingDetails(jdbcTemplate).getInvocations().stream()
        .map(invocation -> invocation.getArgument(0, String.class))
        .toList();
  }

  private void assertOrderedChildQueries(List<String> sql) {
    assertThat(sql.stream().skip(1)).allMatch(value -> value.contains("ORDER BY"));
  }

  private void assertBlobQueriesUseLengthOnly(List<String> sql) {
    assertThat(
            sql.stream()
                .filter(
                    value ->
                        value.contains("FILE_ATTCHMNT")
                            || value.contains("FILE_ATTACHMENT")
                            || value.contains("FILE_ATTACH")))
        .allMatch(value -> value.contains("DBMS_LOB.GETLENGTH"))
        .noneMatch(value -> value.startsWith("SELECT a.*"));
  }

  private static RowSetSnapshot rowSet(String name, RowSnapshot... rows) {
    return new RowSetSnapshot(name, List.of(rows));
  }

  private static RowSnapshot row(String... columns) {
    assertThat(columns.length).isEven();
    ArrayList<ColumnSnapshot> values = new ArrayList<>();
    for (int index = 0; index < columns.length; index += 2) {
      values.add(new ColumnSnapshot(columns[index], columns[index + 1]));
    }
    return new RowSnapshot(List.copyOf(values), null, null);
  }
}

package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

class ExemptionDetailQueriesTest {

  private EmbeddedDatabase database;
  private JdbcTemplate jdbc;
  private ExemptionRepository repository;

  @BeforeEach
  void setUp() {
    database = new EmbeddedDatabaseBuilder()
        .generateUniqueName(true)
        .setType(EmbeddedDatabaseType.H2)
        .build();
    jdbc = new JdbcTemplate(database);
    jdbc.execute("SET MODE Oracle");
    jdbc.execute("CREATE SCHEMA THE");
    jdbc.execute("""
        CREATE TABLE THE.EXPORT_EXEMPTION (
          EXEMPTION_NUMBER VARCHAR PRIMARY KEY, APPROVED_VOLUME DECIMAL(12,2),
          APPROVAL_DATE TIMESTAMP, EXPIRY_DATE TIMESTAMP, OTHER_CONDITIONS VARCHAR,
          ENTRY_USERID VARCHAR, ENTRY_TIMESTAMP TIMESTAMP,
          UPDATE_USERID VARCHAR, UPDATE_TIMESTAMP TIMESTAMP,
          EXPORT_EXEMPTION_TYPE_CODE VARCHAR, EXPORT_EXEMPTION_STATUS_CODE VARCHAR
        )
        """);
    jdbc.execute("""
        CREATE TABLE THE.EXPORT_EXEMPTION_APPLICATION (
          APPLICATION_NUMBER BIGINT PRIMARY KEY, EXEMPTION_NUMBER VARCHAR,
          AGENT_CLIENT_NUMBER VARCHAR, OWNER_CLIENT_NUMBER VARCHAR,
          EXPORT_SCHEDULE_ID BIGINT, ORG_UNIT_NO BIGINT,
          OIC_INDICATOR VARCHAR, EXPORT_JURISDICTION_CODE VARCHAR
        )
        """);
    jdbc.execute("CREATE TABLE THE.EXPORT_SCHEDULE (EXPORT_SCHEDULE_ID BIGINT, ADVERTISING_DATE TIMESTAMP)");
    jdbc.execute("CREATE TABLE THE.EXPORT_PACKAGE (PACKAGE_NUMBER BIGINT, APPLICATION_NUMBER BIGINT)");
    jdbc.execute("""
        CREATE TABLE THE.EXPORT_SCALE_DETAIL (
          PACKAGE_NUMBER BIGINT, SPECIES_GRADE_VOLUME DECIMAL(12,2),
          EXPORT_PERMIT_DETAIL_NUMBER BIGINT
        )
        """);
    jdbc.execute("""
        CREATE TABLE THE.EXPORT_PERMIT_DETAIL (
          EXPORT_PERMIT_DETAIL_NUMBER BIGINT PRIMARY KEY, EXEMPTION_NUMBER VARCHAR,
          PERMIT_VOLUME DECIMAL(12,2), EXPORT_PERMIT_STATUS_CODE VARCHAR NOT NULL
        )
        """);
    jdbc.execute("CREATE TABLE THE.ORG_UNIT (ORG_UNIT_NO BIGINT, ORG_UNIT_NAME VARCHAR, ORG_UNIT_CODE VARCHAR)");
    jdbc.execute("CREATE TABLE THE.OIC_EXEMPTION_ORG_UNIT (EXEMPTION_NUMBER VARCHAR, ORG_UNIT_NO BIGINT)");
    jdbc.execute("CREATE TABLE THE.EXPORT_EXEMPTION_STATUS_CODE (EXPORT_EXEMPTION_STATUS_CODE VARCHAR, DESCRIPTION VARCHAR)");
    jdbc.execute("""
        INSERT INTO THE.EXPORT_EXEMPTION
          (EXEMPTION_NUMBER, APPROVED_VOLUME, EXPORT_EXEMPTION_TYPE_CODE, EXPORT_EXEMPTION_STATUS_CODE)
        VALUES ('EX-205', 100, 'M', 'ACT'), ('EMPTY', 100, 'M', 'ACT')
        """);
    jdbc.execute("INSERT INTO THE.EXPORT_EXEMPTION_STATUS_CODE VALUES ('ACT', 'Active')");
    jdbc.execute("""
        INSERT INTO THE.EXPORT_EXEMPTION_APPLICATION VALUES
          (1, 'EX-205', 'AGENT', 'OWNER', 1, 1905, 'N', 'P'),
          (2, 'EX-205', 'AGENT', 'OWNER', 2, 1906, 'N', 'P')
        """);
    jdbc.execute("INSERT INTO THE.EXPORT_SCHEDULE VALUES (1, TIMESTAMP '2026-01-01 00:00:00'), (2, TIMESTAMP '2026-02-01 00:00:00')");
    jdbc.execute("INSERT INTO THE.ORG_UNIT VALUES (1905, 'Region A', 'A'), (1906, 'Region B', 'B'), (1907, 'Region C', 'C')");
    jdbc.execute("INSERT INTO THE.OIC_EXEMPTION_ORG_UNIT VALUES ('EX-205', 1907)");
    jdbc.execute("INSERT INTO THE.EXPORT_PACKAGE VALUES (11, 1), (22, 2)");
    jdbc.execute("""
        INSERT INTO THE.EXPORT_PERMIT_DETAIL VALUES
          (101, 'EX-205', 30, 'COM'), (102, 'EX-205', 15, 'COM'),
          (103, 'EX-205', 20, 'ACT'), (104, 'EX-205', 5, 'PPD'),
          (105, 'EX-205', 7, 'CAN'), (106, 'EX-205', 8, 'NEW'),
          (999, 'OTHER', 900, 'COM')
        """);
    jdbc.execute("""
        INSERT INTO THE.EXPORT_SCALE_DETAIL VALUES
          (11, 10, 101), (11, 20, 101), (22, 15, 102),
          (22, 20, 103), (22, 5, 104), (22, 7, 105), (22, 8, NULL)
        """);

    for (String table : List.of(
        "EXPORT_EXEMPTION", "EXPORT_EXEMPTION_APPLICATION", "EXPORT_SCHEDULE", "EXPORT_PACKAGE",
        "EXPORT_SCALE_DETAIL", "EXPORT_PERMIT_DETAIL", "ORG_UNIT", "OIC_EXEMPTION_ORG_UNIT",
        "EXPORT_EXEMPTION_STATUS_CODE")) {
      jdbc.execute("CREATE SYNONYM " + table + " FOR THE." + table);
    }
    repository = new ExemptionRepository(jdbc);
  }

  @AfterEach
  void tearDown() {
    database.shutdown();
  }

  @Test
  void completedPermitsAndAssignedScaleBalanceShouldExcludeCancelledPermits() {
    var detail = repository.findByExemptionNumber("EX-205").orElseThrow();

    assertThat(jdbc.queryForList(ExemptionDetailQueries.BY_NUMBER, "EX-205")).hasSize(1);
    assertThat(detail.completedPermitVolume()).isEqualTo(45.0d);
    // Completed 45 + active 20 + payment-pending 5; cancelled 7 and unassigned 8 do not reserve.
    assertThat(detail.usedVolume()).isEqualTo(70.0d);
    assertThat(detail.remainingVolume()).isEqualTo(30.0d);

    var empty = repository.findByExemptionNumber("EMPTY").orElseThrow();
    assertThat(empty.completedPermitVolume()).isZero();
    assertThat(empty.usedVolume()).isZero();
    assertThat(empty.remainingVolume()).isEqualTo(100.0d);
  }

  @Test
  void cancellingAndReopeningShouldReleaseAndReserveRetainedScaleLinks() {
    jdbc.update("UPDATE THE.EXPORT_PERMIT_DETAIL SET EXPORT_PERMIT_STATUS_CODE = 'CAN' "
        + "WHERE EXPORT_PERMIT_DETAIL_NUMBER IN (101, 103)");
    var cancelled = repository.findByExemptionNumber("EX-205").orElseThrow();
    assertThat(cancelled.completedPermitVolume()).isEqualTo(15.0d);
    assertThat(cancelled.usedVolume()).isEqualTo(20.0d);
    assertThat(cancelled.remainingVolume()).isEqualTo(80.0d);

    jdbc.update("UPDATE THE.EXPORT_PERMIT_DETAIL SET EXPORT_PERMIT_STATUS_CODE = 'COM' "
        + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = 101");
    jdbc.update("UPDATE THE.EXPORT_PERMIT_DETAIL SET EXPORT_PERMIT_STATUS_CODE = 'ACT' "
        + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = 103");
    var reopened = repository.findByExemptionNumber("EX-205").orElseThrow();
    assertThat(reopened.completedPermitVolume()).isEqualTo(45.0d);
    assertThat(reopened.usedVolume()).isEqualTo(70.0d);
    assertThat(reopened.remainingVolume()).isEqualTo(30.0d);
  }

  @Test
  void allCancelledPermitsShouldLeaveFullApprovedVolumeAvailable() {
    cancelAllPermits();
    var detail = repository.findByExemptionNumber("EX-205").orElseThrow();
    assertThat(detail.completedPermitVolume()).isZero();
    assertThat(detail.usedVolume()).isZero();
    assertThat(detail.remainingVolume()).isEqualTo(100.0d);
  }

  @ParameterizedTest
  @CsvSource({
      "exemptionNumber, false",
      "balanceRemaining, false",
      "exemptionNumber, true",
      "balanceRemaining, true"
  })
  void searchAndSummaryPathsShouldExcludeCancelledPermitVolumes(
      String sortField, boolean clientScoped) {
    // Number sorting exercises page-first SQL; balance sorting exercises aggregate-first SQL.
    // Search retains its stored-permit measure, including the unscaled NEW permit's 8 m3.
    ExemptionSearchCriteria criteria = new ExemptionSearchCriteria(
        null, null, null, null, null, clientScoped ? "OWNER" : null,
        null, null, null, List.of(), true, false, clientScoped, sortField, 0, 10);
    assertThat(searchExemption(criteria).balanceRemaining()).isEqualTo(22.0d);

    cancelAllPermits();
    assertThat(searchExemption(criteria).balanceRemaining()).isEqualTo(100.0d);

    jdbc.update("UPDATE THE.EXPORT_PERMIT_DETAIL SET EXPORT_PERMIT_STATUS_CODE = 'ACT' "
        + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = 103");
    assertThat(searchExemption(criteria).balanceRemaining()).isEqualTo(80.0d);
  }

  private ExemptionSearchResultDto searchExemption(ExemptionSearchCriteria criteria) {
    var matches = repository.search(criteria).getContent().stream()
        .filter(row -> "EX-205".equals(row.exemptionNumber()))
        .toList();
    assertThat(matches).hasSize(1);
    return matches.getFirst();
  }

  private void cancelAllPermits() {
    jdbc.update("UPDATE THE.EXPORT_PERMIT_DETAIL SET EXPORT_PERMIT_STATUS_CODE = 'CAN' "
        + "WHERE EXEMPTION_NUMBER = 'EX-205'");
  }
}

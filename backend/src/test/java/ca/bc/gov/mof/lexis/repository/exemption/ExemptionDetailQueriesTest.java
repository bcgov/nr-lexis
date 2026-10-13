package ca.bc.gov.mof.lexis.repository.exemption;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

class ExemptionDetailQueriesTest {

  @Test
  void completedPermitsShouldBeAggregatedOnceWithoutChangingAssignedScaleBalance() {
    EmbeddedDatabase database = new EmbeddedDatabaseBuilder()
        .generateUniqueName(true)
        .setType(EmbeddedDatabaseType.H2)
        .build();
    try {
      JdbcTemplate jdbc = new JdbcTemplate(database);
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
            EXPORT_SCHEDULE_ID BIGINT, ORG_UNIT_NO BIGINT
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
            PERMIT_VOLUME DECIMAL(12,2), EXPORT_PERMIT_STATUS_CODE VARCHAR
          )
          """);
      jdbc.execute("CREATE TABLE THE.ORG_UNIT (ORG_UNIT_NO BIGINT, ORG_UNIT_NAME VARCHAR)");
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
            (1, 'EX-205', 'AGENT', 'OWNER', 1, 1905),
            (2, 'EX-205', 'AGENT', 'OWNER', 2, 1906)
          """);
      jdbc.execute("INSERT INTO THE.EXPORT_SCHEDULE VALUES (1, TIMESTAMP '2026-01-01 00:00:00'), (2, TIMESTAMP '2026-02-01 00:00:00')");
      jdbc.execute("INSERT INTO THE.ORG_UNIT VALUES (1905, 'Region A'), (1906, 'Region B'), (1907, 'Region C')");
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

      ExemptionRepository repository = new ExemptionRepository(jdbc);
      var detail = repository.findByExemptionNumber("EX-205").orElseThrow();

      assertThat(jdbc.queryForList(ExemptionDetailQueries.BY_NUMBER, "EX-205")).hasSize(1);
      assertThat(detail.completedPermitVolume()).isEqualTo(45.0d);
      assertThat(detail.usedVolume()).isEqualTo(77.0d);
      assertThat(detail.remainingVolume()).isEqualTo(23.0d);

      var empty = repository.findByExemptionNumber("EMPTY").orElseThrow();
      assertThat(empty.completedPermitVolume()).isZero();
      assertThat(empty.usedVolume()).isZero();
      assertThat(empty.remainingVolume()).isEqualTo(100.0d);
    } finally {
      database.shutdown();
    }
  }
}

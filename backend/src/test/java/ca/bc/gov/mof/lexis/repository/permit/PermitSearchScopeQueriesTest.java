package ca.bc.gov.mof.lexis.repository.permit;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.permit.PermitSearchCriteria;
import ca.bc.gov.mof.lexis.dto.permit.PermitSearchResultDto;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

class PermitSearchScopeQueriesTest {

  private static final String CLIENT = "00012345";

  private EmbeddedDatabase database;
  private PermitRepository repository;

  @BeforeEach
  void setUp() {
    database =
        new EmbeddedDatabaseBuilder()
            .generateUniqueName(true)
            .setType(EmbeddedDatabaseType.H2)
            .build();
    JdbcTemplate jdbc = new JdbcTemplate(database);
    jdbc.execute("SET MODE Oracle");
    jdbc.execute("CREATE SCHEMA THE");
    jdbc.execute(
        """
        CREATE TABLE THE.EXPORT_PERMIT_DETAIL (
          EXPORT_PERMIT_DETAIL_NUMBER BIGINT PRIMARY KEY, EXPORT_PERMIT_STATUS_CODE VARCHAR,
          AGENT_NUMBER VARCHAR, CLIENT_NUMBER VARCHAR, PERMIT_VOLUME DECIMAL(12,1),
          EXPORT_PERMIT_ISSUE_DATE DATE, ORG_UNIT_NO BIGINT, EXEMPTION_NUMBER VARCHAR
        )
        """);
    jdbc.execute(
        "CREATE TABLE THE.EXPORT_PERMIT_STATUS_CODE (EXPORT_PERMIT_STATUS_CODE VARCHAR, DESCRIPTION VARCHAR)");
    jdbc.execute("CREATE TABLE THE.ORG_UNIT (ORG_UNIT_NO BIGINT, ORG_UNIT_CODE VARCHAR)");
    jdbc.execute(
        "CREATE TABLE THE.EXPORT_SCALE_DETAIL (PACKAGE_NUMBER VARCHAR, EXPORT_PERMIT_DETAIL_NUMBER BIGINT)");
    jdbc.execute(
        "CREATE TABLE THE.EXPORT_PACKAGE (PACKAGE_NUMBER VARCHAR, APPLICATION_NUMBER BIGINT)");
    jdbc.execute(
        """
        CREATE TABLE THE.EXPORT_EXEMPTION_APPLICATION (
          APPLICATION_NUMBER BIGINT PRIMARY KEY, EXEMPTION_NUMBER VARCHAR,
          OWNER_CLIENT_NUMBER VARCHAR, AGENT_CLIENT_NUMBER VARCHAR, EXPORT_JURISDICTION_CODE VARCHAR
        )
        """);

    jdbc.execute("INSERT INTO THE.EXPORT_PERMIT_STATUS_CODE VALUES ('ACT', 'Active')");
    jdbc.execute("INSERT INTO THE.ORG_UNIT VALUES (1908, 'RSK')");
    jdbc.execute(
        """
        INSERT INTO THE.EXPORT_EXEMPTION_APPLICATION VALUES
          (501, 'EX-1', '00012345', NULL, 'P'),
          (502, 'EX-2', '00012345', NULL, 'F')
        """);
    jdbc.execute("INSERT INTO THE.EXPORT_PACKAGE VALUES ('PKG-P', 501), ('PKG-F', 502)");
    jdbc.execute(
        """
        INSERT INTO THE.EXPORT_PERMIT_DETAIL VALUES
          (101, 'ACT', NULL, '00012345', 0, NULL, 1908, 'EX-1'),
          (102, 'ACT', '00012345', '00099999', 0, NULL, 1908, 'EX-1'),
          (103, 'ACT', NULL, '00012345', 5, NULL, 1908, 'EX-1'),
          (104, 'ACT', NULL, '00099999', 7, NULL, 1908, 'EX-1'),
          (105, 'ACT', NULL, '00099999', 0, NULL, 1908, 'EX-1'),
          (106, 'ACT', NULL, '00099999', 9, NULL, 1908, 'EX-2')
        """);
    // 101/102: no scale lines. 103: two lines. 104: linked to the client's provincial
    // application. 105: same exemption, no link. 106: linked to a federal application only.
    jdbc.execute(
        """
        INSERT INTO THE.EXPORT_SCALE_DETAIL VALUES
          ('PKG-P', 103), ('PKG-P', 103), ('PKG-P', 104), ('PKG-F', 106)
        """);

    for (String table :
        List.of(
            "EXPORT_PERMIT_DETAIL",
            "EXPORT_PERMIT_STATUS_CODE",
            "ORG_UNIT",
            "EXPORT_SCALE_DETAIL",
            "EXPORT_PACKAGE",
            "EXPORT_EXEMPTION_APPLICATION")) {
      jdbc.execute("CREATE SYNONYM " + table + " FOR THE." + table);
    }
    repository = new PermitRepository(jdbc);
  }

  @AfterEach
  void tearDown() {
    database.shutdown();
  }

  @Test
  void clientSearchShouldReturnOwnAndAgentPermitsWithoutScaleLines() {
    var page = repository.search(criteria(CLIENT, 0, 10));

    assertThat(permitNumbers(page.getContent())).containsExactly(104L, 103L, 102L, 101L);
    assertThat(page.getTotalElements()).isEqualTo(4);
    assertThat(repository.count(criteria(CLIENT, 0, 10))).isEqualTo(4);
    assertThat(permitNumbers(repository.search(criteria(CLIENT, 1, 2)).getContent()))
        .containsExactly(102L, 101L);
  }

  @Test
  void staffSearchShouldReturnEveryPermit() {
    var page = repository.search(criteria(null, 0, 10));

    assertThat(permitNumbers(page.getContent()))
        .containsExactly(106L, 105L, 104L, 103L, 102L, 101L);
  }

  private static PermitSearchCriteria criteria(String accessClientNumber, int page, int size) {
    return new PermitSearchCriteria(
        null, null, null, null, null, null, null, null, null, accessClientNumber, List.of(), null,
        page, size);
  }

  private static List<Long> permitNumbers(List<PermitSearchResultDto> results) {
    return results.stream().map(PermitSearchResultDto::permitNumber).toList();
  }
}

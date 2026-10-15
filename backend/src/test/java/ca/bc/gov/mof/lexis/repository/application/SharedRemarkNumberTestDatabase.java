package ca.bc.gov.mof.lexis.repository.application;

import java.lang.reflect.Proxy;
import java.sql.CallableStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

/**
 * H2 copy of the application remarks table. Remark 276 is on two applications; remark 31001 is on
 * one.
 */
public final class SharedRemarkNumberTestDatabase implements AutoCloseable {

  public static final long REMARK_NUMBER = 276L;
  public static final long UNIQUE_REMARK_NUMBER = 31001L;
  public static final long APPLICATION_NUMBER = 105450L;
  public static final long OTHER_APPLICATION_NUMBER = 96807L;
  public static final long APPLICATION_WITHOUT_REMARK = 28237L;
  public static final String REMARK = "Remark on this application";
  public static final String OTHER_REMARK = "Remark on the other application";
  public static final String UNIQUE_REMARK = "Remark with its own number";

  private final EmbeddedDatabase database;
  private final JdbcTemplate jdbcTemplate;

  public SharedRemarkNumberTestDatabase() {
    database =
        new EmbeddedDatabaseBuilder()
            .generateUniqueName(true)
            .setType(EmbeddedDatabaseType.H2)
            .build();
    jdbcTemplate = new JdbcTemplate(database);
    jdbcTemplate.execute("CREATE SCHEMA THE");
    jdbcTemplate.execute(
        """
        CREATE TABLE THE.EXPORT_EXEMPTION_APP_REMARKS (
          APPLICATION_NUMBER BIGINT NOT NULL,
          EXPORT_EXMPTN_APPL_REMARK_NMBR BIGINT NOT NULL,
          REMARK_DATE TIMESTAMP NOT NULL,
          REMARK VARCHAR(254) NOT NULL,
          ENTRY_USERID VARCHAR(30) NOT NULL,
          ENTRY_TIMESTAMP TIMESTAMP NOT NULL,
          UPDATE_USERID VARCHAR(30),
          UPDATE_TIMESTAMP TIMESTAMP,
          CONSTRAINT EEAR_PK PRIMARY KEY (APPLICATION_NUMBER, EXPORT_EXMPTN_APPL_REMARK_NMBR)
        )
        """);
    // The other application's row comes first, so a lookup by remark number alone finds it.
    insert(
        OTHER_APPLICATION_NUMBER,
        REMARK_NUMBER,
        OTHER_REMARK,
        "idir\\other",
        "2018-03-03 09:00:00");
    insert(APPLICATION_NUMBER, REMARK_NUMBER, REMARK, "idir\\original", "2019-04-02 10:15:00");
    insert(
        APPLICATION_NUMBER,
        UNIQUE_REMARK_NUMBER,
        UNIQUE_REMARK,
        "idir\\original",
        "2025-06-12 14:20:00");
  }

  public JdbcTemplate jdbcTemplate() {
    return jdbcTemplate;
  }

  /** A repository that runs the remark update procedure's statement on H2. */
  public RemarkProcedureRepository repository() {
    return new RemarkProcedureRepository(jdbcTemplate);
  }

  public Map<String, Object> row(long applicationNumber, long remarkNumber) {
    return jdbcTemplate.queryForMap(
        "SELECT * FROM THE.EXPORT_EXEMPTION_APP_REMARKS "
            + "WHERE APPLICATION_NUMBER = ? AND EXPORT_EXMPTN_APPL_REMARK_NMBR = ?",
        applicationNumber,
        remarkNumber);
  }

  public List<Map<String, Object>> rows() {
    return jdbcTemplate.queryForList(
        "SELECT * FROM THE.EXPORT_EXEMPTION_APP_REMARKS "
            + "ORDER BY APPLICATION_NUMBER, EXPORT_EXMPTN_APPL_REMARK_NMBR");
  }

  @Override
  public void close() {
    database.shutdown();
  }

  private void insert(
      long applicationNumber, long remarkNumber, String remark, String user, String enteredAt) {
    Timestamp timestamp = Timestamp.valueOf(enteredAt);
    jdbcTemplate.update(
        "INSERT INTO THE.EXPORT_EXEMPTION_APP_REMARKS "
            + "(APPLICATION_NUMBER, EXPORT_EXMPTN_APPL_REMARK_NMBR, REMARK_DATE, REMARK, "
            + "ENTRY_USERID, ENTRY_TIMESTAMP) VALUES (?, ?, ?, ?, ?, ?)",
        applicationNumber,
        remarkNumber,
        timestamp,
        remark,
        user,
        timestamp);
  }

  /**
   * Records each UPDATE_EXEMPTION_APP_REMARK call's binds and runs the procedure's UPDATE, which
   * matches the remark number alone.
   */
  public static final class RemarkProcedureRepository extends ApplicationDetailsRpcRepository {

    private static final String UPDATE_REMARK_PROCEDURE =
        "LEXIS_GROUP_14.UPDATE_EXEMPTION_APP_REMARK(?,?,?,?,?,?)";

    private final JdbcTemplate jdbcTemplate;
    private final List<Map<Integer, Object>> remarkUpdateCalls = new ArrayList<>();

    private RemarkProcedureRepository(JdbcTemplate jdbcTemplate) {
      super(jdbcTemplate);
      this.jdbcTemplate = jdbcTemplate;
    }

    public List<Map<Integer, Object>> remarkUpdateCalls() {
      return List.copyOf(remarkUpdateCalls);
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      if (!UPDATE_REMARK_PROCEDURE.equals(procedureSignature)) {
        throw new UnsupportedOperationException(procedureSignature);
      }
      Map<Integer, Object> binds = new TreeMap<>();
      CallableStatement statement =
          (CallableStatement)
              Proxy.newProxyInstance(
                  CallableStatement.class.getClassLoader(),
                  new Class<?>[] {CallableStatement.class},
                  (proxy, method, args) -> {
                    if (method.getName().startsWith("set")
                        && args != null
                        && args.length == 2
                        && args[0] instanceof Integer index) {
                      binds.put(index, args[1]);
                      return null;
                    }
                    throw new UnsupportedOperationException(method.getName());
                  });
      try {
        binder.accept(statement);
      } catch (SQLException ex) {
        throw new IllegalStateException(ex);
      }
      remarkUpdateCalls.add(binds);
      jdbcTemplate.update(
          """
          UPDATE THE.EXPORT_EXEMPTION_APP_REMARKS
             SET EXPORT_EXMPTN_APPL_REMARK_NMBR = ?,
                 REMARK_DATE = ?,
                 REMARK = ?,
                 UPDATE_USERID = ?,
                 UPDATE_TIMESTAMP = ?,
                 APPLICATION_NUMBER = ?
           WHERE EXPORT_EXMPTN_APPL_REMARK_NMBR = ?
          """,
          binds.get(1),
          binds.get(2),
          binds.get(3),
          binds.get(4),
          binds.get(5),
          binds.get(6),
          binds.get(1));
    }
  }
}

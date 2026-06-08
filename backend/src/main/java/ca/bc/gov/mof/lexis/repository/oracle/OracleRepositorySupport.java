package ca.bc.gov.mof.lexis.repository.oracle;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.Array;
import java.sql.CallableStatement;
import java.sql.Connection;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import oracle.jdbc.OracleConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

public abstract class OracleRepositorySupport {

  protected static final String LEXIS_CODES_PACKAGE = "LEXIS_CODES.";
  protected static final String LEXIS_GROUP_3_PACKAGE = "LEXIS_GROUP_3.";
  protected static final String LEXIS_GROUP_4_PACKAGE = "LEXIS_GROUP_4.";
  protected static final String LEXIS_GROUP_5_PACKAGE = "LEXIS_GROUP_5.";
  protected static final String LEXIS_GROUP_9_PACKAGE = "LEXIS_GROUP_9.";
  protected static final String LEXIS_GROUP_11_PACKAGE = "LEXIS_GROUP_11.";
  protected static final String LEXIS_GROUP_12_PACKAGE = "LEXIS_GROUP_12.";
  protected static final String LEXIS_GROUP_13_PACKAGE = "LEXIS_GROUP_13.";
  protected static final String LEXIS_GROUP_14_PACKAGE = "LEXIS_GROUP_14.";
  protected static final String LEXIS_READ_ONLY_PACKAGE = "LEXIS_READ_ONLY.";

  private static final String STRING_ARRAY_TYPE = "CBR_VARCHAR2_ARRAY";
  private static final int LEGACY_DYNAMIC_PAGE_SIZE = 10;
  private static final int AUDIT_USER_MAX_LENGTH = 30;
  private static final Pattern SAFE_IDENTIFIER = Pattern.compile("[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*");

  protected final Logger logger = LoggerFactory.getLogger(getClass());
  protected final JdbcTemplate jdbcTemplate;

  protected OracleRepositorySupport(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  @FunctionalInterface
  protected interface SqlConsumer<T> {
    void accept(T input) throws SQLException;
  }

  @FunctionalInterface
  protected interface SqlRowMapper<T> {
    T map(ResultSet rs) throws SQLException;
  }

  protected List<CodeNameDto> loadCodeNameOptions(String procedureSignature) {
    List<CodeNameDto> options = queryCursorProcedure(
        procedureSignature,
        null,
        1,
        rs -> new CodeNameDto(trim(rs.getString(1)), trim(rs.getString(2))));
    if (!options.isEmpty()) {
      return options;
    }
    return fallbackCodeNameOptions(procedureSignature);
  }

  protected Optional<String> fallbackCodeDescription(String procedureSignature, String code) {
    String normalized = trim(code);
    if (procedureSignature == null || normalized == null) {
      return Optional.empty();
    }
    String upperCode = normalized.toUpperCase(Locale.ROOT);
    return Optional.ofNullable(
        switch (procedureSignature) {
          case LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)" ->
              switch (upperCode) {
                case "O" -> "Old Growth";
                case "S" -> "Second Growth";
                default -> null;
              };
          case LEXIS_CODES_PACKAGE + "FIND_PACKAGE_STATUS_CODE(?,?)" ->
              switch (upperCode) {
                case "ACT" -> "Active";
                case "SHT" -> "Shutout";
                default -> null;
              };
          case LEXIS_CODES_PACKAGE + "FIND_PRODUCT_TYPE_CODE(?,?)" ->
              switch (upperCode) {
                case "H" -> "Harvested Timber";
                case "S" -> "Standing Timber";
                case "T" -> "Unmanufactured Timber";
                default -> null;
              };
          default -> null;
        });
  }

  protected List<CodeNameDto> loadOrgUnitOptions(boolean displayName) {
    List<CodeNameDto> options =
        queryCursorProcedure(
            LEXIS_CODES_PACKAGE + "FIND_ALL_ORG_UNITS(?)",
            null,
            1,
            rs -> {
              Long orgUnitNo = getLong(rs, "ORG_UNIT_NO");
              String regionCode = getString(rs, "ORG_UNIT_CODE");
              String regionName = getString(rs, "ORG_UNIT_NAME");
              return new CodeNameDto(
                  orgUnitNo == null ? null : orgUnitNo.toString(),
                  displayName
                      ? firstPresent(regionName, regionCode)
                      : firstPresent(regionCode, regionName));
            });
    if (!options.isEmpty()) {
      return options;
    }
    return fallbackOrgUnitOptions(displayName);
  }

  protected <T> List<T> queryCursorProcedure(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    String call = "{ call " + procedureSignature + " }";

    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<List<T>>) cs -> {
            if (binder != null) {
              binder.accept(cs);
            }
            cs.registerOutParameter(cursorOutIndex, Types.REF_CURSOR);
            cs.execute();

            List<T> results = new ArrayList<>();
            try (ResultSet rs = (ResultSet) cs.getObject(cursorOutIndex)) {
              if (rs == null) {
                return results;
              }
              while (rs.next()) {
                results.add(rowMapper.map(rs));
              }
            }
            return results;
          });
    } catch (DataAccessException ex) {
      logger.warn("Oracle procedure call failed [{}]: {}", procedureSignature, ex.getMessage());
      return List.of();
    }
  }

  protected <T> Optional<T> queryCursorSingle(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    List<T> results = queryCursorProcedure(procedureSignature, binder, cursorOutIndex, rowMapper);
    if (results.isEmpty()) {
      return Optional.empty();
    }
    return Optional.ofNullable(results.get(0));
  }

  protected <T> List<T> queryDynamicPagedProcedure(
      String procedureSignature,
      String whereSql,
      List<String> bindValues,
      int page,
      SqlRowMapper<T> rowMapper) {
    String call = "{ call " + procedureSignature + " }";

    try {
      return jdbcTemplate.execute(
          call,
          (CallableStatementCallback<List<T>>) cs -> {
            cs.setString(1, whereSql);

            Array array = null;
            if (bindValues != null && !bindValues.isEmpty()) {
              Connection connection = cs.getConnection();
              OracleConnection oracleConnection = connection.unwrap(OracleConnection.class);
              array = oracleConnection.createOracleArray(STRING_ARRAY_TYPE, bindValues.toArray(String[]::new));
              cs.setArray(2, array);
            } else {
              cs.setNull(2, Types.ARRAY, STRING_ARRAY_TYPE);
            }

            cs.setInt(3, bindValues == null ? 0 : bindValues.size());
            cs.setInt(4, Math.max(0, page));
            cs.registerOutParameter(5, Types.REF_CURSOR);
            cs.execute();

            List<T> results = new ArrayList<>();
            try (ResultSet rs = (ResultSet) cs.getObject(5)) {
              if (rs == null) {
                return results;
              }
              while (rs.next()) {
                results.add(rowMapper.map(rs));
              }
            } finally {
              if (array != null) {
                array.free();
              }
            }
            return results;
          });
    } catch (DataAccessException ex) {
      logger.warn("Oracle dynamic call failed [{}]: {}", procedureSignature, ex.getMessage());
      return List.of();
    }
  }

  protected boolean executeProcedure(String procedureSignature, SqlConsumer<CallableStatement> binder) {
    String call = "{ call " + procedureSignature + " }";
    try {
      Boolean result =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Boolean>)
                  cs -> {
                    if (binder != null) {
                      binder.accept(cs);
                    }
                    cs.execute();
                    return Boolean.TRUE;
                  });
      return Boolean.TRUE.equals(result);
    } catch (DataAccessException ex) {
      logger.warn("Oracle procedure execution failed [{}]: {}", procedureSignature, ex.getMessage());
      return false;
    }
  }

  protected <T> DynamicSearchPage<T> queryDynamicPage(
      String procedureSignature,
      String whereSql,
      List<String> bindValues,
      int page,
      int size,
      SqlRowMapper<T> rowMapper) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = Math.max(1, size);
    long offsetLong = (long) normalizedPage * normalizedSize;
    if (offsetLong > Integer.MAX_VALUE) {
      return new DynamicSearchPage<>(List.of(), Integer.MAX_VALUE);
    }

    int offset = (int) offsetLong;
    int legacyStartPage = offset / LEGACY_DYNAMIC_PAGE_SIZE;
    int firstPageOffset = offset % LEGACY_DYNAMIC_PAGE_SIZE;
    int requiredRows = firstPageOffset + normalizedSize;
    List<T> bufferedRows = new ArrayList<>(requiredRows);
    List<T> previousPage = List.of();
    boolean lastFetchedPageWasFull = false;

    for (int legacyPage = legacyStartPage; bufferedRows.size() < requiredRows && legacyPage < 10_000; legacyPage++) {
      List<T> currentPage =
          queryDynamicPagedProcedure(procedureSignature, whereSql, bindValues, legacyPage, rowMapper);
      if (currentPage.isEmpty()) {
        lastFetchedPageWasFull = false;
        break;
      }
      if (legacyPage > legacyStartPage && currentPage.equals(previousPage)) {
        logger.warn(
            "Oracle dynamic call [{}] returned duplicate data for page {}; stopping pagination",
            procedureSignature,
            legacyPage);
        lastFetchedPageWasFull = false;
        break;
      }
      bufferedRows.addAll(currentPage);
      previousPage = currentPage;
      lastFetchedPageWasFull = currentPage.size() >= LEGACY_DYNAMIC_PAGE_SIZE;
      if (!lastFetchedPageWasFull) {
        break;
      }
    }

    if (bufferedRows.size() <= firstPageOffset) {
      return new DynamicSearchPage<>(List.of(), offset);
    }

    int toIndex = Math.min(firstPageOffset + normalizedSize, bufferedRows.size());
    List<T> results = List.copyOf(bufferedRows.subList(firstPageOffset, toIndex));
    boolean maybeHasMore = results.size() == normalizedSize && lastFetchedPageWasFull;
    int total = safeTotal(offset, results.size(), maybeHasMore);
    return new DynamicSearchPage<>(results, total);
  }

  private int safeTotal(int offset, int resultCount, boolean maybeHasMore) {
    long total = (long) offset + resultCount + (maybeHasMore ? 1L : 0L);
    return total > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) total;
  }

  private List<CodeNameDto> fallbackCodeNameOptions(String procedureSignature) {
    if (procedureSignature == null) {
      return List.of();
    }
    return switch (procedureSignature) {
      case LEXIS_CODES_PACKAGE + "FIND_ALL_APP_STATUS_CODES(?)" ->
          List.of(
              new CodeNameDto("NEW", "New"),
              new CodeNameDto("APP", "Approved"),
              new CodeNameDto("PND", "Pending"),
              new CodeNameDto("REJ", "Rejected"),
              new CodeNameDto("WDN", "Withdrawn"),
              new CodeNameDto("EXE", "Exempted"),
              new CodeNameDto("EXP", "Expired"),
              new CodeNameDto("PMT", "Permitted"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPTION_TYPE_CODES(?)" ->
          List.of(
              new CodeNameDto("M", "Ministerial"),
              new CodeNameDto("O", "Order in Council"),
              new CodeNameDto("B", "Blanket Order in Council"),
              new CodeNameDto("F", "Federal"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_STS_CODES(?)" ->
          List.of(
              new CodeNameDto("NEW", "New"),
              new CodeNameDto("ACT", "Active"),
              new CodeNameDto("CAN", "Cancelled"),
              new CodeNameDto("EXP", "Expired"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_PRODUCT_TYPE_CODES(?)" ->
          List.of(
              new CodeNameDto("H", "Harvested Timber"),
              new CodeNameDto("S", "Standing Timber"),
              new CodeNameDto("T", "Unmanufactured Timber"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_PERMIT_STATUS_CODES(?)" ->
          List.of(
              new CodeNameDto("ACT", "Active"),
              new CodeNameDto("CAN", "Cancelled"),
              new CodeNameDto("COM", "Complete"),
              new CodeNameDto("EXP", "Expired"),
              new CodeNameDto("PPD", "Payment Pending"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_JURISDICTION_CODES(?)" ->
          List.of(
              new CodeNameDto("P", "Provincial"),
              new CodeNameDto("F", "Federal"),
              new CodeNameDto("I", "Indian Reserve"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_EXEMPT_RSN_CODES(?)" ->
          List.of(
              new CodeNameDto("S", "Surplus"),
              new CodeNameDto("U", "Utilization"),
              new CodeNameDto("E", "Economic"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_GROWTH_TYPE_CODES(?)" ->
          List.of(
              new CodeNameDto("O", "Old Growth"),
              new CodeNameDto("S", "Second Growth"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)" ->
          List.of(
              new CodeNameDto("US", "United States"),
              new CodeNameDto("JP", "Japan"),
              new CodeNameDto("CN", "China"),
              new CodeNameDto("NZ", "New Zealand"));
      case LEXIS_CODES_PACKAGE + "FIND_ALL_PORT_CODES(?)" ->
          List.of(
              new CodeNameDto("VAN", "Vancouver"),
              new CodeNameDto("OT", "Other"));
      default -> List.of();
    };
  }

  private List<CodeNameDto> fallbackOrgUnitOptions(boolean displayName) {
    List<CodeNameDto> regions =
        List.of(
            new CodeNameDto("1833", "RNI - Northern Interior"),
            new CodeNameDto("1834", "RSI - Southern Interior"),
            new CodeNameDto("1835", "RCO - Coastal Forest"),
            new CodeNameDto("1903", "RCB - Cariboo Region"),
            new CodeNameDto("1904", "RKB - Kootenay-Boundary Region"),
            new CodeNameDto("1905", "RNO - Northeast Region"),
            new CodeNameDto("1906", "ROM - Omineca Region"),
            new CodeNameDto("1907", "RTO - Thompson-Okanagan Region"),
            new CodeNameDto("1908", "RSK - Skeena Region"),
            new CodeNameDto("1909", "RSC - South Coast Region"),
            new CodeNameDto("1910", "RWC - West Coast Region"));
    if (displayName) {
      return regions;
    }
    return regions.stream()
        .map(option -> new CodeNameDto(option.code(), option.name().split(" - ", 2)[0]))
        .toList();
  }

  protected String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  protected String auditUserOrDefault(String value) {
    String normalized = trim(value);
    if (normalized == null) {
      return "system";
    }
    return normalized.length() <= AUDIT_USER_MAX_LENGTH
        ? normalized
        : normalized.substring(0, AUDIT_USER_MAX_LENGTH);
  }

  protected LocalDate toLocalDate(Date value) {
    return value == null ? null : value.toLocalDate();
  }

  protected LocalDate toLocalDate(Timestamp value) {
    return value == null ? null : value.toLocalDateTime().toLocalDate();
  }

  protected Long getLong(ResultSet rs, String column) {
    try {
      long value = rs.getLong(column);
      return rs.wasNull() ? null : value;
    } catch (SQLException ex) {
      return null;
    }
  }

  protected Double getDouble(ResultSet rs, String column) {
    try {
      double value = rs.getDouble(column);
      return rs.wasNull() ? null : value;
    } catch (SQLException ex) {
      return null;
    }
  }

  protected String getString(ResultSet rs, String column) {
    try {
      return trim(rs.getString(column));
    } catch (SQLException ex) {
      return null;
    }
  }

  protected LocalDate getLocalDate(ResultSet rs, String column) {
    try {
      Timestamp timestamp = rs.getTimestamp(column);
      if (timestamp != null) {
        return timestamp.toLocalDateTime().toLocalDate();
      }
    } catch (SQLException ignored) {
      // Fall through to DATE attempt below.
    }

    try {
      Date date = rs.getDate(column);
      return date == null ? null : date.toLocalDate();
    } catch (SQLException ex) {
      return null;
    }
  }

  private String firstPresent(String first, String second) {
    return first != null ? first : second;
  }

  protected boolean safeIdentifier(String value) {
    return value != null && SAFE_IDENTIFIER.matcher(value).matches();
  }

  protected String sanitizedSort(
      String sortField,
      Map<String, String> allowedColumns,
      String defaultField,
      String defaultDirection) {
    String fallbackColumn = allowedColumns.getOrDefault(defaultField, defaultField);
    String fallbackDirection = "DESC".equalsIgnoreCase(defaultDirection) ? "DESC" : "ASC";

    if (sortField == null || sortField.isBlank()) {
      return " ORDER BY " + fallbackColumn + " " + fallbackDirection;
    }

    String normalized = sortField.trim();
    String direction = "ASC";

    if (normalized.toUpperCase().endsWith(" DESC")) {
      direction = "DESC";
      normalized = normalized.substring(0, normalized.length() - 5).trim();
    } else if (normalized.toUpperCase().endsWith(" ASC")) {
      normalized = normalized.substring(0, normalized.length() - 4).trim();
    }

    String mapped = allowedColumns.get(normalized);
    if (mapped == null || !safeIdentifier(mapped)) {
      mapped = fallbackColumn;
      direction = fallbackDirection;
    }

    return " ORDER BY " + mapped + " " + direction;
  }

  protected static final class SqlWhere {
    private final String sql;
    private final List<String> bindValues;

    SqlWhere(String sql, List<String> bindValues) {
      this.sql = sql;
      this.bindValues = bindValues;
    }

    public String sql() {
      return sql;
    }

    public List<String> bindValues() {
      return bindValues;
    }
  }

  protected final class SqlWhereBuilder {
    private final StringBuilder sql = new StringBuilder(" WHERE 1=1");
    private final List<String> bindValues = new ArrayList<>();

    public SqlWhereBuilder addLike(String column, String value) {
      String normalized = trim(value);
      if (normalized == null) {
        return this;
      }
      addBind(" AND " + column + " LIKE '%' || :" + (bindValues.size() + 1) + " || '%'", normalized);
      return this;
    }

    public SqlWhereBuilder addEquals(String column, String value) {
      String normalized = trim(value);
      if (normalized == null) {
        return this;
      }
      addBind(" AND " + column + " = :" + (bindValues.size() + 1), normalized);
      return this;
    }

    public SqlWhereBuilder addEqualsNumber(String column, Long value) {
      if (value == null) {
        return this;
      }
      addBind(" AND " + column + " = TO_NUMBER(:" + (bindValues.size() + 1) + ")", value.toString());
      return this;
    }

    public SqlWhereBuilder addInEqualsNumberOrNoResults(String column, List<Long> values) {
      if (values == null || values.isEmpty()) {
        sql.append(" AND ").append(column).append(" = TO_NUMBER(0)");
        return this;
      }

      Set<Long> distinct = new LinkedHashSet<>();
      for (Long value : values) {
        if (value != null && value > 0) {
          distinct.add(value);
        }
      }

      if (distinct.isEmpty()) {
        sql.append(" AND ").append(column).append(" = TO_NUMBER(0)");
        return this;
      }

      sql.append(" AND (");
      int index = 0;
      for (Long value : distinct) {
        if (index++ > 0) {
          sql.append(" OR ");
        }
        sql.append(column).append(" = TO_NUMBER(:").append(bindValues.size() + 1).append(")");
        bindValues.add(value.toString());
      }
      sql.append(")");
      return this;
    }

    public SqlWhereBuilder addInLikeOrNoResults(String column, List<Long> values) {
      if (values == null || values.isEmpty()) {
        sql.append(" AND ").append(column).append(" = TO_NUMBER(0)");
        return this;
      }

      Set<Long> distinct = new LinkedHashSet<>();
      for (Long value : values) {
        if (value != null && value > 0) {
          distinct.add(value);
        }
      }

      if (distinct.isEmpty()) {
        sql.append(" AND ").append(column).append(" = TO_NUMBER(0)");
        return this;
      }

      sql.append(" AND (");
      int index = 0;
      for (Long value : distinct) {
        if (index++ > 0) {
          sql.append(" OR ");
        }
        sql.append(column).append(" LIKE '%' || :").append(bindValues.size() + 1).append(" || '%'");
        bindValues.add(value.toString());
      }
      sql.append(")");
      return this;
    }

    public SqlWhereBuilder addDateGte(String column, LocalDate value) {
      if (value == null) {
        return this;
      }
      addBind(
          " AND " + column + " >= TO_DATE(:" + (bindValues.size() + 1) + ", 'YYYY-MM-DD')",
          value.toString());
      return this;
    }

    public SqlWhereBuilder addDateLte(String column, LocalDate value) {
      if (value == null) {
        return this;
      }
      addBind(
          " AND " + column + " <= TO_DATE(:" + (bindValues.size() + 1) + ", 'YYYY-MM-DD')",
          value.toString());
      return this;
    }

    public SqlWhereBuilder addRaw(String rawSqlFragment) {
      if (rawSqlFragment != null && !rawSqlFragment.isBlank()) {
        sql.append(rawSqlFragment);
      }
      return this;
    }

    public SqlWhereBuilder addRawWithBinds(String rawSqlFragment, String... values) {
      if (rawSqlFragment == null || rawSqlFragment.isBlank()) {
        return this;
      }
      sql.append(rawSqlFragment);
      if (values != null) {
        for (String value : values) {
          bindValues.add(value);
        }
      }
      return this;
    }

    public int nextBindIndex() {
      return bindValues.size() + 1;
    }

    public SqlWhere build(String orderByClause) {
      String orderBy = orderByClause == null ? "" : orderByClause;
      return new SqlWhere(sql + orderBy, List.copyOf(bindValues));
    }

    private void addBind(String clause, String value) {
      sql.append(clause);
      bindValues.add(value);
    }
  }

  protected Map<String, String> mapOf(String... keyValuePairs) {
    Map<String, String> values = new LinkedHashMap<>();
    if (keyValuePairs == null) {
      return values;
    }

    for (int i = 0; i + 1 < keyValuePairs.length; i += 2) {
      values.put(keyValuePairs[i], keyValuePairs[i + 1]);
    }
    return values;
  }

  protected SqlWhereBuilder newWhereBuilder() {
    return new SqlWhereBuilder();
  }
}

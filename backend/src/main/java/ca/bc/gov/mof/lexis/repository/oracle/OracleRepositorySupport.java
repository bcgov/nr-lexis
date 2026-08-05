package ca.bc.gov.mof.lexis.repository.oracle;

import static ca.bc.gov.mof.lexis.util.OracleAuditUserId.encode;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;
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

  private static final Pattern SAFE_IDENTIFIER = Pattern.compile("[A-Za-z0-9_]+(?:\\.[A-Za-z0-9_]+)*");
  private static final String FIND_ORG_UNIT_BY_NUMBER =
      LEXIS_CODES_PACKAGE + "FIND_ORG_UNIT_BY_NUMBER(?,?)";
  private static final List<String> NATURAL_RESOURCE_REGION_CODES =
      List.of("1903", "1904", "1905", "1906", "1907", "1908", "1909", "1910");

  protected final Logger logger = LoggerFactory.getLogger(getClass());
  protected final JdbcTemplate jdbcTemplate;
  private final ThreadLocal<Integer> requiredCursorMappingDepth = new ThreadLocal<>();

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

  /**
   * Loads an authoritative code list without treating an Oracle failure as an empty result or
   * replacing a legitimately empty result with static values.
   */
  protected List<CodeNameDto> loadCodeNameOptionsRequired(String procedureSignature) {
    return queryCursorProcedureFailClosed(
        procedureSignature,
        null,
        1,
        rs -> new CodeNameDto(trim(rs.getString(1)), trim(rs.getString(2))));
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

  /**
   * Loads the legacy configured natural-resource regions without production fallback data.
   * Oracle and cursor failures propagate to the API boundary.
   */
  protected List<CodeNameDto> loadOrgUnitOptionsRequired(boolean displayName) {
    return loadNaturalResourceRegions(displayName);
  }

  private List<CodeNameDto> loadNaturalResourceRegions(boolean displayName) {
    List<CodeNameDto> regions = new ArrayList<>();
    for (String orgUnitNumber : NATURAL_RESOURCE_REGION_CODES) {
      SqlConsumer<CallableStatement> binder = cs -> cs.setString(1, orgUnitNumber);
      SqlRowMapper<CodeNameDto> mapper = rs -> mapOrgUnitOption(rs, displayName);
      List<CodeNameDto> rows =
          queryCursorProcedureFailClosed(FIND_ORG_UNIT_BY_NUMBER, binder, 2, mapper);
      rows.stream()
          .filter(option -> orgUnitNumber.equals(option.code()))
          .findFirst()
          .ifPresent(regions::add);
    }
    return List.copyOf(regions);
  }

  private CodeNameDto mapOrgUnitOption(ResultSet rs, boolean displayName) throws SQLException {
    Long orgUnitNo = getLong(rs, "ORG_UNIT_NO");
    String regionCode = getString(rs, "ORG_UNIT_CODE");
    String regionName = getString(rs, "ORG_UNIT_NAME");
    return new CodeNameDto(
        orgUnitNo == null ? null : orgUnitNo.toString(),
        displayName
            ? firstPresent(regionName, regionCode)
            : firstPresent(regionCode, regionName));
  }

  protected <T> List<T> queryCursorProcedure(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    try {
      return queryCursorProcedureInternal(
          procedureSignature, binder, cursorOutIndex, rowMapper, false);
    } catch (DataAccessException ex) {
      logger.warn(
          "event=lexis_oracle_repository operation=cursor_query outcome=failed failureType={}",
          exceptionType(ex));
      return List.of();
    }
  }

  protected <T> List<T> queryCursorProcedureRequired(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    return queryCursorProcedureInternal(
        procedureSignature, binder, cursorOutIndex, rowMapper, true);
  }

  /**
   * Executes an authoritative cursor read without converting an Oracle failure into an empty
   * result. Unlike {@link #queryCursorProcedureRequired}, this preserves the legacy cursor
   * compatibility behavior where unavailable optional columns map to {@code null}.
   */
  protected <T> List<T> queryCursorProcedureFailClosed(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    return queryCursorProcedureInternal(
        procedureSignature, binder, cursorOutIndex, rowMapper, false);
  }

  private <T> List<T> queryCursorProcedureInternal(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper,
      boolean strictColumnAccess) {
    String call = "{ call " + procedureSignature + " }";

    List<T> results = jdbcTemplate.execute(
        call,
        (CallableStatementCallback<List<T>>) cs -> {
          if (binder != null) {
            binder.accept(cs);
          }
          cs.registerOutParameter(cursorOutIndex, Types.REF_CURSOR);
          cs.execute();

          Object cursor = cs.getObject(cursorOutIndex);
          if (!(cursor instanceof ResultSet rs)) {
            throw new DataAccessResourceFailureException(
                "Oracle procedure returned no cursor [" + procedureSignature + "]");
          }

          List<T> cursorRows = new ArrayList<>();
          try (rs) {
            while (rs.next()) {
              cursorRows.add(
                  strictColumnAccess
                      ? mapRequiredCursorRow(rowMapper, rs)
                      : rowMapper.map(rs));
            }
          }
          return cursorRows;
        });
    if (results == null) {
      throw new DataAccessResourceFailureException(
          "Oracle procedure returned no cursor result [" + procedureSignature + "]");
    }
    return results;
  }

  private <T> T mapRequiredCursorRow(SqlRowMapper<T> rowMapper, ResultSet rs)
      throws SQLException {
    Integer previous = requiredCursorMappingDepth.get();
    int previousDepth = previous == null ? 0 : previous;
    requiredCursorMappingDepth.set(previousDepth + 1);
    try {
      return rowMapper.map(rs);
    } finally {
      if (previousDepth == 0) {
        requiredCursorMappingDepth.remove();
      } else {
        requiredCursorMappingDepth.set(previousDepth);
      }
    }
  }

  protected <T> Optional<T> queryCursorSingle(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    List<T> results = queryCursorProcedure(procedureSignature, binder, cursorOutIndex, rowMapper);
    return firstResult(results);
  }

  protected <T> Optional<T> queryCursorSingleRequired(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    List<T> results =
        queryCursorProcedureRequired(procedureSignature, binder, cursorOutIndex, rowMapper);
    return firstResult(results);
  }

  protected <T> Optional<T> queryCursorSingleFailClosed(
      String procedureSignature,
      SqlConsumer<CallableStatement> binder,
      int cursorOutIndex,
      SqlRowMapper<T> rowMapper) {
    List<T> results =
        queryCursorProcedureFailClosed(procedureSignature, binder, cursorOutIndex, rowMapper);
    return firstResult(results);
  }

  private <T> Optional<T> firstResult(List<T> results) {
    if (results.isEmpty()) {
      return Optional.empty();
    }
    return Optional.ofNullable(results.get(0));
  }

  /** Executes one directly paged Oracle query instead of stitching fixed-size procedure pages. */
  protected <T> Page<T> queryDirectPage(
      String selectSql,
      DirectSql whereAndOrder,
      int page,
      int size,
      int totalElements,
      SqlRowMapper<T> rowMapper) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = Math.max(1, size);
    int normalizedTotal = Math.max(0, totalElements);
    long offset = (long) normalizedPage * normalizedSize;
    if (offset >= normalizedTotal) {
      return new PageImpl<>(
          List.of(), PageRequest.of(normalizedPage, normalizedSize), normalizedTotal);
    }

    List<Object> bindValues = new ArrayList<>(whereAndOrder.bindValues());
    bindValues.add(offset);
    bindValues.add(normalizedSize);
    List<T> rows =
        jdbcTemplate.query(
            selectSql
                + whereAndOrder.sql()
                + " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            (rs, rowNumber) -> rowMapper.map(rs),
            bindValues.toArray());
    return new PageImpl<>(
        List.copyOf(rows),
        PageRequest.of(normalizedPage, normalizedSize),
        normalizedTotal);
  }

  /** Executes one directly paged Oracle query with one look-ahead row for slice navigation. */
  protected <T> Slice<T> queryDirectSlice(
      String selectSql,
      DirectSql whereAndOrder,
      int page,
      int size,
      SqlRowMapper<T> rowMapper) {
    int normalizedPage = Math.max(0, page);
    int normalizedSize = Math.max(1, size);
    long offset = (long) normalizedPage * normalizedSize;
    int fetchSize = normalizedSize == Integer.MAX_VALUE ? normalizedSize : normalizedSize + 1;

    List<Object> bindValues = new ArrayList<>(whereAndOrder.bindValues());
    bindValues.add(offset);
    bindValues.add(fetchSize);
    List<T> rows =
        jdbcTemplate.query(
            selectSql
                + whereAndOrder.sql()
                + " OFFSET ? ROWS FETCH NEXT ? ROWS ONLY",
            (rs, rowNumber) -> rowMapper.map(rs),
            bindValues.toArray());
    boolean hasNext = rows.size() > normalizedSize;
    List<T> content =
        hasNext ? List.copyOf(rows.subList(0, normalizedSize)) : List.copyOf(rows);
    return new SliceImpl<>(
        content, PageRequest.of(normalizedPage, normalizedSize), hasNext);
  }

  /** Executes a lightweight direct count query using the same parameterized criteria. */
  protected int queryDirectCount(String selectSql, DirectSql where) {
    Long result =
        jdbcTemplate.queryForObject(
            selectSql + where.sql(), Long.class, where.bindValues().toArray());
    if (result == null) {
      throw new DataRetrievalFailureException("Oracle direct count query returned no result");
    }
    return (int) Math.min(Integer.MAX_VALUE, Math.max(0L, result));
  }

  /**
   * Executes a mutation procedure and propagates dependency failures.
   *
   * Propagation allows Spring to roll back the surrounding transaction instead of committing
   * earlier writes.
   */
  protected void executeProcedureRequired(
      String procedureSignature, SqlConsumer<CallableStatement> binder) {
    String call = "{ call " + procedureSignature + " }";
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
    if (!Boolean.TRUE.equals(result)) {
      throw new DataAccessResourceFailureException(
          "Oracle procedure returned no execution result [" + procedureSignature + "]");
    }
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
              new CodeNameDto("F", "Federal"));
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

  protected String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  protected String auditUserOrDefault(String value) {
    String encoded = encode(value);
    return encoded == null ? "system" : encoded;
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
      throwIfRequiredCursorColumn(column, ex);
      return null;
    }
  }

  protected Double getDouble(ResultSet rs, String column) {
    try {
      double value = rs.getDouble(column);
      return rs.wasNull() ? null : value;
    } catch (SQLException ex) {
      throwIfRequiredCursorColumn(column, ex);
      return null;
    }
  }

  protected String getString(ResultSet rs, String column) {
    try {
      return trim(rs.getString(column));
    } catch (SQLException ex) {
      throwIfRequiredCursorColumn(column, ex);
      return null;
    }
  }

  protected LocalDate getLocalDate(ResultSet rs, String column) {
    SQLException timestampFailure = null;
    try {
      Timestamp timestamp = rs.getTimestamp(column);
      if (timestamp != null) {
        return timestamp.toLocalDateTime().toLocalDate();
      }
    } catch (SQLException ex) {
      timestampFailure = ex;
      // Fall through to DATE attempt below.
    }

    try {
      Date date = rs.getDate(column);
      return date == null ? null : date.toLocalDate();
    } catch (SQLException ex) {
      if (timestampFailure != null) {
        ex.addSuppressed(timestampFailure);
      }
      throwIfRequiredCursorColumn(column, ex);
      return null;
    }
  }

  private void throwIfRequiredCursorColumn(String column, SQLException cause) {
    Integer mappingDepth = requiredCursorMappingDepth.get();
    if (mappingDepth != null && mappingDepth > 0) {
      throw new DataRetrievalFailureException(
          "Required Oracle cursor column could not be read [" + column + "]", cause);
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
      String defaultDirection,
      String uniqueField) {
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

    String orderBy = " ORDER BY " + mapped + " " + direction;
    String uniqueColumn = allowedColumns.get(uniqueField);
    if (uniqueColumn == null || !safeIdentifier(uniqueColumn) || uniqueColumn.equals(mapped)) {
      return orderBy;
    }
    return orderBy + ", " + uniqueColumn + " " + direction;
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

  protected static final class DirectSql {
    private final String sql;
    private final List<Object> bindValues;

    DirectSql(String sql, List<Object> bindValues) {
      this.sql = sql;
      this.bindValues = bindValues;
    }

    public String sql() {
      return sql;
    }

    public List<Object> bindValues() {
      return bindValues;
    }
  }

  protected final class DirectSqlBuilder {
    private final StringBuilder sql = new StringBuilder(" WHERE 1=1");
    private final List<Object> bindValues = new ArrayList<>();

    /** Adds bind values for placeholders declared in the base SELECT before this WHERE clause. */
    public DirectSqlBuilder addLeadingBinds(Object... values) {
      if (values != null) {
        bindValues.addAll(0, List.of(values));
      }
      return this;
    }

    public DirectSqlBuilder addLike(String column, String value) {
      String normalized = trim(value);
      if (normalized != null) {
        addBind(" AND " + column + " LIKE '%' || ? || '%'", normalized);
      }
      return this;
    }

    public DirectSqlBuilder addNumberLike(String column, String value) {
      String normalized = trim(value);
      if (normalized != null) {
        addBind(" AND TO_CHAR(" + column + ") LIKE '%' || ? || '%'", normalized);
      }
      return this;
    }

    public DirectSqlBuilder addEquals(String column, String value) {
      String normalized = trim(value);
      if (normalized != null) {
        addBind(" AND " + column + " = ?", normalized);
      }
      return this;
    }

    public DirectSqlBuilder addDateGte(String column, LocalDate value) {
      if (value != null) {
        addBind(" AND " + column + " >= ?", Date.valueOf(value));
      }
      return this;
    }

    public DirectSqlBuilder addDateLte(String column, LocalDate value) {
      if (value != null) {
        addBind(" AND " + column + " <= ?", Date.valueOf(value));
      }
      return this;
    }

    public DirectSqlBuilder addInEqualsNumberOrNoResults(
        String column, List<Long> values) {
      Set<Long> distinct = new LinkedHashSet<>();
      if (values != null) {
        values.stream()
            .filter(value -> value != null && value > 0)
            .forEach(distinct::add);
      }
      if (distinct.isEmpty()) {
        sql.append(" AND 1=0");
        return this;
      }

      sql.append(" AND ").append(column).append(" IN (");
      int index = 0;
      for (Long value : distinct) {
        if (index++ > 0) {
          sql.append(", ");
        }
        sql.append("?");
        bindValues.add(value);
      }
      sql.append(")");
      return this;
    }

    public DirectSqlBuilder addRaw(String rawSqlFragment) {
      if (rawSqlFragment != null && !rawSqlFragment.isBlank()) {
        sql.append(rawSqlFragment);
      }
      return this;
    }

    public DirectSqlBuilder addRawWithBinds(
        String rawSqlFragment, Object... values) {
      if (rawSqlFragment == null || rawSqlFragment.isBlank()) {
        return this;
      }
      sql.append(rawSqlFragment);
      if (values != null) {
        bindValues.addAll(List.of(values));
      }
      return this;
    }

    public DirectSql build(String orderByClause) {
      return new DirectSql(
          sql + (orderByClause == null ? "" : orderByClause),
          List.copyOf(bindValues));
    }

    private void addBind(String clause, Object value) {
      sql.append(clause);
      bindValues.add(value);
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

  protected DirectSqlBuilder newDirectSqlBuilder() {
    return new DirectSqlBuilder();
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

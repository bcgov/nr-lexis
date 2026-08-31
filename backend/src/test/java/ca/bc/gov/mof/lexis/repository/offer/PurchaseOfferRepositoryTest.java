package ca.bc.gov.mof.lexis.repository.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@DisplayName("Unit Test | PurchaseOfferRepository")
class PurchaseOfferRepositoryTest {

  @Test
  void searchShouldUseDirectQueryForEveryFilterAndAccessConstraint() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(
        new PurchaseOfferSearchCriteria(
            "900123",
            "PKG-1",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            "00055667",
            "00088999",
            "00077777",
            true,
            true,
            List.of(1904L),
            "listingDate DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("TO_CHAR(EEA.APPLICATION_NUMBER) LIKE '%' || ? || '%'")
        .contains("PO.PACKAGE_NUMBER LIKE '%' || ? || '%'")
        .contains("ES.ADVERTISING_DATE >= ?")
        .contains("ES.ADVERTISING_DATE <= ?")
        .contains("PO.OFFER_WITHDRAWAL_DATE >= ?")
        .contains("PO.OFFER_WITHDRAWAL_DATE <= ?")
        .contains("EEA.ORG_UNIT_NO IN (?)")
        .contains("EEA.OWNER_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("EEA.AGENT_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("PO.OFFERING_CLIENT_NUMBER LIKE '%' || ? || '%'")
        .contains("EEA.OWNER_CLIENT_NUMBER = ?")
        .contains("EEA.AGENT_CLIENT_NUMBER = ?")
        .contains("PO.OFFERING_CLIENT_NUMBER = ?")
        .contains("PO.OFFER_WITHDRAWAL_DATE IS NULL")
        .contains("EEA.EXPORT_JURISDICTION_CODE = 'P'")
        .contains(
            "ORDER BY ES.ADVERTISING_DATE DESC, PO.EXPORT_PURCHASE_OFFER_NUMBER DESC")
        .doesNotContain("v.")
        .doesNotContain(":1");
    assertThat(repository.pageSelectSql())
        .contains("FROM EXPORT_PURCHASE_OFFER PO")
        .contains("INNER JOIN EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("LEFT JOIN EXPORT_SCHEDULE ES")
        .contains("LEFT JOIN ORG_UNIT OU")
        .doesNotContain("FIND_POS_BY_CRITERIA");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            java.sql.Date.valueOf("2026-01-01"),
            java.sql.Date.valueOf("2026-01-31"),
            java.sql.Date.valueOf("2026-02-01"),
            java.sql.Date.valueOf("2026-02-28"),
            1904L,
            "00055667",
            "00055667",
            "00088999",
            "00077777",
            "00077777",
            "00077777");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("EEA.ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void ordinaryClientFilterShouldRemainLimitedToApplicationOwnerOrAgent() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            "00099999",
            List.of(),
            null,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("EEA.OWNER_CLIENT_NUMBER LIKE")
        .contains("EEA.AGENT_CLIENT_NUMBER LIKE")
        .doesNotContain("PO.OFFERING_CLIENT_NUMBER =");
    assertThat(repository.bindValues()).containsExactly("00099999", "00099999");
  }

  @Test
  void scopedAccessShouldIncludeOfferingClientAndUseIdenticalSearchAndCountCriteria() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            "00099999",
            null,
            "00077881",
            false,
            false,
            List.of(),
            null,
            0,
            10);

    repository.search(criteria);
    String searchSql = repository.whereSql();
    List<Object> searchBinds = repository.bindValues();

    repository.count(criteria);

    assertThat(searchSql)
        .contains("EEA.OWNER_CLIENT_NUMBER LIKE")
        .contains("EEA.AGENT_CLIENT_NUMBER LIKE")
        .contains("EEA.OWNER_CLIENT_NUMBER =")
        .contains("EEA.AGENT_CLIENT_NUMBER =")
        .contains("PO.OFFERING_CLIENT_NUMBER =");
    assertThat(searchBinds)
        .containsExactly(
            "00099999", "00099999", "00077881", "00077881", "00077881");
    assertThat(repository.countWhereSql())
        .isEqualTo(searchSql.substring(0, searchSql.indexOf(" ORDER BY")));
    assertThat(repository.countBindValues()).isEqualTo(searchBinds);
  }

  @Test
  void searchShouldLoadRequestedDirectPageWithCountTotal() {
    List<PurchaseOfferSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(810001L, 810011L)
            .mapToObj(PurchaseOfferRepositoryTest::offerResult)
            .toList();
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository(rows);

    Page<PurchaseOfferSearchResultDto> results = repository.search(emptyCriteria(null, 0, 10));

    assertThat(results.getContent())
        .extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(810001L, 810002L, 810003L, 810004L, 810005L, 810006L, 810007L, 810008L, 810009L, 810010L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 10, 25, 50, 100, 200})
  void searchShouldUseTwoDatabaseCallsForPageSizesThroughTwoHundred(int pageSize) {
    List<PurchaseOfferSearchResultDto> rows =
        java.util.stream.LongStream.rangeClosed(810001L, 810200L)
            .mapToObj(PurchaseOfferRepositoryTest::offerResult)
            .toList();
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository(rows);

    Page<PurchaseOfferSearchResultDto> results =
        repository.search(emptyCriteria(null, 0, pageSize));

    assertThat(results.getNumberOfElements()).isEqualTo(pageSize);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      textBlock = """
          applicationNumber ASC|ORDER BY EEA.APPLICATION_NUMBER ASC, PO.EXPORT_PURCHASE_OFFER_NUMBER ASC
          packageNumber DESC|ORDER BY PO.PACKAGE_NUMBER DESC, PO.EXPORT_PURCHASE_OFFER_NUMBER DESC
          offerNumber ASC|ORDER BY PO.EXPORT_PURCHASE_OFFER_NUMBER ASC
          listingDate DESC|ORDER BY ES.ADVERTISING_DATE DESC, PO.EXPORT_PURCHASE_OFFER_NUMBER DESC
          offerWithdrawalDate ASC|ORDER BY PO.OFFER_WITHDRAWAL_DATE ASC, PO.EXPORT_PURCHASE_OFFER_NUMBER ASC
          region DESC|ORDER BY OU.ORG_UNIT_NAME DESC, PO.EXPORT_PURCHASE_OFFER_NUMBER DESC
          offeringClientNumber ASC|ORDER BY PO.OFFERING_CLIENT_NUMBER ASC, PO.EXPORT_PURCHASE_OFFER_NUMBER ASC
          """)
  void searchShouldWhitelistEverySupportedSort(String sortField, String expectedOrder) {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(emptyCriteria(sortField, 0, 10));

    assertThat(repository.whereSql()).contains(expectedOrder);
  }

  @Test
  void searchShouldRejectUnrecognizedSortExpressions() {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.search(emptyCriteria("offerNumber DESC NULLS FIRST; DELETE", 0, 10));

    assertThat(repository.whereSql())
        .endsWith("ORDER BY PO.EXPORT_PURCHASE_OFFER_NUMBER DESC")
        .doesNotContain("DELETE")
        .doesNotContain("NULLS FIRST");
  }

  @Test
  void countShouldUseDirectCountWithoutPageSort() {
    TestPurchaseOfferRepository repository =
        new TestPurchaseOfferRepository(List.of(offerResult(810001L)));
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            "PKG-1",
            null,
            null,
            null,
            null,
            "00099999",
            List.of(1904L),
            "listingDate DESC",
            0,
            10);

    repository.search(criteria);
    String pageWhere = repository.whereSql();
    List<Object> pageBinds = repository.bindValues();
    repository.count(criteria);

    assertThat(repository.countSelectSql())
        .contains("SELECT COUNT(*)")
        .contains("FROM EXPORT_PURCHASE_OFFER PO")
        .doesNotContain("FIND_POS_BY_CRITERIA");
    assertThat(repository.countWhereSql())
        .isEqualTo(pageWhere.substring(0, pageWhere.indexOf(" ORDER BY")))
        .doesNotContain("OFFSET")
        .doesNotContain("FETCH NEXT");
    assertThat(repository.countBindValues()).isEqualTo(pageBinds);
  }

  @Test
  void searchShouldUseKnownTotalWithoutCallingCount() {
    TestPurchaseOfferRepository repository =
        new TestPurchaseOfferRepository(
            java.util.stream.LongStream.rangeClosed(810001L, 810011L)
                .mapToObj(PurchaseOfferRepositoryTest::offerResult)
                .toList());

    Page<PurchaseOfferSearchResultDto> results =
        repository.search(emptyCriteria(null, 1, 10), 11);

    assertThat(results.getContent())
        .extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(810011L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isZero();
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  private static PurchaseOfferSearchCriteria emptyCriteria(
      String sortField, int page, int size) {
    return new PurchaseOfferSearchCriteria(
        null, null, null, null, null, null, null, List.of(), sortField, page, size);
  }

  private static PurchaseOfferSearchResultDto offerResult(long offerNumber) {
    return new PurchaseOfferSearchResultDto(offerNumber, 900123L, "PKG-1", null, "Region", null);
  }

  @Test
  void insertShouldBindBlankManufacturingFacilityDefaultWhenInputIsBlank() throws Exception {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.insertOffer(
        new PurchaseOfferRepository.PurchaseOfferInsertRecord(
            null,
            "Example Lumber",
            "Sample Contact",
            12500.25d,
            LocalDate.of(2026, 3, 2),
            null,
            null,
            "N",
            "Y",
            null,
            "N",
            null,
            "P",
            " ",
            "idir\\jsmith",
            null,
            null,
            "Port Moody",
            null,
            1000456L,
            99.9d));

    verify(repository.callableStatement()).setString(14, " ");
    verify(repository.callableStatement(), never()).setNull(14, java.sql.Types.VARCHAR);
  }

  @Test
  void updateShouldBindBlankManufacturingFacilityDefaultWhenInputIsMissing() throws Exception {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    repository.updateOffer(
        new PurchaseOfferRepository.PurchaseOfferUpdateRecord(
            81001L,
            null,
            "Example Lumber",
            "Sample Contact",
            12500.25d,
            LocalDate.of(2026, 3, 2),
            null,
            null,
            "N",
            "Y",
            null,
            "N",
            null,
            "P",
            null,
            "Port Moody",
            null,
            "creator",
            null,
            "idir\\jsmith",
            99.9d));

    verify(repository.callableStatement()).setString(15, " ");
    verify(repository.callableStatement(), never()).setNull(15, java.sql.Types.VARCHAR);
  }

  @Test
  void detailLookupShouldPropagateOracleFailure() {
    FailingPurchaseOfferRepository repository = new FailingPurchaseOfferRepository();

    assertThatThrownBy(() -> repository.findByOfferNumber(81001L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void detailLookupShouldPreserveANullOfferVolume() {
    NullVolumePurchaseOfferRepository repository = new NullVolumePurchaseOfferRepository();

    assertThat(repository.findByOfferNumber(81001L))
        .hasValueSatisfying(
            detail -> {
              assertThat(detail.offerVolume()).isNull();
              assertThat(detail.region()).isEqualTo("Cariboo Natural Resource Region");
              assertThat(detail.author()).isEqualTo("IDIR\\EDITOR");
            });
  }

  @Test
  void applicationRecipientLookupShouldUseRequiredCursorAndPropagateOracleFailure() {
    FailingPurchaseOfferRepository repository = new FailingPurchaseOfferRepository();

    assertThatThrownBy(() -> repository.findApplicationRecipient(1000456L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void applicationRecipientLookupShouldKeepAValidMissingRowDistinctFromAnOutage()
      throws Exception {
    TestPurchaseOfferRepository repository = new TestPurchaseOfferRepository();

    assertThat(repository.findApplicationRecipient(1000456L)).isEmpty();
    verify(repository.callableStatement()).setString(1, "1000456");
  }

  @Test
  void applicationRecipientLookupShouldReturnThePersistedOrganizationUnit() {
    PurchaseOfferRepository repository = new ApplicationRecipientPurchaseOfferRepository();

    assertThat(repository.findApplicationRecipient(1000456L))
        .hasValueSatisfying(
            recipient -> {
              assertThat(recipient.ownerClientNumber()).isEqualTo("00077881");
              assertThat(recipient.ownerClientLocationCode()).isEqualTo("00");
              assertThat(recipient.orgUnitNumber()).isEqualTo(1903L);
            });
  }

  @Test
  void applicationReferenceLookupShouldUseTheEstablishedCursorVolumeAlias() {
    PurchaseOfferRepository repository = new ApplicationVolumePurchaseOfferRepository();

    assertThat(repository.findApplicationReference(1000456L))
        .hasValueSatisfying(
            application -> {
              assertThat(application.applicationNumber()).isEqualTo(1000456L);
              assertThat(application.jurisdictionCode()).isEqualTo("P");
              assertThat(application.applicationVolume()).isEqualTo(95.5d);
            });
  }

  @Test
  void insertShouldPropagateOracleFailure() {
    FailingPurchaseOfferRepository repository = new FailingPurchaseOfferRepository();

    assertThatThrownBy(
            () ->
                repository.insertOffer(
                    new PurchaseOfferRepository.PurchaseOfferInsertRecord(
                        null,
                        "Example Lumber",
                        "Sample Contact",
                        12500.25d,
                        LocalDate.of(2026, 3, 2),
                        null,
                        null,
                        "N",
                        "Y",
                        null,
                        "N",
                        null,
                        "P",
                        " ",
                        "idir\\jsmith",
                        null,
                        null,
                        "Port Moody",
                        null,
                        1000456L,
                        99.9d)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void updateShouldPropagateOracleFailure() {
    FailingPurchaseOfferRepository repository = new FailingPurchaseOfferRepository();

    assertThatThrownBy(
            () ->
                repository.updateOffer(
                    new PurchaseOfferRepository.PurchaseOfferUpdateRecord(
                        81001L,
                        null,
                        "Example Lumber",
                        "Sample Contact",
                        12500.25d,
                        LocalDate.of(2026, 3, 2),
                        null,
                        null,
                        "N",
                        "Y",
                        null,
                        "N",
                        null,
                        "P",
                        null,
                        "Port Moody",
                        null,
                        "creator",
                        null,
                        "idir\\jsmith",
                        99.9d)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private static final class TestPurchaseOfferRepository extends PurchaseOfferRepository {
    private final List<?> rows;
    private String whereSql;
    private List<Object> bindValues;
    private String pageSelectSql;
    private String countSelectSql;
    private String countWhereSql;
    private List<Object> countBindValues;
    private CallableStatement callableStatement;
    private int countCalls;
    private int pageCalls;

    TestPurchaseOfferRepository() {
      this(List.of());
    }

    TestPurchaseOfferRepository(List<?> rows) {
      super(null);
      this.rows = rows;
    }

    String whereSql() {
      return whereSql;
    }

    List<Object> bindValues() {
      return bindValues;
    }

    String pageSelectSql() {
      return pageSelectSql;
    }

    String countSelectSql() {
      return countSelectSql;
    }

    String countWhereSql() {
      return countWhereSql;
    }

    List<Object> countBindValues() {
      return countBindValues;
    }

    CallableStatement callableStatement() {
      return callableStatement;
    }

    int pageCalls() {
      return pageCalls;
    }

    int countCalls() {
      return countCalls;
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      countSelectSql = selectSql;
      countWhereSql = where.sql();
      countBindValues = where.bindValues();
      countCalls++;
      return rows.size();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      pageSelectSql = selectSql;
      whereSql = whereAndOrder.sql();
      bindValues = whereAndOrder.bindValues();
      pageCalls++;
      int normalizedPage = Math.max(0, page);
      int normalizedSize = Math.max(1, size);
      int fromIndex = Math.min(rows.size(), normalizedPage * normalizedSize);
      int toIndex = Math.min(rows.size(), fromIndex + normalizedSize);
      List<T> content = (List<T>) rows.subList(fromIndex, toIndex);
      return new PageImpl<>(
          content, PageRequest.of(normalizedPage, normalizedSize), totalElements);
    }

    @Override
    protected <T> Optional<T> queryCursorSingle(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      bind(binder);
      return Optional.empty();
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      bind(binder);
      return Optional.empty();
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      bind(binder);
    }

    private void bind(SqlConsumer<CallableStatement> binder) {
      callableStatement = mock(CallableStatement.class);
      try {
        binder.accept(callableStatement);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class FailingPurchaseOfferRepository extends PurchaseOfferRepository {
    FailingPurchaseOfferRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }
  }

  private static final class NullVolumePurchaseOfferRepository extends PurchaseOfferRepository {
    NullVolumePurchaseOfferRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      ResultSet resultSet = mock(ResultSet.class);
      try {
        when(resultSet.getLong("EXPORT_PURCHASE_OFFER_NUMBER")).thenReturn(81001L);
        when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
        when(resultSet.getDouble("PURCHASE_OFFER_AMOUNT")).thenReturn(12500.25d);
        when(resultSet.getDouble("EXPORT_PURCHASE_VOLUME")).thenReturn(0.0d);
        when(resultSet.getString("REGION")).thenReturn("Cariboo Natural Resource Region");
        when(resultSet.getString("ENTRY_USERID")).thenReturn("IDIR\\CREATOR");
        when(resultSet.getString("UPDATE_USERID")).thenReturn("IDIR\\EDITOR");
        when(resultSet.getString("ORG_UNIT_CODE"))
            .thenThrow(new SQLException("Column is not present in the legacy detail cursor"));
        when(resultSet.wasNull()).thenReturn(false, false, false, true);
        return Optional.of(rowMapper.map(resultSet));
      } catch (SQLException exception) {
        throw new AssertionError(exception);
      }
    }
  }

  private static final class ApplicationRecipientPurchaseOfferRepository
      extends PurchaseOfferRepository {

    ApplicationRecipientPurchaseOfferRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      ResultSet resultSet = mock(ResultSet.class);
      try {
        when(resultSet.getString("EXPORT_APPLICANT_TYPE_CODE")).thenReturn("O");
        when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn("00077881");
        when(resultSet.getString("OWNER_CLIENT_LOCATION_CODE")).thenReturn("00");
        when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L);
        when(resultSet.wasNull()).thenReturn(false);
        return Optional.of(rowMapper.map(resultSet));
      } catch (SQLException exception) {
        throw new AssertionError(exception);
      }
    }
  }

  private static final class ApplicationVolumePurchaseOfferRepository
      extends PurchaseOfferRepository {

    ApplicationVolumePurchaseOfferRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      ResultSet resultSet = mock(ResultSet.class);
      try {
        when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
        when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
        when(resultSet.getDouble("EXEMPTION_APPLICATION_VOLUME")).thenReturn(95.5d);
        when(resultSet.wasNull()).thenReturn(false);
        T row = rowMapper.map(resultSet);
        verify(resultSet, never()).getDouble("APPLICATION_VOLUME");
        return Optional.of(row);
      } catch (SQLException exception) {
        throw new AssertionError(exception);
      }
    }
  }
}

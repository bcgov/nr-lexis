package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResultDto;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;

@DisplayName("Unit Test | LexisApplicationRepository")
class LexisApplicationRepositoryTest {

  @Test
  void loadExemptionReasonOptionsShouldUseLegacyProcedureName() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    assertThat(repository.loadExemptionReasonOptions())
        .containsExactly(new CodeNameDto("U", "Utilization"));
    assertThat(repository.codeNameProcedureSignature())
        .isEqualTo("LEXIS_CODES.FIND_ALL_EXEMPT_RSN_CODES(?)");
  }

  @Test
  void searchShouldUseProvincialApplicationViewAliasForDynamicCriteria() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "B",
            "APP",
            "00077881",
            "00055667",
            "H",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            31916L,
            List.of(1904L, 1905L),
            false,
            "listingDate DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.APPLICATION_NUMBER")
        .contains("v.PACKAGE_NUMBER")
        .contains("v.ADVERTISING_DATE")
        .contains("v.EXPORT_SCHEDULE_ID")
        .contains("v.EXPORT_JURISDICTION_CODE <> 'F'")
        .contains("ORDER BY v.ADVERTISING_DATE DESC, v.APPLICATION_NUMBER ASC")
        .doesNotContain("EEA.")
        .doesNotContain("EP.")
        .doesNotContain("ES.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "EX-1",
            "APP",
            "H",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "31916",
            "00077881",
            "N",
            "1904",
            "1905",
            "B",
            "00055667",
            "00055667");
  }

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql()).doesNotContain("EEA.ORG_UNIT_NO");
    assertThat(repository.whereSql()).doesNotContain("v.ORG_UNIT_NO");
    assertThat(repository.bindValues()).containsExactly("N");
  }

  @Test
  void scopedClientSearchShouldMatchOwnerOrAgentRegardlessOfApplicantType() {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();

    repository.search(
        new LexisApplicationSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            "00012345",
            null,
            null,
            null,
            null,
            null,
            List.of(),
            true,
            null,
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.OWNER_CLIENT_NUMBER LIKE")
        .contains("v.AGENT_CLIENT_NUMBER LIKE")
        .doesNotContain("v.EXPORT_APPLICANT_TYPE_CODE");
    assertThat(repository.bindValues()).containsExactly("N", "00012345", "00012345");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<LexisApplicationSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(LexisApplicationRepositoryTest::applicationResult)
            .toList();
    TestLexisApplicationRepository repository =
        new TestLexisApplicationRepository(
            List.<List<?>>of(firstPage, List.of(applicationResult(900111L))));

    Page<LexisApplicationSearchResultDto> results =
        repository.search(
            new LexisApplicationSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(LexisApplicationSearchResultDto::application)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void mapRemarkRowShouldUseLegacyRemarkNumberColumn() throws Exception {
    TestLexisApplicationRepository repository = new TestLexisApplicationRepository();
    ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
    Timestamp entryTimestamp = Timestamp.valueOf("2026-06-17 08:30:00");
    when(rs.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR")).thenReturn(88L);
    when(rs.wasNull()).thenReturn(false);
    when(rs.getString("REMARK")).thenReturn("Admin note");
    when(rs.getString("ENTRY_USERID")).thenReturn("idir\\admin");
    when(rs.getTimestamp("ENTRY_TIMESTAMP")).thenReturn(entryTimestamp);

    LexisApplicationDetailDto.LexisRemarkDto remark = repository.mapRemarkRow(rs);

    assertThat(remark.remarkId()).isEqualTo(88L);
    assertThat(remark.remark()).isEqualTo("Admin note");
    assertThat(remark.user()).isEqualTo("idir\\admin");
    assertThat(remark.date()).isEqualTo(LocalDate.of(2026, 6, 17));
    verify(rs).getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR");
  }

  @Test
  void detailShouldKeepAnEmptyApplicationCursorAsNotFound() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, false);

    assertThat(repository.findByApplicationNumber(900123L)).isEmpty();
  }

  @Test
  void detailShouldPreserveLegitimatelyEmptyChildCursors() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, true);

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail -> {
              assertThat(detail.packages()).isEmpty();
              assertThat(detail.remarks()).isEmpty();
              assertThat(detail.offers()).isEmpty();
              assertThat(detail.teacMeetingDate()).isNull();
            });
  }

  @Test
  void detailShouldMapLegacyLatestUserIdAsAuthor() {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(null, true);

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .extracting(LexisApplicationDetailDto::author)
        .isEqualTo("idir\\application-editor");
  }

  @Test
  void detailShouldSortRemarksByLegacyRemarkNumber() {
    LexisApplicationRepository repository = new RemarkOrderingLexisApplicationRepository();

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail ->
                assertThat(detail.remarks())
                    .extracting(LexisApplicationDetailDto.LexisRemarkDto::remarkId)
                    .containsExactly(10L, 20L));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)",
        "LEXIS_CODES.FIND_SCHEDULE_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_SCALE_DETAIL_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_PACKAGES_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_REMARKS_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_PURCHASE_OFFERS_BY_APP(?,?)"
      })
  void detailShouldPropagateAuthoritativeCursorFailures(String failingProcedure) {
    DetailReadLexisApplicationRepository repository =
        new DetailReadLexisApplicationRepository(failingProcedure, true);

    assertThatThrownBy(() -> repository.findByApplicationNumber(900123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining(failingProcedure);
  }

  @Test
  void validOfferCheckShouldPropagateOracleFailure() {
    LexisApplicationRepository repository = new OfferReadLexisApplicationRepository(true);

    assertThatThrownBy(() -> repository.hasValidOffer(List.of(900123L)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("purchase offers unavailable");
  }

  @Test
  void validOfferCheckShouldPreserveLegitimatelyEmptyOfferCursor() {
    LexisApplicationRepository repository = new OfferReadLexisApplicationRepository(false);

    assertThat(repository.hasValidOffer(List.of(900123L))).isFalse();
  }

  private static LexisApplicationSearchResultDto applicationResult(long applicationNumber) {
    return new LexisApplicationSearchResultDto(
        applicationNumber, "New", "Client", "00000001", null, null, "Region", 100d, true, false);
  }

  private static final class TestLexisApplicationRepository extends LexisApplicationRepository {
    private final List<List<?>> pages;
    private String whereSql;
    private List<String> bindValues;
    private String codeNameProcedureSignature;
    private int pageCalls;

    TestLexisApplicationRepository() {
      this(List.of());
    }

    TestLexisApplicationRepository(List<List<?>> pages) {
      super(null);
      this.pages = pages;
    }

    String whereSql() {
      return whereSql;
    }

    List<String> bindValues() {
      return bindValues;
    }

    int pageCalls() {
      return pageCalls;
    }

    String codeNameProcedureSignature() {
      return codeNameProcedureSignature;
    }

    @Override
    protected List<CodeNameDto> loadCodeNameOptions(String procedureSignature) {
      codeNameProcedureSignature = procedureSignature;
      return List.of(new CodeNameDto("U", "Utilization"));
    }

    @Override
    protected List<CodeNameDto> loadCodeNameOptionsRequired(String procedureSignature) {
      return loadCodeNameOptions(procedureSignature);
    }

    @Override
    protected int queryLegacyDynamicCountProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
      return pages.stream().mapToInt(List::size).sum();
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      this.whereSql = whereSql;
      this.bindValues = bindValues;
      pageCalls++;
      if (page >= pages.size()) {
        return List.of();
      }
      return (List<T>) pages.get(page);
    }
  }

  private static final class DetailReadLexisApplicationRepository
      extends LexisApplicationRepository {
    private final String failingProcedure;
    private final boolean applicationPresent;

    DetailReadLexisApplicationRepository(String failingProcedure, boolean applicationPresent) {
      super(null);
      this.failingProcedure = failingProcedure;
      this.applicationPresent = applicationPresent;
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (procedureSignature.equals(failingProcedure)) {
        throw new DataAccessResourceFailureException(
            "Oracle detail dependency unavailable: " + procedureSignature);
      }
      if (!"LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)".equals(procedureSignature)) {
        return List.of();
      }
      if (!applicationPresent) {
        return List.of();
      }

      try {
        return List.of(rowMapper.map(applicationDetailResultSet()));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class OfferReadLexisApplicationRepository
      extends LexisApplicationRepository {
    private final boolean fail;

    OfferReadLexisApplicationRepository(boolean fail) {
      super(null);
      this.fail = fail;
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (fail) {
        throw new DataAccessResourceFailureException("Oracle purchase offers unavailable");
      }
      return List.of();
    }
  }

  private static final class RemarkOrderingLexisApplicationRepository
      extends LexisApplicationRepository {

    RemarkOrderingLexisApplicationRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      try {
        if ("LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)".equals(procedureSignature)) {
          return List.of(rowMapper.map(applicationDetailResultSet()));
        }
        if ("LEXIS_GROUP_5.FIND_REMARKS_BY_APP(?,?)".equals(procedureSignature)) {
          return List.of(rowMapper.map(remarkResultSet(20L)), rowMapper.map(remarkResultSet(10L)));
        }
        return List.of();
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static ResultSet applicationDetailResultSet() throws SQLException {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900123L);
    when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
    when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\application-author");
    when(resultSet.getString("UPDATE_USERID")).thenReturn("idir\\application-editor");
    when(resultSet.wasNull()).thenReturn(false);
    return resultSet;
  }

  private static ResultSet remarkResultSet(long remarkId) throws SQLException {
    ResultSet resultSet = org.mockito.Mockito.mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR")).thenReturn(remarkId);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("REMARK")).thenReturn("Remark " + remarkId);
    when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\remark-author");
    when(resultSet.getTimestamp("ENTRY_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf("2026-07-23 08:30:00"));
    return resultSet;
  }
}

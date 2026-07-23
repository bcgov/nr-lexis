package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@DisplayName("Unit Test | ApplicationReviewRepository")
class ApplicationReviewRepositoryTest {

  @Test
  void searchShouldNotConstrainRegionWhenNoRegionSelected() {
    TestApplicationReviewRepository repository = new TestApplicationReviewRepository();

    repository.search(
        new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(repository.whereSql())
        .doesNotContain("ORG_UNIT_NO")
        .doesNotContain("TO_NUMBER(0)");
    assertThat(repository.bindValues()).isEmpty();
  }

  @Test
  void searchShouldUseApplicationViewAliasForReviewCriteria() {
    TestApplicationReviewRepository repository = new TestApplicationReviewRepository();

    repository.search(
        new ApplicationReviewSearchCriteria(
            "45963",
            "H",
            LocalDate.of(2026, 6, 1),
            LocalDate.of(2026, 6, 30),
            LocalDate.of(2026, 6, 10),
            LocalDate.of(2026, 6, 12),
            List.of(1818L, 1834L),
            "regionCode DESC",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.APPLICATION_NUMBER")
        .contains("v.EXPORT_PRODUCT_TYPE_CODE")
        .contains("v.RECEIVED_DATE")
        .contains("v.ADVERTISING_DATE")
        .contains("v.EXPORT_APPLICATION_STATUS_CODE")
        .contains("v.ORG_UNIT_NO")
        .contains("ORDER BY v.ORG_UNIT_CODE DESC")
        .doesNotContain("EEA.")
        .doesNotContain(" AND ORG_UNIT_NO");
    assertThat(repository.bindValues())
        .containsExactly(
            "45963",
            "H",
            "2026-06-01",
            "2026-06-30",
            "2026-06-10",
            "2026-06-12",
            "1818",
            "1834");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<ReviewRowInput> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(ApplicationReviewRepositoryTest::reviewResult)
            .toList();
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(List.of(firstPage, List.of(reviewResult(900111L))));

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void searchShouldDeriveLegacySpeciesEndUseSortInsteadOfUsingProductType() {
    ParityApplicationReviewRepository repository =
        new ParityApplicationReviewRepository(
            "H", 1903L, List.of(new EndUseInput("AL", "PL")), List.of("AL/PL"));

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("AL/PL");
    assertThat(repository.endUseCalls()).isOne();
    assertThat(repository.candidateCalls()).isOne();
  }

  @Test
  void searchShouldUseTheLegacyCandidateContainingEveryApplicationSpecies() {
    ParityApplicationReviewRepository repository =
        new ParityApplicationReviewRepository(
            "H",
            1903L,
            List.of(new EndUseInput("AL", "PL"), new EndUseInput("BA", "PL")),
            List.of("AL/PL", "AL/BA/PL"));

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("AL/BA/PL");
    assertThat(repository.candidateCalls()).isOne();
  }

  private static ReviewRowInput reviewResult(long applicationNumber) {
    return new ReviewRowInput(applicationNumber, "H", 1903L);
  }

  @Test
  void statusWriteFailureShouldPropagateAndRollBack() {
    TrackingTransactionManager transactionManager = new TrackingTransactionManager();
    ApplicationReviewRepository repository =
        transactionalProxy(
            new MutationApplicationReviewRepository(FailureStage.STATUS_WRITE), transactionManager);

    assertThatThrownBy(() -> repository.updateStatusWithRemark(900101L, "REJ", null, "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    assertThat(transactionManager.commits()).isZero();
    assertThat(transactionManager.rollbacks()).isOne();
  }

  @Test
  void remarkInsertFailureShouldRollBackStatusWrite() {
    TrackingTransactionManager transactionManager = new TrackingTransactionManager();
    ApplicationReviewRepository repository =
        transactionalProxy(
            new MutationApplicationReviewRepository(FailureStage.REMARK_INSERT),
            transactionManager);

    assertThatThrownBy(
            () ->
                repository.updateStatusWithRemark(
                    900101L, "REJ", "Missing documents", "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    assertThat(transactionManager.commits()).isZero();
    assertThat(transactionManager.rollbacks()).isOne();
  }

  @Test
  void missingInsertedRemarkRowShouldRollBackStatusWrite() {
    TrackingTransactionManager transactionManager = new TrackingTransactionManager();
    ApplicationReviewRepository repository =
        transactionalProxy(
            new MutationApplicationReviewRepository(FailureStage.REMARK_EMPTY), transactionManager);

    assertThatThrownBy(
            () ->
                repository.updateStatusWithRemark(
                    900101L, "REJ", "Missing documents", "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle application review remark insert returned no row");
    assertThat(transactionManager.commits()).isZero();
    assertThat(transactionManager.rollbacks()).isOne();
  }

  @Test
  void malformedInsertedRemarkRowShouldRollBackStatusWrite() {
    TrackingTransactionManager transactionManager = new TrackingTransactionManager();
    ApplicationReviewRepository repository =
        transactionalProxy(
            new MutationApplicationReviewRepository(FailureStage.REMARK_MALFORMED),
            transactionManager);

    assertThatThrownBy(
            () ->
                repository.updateStatusWithRemark(
                    900101L, "REJ", "Missing documents", "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle application review remark insert returned no row");
    assertThat(transactionManager.commits()).isZero();
    assertThat(transactionManager.rollbacks()).isOne();
  }

  @Test
  void authoritativeApplicantShouldSelectTheCompleteAgentReferenceForAgentApplicants() {
    ApplicationReviewRepository repository =
        new ApplicantApplicationReviewRepository(
            "A", "00055667", "02", "00077881", "01");

    assertThat(repository.findAuthoritativeApplicantClient(900101L))
        .contains(
            new ApplicationReviewRepository.ApplicantClientReference("00055667", "02"));
  }

  @Test
  void authoritativeApplicantContextShouldIncludeTheCanonicalOracleStatus() {
    ApplicationReviewRepository repository =
        new ApplicantApplicationReviewRepository(
            "A", "00055667", "02", "00077881", "01");

    assertThat(repository.findAuthoritativeApplicantStatusContext(900101L))
        .contains(
            new ApplicationReviewRepository.AuthoritativeApplicantStatusContext(
                "REJ", "A", "00055667", "02", 1835L));
  }

  @Test
  void latestAuthoritativeRemarkShouldUseTheGreatestOracleSequenceNumber() {
    ApplicationReviewRepository repository =
        new RemarkApplicationReviewRepository(
            List.of(
                new ApplicationReviewRepository.ReviewRemarkRow(
                    40L, 900101L, "Earlier note", "idir\\reviewer", java.time.Instant.EPOCH),
                new ApplicationReviewRepository.ReviewRemarkRow(
                    42L, 900101L, "Status reason", "idir\\reviewer", java.time.Instant.EPOCH),
                new ApplicationReviewRepository.ReviewRemarkRow(
                    99L, 900999L, "Other application", "idir\\reviewer", java.time.Instant.EPOCH)));

    assertThat(repository.findLatestAuthoritativeRemark(900101L))
        .contains(
            new ApplicationReviewRepository.ReviewRemarkRow(
                42L, 900101L, "Status reason", "idir\\reviewer", java.time.Instant.EPOCH));
  }

  @Test
  void authoritativeJurisdictionShouldComeFromTheRequiredApplicationCursor() {
    ApplicationReviewRepository repository =
        new ApplicantApplicationReviewRepository(
            "A", "00055667", "02", "00077881", "01");

    assertThat(repository.findAuthoritativeJurisdictionCode(900101L)).contains("F");
  }

  @Test
  void authoritativeCursorShouldNotRequireLegacyApplicationVolumeColumn() throws Exception {
    CallableStatement statement = mock(CallableStatement.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(statement.getObject(2)).thenReturn(resultSet);
    when(resultSet.next()).thenReturn(true, false);
    when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("P");
    when(resultSet.getDouble("APPLICATION_VOLUME"))
        .thenThrow(new SQLException("Invalid column name", "99999", 17006));
    ApplicationReviewRepository repository =
        new ApplicationReviewRepository(jdbcTemplateExecuting(statement));

    assertThat(repository.findAuthoritativeJurisdictionCode(900101L)).contains("P");
  }

  @Test
  void authoritativeApplicantShouldSelectTheCompleteOwnerReferenceForOwnerApplicants() {
    ApplicationReviewRepository repository =
        new ApplicantApplicationReviewRepository(
            "O", "00055667", "02", "00077881", "01");

    assertThat(repository.findAuthoritativeApplicantClient(900101L))
        .contains(
            new ApplicationReviewRepository.ApplicantClientReference("00077881", "01"));
  }

  @Test
  void authoritativeApplicantShouldFailClosedForUnknownOrIncompleteApplicantReferences() {
    ApplicationReviewRepository unknownType =
        new ApplicantApplicationReviewRepository(
            "X", "00055667", "02", "00077881", "01");
    ApplicationReviewRepository incompleteAgent =
        new ApplicantApplicationReviewRepository(
            "A", "00055667", null, "00077881", "01");
    ApplicationReviewRepository incompleteOwner =
        new ApplicantApplicationReviewRepository(
            "O", "00055667", "02", null, "01");

    assertThat(unknownType.findAuthoritativeApplicantClient(900101L)).isEmpty();
    assertThat(incompleteAgent.findAuthoritativeApplicantClient(900101L)).isEmpty();
    assertThat(incompleteOwner.findAuthoritativeApplicantClient(900101L)).isEmpty();
  }

  @Test
  void guardedTransitionShouldWriteOnlyFromAnAllowedAuthoritativeStatus() {
    GuardedMutationApplicationReviewRepository repository =
        new GuardedMutationApplicationReviewRepository("NEW");

    ApplicationReviewRepository.ApplicationStatusTransitionRow result =
        repository.updateStatusWithRemarkFromAllowedSources(
            900101L, "EXP", null, "idir\\jsmith", List.of("NEW", "PND"));

    assertThat(result.updated()).isTrue();
    assertThat(result.applicationFound()).isTrue();
    assertThat(result.transitionAllowed()).isTrue();
    assertThat(result.currentStatus()).isEqualTo("NEW");
    assertThat(repository.requiredReads()).isOne();
    assertThat(repository.statusWrites()).isOne();
  }

  @Test
  void guardedTransitionShouldRejectTerminalAndSameStatusWithoutAnyWrite() {
    GuardedMutationApplicationReviewRepository terminal =
        new GuardedMutationApplicationReviewRepository("APP");
    GuardedMutationApplicationReviewRepository sameStatus =
        new GuardedMutationApplicationReviewRepository("REJ");

    ApplicationReviewRepository.ApplicationStatusTransitionRow terminalResult =
        terminal.updateStatusWithRemarkFromAllowedSources(
            900101L, "REJ", "Missing documents", "idir\\jsmith", List.of("NEW", "PND"));
    ApplicationReviewRepository.ApplicationStatusTransitionRow sameStatusResult =
        sameStatus.updateStatusWithRemarkFromAllowedSources(
            900101L, "REJ", "Missing documents", "idir\\jsmith", List.of("NEW", "PND"));

    assertThat(terminalResult.transitionAllowed()).isFalse();
    assertThat(terminalResult.currentStatus()).isEqualTo("APP");
    assertThat(sameStatusResult.transitionAllowed()).isFalse();
    assertThat(sameStatusResult.currentStatus()).isEqualTo("REJ");
    assertThat(terminal.statusWrites()).isZero();
    assertThat(sameStatus.statusWrites()).isZero();
    assertThat(terminal.requiredReads()).isOne();
    assertThat(sameStatus.requiredReads()).isOne();
  }

  private static ApplicationReviewRepository transactionalProxy(
      ApplicationReviewRepository target, TrackingTransactionManager transactionManager) {
    TransactionInterceptor interceptor = new TransactionInterceptor();
    interceptor.setTransactionManager(transactionManager);
    interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(target);
    proxyFactory.setProxyTargetClass(true);
    proxyFactory.addAdvice(interceptor);
    return (ApplicationReviewRepository) proxyFactory.getProxy();
  }

  enum FailureStage {
    STATUS_WRITE,
    REMARK_INSERT,
    REMARK_EMPTY,
    REMARK_MALFORMED
  }

  static class MutationApplicationReviewRepository extends ApplicationReviewRepository {
    private final FailureStage failureStage;
    private int cursorCallCount;

    MutationApplicationReviewRepository(FailureStage failureStage) {
      super(null);
      this.failureStage = failureStage;
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      cursorCallCount++;
      if (failureStage == FailureStage.REMARK_INSERT && cursorCallCount == 2) {
        throw new DataAccessResourceFailureException("Oracle unavailable");
      }
      if (failureStage == FailureStage.REMARK_EMPTY && cursorCallCount == 2) {
        return Optional.empty();
      }
      try {
        ResultSet resultSet = mock(ResultSet.class);
        if (cursorCallCount == 1) {
          when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900101L);
          when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\jsmith");
        } else if (failureStage == FailureStage.REMARK_MALFORMED) {
          when(resultSet.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR"))
              .thenReturn(77L);
          when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900999L);
          when(resultSet.getString("REMARK")).thenReturn("Missing documents");
          when(resultSet.getString("ENTRY_USERID")).thenReturn("idir\\jsmith");
        }
        return Optional.ofNullable(rowMapper.map(resultSet));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      if (failureStage == FailureStage.STATUS_WRITE) {
        throw new DataAccessResourceFailureException("Oracle unavailable");
      }
    }
  }

  static class ApplicantApplicationReviewRepository extends ApplicationReviewRepository {
    private final String applicantType;
    private final String agentNumber;
    private final String agentLocation;
    private final String ownerNumber;
    private final String ownerLocation;

    ApplicantApplicationReviewRepository(
        String applicantType,
        String agentNumber,
        String agentLocation,
        String ownerNumber,
        String ownerLocation) {
      super(null);
      this.applicantType = applicantType;
      this.agentNumber = agentNumber;
      this.agentLocation = agentLocation;
      this.ownerNumber = ownerNumber;
      this.ownerLocation = ownerLocation;
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      ResultSet resultSet = mock(ResultSet.class);
      try {
        when(resultSet.getString("EXPORT_APPLICANT_TYPE_CODE")).thenReturn(applicantType);
        when(resultSet.getString("AGENT_CLIENT_NUMBER")).thenReturn(agentNumber);
        when(resultSet.getString("AGENT_CLIENT_LOCATION_CODE")).thenReturn(agentLocation);
        when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn(ownerNumber);
        when(resultSet.getString("OWNER_CLIENT_LOCATION_CODE")).thenReturn(ownerLocation);
        when(resultSet.getString("EXPORT_APPLICATION_STATUS_CODE")).thenReturn("REJ");
        when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("F");
        when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1835L);
        return Optional.ofNullable(rowMapper.map(resultSet));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  static class GuardedMutationApplicationReviewRepository
      extends ApplicationReviewRepository {
    private final String currentStatus;
    private int requiredReads;
    private int statusWrites;

    GuardedMutationApplicationReviewRepository(String currentStatus) {
      super(null);
      this.currentStatus = currentStatus;
    }

    int requiredReads() {
      return requiredReads;
    }

    int statusWrites() {
      return statusWrites;
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      requiredReads++;
      ResultSet resultSet = mock(ResultSet.class);
      try {
        when(resultSet.getString("EXPORT_APPLICATION_STATUS_CODE"))
            .thenReturn(currentStatus);
        return Optional.ofNullable(rowMapper.map(resultSet));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      statusWrites++;
    }
  }

  static class RemarkApplicationReviewRepository extends ApplicationReviewRepository {
    private final List<ReviewRemarkRow> remarks;

    RemarkApplicationReviewRepository(List<ReviewRemarkRow> remarks) {
      super(null);
      this.remarks = remarks;
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      assertThat(procedureSignature).isEqualTo("LEXIS_GROUP_5.FIND_REMARKS_BY_APP(?,?)");
      assertThat(cursorOutIndex).isEqualTo(2);
      return (List<T>) remarks;
    }
  }

  static class TrackingTransactionManager extends AbstractPlatformTransactionManager {
    private int commits;
    private int rollbacks;

    int commits() {
      return commits;
    }

    int rollbacks() {
      return rollbacks;
    }

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // No backing resource is needed to verify interceptor commit/rollback decisions.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private static JdbcTemplate jdbcTemplateExecuting(CallableStatement statement) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              CallableStatementCallback callback = invocation.getArgument(1);
              return callback.doInCallableStatement(statement);
            });
    return jdbcTemplate;
  }

  private record EndUseInput(String speciesCode, String endUseCode) {}

  private record ReviewRowInput(Long applicationNumber, String productTypeCode, Long orgUnitNo) {}

  private static ResultSet newReviewResultSet(ReviewRowInput row) {
    try {
      ResultSet resultSet = mock(ResultSet.class);
      when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(row.applicationNumber());
      when(resultSet.getDouble("EXEMPTION_APPLICATION_VOLUME")).thenReturn(1.0d);
      when(resultSet.getString("END_USE_SORT")).thenReturn("H");
      when(resultSet.getString("EXPORT_PRODUCT_TYPE_CODE")).thenReturn(row.productTypeCode());
      when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(row.orgUnitNo());
      when(resultSet.getString("STATUS_DESCRIPTION")).thenReturn("New");
      when(resultSet.getString("REGION_CODE")).thenReturn("RNO");
      return resultSet;
    } catch (SQLException ex) {
      throw new AssertionError(ex);
    }
  }

  private static ResultSet newEndUseResultSet(EndUseInput endUse) {
    try {
      ResultSet resultSet = mock(ResultSet.class);
      when(resultSet.getString("EXPORT_SPECIES_CODE")).thenReturn(endUse.speciesCode());
      when(resultSet.getString("EXPORT_END_USE_CODE")).thenReturn(endUse.endUseCode());
      return resultSet;
    } catch (SQLException ex) {
      throw new AssertionError(ex);
    }
  }

  private static ResultSet newCandidateResultSet(String candidate) {
    try {
      ResultSet resultSet = mock(ResultSet.class);
      when(resultSet.getString("EXCOL_TRANSLATION_VALUE")).thenReturn(candidate);
      return resultSet;
    } catch (SQLException ex) {
      throw new AssertionError(ex);
    }
  }

  private static final class ParityApplicationReviewRepository
      extends ApplicationReviewRepository {
    private final String productTypeCode;
    private final Long orgUnitNo;
    private final List<EndUseInput> endUses;
    private final List<String> candidates;
    private int endUseCalls;
    private int candidateCalls;

    ParityApplicationReviewRepository(
        String productTypeCode,
        Long orgUnitNo,
        List<EndUseInput> endUses,
        List<String> candidates) {
      super(null);
      this.productTypeCode = productTypeCode;
      this.orgUnitNo = orgUnitNo;
      this.endUses = List.copyOf(endUses);
      this.candidates = List.copyOf(candidates);
    }

    int endUseCalls() {
      return endUseCalls;
    }

    int candidateCalls() {
      return candidateCalls;
    }

    @Override
    protected int queryLegacyDynamicCountProcedure(
        String procedureSignature, String whereSql, List<String> bindValues) {
      return 1;
    }

    @Override
    protected <T> List<T> queryLegacyDynamicPagedProcedure(
        String procedureSignature,
        String whereSql,
        List<String> bindValues,
        int page,
        SqlRowMapper<T> rowMapper) {
      if (page > 0) {
        return List.of();
      }
      return List.of(
          mapRow(rowMapper, newReviewResultSet(new ReviewRowInput(46102L, productTypeCode, orgUnitNo))));
    }

    @Override
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if ("LEXIS_GROUP_5.FIND_END_USE_BY_APP(?,?)".equals(procedureSignature)) {
        endUseCalls++;
        return endUses.stream()
            .map(endUse -> mapRow(rowMapper, newEndUseResultSet(endUse)))
            .toList();
      }
      if ("LEXIS_CODES.FIND_CANDIDATE_EXCOL_VALUES(?,?,?,?,?)".equals(procedureSignature)) {
        candidateCalls++;
        return candidates.stream()
            .map(candidate -> mapRow(rowMapper, newCandidateResultSet(candidate)))
            .toList();
      }
      return List.of();
    }

    private <T> T mapRow(SqlRowMapper<T> rowMapper, ResultSet resultSet) {
      try {
        return rowMapper.map(resultSet);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class TestApplicationReviewRepository extends ApplicationReviewRepository {
    private final List<List<ReviewRowInput>> pages;
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestApplicationReviewRepository() {
      this(List.of());
    }

    TestApplicationReviewRepository(List<List<ReviewRowInput>> pages) {
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

    @Override
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
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
      return pages.get(page).stream()
          .map(row -> mapRow(rowMapper, newReviewResultSet(row)))
          .toList();
    }

    private <T> T mapRow(SqlRowMapper<T> rowMapper, ResultSet resultSet) {
      try {
        return rowMapper.map(resultSet);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }
}

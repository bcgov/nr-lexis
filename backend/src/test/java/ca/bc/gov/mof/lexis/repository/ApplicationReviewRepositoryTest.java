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
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.SliceImpl;
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
  void searchShouldUseDirectQueryForEveryReviewFilter() {
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
        .contains("TO_CHAR(EEA.APPLICATION_NUMBER) LIKE '%' || ? || '%'")
        .contains("EEA.EXPORT_PRODUCT_TYPE_CODE = ?")
        .contains("EEA.RECEIVED_DATE >= ?")
        .contains("EEA.RECEIVED_DATE <= ?")
        .contains("ES.ADVERTISING_DATE >= ?")
        .contains("ES.ADVERTISING_DATE <= ?")
        .contains("EEA.EXPORT_APPLICATION_STATUS_CODE IN ('NEW', 'PND')")
        .contains("EEA.ORG_UNIT_NO IN (?, ?)")
        .contains("ORDER BY OU.ORG_UNIT_CODE DESC, EEA.APPLICATION_NUMBER DESC")
        .doesNotContain(":1");
    assertThat(repository.pageSelectSql())
        .contains("FROM EXPORT_EXEMPTION_APPLICATION EEA")
        .contains("INNER JOIN EXPORT_APPLICATION_STATUS_CODE EASC")
        .contains("INNER JOIN EXPORT_EXEMPTION_REASON_CODE EERC")
        .contains("INNER JOIN EXPORT_APPLICANT_TYPE_CODE EATC")
        .contains("FROM HAULING_AUTHORITY HA")
        .contains("EP_INFO.APPLICATION_NUMBER = EEA.APPLICATION_NUMBER")
        .doesNotContain("FIND_APPLICATIONS_BY_CRITERIA");
    assertThat(repository.bindValues())
        .containsExactly(
            "45963",
            "H",
            java.sql.Date.valueOf("2026-06-01"),
            java.sql.Date.valueOf("2026-06-30"),
            java.sql.Date.valueOf("2026-06-10"),
            java.sql.Date.valueOf("2026-06-12"),
            1818L,
            1834L);
  }

  @Test
  void searchShouldLoadRequestedDirectPageWithCountTotal() {
    List<ReviewRowInput> rows =
        java.util.stream.LongStream.rangeClosed(900101L, 900111L)
            .mapToObj(ApplicationReviewRepositoryTest::reviewResult)
            .toList();
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(rows);

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.countCalls()).isEqualTo(1);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      textBlock = """
          applicationNumber DESC|ORDER BY EEA.APPLICATION_NUMBER DESC
          volume ASC|ORDER BY EEA.EXEMPTION_APPLICATION_VOLUME ASC, EEA.APPLICATION_NUMBER ASC
          listingDate DESC|ORDER BY ES.ADVERTISING_DATE DESC, EEA.APPLICATION_NUMBER DESC
          status ASC|ORDER BY EEA.EXPORT_APPLICATION_STATUS_CODE ASC, EEA.APPLICATION_NUMBER ASC
          regionCode DESC|ORDER BY OU.ORG_UNIT_CODE DESC, EEA.APPLICATION_NUMBER DESC
          region ASC|ORDER BY OU.ORG_UNIT_CODE ASC, EEA.APPLICATION_NUMBER ASC
          """)
  void searchShouldWhitelistEverySupportedSort(String sortField, String expectedOrder) {
    TestApplicationReviewRepository repository = new TestApplicationReviewRepository();

    repository.search(emptyCriteria(sortField, 0, 10));

    assertThat(repository.whereSql()).contains(expectedOrder);
  }

  @Test
  void searchShouldRejectUnrecognizedSortExpressions() {
    TestApplicationReviewRepository repository = new TestApplicationReviewRepository();

    repository.search(emptyCriteria("applicationNumber DESC; DELETE", 0, 10));

    assertThat(repository.whereSql())
        .endsWith("ORDER BY EEA.APPLICATION_NUMBER DESC")
        .doesNotContain("DELETE");
  }

  @Test
  void countShouldUseTheSameFiltersWithoutSortOrInfoIconJoins() {
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(List.of(reviewResult(900101L)));
    ApplicationReviewSearchCriteria criteria =
        new ApplicationReviewSearchCriteria(
            "900",
            "H",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            List.of(1903L),
            "listingDate DESC",
            0,
            10);

    repository.search(criteria);
    String pageWhere = repository.whereSql();
    List<Object> pageBinds = repository.bindValues();
    repository.count(criteria);

    assertThat(repository.countSelectSql())
        .contains("SELECT COUNT(*)")
        .contains("FROM EXPORT_EXEMPTION_APPLICATION EEA")
        .doesNotContain("HAULING_AUTHORITY")
        .doesNotContain("SHOW_INFO_ICON");
    assertThat(repository.countWhereSql())
        .isEqualTo(pageWhere.substring(0, pageWhere.indexOf(" ORDER BY")))
        .doesNotContain("OFFSET")
        .doesNotContain("FETCH NEXT");
    assertThat(repository.countBindValues()).isEqualTo(pageBinds);
  }

  @Test
  void searchShouldUseKnownTotalWithoutCallingCount() {
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(
            java.util.stream.LongStream.rangeClosed(900101L, 900111L)
                .mapToObj(ApplicationReviewRepositoryTest::reviewResult)
                .toList());

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(emptyCriteria(null, 1, 10), 11);

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::applicationNumber)
        .containsExactly(900111L);
    assertThat(repository.countCalls()).isZero();
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void previewSliceShouldUseOneDirectPageQueryWithLookAhead() {
    TestApplicationReviewRepository repository =
        new TestApplicationReviewRepository(
            java.util.stream.LongStream.rangeClosed(900101L, 900111L)
                .mapToObj(ApplicationReviewRepositoryTest::reviewResult)
                .toList());

    Slice<ApplicationReviewSearchResultDto> results =
        repository.slice(emptyCriteria(null, 0, 10));

    assertThat(results.getContent()).hasSize(10);
    assertThat(results.hasNext()).isTrue();
    assertThat(repository.sliceCalls()).isEqualTo(1);
    assertThat(repository.countCalls()).isZero();
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
            List.of("AL/CE/PL", "AL/BA/PL"));

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("AL/BA/PL");
    assertThat(repository.candidateCalls()).isOne();
  }

  @Test
  void searchShouldIncludeTheLegacyCandidateSuffixPattern() {
    ParityApplicationReviewRepository repository =
        new ParityApplicationReviewRepository(
            "H", 1903L, List.of(new EndUseInput("CE", "UT")), List.of("CE/UT SH"));

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(
                null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("CE/UT SH");
  }

  @ParameterizedTest
  @ValueSource(ints = {1, 10, 25, 50, 100, 200})
  void searchShouldKeepDatabaseCallsConstantThroughTwoHundredRows(int pageSize) {
    BatchingApplicationReviewRepository repository =
        new BatchingApplicationReviewRepository(pageSize);

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(emptyCriteria(null, 0, pageSize));

    assertThat(results.getContent()).hasSize(pageSize);
    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsOnly("AL/PL");
    assertThat(repository.countCalls()).isOne();
    assertThat(repository.pageCalls()).isOne();
    assertThat(repository.requestedApplicationCount()).isEqualTo(pageSize);
    assertThat(repository.endUseCalls()).isOne();
    assertThat(repository.candidateCalls()).isOne();
    assertThat(repository.databaseCalls()).isEqualTo(4);
  }

  @Test
  void searchShouldUseStoredProcedureFallbackWhenBatchEndUseQueryFails() {
    FallbackApplicationReviewRepository repository =
        new FallbackApplicationReviewRepository(BatchFailureStage.END_USE);

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(
                null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("AL/PL");
    assertThat(repository.batchEndUseCalls()).isOne();
    assertThat(repository.batchCandidateCalls()).isZero();
    assertThat(repository.procedureEndUseCalls()).isOne();
    assertThat(repository.procedureCandidateCalls()).isOne();
  }

  @Test
  void searchShouldUseStoredProcedureFallbackWhenBatchCandidateQueryFails() {
    FallbackApplicationReviewRepository repository =
        new FallbackApplicationReviewRepository(BatchFailureStage.CANDIDATE);

    Page<ApplicationReviewSearchResultDto> results =
        repository.search(
            new ApplicationReviewSearchCriteria(
                null, null, null, null, null, null, List.of(), null, 0, 10));

    assertThat(results.getContent())
        .extracting(ApplicationReviewSearchResultDto::speciesEndUse)
        .containsExactly("AL/PL");
    assertThat(repository.batchEndUseCalls()).isOne();
    assertThat(repository.batchCandidateCalls()).isOne();
    assertThat(repository.procedureEndUseCalls()).isOne();
    assertThat(repository.procedureCandidateCalls()).isOne();
  }

  private static ApplicationReviewSearchCriteria emptyCriteria(
      String sortField, int page, int size) {
    return new ApplicationReviewSearchCriteria(
        null, null, null, null, null, null, List.of(), sortField, page, size);
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

  enum BatchFailureStage {
    END_USE,
    CANDIDATE
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
    protected int queryDirectCount(String selectSql, DirectSql where) {
      return 1;
    }

    @Override
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      List<T> rows =
          page > 0
              ? List.of()
              : List.of(
                  mapRow(
                      rowMapper,
                      newReviewResultSet(
                          new ReviewRowInput(46102L, productTypeCode, orgUnitNo))));
      return new PageImpl<>(rows, PageRequest.of(page, size), totalElements);
    }

    @Override
    protected List<EndUseSortRow> findEndUsesByApplicationNumbers(
        Collection<Long> applicationNumbers) {
      endUseCalls++;
      Long applicationNumber = applicationNumbers.iterator().next();
      return endUses.stream()
          .map(
              endUse ->
                  new EndUseSortRow(
                      applicationNumber, endUse.speciesCode(), endUse.endUseCode()))
          .toList();
    }

    @Override
    protected List<ExcolCandidateRow> findCandidateExcolRows(
        Collection<Long> orgUnitNumbers,
        Collection<String> speciesCodes,
        Collection<String> endUseCodes) {
      candidateCalls++;
      EndUseInput firstEndUse = endUses.get(0);
      return candidates.stream()
          .map(
              candidate ->
                  new ExcolCandidateRow(
                      orgUnitNo,
                      firstEndUse.speciesCode(),
                      firstEndUse.endUseCode(),
                      candidate))
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

  private static final class BatchingApplicationReviewRepository
      extends ApplicationReviewRepository {
    private final int resultCount;
    private int countCalls;
    private int pageCalls;
    private int requestedApplicationCount;
    private int endUseCalls;
    private int candidateCalls;

    BatchingApplicationReviewRepository(int resultCount) {
      super(null);
      this.resultCount = resultCount;
    }

    int pageCalls() {
      return pageCalls;
    }

    int countCalls() {
      return countCalls;
    }

    int databaseCalls() {
      return countCalls + pageCalls + endUseCalls + candidateCalls;
    }

    int requestedApplicationCount() {
      return requestedApplicationCount;
    }

    int endUseCalls() {
      return endUseCalls;
    }

    int candidateCalls() {
      return candidateCalls;
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      countCalls++;
      return resultCount;
    }

    @Override
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      pageCalls++;
      int start = Math.min(resultCount, page * size);
      int end = Math.min(start + size, resultCount);
      List<T> rows =
          java.util.stream.LongStream.range(start, end)
              .mapToObj(
                  offset ->
                      mapRow(
                          rowMapper,
                          newReviewResultSet(
                              new ReviewRowInput(900001L + offset, "H", 1903L))))
              .toList();
      return new PageImpl<>(rows, PageRequest.of(page, size), totalElements);
    }

    @Override
    protected List<EndUseSortRow> findEndUsesByApplicationNumbers(
        Collection<Long> applicationNumbers) {
      endUseCalls++;
      requestedApplicationCount = applicationNumbers.size();
      return applicationNumbers.stream()
          .map(applicationNumber -> new EndUseSortRow(applicationNumber, "AL", "PL"))
          .toList();
    }

    @Override
    protected List<ExcolCandidateRow> findCandidateExcolRows(
        Collection<Long> orgUnitNumbers,
        Collection<String> speciesCodes,
        Collection<String> endUseCodes) {
      candidateCalls++;
      return List.of(new ExcolCandidateRow(1903L, "AL", "PL", "AL/PL"));
    }

    private <T> T mapRow(SqlRowMapper<T> rowMapper, ResultSet resultSet) {
      try {
        return rowMapper.map(resultSet);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class FallbackApplicationReviewRepository
      extends ApplicationReviewRepository {
    private final BatchFailureStage failureStage;
    private int batchEndUseCalls;
    private int batchCandidateCalls;
    private int procedureEndUseCalls;
    private int procedureCandidateCalls;

    FallbackApplicationReviewRepository(BatchFailureStage failureStage) {
      super(null);
      this.failureStage = failureStage;
    }

    int batchEndUseCalls() {
      return batchEndUseCalls;
    }

    int batchCandidateCalls() {
      return batchCandidateCalls;
    }

    int procedureEndUseCalls() {
      return procedureEndUseCalls;
    }

    int procedureCandidateCalls() {
      return procedureCandidateCalls;
    }

    @Override
    protected int queryDirectCount(String selectSql, DirectSql where) {
      return 1;
    }

    @Override
    protected <T> Page<T> queryDirectPage(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        int totalElements,
        SqlRowMapper<T> rowMapper) {
      List<T> rows =
          page > 0
              ? List.of()
              : List.of(
                  mapRow(
                      rowMapper,
                      newReviewResultSet(new ReviewRowInput(46102L, "H", 1903L))));
      return new PageImpl<>(rows, PageRequest.of(page, size), totalElements);
    }

    @Override
    protected List<EndUseSortRow> findEndUsesByApplicationNumbers(
        Collection<Long> applicationNumbers) {
      batchEndUseCalls++;
      if (failureStage == BatchFailureStage.END_USE) {
        throw new DataAccessResourceFailureException("batch end-use grant unavailable");
      }
      return List.of(new EndUseSortRow(46102L, "AL", "PL"));
    }

    @Override
    protected List<ExcolCandidateRow> findCandidateExcolRows(
        Collection<Long> orgUnitNumbers,
        Collection<String> speciesCodes,
        Collection<String> endUseCodes) {
      batchCandidateCalls++;
      if (failureStage == BatchFailureStage.CANDIDATE) {
        throw new DataAccessResourceFailureException("batch EXCOL grant unavailable");
      }
      return List.of(new ExcolCandidateRow(1903L, "AL", "PL", "AL/PL"));
    }

    @Override
    protected List<EndUseSortRow> findEndUsesByApplicationNumber(Long applicationNumber) {
      procedureEndUseCalls++;
      return List.of(new EndUseSortRow(applicationNumber, "AL", "PL"));
    }

    @Override
    protected List<String> findCandidateExcolCodes(
        int speciesCount, String speciesCode, String endUseCode, Long orgUnitNo) {
      procedureCandidateCalls++;
      return List.of("AL/PL");
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
    private final List<ReviewRowInput> rows;
    private String whereSql;
    private List<Object> bindValues;
    private String pageSelectSql;
    private String countSelectSql;
    private String countWhereSql;
    private List<Object> countBindValues;
    private int countCalls;
    private int pageCalls;
    private int sliceCalls;

    TestApplicationReviewRepository() {
      this(List.of());
    }

    TestApplicationReviewRepository(List<ReviewRowInput> rows) {
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

    int countCalls() {
      return countCalls;
    }

    int pageCalls() {
      return pageCalls;
    }

    int sliceCalls() {
      return sliceCalls;
    }

    @Override
    protected List<EndUseSortRow> findEndUsesByApplicationNumbers(
        Collection<Long> applicationNumbers) {
      return List.of();
    }

    @Override
    protected List<ExcolCandidateRow> findCandidateExcolRows(
        Collection<Long> orgUnitNumbers,
        Collection<String> speciesCodes,
        Collection<String> endUseCodes) {
      return List.of();
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
      List<T> content =
          rows.subList(fromIndex, toIndex).stream()
              .map(row -> mapRow(rowMapper, newReviewResultSet(row)))
              .toList();
      return new PageImpl<>(
          content, PageRequest.of(normalizedPage, normalizedSize), totalElements);
    }

    @Override
    protected <T> Slice<T> queryDirectSlice(
        String selectSql,
        DirectSql whereAndOrder,
        int page,
        int size,
        SqlRowMapper<T> rowMapper) {
      pageSelectSql = selectSql;
      whereSql = whereAndOrder.sql();
      bindValues = whereAndOrder.bindValues();
      sliceCalls++;
      int normalizedPage = Math.max(0, page);
      int normalizedSize = Math.max(1, size);
      int fromIndex = Math.min(rows.size(), normalizedPage * normalizedSize);
      int toIndex = Math.min(rows.size(), fromIndex + normalizedSize);
      List<T> content =
          rows.subList(fromIndex, toIndex).stream()
              .map(row -> mapRow(rowMapper, newReviewResultSet(row)))
              .toList();
      return new SliceImpl<>(
          content,
          PageRequest.of(normalizedPage, normalizedSize),
          rows.size() > toIndex);
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

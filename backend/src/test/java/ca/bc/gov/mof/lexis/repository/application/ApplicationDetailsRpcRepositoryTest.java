package ca.bc.gov.mof.lexis.repository.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@DisplayName("Unit Test | ApplicationDetailsRpcRepository")
class ApplicationDetailsRpcRepositoryTest {

  @Test
  void directMutationsShouldPropagateOracleFailure() {
    FailingApplicationDetailsRpcRepository repository =
        new FailingApplicationDetailsRpcRepository();

    assertOracleFailure(
        () ->
            repository.updateScaleDetail(
                new ApplicationDetailsRpcRepository.ScaleMutationRecord(
                    "55",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null)));
    assertOracleFailure(() -> repository.deleteScaleById("55", "idir\\jsmith"));
    assertOracleFailure(() -> repository.deletePackageById("PKG-1", "idir\\jsmith"));
    assertOracleFailure(() -> repository.deleteApplicationFile(10L));
    assertOracleFailure(
        () -> repository.updateRemark(44L, 1000456L, "updated", "idir\\jsmith", Instant.now()));
    assertOracleFailure(
        () ->
            repository.updatePackagePreservingEndUses(
                packageMutationRecord(
                    List.of(
                        new ApplicationDetailsRpcRepository.EndUseMutationRecord("CE", "LU")))));
  }

  @Test
  void applicationEndUseReplacementShouldPropagateInsertFailure() {
    FailOnSecondExecutionRepository repository = new FailOnSecondExecutionRepository();

    assertOracleFailure(
        () ->
            repository.replaceApplicationEndUses(
                1000456L,
                List.of(new ApplicationDetailsRpcRepository.EndUseMutationRecord("CE", "LU"))));
  }

  @Test
  void packageUpdateShouldPropagateEndUseDeleteFailure() {
    FailOnSecondExecutionRepository repository = new FailOnSecondExecutionRepository();

    assertOracleFailure(
        () ->
            repository.updatePackage(
                new ApplicationDetailsRpcRepository.PackageMutationRecord(
                    "PKG-1",
                    1000456L,
                    "N",
                    100.0d,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "NEW",
                    "G",
                    "LOG",
                    "idir\\jsmith",
                    Instant.now(),
                    "idir\\jsmith",
                    List.of(new ApplicationDetailsRpcRepository.EndUseMutationRecord("CE", "LU")))));
  }

  @Test
  void packageSynchronizationShouldNeverExecuteEndUseMutations() {
    FailOnSecondExecutionRepository repository = new FailOnSecondExecutionRepository();

    boolean updated =
        repository.updatePackagePreservingEndUses(
            packageMutationRecord(
                List.of(new ApplicationDetailsRpcRepository.EndUseMutationRecord("CE", "LU"))));

    assertThat(updated).isTrue();
    assertThat(repository.executionCount).isEqualTo(1);
  }

  @Test
  void packageHeaderDuplicateShouldBecomeExactPackageConflictWhenPackageNowExists() {
    DuplicatePackageHeaderRepository repository =
        new DuplicatePackageHeaderRepository(true);

    assertThatThrownBy(
            () -> repository.insertPackage(packageMutationRecord(List.of())))
        .isInstanceOf(DuplicatePackageNumberException.class)
        .hasMessage("Package PKG-1 already exists.")
        .hasCauseInstanceOf(DuplicateKeyException.class);

    assertThat(repository.packageExistsChecks).isEqualTo(1);
    assertThat(repository.checkedPackageNumber).isEqualTo("PKG-1");
  }

  @Test
  void packageHeaderDuplicateShouldRemainDatabaseFailureWhenExactPackageDoesNotExist() {
    DuplicatePackageHeaderRepository repository =
        new DuplicatePackageHeaderRepository(false);

    assertThatThrownBy(
            () -> repository.insertPackage(packageMutationRecord(List.of())))
        .isInstanceOf(DuplicateKeyException.class)
        .isNotInstanceOf(DuplicatePackageNumberException.class);

    assertThat(repository.packageExistsChecks).isEqualTo(1);
    assertThat(repository.checkedPackageNumber).isEqualTo("PKG-1");
  }

  @Test
  void packageHeaderIntegrityFailureOtherThanDuplicateShouldPropagateWithoutExistenceCheck() {
    OtherPackageHeaderIntegrityFailureRepository repository =
        new OtherPackageHeaderIntegrityFailureRepository();

    assertThatThrownBy(
            () -> repository.insertPackage(packageMutationRecord(List.of())))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessage("foreign key failure");

    assertThat(repository.packageExistsChecks).isZero();
  }

  @Test
  void packageEndUseDuplicateShouldNotBeMisclassifiedAsPackageNumberConflict() {
    DuplicatePackageEndUseRepository repository =
        new DuplicatePackageEndUseRepository();

    assertThatThrownBy(
            () ->
                repository.insertPackage(
                    packageMutationRecord(
                        List.of(
                            new ApplicationDetailsRpcRepository.EndUseMutationRecord(
                                "CE", "LU")))))
        .isInstanceOf(DuplicateKeyException.class)
        .isNotInstanceOf(DuplicatePackageNumberException.class)
        .hasMessage("end-use duplicate");

    assertThat(repository.packageExistsChecks).isZero();
  }

  @Test
  void requiredScaleCodeLookupsShouldPropagateOracleFailure() {
    FailingRequiredLookupRepository repository = new FailingRequiredLookupRepository();

    assertOracleFailure(() -> repository.findSpeciesCodeRequired("HE"));
    assertOracleFailure(() -> repository.findGradeCodeRequired("A"));
    assertOracleFailure(() -> repository.findPermitsByOicApplicationNumberRequired(1000456L));
  }

  @Test
  void requiredPackageOptionLookupsShouldPropagateOracleFailure() {
    FailingRequiredLookupRepository repository = new FailingRequiredLookupRepository();

    assertOracleFailure(repository::findAllSpeciesCodesRequired);
    assertOracleFailure(repository::findAllPackageStatusCodesRequired);
    assertOracleFailure(() -> repository.findEndUseCodeRequired("LU"));
    assertOracleFailure(() -> repository.findSpeciesEndUsesByRegionSpeciesRequired("11", "HE"));
    assertOracleFailure(() -> repository.findSpeciesEndUsesByRegionRequired("11"));
    assertOracleFailure(() -> repository.findCandidateEndUseCodesRequired(1, "HE", 11L));
    assertOracleFailure(() -> repository.findCandidateExcolCombinationsRequired(1, "HE", 11L));
    assertOracleFailure(() -> repository.isPackageStatusCodeValidRequired("A"));
  }

  @Test
  void requiredPackageOptionLookupsShouldPreserveLegitimateEmptyResults() {
    EmptyRequiredLookupRepository repository = new EmptyRequiredLookupRepository();

    assertThat(repository.findAllSpeciesCodesRequired()).isEmpty();
    assertThat(repository.findAllPackageStatusCodesRequired()).isEmpty();
    assertThat(repository.findEndUseCodeRequired("LU")).isEmpty();
    assertThat(repository.findSpeciesEndUsesByRegionSpeciesRequired("11", "HE")).isEmpty();
    assertThat(repository.findSpeciesEndUsesByRegionRequired("11")).isEmpty();
    assertThat(repository.findCandidateEndUseCodesRequired(1, "HE", 11L)).isEmpty();
    assertThat(repository.findCandidateExcolCombinationsRequired(1, "HE", 11L)).isEmpty();
    assertThat(repository.isPackageStatusCodeValidRequired("A")).isFalse();
  }

  @Test
  void attachmentOwnershipReadsShouldPropagateOracleFailure() {
    FailingDocumentLookupRepository repository = new FailingDocumentLookupRepository();

    assertOracleFailure(
        () -> repository.findApplicationDocumentDetailsByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findPermitNumbersByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findPermitDocumentDetailsByPermitNumber(7000123L));
    assertOracleFailure(() -> repository.findAttachmentTypeDescription("UPLOAD"));
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() {
    EmptyDocumentLookupRepository repository = new EmptyDocumentLookupRepository();

    assertThat(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findPermitNumbersByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findPermitDocumentDetailsByPermitNumber(7000123L)).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("UPLOAD")).isEmpty();
  }

  @Test
  void applicationReadModelsShouldPropagateOracleFailure() {
    FailingDocumentLookupRepository repository = new FailingDocumentLookupRepository();

    assertOracleFailure(() -> repository.findScaleDetailsByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findPermitsByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findRemarkByNumber(44L));
    assertOracleFailure(() -> repository.findApplicationClientSnapshot(1000456L));
    assertOracleFailure(() -> repository.findTimberMark("TM-1"));
    assertOracleFailure(() -> repository.findTimberMarkByOrgUnit("TM-1", 11L));
  }

  @Test
  void applicationReadModelsShouldPreserveLegitimateEmptyResults() {
    EmptyDocumentLookupRepository repository = new EmptyDocumentLookupRepository();

    assertThat(repository.findScaleDetailsByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findPermitsByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findRemarkByNumber(44L)).isEmpty();
    assertThat(repository.findApplicationClientSnapshot(1000456L)).isEmpty();
    assertThat(repository.findTimberMark("TM-1")).isEmpty();
    assertThat(repository.findTimberMarkByOrgUnit("TM-1", 11L)).isEmpty();
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void attachmentStreamShouldTreatMissingCursorAsOracleFailure() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement statement = mock(CallableStatement.class);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_FILE_ATTACHMENT(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(statement));
    when(statement.getObject(2)).thenReturn(null);
    ApplicationDetailsRpcRepository repository =
        new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThatThrownBy(
            () -> repository.streamFileAttachment(44L, new ByteArrayOutputStream()))
        .isInstanceOf(java.io.IOException.class)
        .hasCauseInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void permitLookupsShouldReadOraclePermitDetailNumber() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement ordinaryStatement = mock(CallableStatement.class);
    CallableStatement oicStatement = mock(CallableStatement.class);
    ResultSet ordinaryReadCursor = permitCursor(76925L);
    ResultSet ordinaryRequiredCursor = permitCursor(76925L);
    ResultSet oicSingleCursor = permitCursor(76925L);
    ResultSet oicListCursor = permitCursor(76925L);

    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PERMIT_DET_BY_APP(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(ordinaryStatement));
    when(ordinaryStatement.getObject(2)).thenReturn(ordinaryReadCursor, ordinaryRequiredCursor);
    when(
            jdbcTemplate.execute(
                eq("{ call LEXIS_GROUP_5.FIND_PERMIT_DET_BY_OIC_APP(?,?) }"),
                any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(oicStatement));
    when(oicStatement.getObject(2)).thenReturn(oicSingleCursor, oicListCursor);

    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findPermitsByApplicationNumber(46116L))
        .containsExactly(new ApplicationDetailsRpcRepository.ApplicationPermitRow(76925L, "Active"));
    assertThat(repository.findPermitsByApplicationNumberRequired(46116L))
        .containsExactly(new ApplicationDetailsRpcRepository.ApplicationPermitRow(76925L, "Active"));
    assertThat(repository.findPermitByOicApplicationNumberRequired(46116L))
        .contains(new ApplicationDetailsRpcRepository.ApplicationPermitRow(76925L, "Active"));
    assertThat(repository.findPermitsByOicApplicationNumberRequired(46116L))
        .containsExactly(new ApplicationDetailsRpcRepository.ApplicationPermitRow(76925L, "Active"));

    verify(ordinaryReadCursor, never()).getLong("EXPORT_PERMIT_NUMBER");
    verify(ordinaryRequiredCursor, never()).getLong("EXPORT_PERMIT_NUMBER");
    verify(oicSingleCursor, never()).getLong("EXPORT_PERMIT_NUMBER");
    verify(oicListCursor, never()).getLong("EXPORT_PERMIT_NUMBER");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationUpdateShouldRoundTripOracleProductLocationSentinel() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement readStatement = mock(CallableStatement.class);
    CallableStatement updateStatement = mock(CallableStatement.class);
    ResultSet cursor = mock(ResultSet.class);
    when(
            jdbcTemplate.execute(
                org.mockito.ArgumentMatchers.anyString(), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation -> {
              String call = invocation.getArgument(0);
              CallableStatement statement =
                  call.contains("FIND_APPLICATION_BY_NUMBER") ? readStatement : updateStatement;
              return ((CallableStatementCallback) invocation.getArgument(1))
                  .doInCallableStatement(statement);
            });
    when(readStatement.getObject(2)).thenReturn(cursor);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
    when(cursor.getString("PRODUCT_LOCATION")).thenReturn(" ");

    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record =
        repository.findApplicationUpdateRecord(1000456L).orElseThrow();

    assertThat(record.productLocation()).isEqualTo(" ");
    assertThat(repository.updateApplication(record)).isTrue();
    verify(updateStatement).setString(8, " ");
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void applicationInsertShouldPreserveOracleProductLocationSentinel() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    CallableStatement insertStatement = mock(CallableStatement.class);
    ResultSet cursor = mock(ResultSet.class);
    when(
            jdbcTemplate.execute(
                org.mockito.ArgumentMatchers.anyString(), any(CallableStatementCallback.class)))
        .thenAnswer(
            invocation ->
                ((CallableStatementCallback) invocation.getArgument(1))
                    .doInCallableStatement(insertStatement));
    when(insertStatement.getObject(28)).thenReturn(cursor);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
    when(cursor.wasNull()).thenReturn(false);

    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(
            repository.insertApplication(
                new ApplicationDetailsRpcRepository.ApplicationInsertRecord(
                    LocalDate.of(2026, 9, 4),
                    null,
                    180L,
                    LocalDate.of(2026, 9, 4),
                    1.0d,
                    0.0d,
                    " ",
                    "idir\\jsmith",
                    null,
                    null,
                    null,
                    "00001074",
                    "00",
                    null,
                    "U",
                    "NEW",
                    "O",
                    1909L,
                    "S",
                    "P",
                    "S",
                    null,
                    "KARIM",
                    "N")))
        .contains(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L));
    verify(insertStatement).setString(7, " ");
    verify(insertStatement, never()).setNull(7, java.sql.Types.VARCHAR);
  }

  private static ResultSet permitCursor(long permitNumber) throws SQLException {
    ResultSet cursor = mock(ResultSet.class);
    when(cursor.next()).thenReturn(true, false);
    when(cursor.getLong("EXPORT_PERMIT_DETAIL_NUMBER")).thenReturn(permitNumber);
    when(cursor.wasNull()).thenReturn(false);
    when(cursor.getString("STATUS_DESCRIPTION")).thenReturn("Active");
    return cursor;
  }

  private static ApplicationDetailsRpcRepository.PackageMutationRecord packageMutationRecord(
      List<ApplicationDetailsRpcRepository.EndUseMutationRecord> endUses) {
    return new ApplicationDetailsRpcRepository.PackageMutationRecord(
        "PKG-1",
        1000456L,
        "N",
        100.0d,
        4.0d,
        3.0d,
        "comments",
        10.0d,
        null,
        null,
        "NEW",
        "G",
        "LOG",
        "idir\\creator",
        Instant.now(),
        "idir\\jsmith",
        endUses);
  }

  private static void assertOracleFailure(Runnable mutation) {
    assertThatThrownBy(mutation::run)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private static final class FailingApplicationDetailsRpcRepository
      extends ApplicationDetailsRpcRepository {
    FailingApplicationDetailsRpcRepository() {
      super(null);
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }
  }

  private static final class FailOnSecondExecutionRepository
      extends ApplicationDetailsRpcRepository {
    private int executionCount;

    FailOnSecondExecutionRepository() {
      super(null);
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      executionCount++;
      if (executionCount == 2) {
        throw new DataAccessResourceFailureException("Oracle unavailable");
      }
    }
  }

  private static final class FailingRequiredLookupRepository
      extends ApplicationDetailsRpcRepository {
    FailingRequiredLookupRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }
  }

  private static final class EmptyRequiredLookupRepository
      extends ApplicationDetailsRpcRepository {
    EmptyRequiredLookupRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
    }
  }

  private static final class FailingDocumentLookupRepository
      extends ApplicationDetailsRpcRepository {
    FailingDocumentLookupRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataAccessResourceFailureException("Oracle unavailable");
    }
  }

  private static final class EmptyDocumentLookupRepository
      extends ApplicationDetailsRpcRepository {
    EmptyDocumentLookupRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return List.of();
    }
  }

  private static final class DuplicatePackageHeaderRepository
      extends ApplicationDetailsRpcRepository {
    private final boolean exactPackageExists;
    private int packageExistsChecks;
    private String checkedPackageNumber;

    DuplicatePackageHeaderRepository(boolean exactPackageExists) {
      super(null);
      this.exactPackageExists = exactPackageExists;
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DuplicateKeyException("package header duplicate");
    }

    @Override
    public boolean packageExists(String packageNumber) {
      packageExistsChecks++;
      checkedPackageNumber = packageNumber;
      return exactPackageExists;
    }
  }

  private static final class OtherPackageHeaderIntegrityFailureRepository
      extends ApplicationDetailsRpcRepository {
    private int packageExistsChecks;

    OtherPackageHeaderIntegrityFailureRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      throw new DataIntegrityViolationException("foreign key failure");
    }

    @Override
    public boolean packageExists(String packageNumber) {
      packageExistsChecks++;
      return true;
    }
  }

  private static final class DuplicatePackageEndUseRepository
      extends ApplicationDetailsRpcRepository {
    private int packageExistsChecks;

    DuplicatePackageEndUseRepository() {
      super(null);
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return (List<T>)
          List.of(
              new ApplicationDetailsRpcRepository.PackageMutationRow(
                  "PKG-1",
                  1000456L,
                  "N",
                  100.0d,
                  4.0d,
                  3.0d,
                  "comments",
                  10.0d,
                  null,
                  null,
                  "NEW",
                  "G",
                  "LOG",
                  "idir\\creator",
                  Instant.now()));
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      throw new DuplicateKeyException("end-use duplicate");
    }

    @Override
    public boolean packageExists(String packageNumber) {
      packageExistsChecks++;
      return true;
    }
  }
}

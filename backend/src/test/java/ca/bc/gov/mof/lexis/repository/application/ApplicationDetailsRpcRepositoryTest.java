package ca.bc.gov.mof.lexis.repository.application;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PACKAGE_STATUSES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_SPECIES;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ORG_UNIT_BY_NUMBER;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.CodeRow;
import java.io.ByteArrayOutputStream;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@DisplayName("Unit Test | ApplicationDetailsRpcRepository")
class ApplicationDetailsRpcRepositoryTest {

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  @SuppressWarnings("unchecked")
  void packageCodeListsShouldPreserveMetadataStableSortingAndFiltering(boolean species)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    String sql = species ? ACTIVE_SPECIES : ACTIVE_PACKAGE_STATUSES;
    List<ResultSet> rows =
        List.of(
            codeOptionRow("Z", "Last group", 2L, 1L),
            codeOptionRow(" B ", " First tie ", 1L, 7L),
            codeOptionRow("A", "Second tie", 1L, 7L),
            codeOptionRow(" B ", " First tie ", 1L, 7L),
            codeOptionRow(" N ", " Null metadata ", null, null),
            codeOptionRow(" ", "Missing code", 0L, 0L),
            codeOptionRow("X", null, 0L, 0L));
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeRow> mapper = invocation.getArgument(1);
              List<CodeRow> mapped = new java.util.ArrayList<>();
              for (int index = 0; index < rows.size(); index++) {
                mapped.add(mapper.mapRow(rows.get(index), index));
              }
              return mapped;
            });
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    List<CodeRow> options =
        species
            ? repository.findAllSpeciesCodesRequired()
            : repository.findAllPackageStatusCodesRequired();

    assertThat(options)
        .containsExactly(
            new CodeRow("N", "Null metadata", 0L, 0L),
            new CodeRow("B", "First tie", 1L, 7L),
            new CodeRow("A", "Second tie", 1L, 7L),
            new CodeRow("B", "First tie", 1L, 7L),
            new CodeRow("Z", "Last group", 2L, 1L));
    ArgumentCaptor<Object[]> binds = ArgumentCaptor.forClass(Object[].class);
    verify(jdbcTemplate).query(eq(sql), any(RowMapper.class), binds.capture());
    assertThat(binds.getValue()).isEmpty();
  }

  @ParameterizedTest
  @ValueSource(booleans = {true, false})
  @SuppressWarnings("unchecked")
  void packageCodeListsShouldDistinguishEmptyResultsFromOracleFailure(boolean species) {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    String sql = species ? ACTIVE_SPECIES : ACTIVE_PACKAGE_STATUSES;
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of())
        .thenThrow(failure);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);
    java.util.function.Supplier<List<CodeRow>> loader =
        species
            ? repository::findAllSpeciesCodesRequired
            : repository::findAllPackageStatusCodesRequired;

    assertThat(loader.get()).isEmpty();
    assertThatThrownBy(loader::get).isSameAs(failure);
  }

  @ParameterizedTest
  @CsvSource({
    "true,CODE", "true,DESCRIPTION", "true,GROUP_BY", "true,ORDER_BY",
    "false,CODE", "false,DESCRIPTION", "false,GROUP_BY", "false,ORDER_BY"
  })
  @SuppressWarnings("unchecked")
  void packageCodeListsShouldRejectUnreadableRequiredColumns(boolean species, String column)
      throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    SQLException failure = new SQLException("Invalid column name");
    if (column.equals("CODE") || column.equals("DESCRIPTION")) {
      when(resultSet.getString(column)).thenThrow(failure);
    } else {
      when(resultSet.getLong(column)).thenThrow(failure);
    }
    String sql = species ? ACTIVE_SPECIES : ACTIVE_PACKAGE_STATUSES;
    when(jdbcTemplate.query(eq(sql), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<CodeRow> mapper = invocation.getArgument(1);
              return List.of(mapper.mapRow(resultSet, 0));
            });
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);
    java.util.function.Supplier<List<CodeRow>> loader =
        species
            ? repository::findAllSpeciesCodesRequired
            : repository::findAllPackageStatusCodesRequired;

    assertThatThrownBy(loader::get)
        .isInstanceOf(org.springframework.dao.DataRetrievalFailureException.class)
        .hasMessageContaining(column)
        .hasCause(failure);
  }

  private static ResultSet codeOptionRow(String code, String description, Long group, Long order)
      throws SQLException {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("CODE")).thenReturn(code);
    when(resultSet.getString("DESCRIPTION")).thenReturn(description);
    when(resultSet.getLong("GROUP_BY")).thenReturn(group == null ? 0L : group);
    when(resultSet.getLong("ORDER_BY")).thenReturn(order == null ? 0L : order);
    when(resultSet.wasNull()).thenReturn(group == null, order == null);
    return resultSet;
  }

  @Test
  void orgUnitValidationShouldRejectInvalidInputsWithoutQuerying() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(null)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(0L)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(-1L)).isFalse();
    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldBindNumberAndUseOnlyTheFirstNullableRow() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1903L, 9999L, 1904L, 1903L, 0L, 1903L);
    when(resultSet.wasNull()).thenReturn(false, false, false, false, true, false);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<Long> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(1903L)).isTrue();
    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldDistinguishAbsentRowsFromQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenReturn(List.of())
        .thenThrow(failure);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.isOrgUnitValidRequired(1903L)).isFalse();
    assertThatThrownBy(() -> repository.isOrgUnitValidRequired(1903L)).isSameAs(failure);
  }

  @Test
  @SuppressWarnings("unchecked")
  void orgUnitValidationShouldRejectAnUnreadableRequiredNumber() throws Exception {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    SQLException failure = new SQLException("Invalid column name");
    when(resultSet.getLong("ORG_UNIT_NO")).thenThrow(failure);
    when(jdbcTemplate.query(eq(ORG_UNIT_BY_NUMBER), any(RowMapper.class), eq(1903L)))
        .thenAnswer(
            invocation -> {
              RowMapper<Long> mapper = invocation.getArgument(1);
              return java.util.Collections.singletonList(mapper.mapRow(resultSet, 0));
            });
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThatThrownBy(() -> repository.isOrgUnitValidRequired(1903L))
        .isInstanceOf(org.springframework.dao.DataRetrievalFailureException.class)
        .hasMessageContaining("ORG_UNIT_NO")
        .hasCause(failure);
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "A & B; volume < 10; owner > agent",
    "Use &amp; in the document; literal &lt; &gt; &amp;amp;",
    "<b>A & B</b>",
    "Plain modern note"
  })
  void newRemarksShouldPreserveEnteredTextThroughOracleStorage(String text) {
    RemarkRoundTripRepository repository = new RemarkRoundTripRepository();

    assertThat(repository.insertRemark(1000456L, text, "idir\\jsmith", Instant.EPOCH))
        .get().extracting(ApplicationDetailsRpcRepository.RemarkRow::remark).isEqualTo(text);
    assertThat(repository.storedRemark).isEqualTo(text);
    assertThat(repository.findRemarksByApplicationNumber(1000456L))
        .extracting(ApplicationDetailsRpcRepository.RemarkRow::remark).containsExactly(text);

    assertThat(repository.updateRemark(44L, 1000456L, text + " updated", "idir\\jsmith", Instant.EPOCH))
        .isTrue();
    assertThat(repository.storedRemark).isEqualTo(text + " updated");
    assertThat(repository.findRemarkByNumberRequired(44L))
        .get().extracting(ApplicationDetailsRpcRepository.RemarkRow::remark).isEqualTo(text + " updated");
  }

  @ParameterizedTest
  @ValueSource(strings = {
    "Use &amp; in the document",
    "Literal &lt; &gt; &amp;amp; &copy; &#39;",
    "A &amp; B; raw <b>text</b> & more"
  })
  void existingRemarksShouldSurviveReadsAndRepeatedEditsWithoutEntityConversion(String storedText) {
    RemarkRoundTripRepository repository = new RemarkRoundTripRepository();
    // Seed a pre-existing row; a new insert alone cannot exercise mixed historical storage.
    repository.storedRemark = storedText;

    assertThat(repository.findRemarksByApplicationNumber(1000456L))
        .extracting(ApplicationDetailsRpcRepository.RemarkRow::remark).containsExactly(storedText);
    for (int save = 0; save < 3; save++) {
      String displayedText = repository.findRemarkByNumberRequired(44L).orElseThrow().remark();
      assertThat(displayedText).isEqualTo(storedText);
      assertThat(repository.updateRemark(44L, 1000456L, displayedText, "idir\\jsmith", Instant.EPOCH))
          .isTrue();
      assertThat(repository.storedRemark).isEqualTo(storedText);
    }

    assertThat(repository.updateRemark(44L, 1000456L, storedText + " updated", "idir\\jsmith", Instant.EPOCH))
        .isTrue();
    assertThat(repository.findRemarkByNumberRequired(44L).orElseThrow().remark())
        .isEqualTo(storedText + " updated");
    assertThat(repository.storedRemark).isEqualTo(storedText + " updated");
  }

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

    assertThat(repository.findEndUseCodeRequired("LU")).isEmpty();
    assertThat(repository.findSpeciesEndUsesByRegionSpeciesRequired("11", "HE")).isEmpty();
    assertThat(repository.findSpeciesEndUsesByRegionRequired("11")).isEmpty();
    assertThat(repository.findCandidateEndUseCodesRequired(1, "HE", 11L)).isEmpty();
    assertThat(repository.findCandidateExcolCombinationsRequired(1, "HE", 11L)).isEmpty();
    assertThat(repository.isPackageStatusCodeValidRequired("A")).isFalse();
  }

  @Test
  void packageMutationLookupShouldBindOpaquePackageNumberWithoutTrimming() throws Exception {
    CapturingPackageLookupRepository repository = new CapturingPackageLookupRepository();
    String paddedPackageNumber = "PKG-EXISTING  ";

    assertThat(repository.findPackageMutationByPackageNumber(paddedPackageNumber)).isEmpty();
    verify(repository.callableStatement).setString(1, paddedPackageNumber);

    assertThat(repository.findPackageMutationByPackageNumber("PKG-EXISTING")).isEmpty();
    verify(repository.callableStatement).setString(1, "PKG-EXISTING");
  }

  @Test
  void packageMutationAndScaleBindingsShouldPreserveOpaquePackageNumber() throws Exception {
    String paddedPackageNumber = "PKG-EXISTING  ";
    CapturingPackageMutationRepository repository =
        new CapturingPackageMutationRepository(paddedPackageNumber);

    assertThat(repository.findPackageMutationByPackageNumber(paddedPackageNumber))
        .get()
        .extracting(ApplicationDetailsRpcRepository.PackageMutationRow::packageNumber)
        .isEqualTo(paddedPackageNumber);
    verify(repository.packageLookupStatement).setString(1, paddedPackageNumber);

    assertThat(
            repository.updatePackage(
                new ApplicationDetailsRpcRepository.PackageMutationRecord(
                    paddedPackageNumber,
                    1000456L,
                    "N",
                    100.0d,
                    4.0d,
                    3.0d,
                    "comments",
                    10.0d,
                    null,
                    null,
                    "A",
                    "G",
                    "LOG",
                    "idir\\jsmith",
                    Instant.EPOCH,
                    "idir\\jsmith",
                    List.of(
                        new ApplicationDetailsRpcRepository.EndUseMutationRecord("CE", "LU")))))
        .isTrue();
    verify(repository.updatePackageStatement).setString(1, paddedPackageNumber);
    verify(repository.deletePackageEndUsesStatement).setString(1, paddedPackageNumber);
    verify(repository.insertPackageEndUsesStatement).setString(1, paddedPackageNumber);
    verify(repository.insertPackageEndUsesStatement).setString(2, "CE");
    verify(repository.insertPackageEndUsesStatement).setString(3, "LU");

    assertThat(
            repository.insertScaleDetail(
                new ApplicationDetailsRpcRepository.ScaleMutationRecord(
                    null,
                    "TM-1",
                    1L,
                    1.0d,
                    paddedPackageNumber,
                    "FI",
                    "A",
                    1000456L,
                    null,
                    null,
                    "idir\\jsmith",
                    Instant.EPOCH,
                    null)))
        .get()
        .extracting(ApplicationDetailsRpcRepository.ApplicationScaleDetailRow::packageNumber)
        .isEqualTo(paddedPackageNumber);
    verify(repository.scaleInsertStatement).setString(8, paddedPackageNumber);
  }

  @Test
  void attachmentOwnershipReadsShouldPropagateOracleFailure() {
    FailingDocumentLookupRepository repository = new FailingDocumentLookupRepository();

    assertOracleFailure(
        () -> repository.findApplicationDocumentDetailsByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findPermitNumbersByApplicationNumber(1000456L));
    assertOracleFailure(() -> repository.findPermitDocumentDetailsByPermitNumber(7000123L));
  }

  @Test
  void attachmentOwnershipReadsShouldPreserveLegitimateEmptyResults() {
    EmptyDocumentLookupRepository repository = new EmptyDocumentLookupRepository();

    assertThat(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findPermitNumbersByApplicationNumber(1000456L)).isEmpty();
    assertThat(repository.findPermitDocumentDetailsByPermitNumber(7000123L)).isEmpty();
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypeDescriptionShouldUseBoundDirectQueryAndTrimDescription() throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("DESCRIPTION")).thenReturn(" Uploaded document ");
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("UPLOAD")))
        .thenAnswer(
            invocation ->
                List.of(
                    ((RowMapper<String>) invocation.getArgument(1)).mapRow(resultSet, 0)));
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(" UPLOAD "))
        .hasValue("Uploaded document");

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).query(sql.capture(), any(RowMapper.class), eq("UPLOAD"));
    assertThat(sql.getValue())
        .contains("FROM THE.EXPORT_ATTACHMENT_TYPE_CODE")
        .contains("WHERE C.EXPORT_ATTACHMENT_TYPE_CODE = ?");
  }

  @Test
  @SuppressWarnings("unchecked")
  void attachmentTypeDescriptionShouldReturnEmptyForNoDescriptionOrABlankFirstRow()
      throws SQLException {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ResultSet resultSet = mock(ResultSet.class);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("EMPTY")))
        .thenReturn(List.of());
    when(resultSet.getString("DESCRIPTION")).thenReturn(null, "later", "  ", "later");
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("NULL")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("BLANK")))
        .thenAnswer(
            invocation -> {
              RowMapper<String> mapper = invocation.getArgument(1);
              return Arrays.asList(mapper.mapRow(resultSet, 0), mapper.mapRow(resultSet, 1));
            });
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription("EMPTY")).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("NULL")).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("BLANK")).isEmpty();
  }

  @Test
  void attachmentTypeDescriptionShouldSkipLookupForBlankCode() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertThat(repository.findAttachmentTypeDescription(null)).isEmpty();
    assertThat(repository.findAttachmentTypeDescription("  ")).isEmpty();

    verifyNoInteractions(jdbcTemplate);
  }

  @Test
  void attachmentTypeDescriptionShouldPropagateQueryFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.query(any(String.class), any(RowMapper.class), eq("UPLOAD")))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    ApplicationDetailsRpcRepository repository = new ApplicationDetailsRpcRepository(jdbcTemplate);

    assertOracleFailure(() -> repository.findAttachmentTypeDescription("UPLOAD"));
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

  private static final class CapturingPackageLookupRepository
      extends ApplicationDetailsRpcRepository {
    private CallableStatement callableStatement;

    CapturingPackageLookupRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      callableStatement = mock(CallableStatement.class);
      try {
        binder.accept(callableStatement);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
      return Optional.empty();
    }
  }

  private static final class CapturingPackageMutationRepository
      extends ApplicationDetailsRpcRepository {
    private final String packageNumber;
    private CallableStatement packageLookupStatement;
    private CallableStatement updatePackageStatement;
    private CallableStatement deletePackageEndUsesStatement;
    private CallableStatement insertPackageEndUsesStatement;
    private CallableStatement scaleInsertStatement;

    CapturingPackageMutationRepository(String packageNumber) {
      super(null);
      this.packageNumber = packageNumber;
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      CallableStatement statement = mock(CallableStatement.class);
      if (procedureSignature.contains("FIND_PACKAGE_BY_NUMBER")) {
        packageLookupStatement = statement;
      } else if (procedureSignature.contains("INSERT_SCALE_DETAIL")) {
        scaleInsertStatement = statement;
      }
      try {
        binder.accept(statement);
        ResultSet resultSet = mock(ResultSet.class);
        if (procedureSignature.contains("FIND_PACKAGE_BY_NUMBER")) {
          when(resultSet.getString("PACKAGE_NUMBER")).thenReturn(packageNumber);
          when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
          when(resultSet.wasNull()).thenReturn(false);
          return Optional.of(rowMapper.map(resultSet));
        }
        if (procedureSignature.contains("INSERT_SCALE_DETAIL")) {
          when(resultSet.getString("EXPORT_SCALE_DETAIL_ID")).thenReturn("55");
          when(resultSet.getString("PACKAGE_NUMBER")).thenReturn(packageNumber);
          when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
          when(resultSet.wasNull()).thenReturn(false);
          return Optional.of(rowMapper.map(resultSet));
        }
        return Optional.empty();
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      CallableStatement statement = mock(CallableStatement.class);
      if (procedureSignature.contains("UPDATE_PACKAGE")) {
        updatePackageStatement = statement;
      } else if (procedureSignature.contains("DELETE_END_USE_PACKAGE")) {
        deletePackageEndUsesStatement = statement;
      } else if (procedureSignature.contains("INSERT_END_USE_PACKAGE")) {
        insertPackageEndUsesStatement = statement;
      }
      try {
        binder.accept(statement);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }
  }

  private static final class RemarkRoundTripRepository extends ApplicationDetailsRpcRepository {
    private String storedRemark;

    RemarkRoundTripRepository() {
      super(null);
    }

    @Override
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      try {
        CallableStatement statement = mock(CallableStatement.class);
        if (procedureSignature.contains("INSERT_EXEMPTION_APP_REMARK")) {
          doAnswer(invocation -> { storedRemark = invocation.getArgument(1); return null; })
              .when(statement).setString(eq(2), any());
        }
        binder.accept(statement);
        ResultSet rs = mock(ResultSet.class);
        when(rs.getLong("EXPORT_EXMPTN_APPL_REMARK_NMBR")).thenReturn(44L);
        when(rs.getLong("APPLICATION_NUMBER")).thenReturn(1000456L);
        when(rs.getString("REMARK")).thenReturn(storedRemark);
        when(rs.getString("ENTRY_USERID")).thenReturn("idir\\jsmith");
        return List.of(rowMapper.map(rs));
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
    }

    @Override
    protected void executeProcedureRequired(
        String procedureSignature, SqlConsumer<CallableStatement> binder) {
      try {
        assertThat(procedureSignature).contains("UPDATE_EXEMPTION_APP_REMARK");
        CallableStatement statement = mock(CallableStatement.class);
        doAnswer(invocation -> { storedRemark = invocation.getArgument(1); return null; })
            .when(statement).setString(eq(3), any());
        binder.accept(statement);
      } catch (SQLException ex) {
        throw new AssertionError(ex);
      }
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

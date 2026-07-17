package ca.bc.gov.mof.lexis.repository.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationOfferDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import org.springframework.data.domain.Page;
import java.sql.CallableStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.IncorrectResultSizeDataAccessException;

@DisplayName("Unit Test | FederalApplicationRepository")
class FederalApplicationRepositoryTest {

  @Test
  void searchShouldUseFederalViewAliasForDynamicCriteria() {
    TestFederalApplicationRepository repository = new TestFederalApplicationRepository();

    repository.search(
        new FederalApplicationSearchCriteria(
            "900123",
            "PKG-1",
            "EX-1",
            "APP",
            LocalDate.of(2026, 1, 1),
            LocalDate.of(2026, 1, 31),
            LocalDate.of(2026, 2, 1),
            LocalDate.of(2026, 2, 28),
            "00077881",
            "00055667",
            0,
            10));

    assertThat(repository.whereSql())
        .contains("v.FED_APPLICATION_NUMBER")
        .contains("v.EXPORT_JURISDICTION_CODE")
        .contains("ORDER BY v.APPLICATION_NUMBER DESC")
        .doesNotContain("EEA.");
    assertThat(repository.bindValues())
        .containsExactly(
            "900123",
            "PKG-1",
            "F",
            "EX-1",
            "APP",
            "2026-01-01",
            "2026-01-31",
            "2026-02-01",
            "2026-02-28",
            "00077881",
            "00077881",
            "00055667");
  }

  @Test
  void searchShouldLoadRequestedLegacyPageWithCountTotal() {
    List<FederalApplicationSearchResultDto> firstPage =
        java.util.stream.LongStream.rangeClosed(900101L, 900110L)
            .mapToObj(FederalApplicationRepositoryTest::federalResult)
            .toList();
    TestFederalApplicationRepository repository =
        new TestFederalApplicationRepository(
            List.<List<?>>of(firstPage, List.of(federalResult(900111L))));

    Page<FederalApplicationSearchResultDto> results =
        repository.search(
            new FederalApplicationSearchCriteria(
                null, null, null, null, null, null, null, null, null, null, 0, 10));

    assertThat(results.getContent())
        .extracting(FederalApplicationSearchResultDto::applicationNumber)
        .containsExactly(900101L, 900102L, 900103L, 900104L, 900105L, 900106L, 900107L, 900108L, 900109L, 900110L);
    assertThat(results.getTotalElements()).isEqualTo(11);
    assertThat(repository.pageCalls()).isEqualTo(1);
  }

  @Test
  void findByApplicationNumberShouldIncludePackagesAndStructuredOffersFromLegacyProcedures() {
    TestFederalApplicationRepository repository = new TestFederalApplicationRepository();

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail -> {
              assertThat(detail.packages()).containsExactly("PKG-900123", "PKG-900124");
              assertThat(detail.offers())
                  .containsExactly(
                      new FederalApplicationOfferDto(
                          "81001", "Federal Buyer", LocalDate.of(2026, 6, 4)));
            });

    assertThat(repository.cursorProcedureSignatures())
        .containsExactly(
            "LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)",
            "LEXIS_GROUP_5.FIND_PACKAGES_BY_APP(?,?)",
            "LEXIS_GROUP_5.FIND_PURCHASE_OFFERS_BY_APP(?,?)",
            "LEXIS_GROUP_3.FIND_F_PERM_DET_BY_APP(?,?)");
  }

  @Test
  void agentApplicantTypeShouldRequireAnActualAgentClient() {
    assertThat(FederalApplicationRepository.resolveAgentApplicantType(null)).isNull();
    assertThat(FederalApplicationRepository.resolveAgentApplicantType("  ")).isNull();
    assertThat(FederalApplicationRepository.resolveAgentApplicantType("00055667")).isEqualTo("A");
  }

  @Test
  void findPermitByApplicationNumberShouldMapFederalPermitDetailFields() {
    TestFederalApplicationRepository repository = new TestFederalApplicationRepository();

    assertThat(repository.findPermitByApplicationNumber(900123L))
        .isPresent()
        .get()
        .extracting(
            FederalApplicationPermitDto::permitNumber,
            FederalApplicationPermitDto::permitIssueDate,
            FederalApplicationPermitDto::destinationCountry,
            FederalApplicationPermitDto::transportType,
            FederalApplicationPermitDto::transportName,
            FederalApplicationPermitDto::shippingDate,
            FederalApplicationPermitDto::portOfExport,
            FederalApplicationPermitDto::otherPortOfExport)
        .containsExactly(
            7000123L,
            LocalDate.of(2026, 6, 1),
            "US",
            "VSL",
            "MV FEDERAL",
            LocalDate.of(2026, 6, 7),
            "VAN",
            "ALT");

    assertThat(repository.cursorProcedureSignatures())
        .containsExactly("LEXIS_GROUP_3.FIND_F_PERM_DET_BY_APP(?,?)");
  }

  @Test
  void requiredPermitLookupShouldRejectMultiplePermitsForOneApplication() {
    FederalApplicationRepository repository =
        new MultiplePermitFederalApplicationRepository();

    assertThatThrownBy(() -> repository.findPermitByApplicationNumberRequired(900123L))
        .isInstanceOf(IncorrectResultSizeDataAccessException.class)
        .hasMessageContaining("expected 1")
        .hasMessageContaining("actual 2");
  }

  @Test
  void requiredMutationContextShouldIncludeCanonicalStatusAndListingDate() {
    FederalApplicationRepository repository = new MutationContextFederalApplicationRepository();

    assertThat(repository.findMutationContextRequired(900123L))
        .contains(
            new FederalApplicationRepository.FederalMutationContextRow(
                900123L,
                LocalDate.of(2026, 6, 1),
                1909L,
                "00077881",
                "00",
                "APP",
                LocalDate.of(2026, 6, 7)));
  }

  @Test
  void detailShouldKeepAnEmptyApplicationCursorAsNotFound() {
    DetailReadFederalApplicationRepository repository =
        new DetailReadFederalApplicationRepository(null, false);

    assertThat(repository.findByApplicationNumber(900123L)).isEmpty();
  }

  @Test
  void detailShouldPreserveLegitimatelyMissingPackagesAndPermit() {
    DetailReadFederalApplicationRepository repository =
        new DetailReadFederalApplicationRepository(null, true);

    assertThat(repository.findByApplicationNumber(900123L))
        .isPresent()
        .get()
        .satisfies(
            detail -> {
              assertThat(detail.packages()).isEmpty();
              assertThat(detail.federalPermit()).isNull();
            });
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)",
        "LEXIS_GROUP_5.FIND_PACKAGES_BY_APP(?,?)",
        "LEXIS_GROUP_5.FIND_PURCHASE_OFFERS_BY_APP(?,?)",
        "LEXIS_GROUP_3.FIND_F_PERM_DET_BY_APP(?,?)"
      })
  void detailShouldPropagateAuthoritativeCursorFailures(String failingProcedure) {
    DetailReadFederalApplicationRepository repository =
        new DetailReadFederalApplicationRepository(failingProcedure, true);

    assertThatThrownBy(() -> repository.findByApplicationNumber(900123L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining(failingProcedure);
  }

  @Test
  void verifyApplicationClientsRequiredShouldReturnTrueForMatchingClients() {
    FederalApplicationRepository repository =
        new ClientVerificationFederalApplicationRepository(
            List.of(Optional.of("00077881"), Optional.of("00077881")), false);

    assertThat(repository.verifyApplicationClientsRequired(List.of(900123L, 900124L))).isTrue();
  }

  @Test
  void verifyApplicationClientsRequiredShouldPreserveMismatchAndAbsenceAsFalse() {
    FederalApplicationRepository mismatchRepository =
        new ClientVerificationFederalApplicationRepository(
            List.of(Optional.of("00077881"), Optional.of("00055667")), false);
    FederalApplicationRepository missingRepository =
        new ClientVerificationFederalApplicationRepository(
            List.of(Optional.of("00077881"), Optional.empty()), false);

    assertThat(mismatchRepository.verifyApplicationClientsRequired(List.of(900123L, 900124L)))
        .isFalse();
    assertThat(missingRepository.verifyApplicationClientsRequired(List.of(900123L, 900124L)))
        .isFalse();
  }

  @Test
  void verifyApplicationClientsRequiredShouldPropagateOracleFailure() {
    FederalApplicationRepository repository =
        new ClientVerificationFederalApplicationRepository(List.of(), true);

    assertThatThrownBy(
            () -> repository.verifyApplicationClientsRequired(List.of(900123L, 900124L)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Federal client lookup unavailable");
  }

  private static FederalApplicationSearchResultDto federalResult(long applicationNumber) {
    return new FederalApplicationSearchResultDto(
        applicationNumber,
        "FED-" + applicationNumber,
        "New",
        "Client",
        null,
        null,
        null,
        null,
        null,
        true,
        true);
  }

  private static FederalApplicationDetailDto federalDetail(long applicationNumber) {
    return new FederalApplicationDetailDto(
        applicationNumber,
        "FED-" + applicationNumber,
        "APP",
        "Approved",
        "00077881",
        "00",
        "00055667",
        "01",
        null,
        "F",
        "Federal",
        LocalDate.of(2026, 1, 2),
        LocalDate.of(2026, 1, 3),
        false,
        List.of(),
        List.of(),
        List.of(),
        null);
  }

  private static final class TestFederalApplicationRepository extends FederalApplicationRepository {
    private final List<List<?>> pages;
    private final List<String> cursorProcedureSignatures = new ArrayList<>();
    private String whereSql;
    private List<String> bindValues;
    private int pageCalls;

    TestFederalApplicationRepository() {
      this(List.of());
    }

    TestFederalApplicationRepository(List<List<?>> pages) {
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

    List<String> cursorProcedureSignatures() {
      return cursorProcedureSignatures;
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedure(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return cursorRows(procedureSignature, rowMapper);
    }

    @Override
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      return cursorRows(procedureSignature, rowMapper);
    }

    @SuppressWarnings("unchecked")
    private <T> List<T> cursorRows(
        String procedureSignature, SqlRowMapper<T> rowMapper) {
      cursorProcedureSignatures.add(procedureSignature);
      try {
        return switch (procedureSignature) {
          case "LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)" -> (List<T>) List.of(federalDetail(900123L));
          case "LEXIS_GROUP_5.FIND_PACKAGES_BY_APP(?,?)" -> (List<T>) List.of("PKG-900123", "PKG-900124");
          case "LEXIS_GROUP_5.FIND_PURCHASE_OFFERS_BY_APP(?,?)" ->
              List.of(rowMapper.map(federalOfferResultSet()));
          case "LEXIS_GROUP_3.FIND_F_PERM_DET_BY_APP(?,?)" -> List.of(rowMapper.map(federalPermitResultSet()));
          default -> List.of();
        };
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      }
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

  private static final class DetailReadFederalApplicationRepository
      extends FederalApplicationRepository {
    private final String failingProcedure;
    private final boolean applicationPresent;

    DetailReadFederalApplicationRepository(String failingProcedure, boolean applicationPresent) {
      super(null);
      this.failingProcedure = failingProcedure;
      this.applicationPresent = applicationPresent;
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedureFailClosed(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (procedureSignature.equals(failingProcedure)) {
        throw new DataAccessResourceFailureException(
            "Oracle detail dependency unavailable: " + procedureSignature);
      }
      if ("LEXIS_GROUP_5.FIND_APPLICATION_BY_NUMBER(?,?)".equals(procedureSignature)
          && applicationPresent) {
        return (List<T>) List.of(federalDetail(900123L));
      }
      return List.of();
    }
  }

  private static final class MutationContextFederalApplicationRepository
      extends FederalApplicationRepository {
    MutationContextFederalApplicationRepository() {
      super(null);
    }

    @Override
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      try {
        return Optional.ofNullable(rowMapper.map(federalMutationContextResultSet()));
      } catch (Exception ex) {
        throw new IllegalStateException(ex);
      }
    }
  }

  private static final class ClientVerificationFederalApplicationRepository
      extends FederalApplicationRepository {
    private final List<Optional<String>> results;
    private final boolean fail;
    private int resultIndex;

    ClientVerificationFederalApplicationRepository(
        List<Optional<String>> results, boolean fail) {
      super(null);
      this.results = results;
      this.fail = fail;
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> Optional<T> queryCursorSingleRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      if (fail) {
        throw new DataAccessResourceFailureException("Federal client lookup unavailable");
      }
      return (Optional<T>) (Optional<?>) results.get(resultIndex++);
    }
  }

  private static final class MultiplePermitFederalApplicationRepository
      extends FederalApplicationRepository {
    MultiplePermitFederalApplicationRepository() {
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
              new FederalApplicationPermitDto(
                  7000123L, null, null, null, null, null, null, null),
              new FederalApplicationPermitDto(
                  7000124L, null, null, null, null, null, null, null));
    }
  }

  private static ResultSet federalPermitResultSet() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_FED_PERMIT_DETAIL_ID")).thenReturn(7000123L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getTimestamp("EXPORT_PERMIT_ISSUE_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-01 00:00:00"));
    when(resultSet.getString("EXPORT_COUNTRY_CODE")).thenReturn("US");
    when(resultSet.getString("EXPORT_TRANSPORT_TYPE_CODE")).thenReturn("VSL");
    when(resultSet.getString("TRANSPORT_NAME")).thenReturn("MV FEDERAL");
    when(resultSet.getTimestamp("ESTIMATED_SHIPPING_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-07 00:00:00"));
    when(resultSet.getString("EXPORT_PORT_OF_EXPORT_CODE")).thenReturn("VAN");
    when(resultSet.getString("OTHER_PORT_OF_EXPORT")).thenReturn("ALT");
    return resultSet;
  }

  private static ResultSet federalOfferResultSet() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getLong("EXPORT_PURCHASE_OFFER_NUMBER")).thenReturn(81001L);
    when(resultSet.wasNull()).thenReturn(false);
    when(resultSet.getString("COMPANY_NAME")).thenReturn("Federal Buyer");
    when(resultSet.getTimestamp("ENTRY_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf("2026-06-04 08:30:00"));
    return resultSet;
  }

  private static ResultSet federalMutationContextResultSet() throws Exception {
    ResultSet resultSet = mock(ResultSet.class);
    when(resultSet.getString("EXPORT_JURISDICTION_CODE")).thenReturn("F");
    when(resultSet.getLong("APPLICATION_NUMBER")).thenReturn(900123L);
    when(resultSet.getTimestamp("APPLICATION_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-01 00:00:00"));
    when(resultSet.getLong("ORG_UNIT_NO")).thenReturn(1909L);
    when(resultSet.getString("OWNER_CLIENT_NUMBER")).thenReturn("00077881");
    when(resultSet.getString("OWNER_CLIENT_LOCATION_CODE")).thenReturn("00");
    when(resultSet.getString("EXPORT_APPLICATION_STATUS_CODE")).thenReturn("APP");
    when(resultSet.getTimestamp("ADVERTISING_DATE"))
        .thenReturn(Timestamp.valueOf("2026-06-07 00:00:00"));
    when(resultSet.wasNull()).thenReturn(false);
    return resultSet;
  }
}

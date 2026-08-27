package ca.bc.gov.mof.lexis.repository.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.CallableStatement;
import java.sql.Types;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class FederalSubmissionPrevalidationRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private CallableStatement statement;

  private FederalSubmissionPrevalidationRepository repository;

  @BeforeEach
  @SuppressWarnings("unchecked")
  void setUp() throws Exception {
    repository = new FederalSubmissionPrevalidationRepository(jdbcTemplate);
    doAnswer(
            invocation -> {
              CallableStatementCallback<Boolean> callback = invocation.getArgument(1);
              return callback.doInCallableStatement(statement);
            })
        .when(jdbcTemplate)
        .execute(anyString(), any(CallableStatementCallback.class));
    when(statement.getString(anyInt())).thenReturn("Y");
  }

  @Test
  @SuppressWarnings("unchecked")
  void shouldCallTheLegacyValidationProceduresWithUnchangedValues() throws Exception {
    assertThat(repository.isClientNumberValid("1234")).isTrue();
    assertThat(repository.isLocationCodeValid("1234", "01")).isTrue();
    assertThat(repository.isBoomNumberValid("Boom-1")).isTrue();
    assertThat(repository.isTimberMarkValid("tm001")).isTrue();

    verify(jdbcTemplate)
        .execute(
            eq(
                "{call THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_CLIENT_NUM(?,?)}"),
            any(CallableStatementCallback.class));
    verify(jdbcTemplate)
        .execute(
            eq(
                "{call THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_LOCN_CODE(?,?,?)}"),
            any(CallableStatementCallback.class));
    verify(jdbcTemplate)
        .execute(
            eq(
                "{call THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_BOOM_NUMBER(?,?)}"),
            any(CallableStatementCallback.class));
    verify(jdbcTemplate)
        .execute(
            eq(
                "{call THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_TIMBER_MARK(?,?)}"),
            any(CallableStatementCallback.class));
    verify(statement, times(2)).setString(1, "1234");
    verify(statement).setString(2, "01");
    verify(statement).setString(1, "Boom-1");
    verify(statement).setString(1, "tm001");
    verify(statement, times(3)).registerOutParameter(2, Types.VARCHAR);
    verify(statement).registerOutParameter(3, Types.VARCHAR);
    verify(statement, times(4)).execute();
  }

  @Test
  void shouldTreatOnlyTheLegacySuccessIndicatorAsValid() throws Exception {
    when(statement.getString(2)).thenReturn("N", (String) null, "Y", "y");

    assertThat(repository.isClientNumberValid("inactive")).isFalse();
    assertThat(repository.isBoomNumberValid("duplicate")).isFalse();
    assertThat(repository.isTimberMarkValid("valid")).isTrue();
    assertThat(repository.isTimberMarkValid("unexpected-lowercase-result")).isFalse();
  }
}

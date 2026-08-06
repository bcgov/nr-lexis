package ca.bc.gov.mof.lexis.repository.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class LexisUserPreferenceRepositoryTest {

  private static final String USER_ID = "IDIR\\JSMITH";
  private static final String PREFERENCE_NAME = "DEFAULT_REGION";

  @Mock private JdbcTemplate jdbcTemplate;

  @Test
  void findValueShouldReadThePreferenceForTheCurrentUserAndName() {
    when(jdbcTemplate.queryForList(
            anyString(), eq(String.class), eq(USER_ID), eq(PREFERENCE_NAME)))
        .thenReturn(List.of("RNI"));
    LexisUserPreferenceRepository repository =
        new LexisUserPreferenceRepository(jdbcTemplate);

    assertThat(repository.findValue(USER_ID, PREFERENCE_NAME)).contains("RNI");

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .queryForList(sql.capture(), eq(String.class), eq(USER_ID), eq(PREFERENCE_NAME));
    assertThat(sql.getValue())
        .contains("FROM THE.LEXIS_USER_PREFERENCE")
        .contains("WHERE USER_ID = ?")
        .contains("AND PREFERENCE_NAME = ?");
  }

  @Test
  void saveValueShouldUseAnAtomicMergeAndPreserveTheCreateAuditOnUpdates() {
    LexisUserPreferenceRepository repository =
        new LexisUserPreferenceRepository(jdbcTemplate);

    repository.saveValue(USER_ID, PREFERENCE_NAME, "RSI", USER_ID);

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .update(
            sql.capture(),
            eq(USER_ID),
            eq(PREFERENCE_NAME),
            eq("RSI"),
            eq(USER_ID));
    assertThat(sql.getValue())
        .contains("MERGE INTO THE.LEXIS_USER_PREFERENCE")
        .contains("WHEN MATCHED THEN")
        .contains("target.UPDATE_USER = source.ACTOR")
        .contains("target.UPDATE_TIMESTAMP = SYSDATE")
        .contains("WHEN NOT MATCHED THEN")
        .contains("UPDATE_USER,")
        .doesNotContain("UPDATE_USERID")
        .doesNotContain("target.CREATE_TIMESTAMP =");
  }

  @Test
  void deleteValueShouldOnlyRemoveTheNamedPreferenceForTheCurrentUser() {
    LexisUserPreferenceRepository repository =
        new LexisUserPreferenceRepository(jdbcTemplate);

    repository.deleteValue(USER_ID, PREFERENCE_NAME);

    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).update(sql.capture(), eq(USER_ID), eq(PREFERENCE_NAME));
    assertThat(sql.getValue())
        .contains("DELETE FROM THE.LEXIS_USER_PREFERENCE")
        .contains("WHERE USER_ID = ?")
        .contains("AND PREFERENCE_NAME = ?");
  }
}

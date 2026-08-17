package ca.bc.gov.mof.lexis.repository.session;

import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class LexisUserPreferenceRepository {

  private static final String FIND_VALUE =
      """
      SELECT PREFERENCE_VALUE
      FROM THE.LEXIS_USER_PREFERENCE
      WHERE USER_ID = ?
        AND PREFERENCE_NAME = ?
      """;

  private static final String UPSERT_VALUE =
      """
      MERGE INTO THE.LEXIS_USER_PREFERENCE target
      USING (
        SELECT ? AS USER_ID,
               ? AS PREFERENCE_NAME,
               ? AS PREFERENCE_VALUE,
               ? AS ACTOR
        FROM DUAL
      ) source
      ON (
        target.USER_ID = source.USER_ID
        AND target.PREFERENCE_NAME = source.PREFERENCE_NAME
      )
      WHEN MATCHED THEN
        UPDATE SET
          target.PREFERENCE_VALUE = source.PREFERENCE_VALUE,
          target.UPDATE_USERID = source.ACTOR,
          target.UPDATE_TIMESTAMP = SYSDATE
      WHEN NOT MATCHED THEN
        INSERT (
          USER_ID,
          PREFERENCE_NAME,
          PREFERENCE_VALUE,
          ENTRY_USERID,
          ENTRY_TIMESTAMP,
          UPDATE_USERID,
          UPDATE_TIMESTAMP
        )
        VALUES (
          source.USER_ID,
          source.PREFERENCE_NAME,
          source.PREFERENCE_VALUE,
          source.ACTOR,
          SYSDATE,
          source.ACTOR,
          SYSDATE
        )
      """;

  private static final String DELETE_VALUE =
      """
      DELETE FROM THE.LEXIS_USER_PREFERENCE
      WHERE USER_ID = ?
        AND PREFERENCE_NAME = ?
      """;

  private final JdbcTemplate jdbcTemplate;

  public LexisUserPreferenceRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public Optional<String> findValue(String userId, String preferenceName) {
    List<String> values =
        jdbcTemplate.queryForList(FIND_VALUE, String.class, userId, preferenceName);
    return values.stream().findFirst();
  }

  public void saveValue(
      String userId, String preferenceName, String preferenceValue, String actor) {
    jdbcTemplate.update(
        UPSERT_VALUE, userId, preferenceName, preferenceValue, actor);
  }

  public void deleteValue(String userId, String preferenceName) {
    jdbcTemplate.update(DELETE_VALUE, userId, preferenceName);
  }
}

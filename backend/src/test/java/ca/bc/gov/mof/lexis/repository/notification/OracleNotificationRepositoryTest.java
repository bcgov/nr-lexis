package ca.bc.gov.mof.lexis.repository.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.notification.NotificationLevel;
import java.io.Reader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OracleNotificationRepositoryTest {

  private static final String UTF8_BASE64_PREFIX = "LEXIS_UTF8_B64:";

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private PreparedStatement statement;
  @Mock private ResultSet resultSet;

  @Test
  void findVisibleShouldCloseTheRoleAudiencePredicate() {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());

    repository.findVisible(List.of("LEXIS_READ_ONLY"));

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
    assertThat(sqlCaptor.getValue())
        .contains("audience_filter.ROLE_NAME IN (\n?")
        .contains("AND n.DISPLAY_END_TIMESTAMP >= SYSDATE")
        .contains("ORDER BY n.PUBLISH_TIMESTAMP DESC,")
        .doesNotContain("CASE n.LEXIS_NOTIFICATION_LEVEL_CODE");
  }

  @Test
  void insertShouldLeaveAsciiTextReadableInTheExistingOracleColumns() throws Exception {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    String title = "Service update";
    String contentHtml = "<p>ASCII content.</p>";
    when(jdbcTemplate.queryForObject(anyString(), eq(Long.class))).thenReturn(12L);
    when(jdbcTemplate.update(anyString(), any(PreparedStatementSetter.class)))
        .thenAnswer(
            invocation -> {
              invocation.getArgument(1, PreparedStatementSetter.class).setValues(statement);
              return 1;
            });

    assertThatThrownBy(
            () ->
                repository.insert(
                    new OracleNotificationRepository.NotificationMutation(
                        title,
                        contentHtml,
                        NotificationLevel.INFORMATION,
                        LocalDateTime.of(2026, 7, 21, 12, 0),
                        LocalDateTime.of(2026, 7, 28, 23, 59, 59),
                        "IDIR\\ADMIN",
                        List.of())))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessage("Created notification could not be retrieved.");

    verify(statement).setString(2, title);
    ArgumentCaptor<Reader> contentCaptor = ArgumentCaptor.forClass(Reader.class);
    verify(statement).setCharacterStream(eq(3), contentCaptor.capture());
    StringWriter boundContent = new StringWriter();
    contentCaptor.getValue().transferTo(boundContent);
    assertThat(boundContent.toString()).isEqualTo(contentHtml);
  }

  @Test
  void updateShouldEncodeUnicodeWithinTheExistingOracleColumnTypes() throws Exception {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    String title = "界".repeat(80);
    String contentHtml = "<p>We’re testing — " + "x".repeat(100_000) + "</p>";
    when(jdbcTemplate.update(anyString(), any(PreparedStatementSetter.class)))
        .thenAnswer(
            invocation -> {
              invocation.getArgument(1, PreparedStatementSetter.class).setValues(statement);
              return 0;
            });

    repository.update(
        12L,
        new OracleNotificationRepository.NotificationMutation(
            title,
            contentHtml,
            NotificationLevel.INFORMATION,
            LocalDateTime.of(2026, 7, 21, 12, 0),
            LocalDateTime.of(2026, 7, 28, 23, 59, 59),
            "IDIR\\ADMIN",
            List.of()));

    String encodedTitle = encodeText(title);
    verify(statement).setString(1, encodedTitle);
    assertThat(encodedTitle).hasSizeLessThan(500).matches("\\A\\p{ASCII}*\\z");
    ArgumentCaptor<Reader> contentCaptor = ArgumentCaptor.forClass(Reader.class);
    verify(statement).setCharacterStream(eq(2), contentCaptor.capture());
    StringWriter boundContent = new StringWriter();
    contentCaptor.getValue().transferTo(boundContent);
    assertThat(boundContent.toString()).isEqualTo(encodeText(contentHtml));

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).update(sqlCaptor.capture(), any(PreparedStatementSetter.class));
    assertThat(sqlCaptor.getValue())
        .doesNotContain("PUBLISH_TIMESTAMP = ?")
        .contains("UPDATE_TIMESTAMP = SYSDATE");
  }

  @Test
  void findAllShouldDecodeUnicodeTextStoredInExistingOracleColumnTypes() throws Exception {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    String title = "Service update — today";
    String contentHtml = "<p>We’re testing Unicode punctuation.</p>";
    LocalDateTime publishTimestamp = LocalDateTime.of(2026, 7, 21, 0, 0);
    LocalDateTime endTimestamp = LocalDateTime.of(2026, 7, 28, 23, 59, 59);
    LocalDateTime auditTimestamp = LocalDateTime.of(2026, 7, 21, 12, 0);

    when(resultSet.getLong("LEXIS_NOTIFICATION_ID")).thenReturn(12L);
    when(resultSet.getString("TITLE")).thenReturn(encodeText(title));
    when(resultSet.getString("CONTENT_HTML")).thenReturn(encodeText(contentHtml));
    when(resultSet.getString("LEXIS_NOTIFICATION_LEVEL_CODE")).thenReturn("INFORMATION");
    when(resultSet.getTimestamp("PUBLISH_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf(publishTimestamp));
    when(resultSet.getTimestamp("DISPLAY_END_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf(endTimestamp));
    when(resultSet.getString("CREATE_USER")).thenReturn("IDIR\\ADMIN");
    when(resultSet.getTimestamp("CREATE_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf(auditTimestamp));
    when(resultSet.getString("UPDATE_USERID")).thenReturn("IDIR\\ADMIN");
    when(resultSet.getTimestamp("UPDATE_TIMESTAMP"))
        .thenReturn(Timestamp.valueOf(auditTimestamp));
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenAnswer(
            invocation -> {
              RowMapper<?> rowMapper = invocation.getArgument(1, RowMapper.class);
              return List.of(rowMapper.mapRow(resultSet, 0));
            });

    assertThat(repository.findAll())
        .singleElement()
        .satisfies(
            notification -> {
              assertThat(notification.title()).isEqualTo(title);
              assertThat(notification.contentHtml()).isEqualTo(contentHtml);
            });
    verify(resultSet).getString("TITLE");
    verify(resultSet).getString("CONTENT_HTML");
  }

  private static String encodeText(String value) {
    return UTF8_BASE64_PREFIX
        + Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
  }
}

package ca.bc.gov.mof.lexis.repository.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.notification.NotificationLevel;
import java.io.Reader;
import java.io.StringWriter;
import java.sql.PreparedStatement;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementSetter;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OracleNotificationRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;
  @Mock private PreparedStatement statement;

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
        .contains("AND n.DISPLAY_END_TIMESTAMP >= SYSTIMESTAMP")
        .contains("ORDER BY CASE n.NOTIFICATION_LEVEL");
  }

  @Test
  void updateShouldBindRichTextAsACharacterStream() throws Exception {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    String contentHtml = "<p>" + "x".repeat(100_000) + "</p>";
    when(jdbcTemplate.update(anyString(), any(PreparedStatementSetter.class)))
        .thenAnswer(
            invocation -> {
              invocation.getArgument(1, PreparedStatementSetter.class).setValues(statement);
              return 0;
            });

    repository.update(
        12L,
        new OracleNotificationRepository.NotificationMutation(
            "Service update",
            contentHtml,
            NotificationLevel.INFORMATION,
            LocalDateTime.of(2026, 7, 21, 12, 0),
            LocalDateTime.of(2026, 7, 28, 23, 59, 59, 999_000_000),
            "IDIR\\ADMIN",
            List.of()));

    ArgumentCaptor<Reader> contentCaptor = ArgumentCaptor.forClass(Reader.class);
    verify(statement).setCharacterStream(eq(2), contentCaptor.capture());
    StringWriter boundContent = new StringWriter();
    contentCaptor.getValue().transferTo(boundContent);
    assertThat(boundContent.toString()).isEqualTo(contentHtml);

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate).update(sqlCaptor.capture(), any(PreparedStatementSetter.class));
    assertThat(sqlCaptor.getValue()).doesNotContain("PUBLISH_TIMESTAMP = ?");
  }
}

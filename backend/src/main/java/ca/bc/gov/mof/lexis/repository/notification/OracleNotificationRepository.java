package ca.bc.gov.mof.lexis.repository.notification;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class OracleNotificationRepository {

  private static final String SELECT_NOTIFICATION_ROWS =
      """
      SELECT n.LEXIS_NOTIFICATION_ID,
             n.TITLE,
             n.CONTENT_HTML,
             n.PUBLISH_TIMESTAMP,
             n.ENTRY_USERID,
             n.ENTRY_TIMESTAMP,
             n.UPDATE_USERID,
             n.UPDATE_TIMESTAMP,
             a.ROLE_NAME
        FROM THE.LEXIS_NOTIFICATION n
        LEFT JOIN THE.LEXIS_NOTIFICATION_AUDIENCE a
          ON a.LEXIS_NOTIFICATION_ID = n.LEXIS_NOTIFICATION_ID
      """;

  private static final String ORDER_BY =
      " ORDER BY n.PUBLISH_TIMESTAMP DESC, n.LEXIS_NOTIFICATION_ID DESC, a.ROLE_NAME";

  private final JdbcTemplate jdbcTemplate;

  public OracleNotificationRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    this.jdbcTemplate = jdbcTemplate;
  }

  public List<NotificationRow> findVisible(List<String> audienceRoles) {
    if (audienceRoles == null || audienceRoles.isEmpty()) {
      return queryNotificationRows(
          SELECT_NOTIFICATION_ROWS
              + """
                WHERE n.PUBLISH_TIMESTAMP <= SYSTIMESTAMP
                  AND NOT EXISTS (
                    SELECT 1
                      FROM THE.LEXIS_NOTIFICATION_AUDIENCE audience_filter
                     WHERE audience_filter.LEXIS_NOTIFICATION_ID = n.LEXIS_NOTIFICATION_ID
                  )
              """
              + ORDER_BY);
    }

    String placeholders = String.join(", ", java.util.Collections.nCopies(audienceRoles.size(), "?"));
    String sql =
        SELECT_NOTIFICATION_ROWS
            + """
              WHERE n.PUBLISH_TIMESTAMP <= SYSTIMESTAMP
                AND (
                  NOT EXISTS (
                    SELECT 1
                      FROM THE.LEXIS_NOTIFICATION_AUDIENCE audience_filter
                     WHERE audience_filter.LEXIS_NOTIFICATION_ID = n.LEXIS_NOTIFICATION_ID
                  )
                  OR EXISTS (
                    SELECT 1
                      FROM THE.LEXIS_NOTIFICATION_AUDIENCE audience_filter
                     WHERE audience_filter.LEXIS_NOTIFICATION_ID = n.LEXIS_NOTIFICATION_ID
                       AND audience_filter.ROLE_NAME IN (
              """
            + placeholders
            + ")\n  )\n)"
            + ORDER_BY;
    return queryNotificationRows(sql, audienceRoles.toArray());
  }

  public List<NotificationRow> findAll() {
    return queryNotificationRows(SELECT_NOTIFICATION_ROWS + ORDER_BY);
  }

  public NotificationRow insert(NotificationMutation mutation) {
    Long notificationId =
        jdbcTemplate.queryForObject(
            "SELECT THE.LEXIS_NOTIFICATION_SEQ.NEXTVAL FROM DUAL", Long.class);
    if (notificationId == null) {
      throw new DataRetrievalFailureException("Oracle did not generate a notification id.");
    }

    jdbcTemplate.update(
        """
        INSERT INTO THE.LEXIS_NOTIFICATION (
          LEXIS_NOTIFICATION_ID,
          TITLE,
          CONTENT_HTML,
          PUBLISH_TIMESTAMP,
          ENTRY_USERID,
          ENTRY_TIMESTAMP,
          UPDATE_USERID,
          UPDATE_TIMESTAMP
        ) VALUES (?, ?, ?, ?, ?, SYSTIMESTAMP, ?, SYSTIMESTAMP)
        """,
        notificationId,
        mutation.title(),
        mutation.contentHtml(),
        Timestamp.valueOf(mutation.publishTimestamp()),
        mutation.auditUserId(),
        mutation.auditUserId());
    replaceAudienceRoles(notificationId, mutation.audienceRoles());
    return findById(notificationId)
        .orElseThrow(
            () -> new DataRetrievalFailureException("Created notification could not be retrieved."));
  }

  public Optional<NotificationRow> update(long notificationId, NotificationMutation mutation) {
    int updated =
        jdbcTemplate.update(
            """
            UPDATE THE.LEXIS_NOTIFICATION
               SET TITLE = ?,
                   CONTENT_HTML = ?,
                   PUBLISH_TIMESTAMP = ?,
                   UPDATE_USERID = ?,
                   UPDATE_TIMESTAMP = SYSTIMESTAMP
             WHERE LEXIS_NOTIFICATION_ID = ?
            """,
            mutation.title(),
            mutation.contentHtml(),
            Timestamp.valueOf(mutation.publishTimestamp()),
            mutation.auditUserId(),
            notificationId);
    if (updated == 0) {
      return Optional.empty();
    }

    replaceAudienceRoles(notificationId, mutation.audienceRoles());
    return findById(notificationId);
  }

  public boolean delete(long notificationId) {
    jdbcTemplate.update(
        "DELETE FROM THE.LEXIS_NOTIFICATION_AUDIENCE WHERE LEXIS_NOTIFICATION_ID = ?", notificationId);
    return jdbcTemplate.update(
            "DELETE FROM THE.LEXIS_NOTIFICATION WHERE LEXIS_NOTIFICATION_ID = ?", notificationId)
        == 1;
  }

  private Optional<NotificationRow> findById(long notificationId) {
    List<NotificationRow> rows =
        queryNotificationRows(
            SELECT_NOTIFICATION_ROWS
                + " WHERE n.LEXIS_NOTIFICATION_ID = ?"
                + ORDER_BY,
            notificationId);
    return rows.stream().findFirst();
  }

  private void replaceAudienceRoles(long notificationId, List<String> audienceRoles) {
    jdbcTemplate.update(
        "DELETE FROM THE.LEXIS_NOTIFICATION_AUDIENCE WHERE LEXIS_NOTIFICATION_ID = ?", notificationId);
    if (audienceRoles == null || audienceRoles.isEmpty()) {
      return;
    }

    List<Object[]> rows = new ArrayList<>();
    for (String role : audienceRoles) {
      rows.add(new Object[] {notificationId, role});
    }
    jdbcTemplate.batchUpdate(
        """
        INSERT INTO THE.LEXIS_NOTIFICATION_AUDIENCE (LEXIS_NOTIFICATION_ID, ROLE_NAME)
        VALUES (?, ?)
        """,
        rows);
  }

  private List<NotificationRow> queryNotificationRows(String sql, Object... parameters) {
    List<NotificationResultRow> queryRows =
        jdbcTemplate.query(
            sql,
            (rs, rowNumber) ->
                new NotificationResultRow(
                    rs.getLong("LEXIS_NOTIFICATION_ID"),
                    rs.getString("TITLE"),
                    rs.getString("CONTENT_HTML"),
                    toLocalDateTime(rs.getTimestamp("PUBLISH_TIMESTAMP")),
                    rs.getString("ENTRY_USERID"),
                    toLocalDateTime(rs.getTimestamp("ENTRY_TIMESTAMP")),
                    rs.getString("UPDATE_USERID"),
                    toLocalDateTime(rs.getTimestamp("UPDATE_TIMESTAMP")),
                    rs.getString("ROLE_NAME")),
            parameters);

    Map<Long, NotificationRowBuilder> notifications = new LinkedHashMap<>();
    for (NotificationResultRow queryRow : queryRows) {
      NotificationRowBuilder notification =
          notifications.computeIfAbsent(queryRow.id(), ignored -> new NotificationRowBuilder(queryRow));
      if (queryRow.audienceRole() != null) {
        notification.audienceRoles().add(queryRow.audienceRole());
      }
    }

    return notifications.values().stream().map(NotificationRowBuilder::toRow).toList();
  }

  private LocalDateTime toLocalDateTime(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toLocalDateTime();
  }

  public record NotificationMutation(
      String title,
      String contentHtml,
      LocalDateTime publishTimestamp,
      String auditUserId,
      List<String> audienceRoles) {}

  public record NotificationRow(
      long id,
      String title,
      String contentHtml,
      LocalDateTime publishTimestamp,
      String entryUserId,
      LocalDateTime entryTimestamp,
      String updateUserId,
      LocalDateTime updateTimestamp,
      List<String> audienceRoles) {}

  private record NotificationResultRow(
      long id,
      String title,
      String contentHtml,
      LocalDateTime publishTimestamp,
      String entryUserId,
      LocalDateTime entryTimestamp,
      String updateUserId,
      LocalDateTime updateTimestamp,
      String audienceRole) {}

  private static final class NotificationRowBuilder {
    private final NotificationResultRow row;
    private final List<String> audienceRoles = new ArrayList<>();

    private NotificationRowBuilder(NotificationResultRow row) {
      this.row = row;
    }

    private List<String> audienceRoles() {
      return audienceRoles;
    }

    private NotificationRow toRow() {
      return new NotificationRow(
          row.id(),
          row.title(),
          row.contentHtml(),
          row.publishTimestamp(),
          row.entryUserId(),
          row.entryTimestamp(),
          row.updateUserId(),
          row.updateTimestamp(),
          List.copyOf(audienceRoles));
    }
  }
}

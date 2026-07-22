package ca.bc.gov.mof.lexis.dto.notification;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record LexisNotificationDto(
    long id,
    String title,
    String contentHtml,
    NotificationLevel notificationLevel,
    LocalDate displayStartDate,
    LocalDate displayEndDate,
    String createUser,
    LocalDateTime createTimestamp,
    String updateUserId,
    LocalDateTime updateTimestamp,
    List<String> audienceRoles) {}

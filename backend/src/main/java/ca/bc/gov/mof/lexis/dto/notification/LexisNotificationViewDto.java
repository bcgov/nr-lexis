package ca.bc.gov.mof.lexis.dto.notification;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record LexisNotificationViewDto(
    long id,
    String title,
    String contentHtml,
    NotificationLevel notificationLevel,
    LocalDate displayStartDate,
    LocalDate displayEndDate,
    LocalDateTime updateTimestamp) {}

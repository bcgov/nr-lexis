package ca.bc.gov.mof.lexis.dto.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record NotificationUpsertRequestDto(
    @NotBlank @Size(max = 80) String title,
    @NotBlank @Size(max = 100000) String contentHtml,
    @NotNull NotificationLevel notificationLevel,
    @NotNull LocalDate displayStartDate,
    @NotNull LocalDate displayEndDate,
    @NotNull @Size(max = 50) List<@NotBlank @Size(max = 100) String> audienceRoles) {}

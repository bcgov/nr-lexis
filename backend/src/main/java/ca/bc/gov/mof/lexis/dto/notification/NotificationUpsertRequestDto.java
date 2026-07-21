package ca.bc.gov.mof.lexis.dto.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;
import java.util.List;

public record NotificationUpsertRequestDto(
    @NotBlank @Size(max = 500) String title,
    @NotBlank @Size(max = 100000) String contentHtml,
    @NotNull LocalDateTime publishTimestamp,
    @NotNull @Size(max = 50) List<@NotBlank @Size(max = 100) String> audienceRoles) {}

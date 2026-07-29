package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.notification.LexisNotificationDto;
import ca.bc.gov.mof.lexis.dto.notification.NotificationAudienceRolesDto;
import ca.bc.gov.mof.lexis.dto.notification.NotificationUpsertRequestDto;
import ca.bc.gov.mof.lexis.service.notification.LexisNotificationService;
import ca.bc.gov.mof.lexis.service.notification.LexisNotificationService.NotificationNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import java.security.Principal;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/lexis/admin/notifications")
@Validated
public class LexisNotificationAdminController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisNotificationAdminController.class);

  private final ObjectProvider<LexisNotificationService> notificationServiceProvider;

  public LexisNotificationAdminController(
      ObjectProvider<LexisNotificationService> notificationServiceProvider) {
    this.notificationServiceProvider = notificationServiceProvider;
  }

  @GetMapping
  public ResponseEntity<List<LexisNotificationDto>> notifications() {
    LexisNotificationService service = notificationServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Notification service unavailable - returning no content for admin notification list");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.allNotifications());
  }

  @GetMapping("/audience-roles")
  public ResponseEntity<NotificationAudienceRolesDto> audienceRoles() {
    LexisNotificationService service = notificationServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Notification service unavailable - returning no content for audience roles");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.audienceRoles());
  }

  @PostMapping
  public ResponseEntity<LexisNotificationDto> create(
      @Valid @RequestBody NotificationUpsertRequestDto request, Principal principal) {
    return withBadRequest(() -> ResponseEntity.status(HttpStatus.CREATED).body(service().create(request, principal)));
  }

  @PutMapping("/{notificationId}")
  public ResponseEntity<LexisNotificationDto> update(
      @PathVariable @Positive long notificationId,
      @Valid @RequestBody NotificationUpsertRequestDto request,
      Principal principal) {
    try {
      return withBadRequest(() -> ResponseEntity.ok(service().update(notificationId, request, principal)));
    } catch (NotificationNotFoundException exception) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage(), exception);
    }
  }

  @DeleteMapping("/{notificationId}")
  public ResponseEntity<Void> delete(@PathVariable @Positive long notificationId) {
    try {
      service().delete(notificationId);
      return ResponseEntity.noContent().build();
    } catch (NotificationNotFoundException exception) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage(), exception);
    }
  }

  private LexisNotificationService service() {
    LexisNotificationService service = notificationServiceProvider.getIfAvailable();
    if (service == null) {
      throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Notification service unavailable.");
    }
    return service;
  }

  private <T> ResponseEntity<T> withBadRequest(java.util.function.Supplier<ResponseEntity<T>> action) {
    try {
      return action.get();
    } catch (IllegalArgumentException exception) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, exception.getMessage(), exception);
    }
  }
}

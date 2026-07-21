package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.notification.LexisNotificationDto;
import ca.bc.gov.mof.lexis.service.notification.LexisNotificationService;
import java.security.Principal;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/notifications")
public class LexisNotificationController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisNotificationController.class);

  private final ObjectProvider<LexisNotificationService> notificationServiceProvider;

  public LexisNotificationController(
      ObjectProvider<LexisNotificationService> notificationServiceProvider) {
    this.notificationServiceProvider = notificationServiceProvider;
  }

  @GetMapping
  public ResponseEntity<List<LexisNotificationDto>> notifications(Principal principal) {
    LexisNotificationService service = notificationServiceProvider.getIfAvailable();
    if (service == null) {
      LOGGER.warn("Notification service unavailable - returning no content for notification list");
      return ResponseEntity.noContent().build();
    }
    return ResponseEntity.ok(service.visibleNotifications(principal));
  }
}

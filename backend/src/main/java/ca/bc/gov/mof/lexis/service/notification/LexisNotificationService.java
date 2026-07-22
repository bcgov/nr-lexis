package ca.bc.gov.mof.lexis.service.notification;

import ca.bc.gov.mof.lexis.dto.notification.LexisNotificationDto;
import ca.bc.gov.mof.lexis.dto.notification.NotificationAudienceRolesDto;
import ca.bc.gov.mof.lexis.dto.notification.NotificationUpsertRequestDto;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationMutation;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationRow;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.security.Principal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class LexisNotificationService {

  private static final int MAX_NOTIFICATION_CONTENT_LENGTH = 4_000;

  private final OracleNotificationRepository repository;
  private final NotificationHtmlSanitizer htmlSanitizer;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisPrincipalService principalService;

  public LexisNotificationService(
      OracleNotificationRepository repository,
      NotificationHtmlSanitizer htmlSanitizer,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisPrincipalService principalService) {
    this.repository = repository;
    this.htmlSanitizer = htmlSanitizer;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.principalService = principalService;
  }

  public List<LexisNotificationDto> visibleNotifications(Principal principal) {
    return repository.findVisible(sessionService.parseRolesFromPrincipal(toAuthentication(principal))).stream()
        .map(this::toDto)
        .toList();
  }

  public List<LexisNotificationDto> allNotifications() {
    return repository.findAll().stream().map(this::toDto).toList();
  }

  public NotificationAudienceRolesDto audienceRoles() {
    return new NotificationAudienceRolesDto(new ArrayList<>(knownAudienceRoles()));
  }

  @Transactional
  public LexisNotificationDto create(NotificationUpsertRequestDto request, Principal principal) {
    if (request == null) {
      throw new IllegalArgumentException("Notification details are required.");
    }
    return toDto(repository.insert(toMutation(request, request.displayStartDate(), principal)));
  }

  @Transactional
  public LexisNotificationDto update(
      long notificationId, NotificationUpsertRequestDto request, Principal principal) {
    if (notificationId < 1) {
      throw new IllegalArgumentException("A valid notification id is required.");
    }
    NotificationRow existing =
        repository
            .findById(notificationId)
            .orElseThrow(() -> new NotificationNotFoundException(notificationId));
    return repository
        .update(notificationId, toMutation(request, existing.displayStartTimestamp().toLocalDate(), principal))
        .map(this::toDto)
        .orElseThrow(() -> new NotificationNotFoundException(notificationId));
  }

  @Transactional
  public void delete(long notificationId) {
    if (notificationId < 1 || !repository.delete(notificationId)) {
      throw new NotificationNotFoundException(notificationId);
    }
  }

  private NotificationMutation toMutation(
      NotificationUpsertRequestDto request, LocalDate displayStartDate, Principal principal) {
    if (request == null) {
      throw new IllegalArgumentException("Notification details are required.");
    }

    String title =
        normalizeRequired(
            htmlSanitizer.sanitizePlainText(request.title()), "A notification title is required.");
    String contentHtml = htmlSanitizer.sanitize(request.contentHtml());
    String contentText = htmlSanitizer.sanitizePlainText(contentHtml);
    if (contentText.isBlank()) {
      throw new IllegalArgumentException("Notification content is required.");
    }
    if (contentText.length() > MAX_NOTIFICATION_CONTENT_LENGTH) {
      throw new IllegalArgumentException("Notification content cannot exceed 4,000 characters.");
    }
    if (request.notificationLevel() == null) {
      throw new IllegalArgumentException("A notification level is required.");
    }
    if (displayStartDate == null) {
      throw new IllegalArgumentException("A display start date is required.");
    }
    if (request.displayEndDate() == null) {
      throw new IllegalArgumentException("A display end date is required.");
    }
    if (request.displayEndDate().isBefore(displayStartDate)) {
      throw new IllegalArgumentException("The display end date cannot be before the display start date.");
    }

    String auditUserId =
        normalizeRequired(
            principalService.resolvePrincipalName(principal), "An audit user is required.");
    return new NotificationMutation(
        title,
        contentHtml,
        request.notificationLevel(),
        displayStartDate.atStartOfDay(),
        request.displayEndDate().atTime(LocalTime.of(23, 59, 59, 999_000_000)),
        auditUserId,
        normalizeAudienceRoles(request.audienceRoles()));
  }

  private List<String> normalizeAudienceRoles(List<String> audienceRoles) {
    if (audienceRoles == null || audienceRoles.isEmpty()) {
      return List.of();
    }

    Set<String> knownRoles = knownAudienceRoles();
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String role : audienceRoles) {
      String normalizedRole = sessionService.normalizeRole(role);
      if (normalizedRole == null || !knownRoles.contains(normalizedRole)) {
        throw new IllegalArgumentException("An unknown notification audience role was supplied.");
      }
      normalized.add(normalizedRole);
    }
    return List.copyOf(normalized);
  }

  private Set<String> knownAudienceRoles() {
    return authorizationService.getConfiguredRoles().stream()
        .map(role -> role.toUpperCase(Locale.ROOT))
        .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
  }

  private LexisNotificationDto toDto(NotificationRow row) {
    return new LexisNotificationDto(
        row.id(),
        row.title(),
        row.contentHtml(),
        row.notificationLevel(),
        row.displayStartTimestamp().toLocalDate(),
        row.displayEndTimestamp().toLocalDate(),
        row.entryUserId(),
        row.entryTimestamp(),
        row.updateUserId(),
        row.updateTimestamp(),
        row.audienceRoles().stream().sorted(Comparator.naturalOrder()).toList());
  }

  private String normalizeRequired(String value, String message) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(message);
    }
    return value.trim();
  }

  private org.springframework.security.core.Authentication toAuthentication(Principal principal) {
    return principal instanceof org.springframework.security.core.Authentication authentication
        ? authentication
        : null;
  }

  public static final class NotificationNotFoundException extends RuntimeException {
    public NotificationNotFoundException(long notificationId) {
      super("Notification " + notificationId + " was not found.");
    }
  }
}

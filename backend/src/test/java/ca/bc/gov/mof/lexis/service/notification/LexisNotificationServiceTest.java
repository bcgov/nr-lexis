package ca.bc.gov.mof.lexis.service.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.notification.NotificationUpsertRequestDto;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationMutation;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationRow;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.security.Principal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LexisNotificationServiceTest {

  @Mock private OracleNotificationRepository repository;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private LexisPrincipalService principalService;

  private final NotificationHtmlSanitizer htmlSanitizer = new NotificationHtmlSanitizer();

  @Test
  void createShouldSanitizeHtmlBeforeWritingToTheRepository() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    LocalDateTime publishTimestamp = LocalDateTime.of(2026, 7, 21, 0, 0);
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "<strong>Service</strong><script>alert(1)</script> update",
            "<p><strong>Important</strong><script>alert(1)</script>"
                + "<a href=\"javascript:alert(1)\">unsafe</a></p>",
            publishTimestamp,
            List.of());
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");
    when(repository.insert(any(NotificationMutation.class)))
        .thenReturn(notificationRow("<p><strong>Important</strong>unsafe</p>", publishTimestamp));

    service.create(request, principal);

    ArgumentCaptor<NotificationMutation> mutationCaptor =
        ArgumentCaptor.forClass(NotificationMutation.class);
    verify(repository).insert(mutationCaptor.capture());
    NotificationMutation mutation = mutationCaptor.getValue();
    assertThat(mutation.contentHtml())
        .contains("<strong>Important</strong>")
        .doesNotContain("script")
        .doesNotContain("javascript:");
    assertThat(mutation.title()).isEqualTo("Service update");
    assertThat(mutation.auditUserId()).isEqualTo("IDIR\\ADMIN");
  }

  @Test
  void createShouldRejectContentThatIsEmptyAfterSanitization() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Image-only notification",
            "<img src=\"https://example.test/image.png\">",
            LocalDateTime.of(2026, 7, 21, 0, 0),
            List.of());

    assertThatThrownBy(() -> service.create(request, principal))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Notification content is required.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  private LexisNotificationService newService() {
    return new LexisNotificationService(
        repository, htmlSanitizer, sessionService, authorizationService, principalService);
  }

  private NotificationRow notificationRow(String contentHtml, LocalDateTime publishTimestamp) {
    return new NotificationRow(
        12L,
        "Service update",
        contentHtml,
        publishTimestamp,
        "IDIR\\ADMIN",
        publishTimestamp,
        "IDIR\\ADMIN",
        publishTimestamp,
        List.of());
  }
}

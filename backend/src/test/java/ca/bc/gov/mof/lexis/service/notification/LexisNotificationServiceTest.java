package ca.bc.gov.mof.lexis.service.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.notification.LexisNotificationViewDto;
import ca.bc.gov.mof.lexis.dto.notification.NotificationLevel;
import ca.bc.gov.mof.lexis.dto.notification.NotificationUpsertRequestDto;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationMutation;
import ca.bc.gov.mof.lexis.repository.notification.OracleNotificationRepository.NotificationRow;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.security.Principal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
  void visibleNotificationsShouldReturnAViewerProjectionWithoutAdminMetadata() {
    LexisNotificationService service = newService();
    LocalDateTime displayStart = LocalDateTime.of(2026, 7, 21, 0, 0);
    LocalDateTime displayEnd = LocalDateTime.of(2026, 7, 28, 23, 59, 59);
    NotificationRow row =
        notificationRow(
            "<p>Details</p>", NotificationLevel.INFORMATION, displayStart, displayEnd);
    when(sessionService.parseRolesFromPrincipal(null)).thenReturn(List.of("LEXIS_READ_ONLY"));
    when(repository.findVisible(List.of("LEXIS_READ_ONLY"))).thenReturn(List.of(row));

    assertThat(service.visibleNotifications(() -> "idir\\viewer"))
        .containsExactly(
            new LexisNotificationViewDto(
                12L,
                "Service update",
                "<p>Details</p>",
                NotificationLevel.INFORMATION,
                displayStart.toLocalDate(),
                displayEnd.toLocalDate(),
                displayStart));
  }

  @Test
  void createShouldSanitizeHtmlBeforeWritingToTheRepository() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    LocalDate displayStartDate = LocalDate.of(2026, 7, 21);
    LocalDate displayEndDate = LocalDate.of(2026, 7, 28);
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "<strong>Service</strong><script>alert(1)</script> update",
            "<p><strong>Important</strong><script>alert(1)</script>"
                + "<a href=\"javascript:alert(1)\">unsafe</a></p>",
            NotificationLevel.WARNING,
            displayStartDate,
            displayEndDate,
            List.of());
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");
    when(repository.insert(any(NotificationMutation.class)))
        .thenReturn(
            notificationRow(
                "<p><strong>Important</strong>unsafe</p>",
                NotificationLevel.WARNING,
                displayStartDate.atStartOfDay(),
                displayEndDate.atTime(LocalTime.of(23, 59, 59))));

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
    assertThat(mutation.notificationLevel()).isEqualTo(NotificationLevel.WARNING);
    assertThat(mutation.displayStartTimestamp()).isEqualTo(displayStartDate.atStartOfDay());
    assertThat(mutation.displayEndTimestamp())
        .isEqualTo(displayEndDate.atTime(LocalTime.of(23, 59, 59)));
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
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of());

    assertThatThrownBy(() -> service.create(request, principal))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Notification content is required.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  @Test
  void audienceRolesShouldOnlyExposeSupportedFamRoles() {
    when(authorizationService.getConfiguredRoles())
        .thenReturn(
            Set.of(
                "LEXIS_ADMIN",
                "LEXIS_READ_ONLY",
                "LEXIS_APPLICATION_APPROVER",
                "LEXIS_EXEMPTION_APPROVER",
                "LEXIS_PROVINCIAL_SUBMITTER",
                "LEXIS_DELEGATED_ADMIN"));

    assertThat(newService().audienceRoles().roles())
        .containsExactly(
            "LEXIS_ADMIN",
            "LEXIS_READ_ONLY",
            "LEXIS_APPLICATION_APPROVER",
            "LEXIS_EXEMPTION_APPROVER",
            "LEXIS_PROVINCIAL_SUBMITTER");
  }

  @Test
  void createShouldRejectDelegatedAdminAsAnAudience() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Service update",
            "<p>Details</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of("LEXIS_DELEGATED_ADMIN"));
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");
    when(sessionService.normalizeRole("LEXIS_DELEGATED_ADMIN"))
        .thenReturn("LEXIS_DELEGATED_ADMIN");
    when(authorizationService.getConfiguredRoles()).thenReturn(Set.of("LEXIS_DELEGATED_ADMIN"));

    assertThatThrownBy(() -> service.create(request, principal))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("An unknown notification audience role was supplied.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  @Test
  void createShouldNormalizeScopedProvincialSubmitterAudienceToItsBaseRole() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    String scopedRole = "LEXIS_PROVINCIAL_SUBMITTER_00012345";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Service update",
            "<p>Details</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of(scopedRole));
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");
    when(sessionService.normalizeRole(scopedRole)).thenReturn("LEXIS_PROVINCIAL_SUBMITTER");
    when(authorizationService.getConfiguredRoles()).thenReturn(Set.of("LEXIS_PROVINCIAL_SUBMITTER"));
    when(repository.insert(any(NotificationMutation.class)))
        .thenReturn(
            notificationRow(
                "<p>Details</p>",
                NotificationLevel.INFORMATION,
                LocalDate.of(2026, 7, 21).atStartOfDay(),
                LocalDate.of(2026, 7, 28).atTime(LocalTime.of(23, 59, 59))));

    service.create(request, principal);

    ArgumentCaptor<NotificationMutation> mutationCaptor =
        ArgumentCaptor.forClass(NotificationMutation.class);
    verify(repository).insert(mutationCaptor.capture());
    assertThat(mutationCaptor.getValue().audienceRoles())
        .containsExactly("LEXIS_PROVINCIAL_SUBMITTER");
  }

  @Test
  void createShouldRejectAnEndDateBeforeTheStartDate() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Service update",
            "<p>Details</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 28),
            LocalDate.of(2026, 7, 21),
            List.of());

    assertThatThrownBy(() -> service.create(request, principal))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("The display end date cannot be before the display start date.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  @Test
  void createShouldRejectContentLongerThanFourThousandCharacters() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Long notification",
            "<p>" + "x".repeat(4_001) + "</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of());

    assertThatThrownBy(() -> service.create(request, principal))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Notification content cannot exceed 4,000 characters.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  @Test
  void createShouldRejectATitleLongerThanEightyCharacters() {
    LexisNotificationService service = newService();
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "x".repeat(81),
            "<p>Details</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of());

    assertThatThrownBy(() -> service.create(request, () -> "idir\\admin"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Notification title cannot exceed 80 characters.");

    verify(repository, never()).insert(any(NotificationMutation.class));
  }

  @Test
  void createShouldPreserveUnicodeNotificationText() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Service update — today",
            "<p>We’re testing Unicode punctuation.</p>",
            NotificationLevel.INFORMATION,
            LocalDate.of(2026, 7, 21),
            LocalDate.of(2026, 7, 28),
            List.of());
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");
    when(repository.insert(any(NotificationMutation.class)))
        .thenReturn(
            notificationRow(
                request.contentHtml(),
                NotificationLevel.INFORMATION,
                request.displayStartDate().atStartOfDay(),
                request.displayEndDate().atTime(LocalTime.of(23, 59, 59))));

    service.create(request, principal);

    ArgumentCaptor<NotificationMutation> mutationCaptor =
        ArgumentCaptor.forClass(NotificationMutation.class);
    verify(repository).insert(mutationCaptor.capture());
    assertThat(mutationCaptor.getValue().title()).isEqualTo(request.title());
    assertThat(mutationCaptor.getValue().contentHtml()).isEqualTo(request.contentHtml());
  }

  @Test
  void updateShouldRetainTheOriginalDisplayStartDate() {
    LexisNotificationService service = newService();
    Principal principal = () -> "idir\\admin";
    LocalDateTime originalStart = LocalDateTime.of(2026, 7, 21, 0, 0);
    NotificationRow existing =
        notificationRow(
            "<p>Details</p>",
            NotificationLevel.INFORMATION,
            originalStart,
            LocalDateTime.of(2026, 7, 28, 23, 59, 59));
    NotificationUpsertRequestDto request =
        new NotificationUpsertRequestDto(
            "Updated service update",
            "<p>Updated details</p>",
            NotificationLevel.CRITICAL,
            LocalDate.of(2027, 1, 1),
            LocalDate.of(2026, 7, 30),
            List.of());
    when(repository.findById(12L)).thenReturn(Optional.of(existing));
    when(repository.update(eq(12L), any(NotificationMutation.class))).thenReturn(Optional.of(existing));
    when(principalService.resolvePrincipalName(principal)).thenReturn("IDIR\\ADMIN");

    service.update(12L, request, principal);

    ArgumentCaptor<NotificationMutation> mutationCaptor =
        ArgumentCaptor.forClass(NotificationMutation.class);
    verify(repository).update(eq(12L), mutationCaptor.capture());
    assertThat(mutationCaptor.getValue().displayStartTimestamp()).isEqualTo(originalStart);
    assertThat(mutationCaptor.getValue().displayEndTimestamp())
        .isEqualTo(LocalDateTime.of(2026, 7, 30, 23, 59, 59));
  }

  private LexisNotificationService newService() {
    return new LexisNotificationService(
        repository, htmlSanitizer, sessionService, authorizationService, principalService);
  }

  private NotificationRow notificationRow(
      String contentHtml,
      NotificationLevel notificationLevel,
      LocalDateTime displayStartTimestamp,
      LocalDateTime displayEndTimestamp) {
    return new NotificationRow(
        12L,
        "Service update",
        contentHtml,
        notificationLevel,
        displayStartTimestamp,
        displayEndTimestamp,
        "IDIR\\ADMIN",
        displayStartTimestamp,
        "IDIR\\ADMIN",
        displayStartTimestamp,
        List.of());
  }
}

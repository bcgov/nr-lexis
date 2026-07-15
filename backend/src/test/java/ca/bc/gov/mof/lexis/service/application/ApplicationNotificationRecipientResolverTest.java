package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationNotificationContactRepository.NotificationContactRow;
import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;

@ExtendWith(MockitoExtension.class)
class ApplicationNotificationRecipientResolverTest {

  @Mock private ApplicationNotificationContactRepository notificationContactRepository;
  @Mock private AuthoritativeClientEmailResolver clientEmailResolver;

  @Test
  void disabledCaptureShouldUseLegacyOwnerEmailWithoutQueryingCaptureTable() {
    ApplicationNotificationRecipientResolver resolver = resolver(false);
    when(clientEmailResolver.resolve("00011111", "02"))
        .thenReturn(Optional.of("legacy@example.com"));

    Optional<String> result =
        resolver.resolve(1000456L, "O", "00011111", "02", null, null);

    assertThat(result).contains("legacy@example.com");
    verifyNoInteractions(notificationContactRepository);
  }

  @Test
  void enabledCaptureShouldPreferMatchingCapturedOwnerEmail() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.of(contact(1000456L, "captured@example.com", "00011111", "02")));

    Optional<String> result =
        resolver.resolve(1000456L, "O", "11111", "02", null, null);

    assertThat(result).contains("captured@example.com");
    verifyNoInteractions(clientEmailResolver);
  }

  @Test
  void absentCaptureShouldFallBackToLegacyOwnerEmail() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.empty());
    when(clientEmailResolver.resolve("11111", "02"))
        .thenReturn(Optional.of("legacy@example.com"));

    Optional<String> result =
        resolver.resolve(1000456L, "O", "11111", "02", null, null);

    assertThat(result).contains("legacy@example.com");
  }

  @Test
  void malformedCapturedAddressShouldFailClosedWithoutLegacyFallback() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.of(contact(1000456L, "not-an-email", "00011111", "02")));

    assertThatThrownBy(
            () -> resolver.resolve(1000456L, "O", "11111", "02", null, null))
        .isInstanceOf(DataRetrievalFailureException.class);
    verifyNoInteractions(clientEmailResolver);
  }

  @Test
  void mismatchedCapturedOwnerShouldFailClosedWithoutLegacyFallback() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.of(contact(1000456L, "captured@example.com", "00099999", "02")));

    assertThatThrownBy(
            () -> resolver.resolve(1000456L, "O", "11111", "02", null, null))
        .isInstanceOf(DataRetrievalFailureException.class);
    verifyNoInteractions(clientEmailResolver);
  }

  @Test
  void unexpectedCapturedIdentityMetadataShouldFailClosedWithoutLegacyFallback() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    NotificationContactRow inconsistent =
        new NotificationContactRow(
            1000456L,
            "captured@example.com",
            "LEGACY_CLIENT_LOCATION",
            Boolean.TRUE,
            "BCEIDBUSINESS",
            "identity-1",
            "00011111",
            "02",
            "bceid\\submitter",
            Instant.parse("2026-07-14T18:00:00Z"));
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.of(inconsistent));

    assertThatThrownBy(
            () -> resolver.resolve(1000456L, "O", "11111", "02", null, null))
        .isInstanceOf(DataRetrievalFailureException.class);
    verifyNoInteractions(clientEmailResolver);
  }

  @Test
  void agentRecipientShouldAlwaysUseLegacyAgentContact() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(clientEmailResolver.resolve("00022222", "03"))
        .thenReturn(Optional.of("agent@example.com"));

    Optional<String> result =
        resolver.resolve(1000456L, "A", "00011111", "02", "00022222", "03");

    assertThat(result).contains("agent@example.com");
    verifyNoInteractions(notificationContactRepository);
  }

  @Test
  void linkedApplicationsShouldUseLowestApplicationNumberAsPrimary() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenReturn(Optional.of(contact(1000456L, "primary@example.com", "00011111", "02")));

    Optional<String> result =
        resolver.resolveForLinkedOwnerApplications(
            List.of(1000457L, 1000456L, 1000458L), "11111", "02");

    assertThat(result).contains("primary@example.com");
    verify(notificationContactRepository, never())
        .findForCurrentOwner(1000458L, "00011111", "02");
    verify(notificationContactRepository, never())
        .findForCurrentOwner(1000457L, "00011111", "02");
    verifyNoInteractions(clientEmailResolver);
  }

  @Test
  void captureLookupFailureShouldPropagateWithoutLegacyFallback() {
    ApplicationNotificationRecipientResolver resolver = resolver(true);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(notificationContactRepository.findForCurrentOwner(1000456L, "00011111", "02"))
        .thenThrow(failure);

    assertThatThrownBy(
            () -> resolver.resolve(1000456L, "O", "11111", "02", null, null))
        .isSameAs(failure);
    verifyNoInteractions(clientEmailResolver);
  }

  private ApplicationNotificationRecipientResolver resolver(boolean captureEnabled) {
    return new ApplicationNotificationRecipientResolver(
        notificationContactRepository, clientEmailResolver, captureEnabled);
  }

  private NotificationContactRow contact(
      Long applicationNumber, String email, String clientNumber, String locationCode) {
    return new NotificationContactRow(
        applicationNumber,
        email,
        "AUTHENTICATED_USER",
        Boolean.FALSE,
        "BCEIDBUSINESS",
        "identity-1",
        clientNumber,
        locationCode,
        "bceid\\submitter",
        Instant.parse("2026-07-14T18:00:00Z"));
  }
}

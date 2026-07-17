package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.client.AuthoritativeClientEmailResolver;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ApplicationNotificationRecipientResolverTest {

  @Mock private AuthoritativeClientEmailResolver clientEmailResolver;

  @Test
  void ownerRecipientShouldUseOwnerClientLocationEmail() {
    ApplicationNotificationRecipientResolver resolver = resolver();
    when(clientEmailResolver.resolve("00011111", "02"))
        .thenReturn(Optional.of("owner@example.com"));

    Optional<String> result =
        resolver.resolve(1000456L, "O", "00011111", "02", "00022222", "03");

    assertThat(result).contains("owner@example.com");
    verify(clientEmailResolver).resolve("00011111", "02");
    verifyNoMoreInteractions(clientEmailResolver);
  }

  @Test
  void agentRecipientShouldUseAgentClientLocationEmail() {
    ApplicationNotificationRecipientResolver resolver = resolver();
    when(clientEmailResolver.resolve("00022222", "03"))
        .thenReturn(Optional.of("agent@example.com"));

    Optional<String> result =
        resolver.resolve(1000456L, "A", "00011111", "02", "00022222", "03");

    assertThat(result).contains("agent@example.com");
    verify(clientEmailResolver).resolve("00022222", "03");
    verifyNoMoreInteractions(clientEmailResolver);
  }

  @Test
  void linkedOwnerApplicationsShouldUseOwnerClientLocationEmail() {
    ApplicationNotificationRecipientResolver resolver = resolver();
    when(clientEmailResolver.resolve("00011111", "02"))
        .thenReturn(Optional.of("owner@example.com"));

    Optional<String> result = resolver.resolveClientLocation("00011111", "02");

    assertThat(result).contains("owner@example.com");
    verify(clientEmailResolver).resolve("00011111", "02");
  }

  @Test
  void unknownApplicantTypeShouldNotResolveARecipient() {
    ApplicationNotificationRecipientResolver resolver = resolver();

    Optional<String> result =
        resolver.resolve(1000456L, "X", "00011111", "02", "00022222", "03");

    assertThat(result).isEmpty();
    verifyNoMoreInteractions(clientEmailResolver);
  }

  private ApplicationNotificationRecipientResolver resolver() {
    return new ApplicationNotificationRecipientResolver(clientEmailResolver);
  }
}

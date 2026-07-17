package ca.bc.gov.mof.lexis.service.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.client.ClientLookupService.ClientData;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mockito;
import org.springframework.dao.DataAccessResourceFailureException;

class AuthoritativeClientEmailResolverTest {

  private final ClientLookupService clientLookupService = Mockito.mock(ClientLookupService.class);
  private final AuthoritativeClientEmailResolver resolver =
      new AuthoritativeClientEmailResolver(clientLookupService);

  @Test
  void shouldResolveTheRequiredClientLookupEmail() {
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(Optional.of(client("client@example.test")));

    assertThat(resolver.resolve(" 00077881 ", " 00 "))
        .contains("client@example.test");
  }

  @Test
  void shouldRequireACompleteClientReference() {
    assertThat(resolver.resolve("00077881", " ")).isEmpty();
    assertThat(resolver.resolve(null, "00")).isEmpty();

    verifyNoInteractions(clientLookupService);
  }

  @Test
  void shouldReturnEmptyWhenTheRequiredLookupHasNoClientRow() {
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(Optional.empty());

    assertThat(resolver.resolve("00077881", "00")).isEmpty();
  }

  @ParameterizedTest
  @MethodSource("invalidEmails")
  void shouldRejectMissingOrUnsafeEmailValues(String email) {
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(Optional.of(client(email)));

    assertThat(resolver.resolve("00077881", "00")).isEmpty();
  }

  @Test
  void shouldPropagateRequiredLookupFailures() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenThrow(failure);

    assertThatThrownBy(() -> resolver.resolve("00077881", "00")).isSameAs(failure);
  }

  private static Stream<String> invalidEmails() {
    return Stream.of(
        " ",
        "Not on file",
        "not-an-email",
        "client@example.test,attacker@example.test",
        "Client Name <client@example.test>",
        "client@example.test\r\nBcc: attacker@example.test",
        "client@" + "a".repeat(250) + ".test");
  }

  private static ClientData client(String email) {
    return new ClientData(
        "00077881", "Client", null, null, null, null, null, null, null, email);
  }
}

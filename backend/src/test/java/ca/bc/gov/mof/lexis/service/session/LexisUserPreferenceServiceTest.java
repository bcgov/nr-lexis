package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.session.LexisUserPreferenceRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class LexisUserPreferenceServiceTest {

  private static final String USER_ID = "IDIR\\JSMITH";

  @Mock private LexisUserPreferenceRepository repository;

  @InjectMocks private LexisUserPreferenceService service;

  @Test
  void findPreferencesShouldReturnTheCurrentUsersDefaultRegion() {
    when(repository.findValue(USER_ID, "DEFAULT_REGION")).thenReturn(Optional.of("RCO"));

    assertThat(service.findPreferences(USER_ID).defaultRegion()).isEqualTo("RCO");
  }

  @Test
  void updatePreferencesShouldUpsertTheDefaultRegionWithTheCurrentUserAsActor() {
    assertThat(service.updatePreferences(" idir\\jsmith ", "RNI").defaultRegion()).isEqualTo("RNI");

    verify(repository).saveValue(USER_ID, "DEFAULT_REGION", "RNI", USER_ID);
  }

  @Test
  void clearingTheDefaultRegionShouldDeleteOnlyThatPreference() {
    assertThat(service.updatePreferences(USER_ID, null).defaultRegion()).isNull();

    verify(repository).deleteValue(USER_ID, "DEFAULT_REGION");
  }

  @Test
  void preferencesShouldRequireAStableAuthenticatedIdentity() {
    assertThatThrownBy(() -> service.findPreferences(" "))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Authenticated user identity is unavailable.");
  }
}

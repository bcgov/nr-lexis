package ca.bc.gov.mof.lexis.service.session;

import ca.bc.gov.mof.lexis.dto.session.LexisUserPreferencesDto;
import ca.bc.gov.mof.lexis.repository.session.LexisUserPreferenceRepository;
import java.util.Locale;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class LexisUserPreferenceService {

  static final String DEFAULT_REGION_PREFERENCE = "DEFAULT_REGION";

  private final LexisUserPreferenceRepository repository;

  public LexisUserPreferenceService(LexisUserPreferenceRepository repository) {
    this.repository = repository;
  }

  public LexisUserPreferencesDto findPreferences(String userId) {
    String resolvedUserId = requireUserId(userId);
    return new LexisUserPreferencesDto(
        repository.findValue(resolvedUserId, DEFAULT_REGION_PREFERENCE).orElse(null));
  }

  public LexisUserPreferencesDto updatePreferences(String userId, String defaultRegion) {
    String resolvedUserId = requireUserId(userId);
    if (defaultRegion == null) {
      repository.deleteValue(resolvedUserId, DEFAULT_REGION_PREFERENCE);
      return new LexisUserPreferencesDto(null);
    }

    repository.saveValue(
        resolvedUserId, DEFAULT_REGION_PREFERENCE, defaultRegion, resolvedUserId);
    return new LexisUserPreferencesDto(defaultRegion);
  }

  private String requireUserId(String userId) {
    if (userId == null || userId.isBlank()) {
      throw new AccessDeniedException("Authenticated user identity is unavailable.");
    }
    return userId.trim().toUpperCase(Locale.ROOT);
  }
}

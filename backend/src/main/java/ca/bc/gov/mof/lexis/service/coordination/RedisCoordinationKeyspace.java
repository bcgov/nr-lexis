package ca.bc.gov.mof.lexis.service.coordination;

import ca.bc.gov.mof.lexis.util.TextUtils;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Produces environment-scoped Redis keys for all shared LEXIS coordination state. */
@Component
@Profile("oracle")
public final class RedisCoordinationKeyspace {

  private final String prefix;

  public RedisCoordinationKeyspace(
      @Value("${lexis.coordination.namespace:local}") String namespace) {
    String normalized = TextUtils.trimToNull(namespace);
    if (normalized == null) {
      normalized = "local";
    }
    normalized = normalized.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "-");
    this.prefix = "lexis:" + normalized + ":";
  }

  public String key(String purpose, String identifier) {
    String normalizedPurpose = TextUtils.trimToNull(purpose);
    String normalizedIdentifier = TextUtils.trimToNull(identifier);
    if (normalizedPurpose == null || normalizedIdentifier == null) {
      throw new IllegalArgumentException("Redis coordination key parts are required.");
    }
    return prefix + normalizedPurpose + ":" + normalizedIdentifier;
  }
}

package ca.bc.gov.mof.lexis.service.coordination;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class RedisCoordinationKeyspaceTest {

  @Test
  void shouldNormalizeEnvironmentNamespaceAndPreserveResourceIdentity() {
    RedisCoordinationKeyspace keyspace = new RedisCoordinationKeyspace(" TEST / Blue ");

    assertThat(keyspace.key("mutation", "application:100"))
        .isEqualTo("lexis:test---blue:mutation:application:100");
  }

  @Test
  void shouldUseLocalNamespaceWhenConfigurationIsBlank() {
    RedisCoordinationKeyspace keyspace = new RedisCoordinationKeyspace("  ");

    assertThat(keyspace.key("edit", "application:1"))
        .isEqualTo("lexis:local:edit:application:1");
  }

  @Test
  void shouldRejectMissingKeyParts() {
    RedisCoordinationKeyspace keyspace = new RedisCoordinationKeyspace("test");

    assertThatThrownBy(() -> keyspace.key(" ", "application:1"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("key parts");
    assertThatThrownBy(() -> keyspace.key("mutation", null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("key parts");
  }
}

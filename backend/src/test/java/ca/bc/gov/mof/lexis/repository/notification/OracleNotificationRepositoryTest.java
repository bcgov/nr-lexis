package ca.bc.gov.mof.lexis.repository.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class OracleNotificationRepositoryTest {

  @Mock private JdbcTemplate jdbcTemplate;

  @Test
  void findVisibleShouldCloseTheRoleAudiencePredicate() {
    OracleNotificationRepository repository = new OracleNotificationRepository(jdbcTemplate);
    when(jdbcTemplate.query(anyString(), any(RowMapper.class), any(Object[].class)))
        .thenReturn(List.of());

    repository.findVisible(List.of("LEXIS_READ_ONLY"));

    ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
    verify(jdbcTemplate)
        .query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
    assertThat(sqlCaptor.getValue())
        .contains("audience_filter.ROLE_NAME IN (\n?")
        .contains(")\n  )\n) ORDER BY n.PUBLISH_TIMESTAMP DESC");
  }
}

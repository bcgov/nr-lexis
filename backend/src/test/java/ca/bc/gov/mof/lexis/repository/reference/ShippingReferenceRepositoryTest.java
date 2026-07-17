package ca.bc.gov.mof.lexis.repository.reference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import java.sql.CallableStatement;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ShippingReferenceRepositoryTest {

  @Test
  void shouldUseRequiredLexisCodesProceduresForAllMutationOptions() {
    TestRepository repository = new TestRepository();

    assertThat(repository.findActiveCountriesRequired())
        .containsExactly(new CodeNameDto("US", "United States"));
    assertThat(repository.findActiveTransportTypesRequired())
        .containsExactly(new CodeNameDto("S", "Ship"));
    assertThat(repository.findActivePortsRequired())
        .containsExactly(new CodeNameDto("VA", "Vancouver"));
    assertThat(repository.signatures)
        .containsExactly(
            "LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?)",
            "LEXIS_CODES.FIND_ALL_TRANSPORT_TYPE_CODES(?)",
            "LEXIS_CODES.FIND_ALL_PORT_CODES(?)");
  }

  private static final class TestRepository extends ShippingReferenceRepository {

    private final List<String> signatures = new ArrayList<>();

    private TestRepository() {
      super(mock(JdbcTemplate.class));
    }

    @Override
    @SuppressWarnings("unchecked")
    protected <T> List<T> queryCursorProcedureRequired(
        String procedureSignature,
        SqlConsumer<CallableStatement> binder,
        int cursorOutIndex,
        SqlRowMapper<T> rowMapper) {
      signatures.add(procedureSignature);
      assertThat(binder).isNull();
      assertThat(cursorOutIndex).isEqualTo(1);
      CodeNameDto option =
          switch (procedureSignature) {
            case "LEXIS_CODES.FIND_ALL_COUNTRY_CODES(?)" ->
                new CodeNameDto("US", "United States");
            case "LEXIS_CODES.FIND_ALL_TRANSPORT_TYPE_CODES(?)" ->
                new CodeNameDto("S", "Ship");
            case "LEXIS_CODES.FIND_ALL_PORT_CODES(?)" ->
                new CodeNameDto("VA", "Vancouver");
            default -> throw new AssertionError("Unexpected procedure " + procedureSignature);
          };
      return (List<T>) List.of(option);
    }
  }
}

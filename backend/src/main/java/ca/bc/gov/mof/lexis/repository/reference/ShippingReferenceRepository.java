package ca.bc.gov.mof.lexis.repository.reference;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ShippingReferenceRepository extends OracleRepositorySupport {

  public ShippingReferenceRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<CodeNameDto> findActiveCountriesRequired() {
    return findOptionsRequired(LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)");
  }

  public List<CodeNameDto> findActiveTransportTypesRequired() {
    return findOptionsRequired(LEXIS_CODES_PACKAGE + "FIND_ALL_TRANSPORT_TYPE_CODES(?)");
  }

  public List<CodeNameDto> findActivePortsRequired() {
    return findOptionsRequired(LEXIS_CODES_PACKAGE + "FIND_ALL_PORT_CODES(?)");
  }

  private List<CodeNameDto> findOptionsRequired(String procedureSignature) {
    return queryCursorProcedureRequired(
        procedureSignature,
        null,
        1,
        rs -> new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")));
  }
}

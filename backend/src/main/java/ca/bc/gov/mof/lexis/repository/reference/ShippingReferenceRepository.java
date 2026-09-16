package ca.bc.gov.mof.lexis.repository.reference;

import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_PORTS;
import static ca.bc.gov.mof.lexis.repository.reference.LexisCodeQueries.ACTIVE_TRANSPORT_TYPES;

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
    return queryDirectRequired(
        ACTIVE_TRANSPORT_TYPES,
        rs -> new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")));
  }

  public List<CodeNameDto> findActivePortsRequired() {
    return queryDirectRequired(
        ACTIVE_PORTS, rs -> new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")));
  }

  private List<CodeNameDto> findOptionsRequired(String procedureSignature) {
    return queryCursorProcedureRequired(
        procedureSignature,
        null,
        1,
        rs -> new CodeNameDto(getString(rs, "CODE"), getString(rs, "DESCRIPTION")));
  }
}

package ca.bc.gov.mof.lexis.repository.federal;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import java.sql.Types;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class FederalSubmissionPrevalidationRepository extends OracleRepositorySupport {

  private static final String VALIDATE_CLIENT_NUMBER =
      "THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_CLIENT_NUM(?,?)";
  private static final String VALIDATE_LOCATION_CODE =
      "THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_LOCN_CODE(?,?,?)";
  private static final String VALIDATE_BOOM_NUMBER =
      "THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_BOOM_NUMBER(?,?)";
  private static final String VALIDATE_TIMBER_MARK =
      "THE.LEXISWS_WEB_VALIDATION.LEXISWS_VALIDATE_TIMBER_MARK(?,?)";

  public FederalSubmissionPrevalidationRepository(
      @Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public boolean isClientNumberValid(String clientNumber) {
    return executeValidation(VALIDATE_CLIENT_NUMBER, clientNumber);
  }

  public boolean isLocationCodeValid(String clientNumber, String locationCode) {
    return executeValidation(VALIDATE_LOCATION_CODE, clientNumber, locationCode);
  }

  public boolean isBoomNumberValid(String boomNumber) {
    return executeValidation(VALIDATE_BOOM_NUMBER, boomNumber);
  }

  public boolean isTimberMarkValid(String timberMark) {
    return executeValidation(VALIDATE_TIMBER_MARK, timberMark);
  }

  private boolean executeValidation(String procedureSignature, String... values) {
    String call = "{call " + procedureSignature + "}";
    Boolean result =
        jdbcTemplate.execute(
            call,
            (CallableStatementCallback<Boolean>)
                statement -> {
                  for (int index = 0; index < values.length; index++) {
                    statement.setString(index + 1, values[index]);
                  }
                  int outputIndex = values.length + 1;
                  statement.registerOutParameter(outputIndex, Types.VARCHAR);
                  statement.execute();
                  return "Y".equals(statement.getString(outputIndex));
                });
    return Boolean.TRUE.equals(result);
  }
}

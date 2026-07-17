package ca.bc.gov.mof.lexis.repository;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.LexisApplicationRepository;
import ca.bc.gov.mof.lexis.repository.exemption.ExemptionRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;

class AuthoritativeSearchOptionsRepositoryTest {

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void everySearchOptionLoaderShouldPropagateOracleFailure() {
    JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
    when(jdbcTemplate.execute(anyString(), any(CallableStatementCallback.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    LexisApplicationRepository applications = new LexisApplicationRepository(jdbcTemplate);
    assertUnavailable(applications::loadExemptionTypeOptions);
    assertUnavailable(applications::loadExemptionReasonOptions);
    assertUnavailable(applications::loadApplicationStatusOptions);
    assertUnavailable(applications::loadProductTypeOptions);
    assertUnavailable(applications::loadGrowthTypeOptions);
    assertUnavailable(applications::loadRegionOptions);

    ExemptionRepository exemptions = new ExemptionRepository(jdbcTemplate);
    assertUnavailable(exemptions::loadExemptionTypeOptions);
    assertUnavailable(exemptions::loadExemptionStatusOptions);
    assertUnavailable(exemptions::loadRegionOptions);

    PermitRepository permits = new PermitRepository(jdbcTemplate);
    assertUnavailable(permits::loadPermitStatusOptions);
    assertUnavailable(permits::loadRegionOptions);

    ApplicationReviewRepository review = new ApplicationReviewRepository(jdbcTemplate);
    assertUnavailable(review::loadProductTypeOptions);
    assertUnavailable(review::loadRegionOptions);
    assertUnavailable(review::loadReviewStatusOptions);

    PurchaseOfferRepository offers = new PurchaseOfferRepository(jdbcTemplate);
    assertUnavailable(offers::loadRegionOptions);

    LexisReportScheduleRepository reports = new LexisReportScheduleRepository(jdbcTemplate);
    assertUnavailable(reports::loadRegionOptions);

    FederalApplicationRepository federal = new FederalApplicationRepository(jdbcTemplate);
    assertUnavailable(federal::loadApplicationStatusOptions);
    assertUnavailable(federal::loadFederalExemptionTypeOptions);
  }

  private void assertUnavailable(ThrowingCallable loader) {
    assertThatThrownBy(loader)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }
}

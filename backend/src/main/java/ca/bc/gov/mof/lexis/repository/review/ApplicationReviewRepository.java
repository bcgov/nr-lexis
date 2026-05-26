package ca.bc.gov.mof.lexis.repository.review;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class ApplicationReviewRepository {

  public List<CodeNameDto> loadProductTypeOptions() {
    // TODO: Port product type search setup from ApplicationsReviewSearchAction view.
    return List.of();
  }

  public List<CodeNameDto> loadRegionOptions() {
    // TODO: Port region search setup from ApplicationsReviewSearchAction view.
    return List.of();
  }

  public List<CodeNameDto> loadReviewStatusOptions() {
    // TODO: Port new-application review status dialog options from legacy session setup.
    return List.of();
  }

  public List<ApplicationReviewSearchResultDto> search(ApplicationReviewSearchCriteria criteria) {
    // TODO: Port ApplicationsReviewSearchAction search/createSearchFromRequest behavior to Oracle/JDBC.
    return List.of();
  }

  public boolean approve(Long applicationNumber, String updateUserId) {
    // TODO: Port ApplicationsReviewSearchAction approve behavior to Oracle/JDBC.
    return false;
  }

  public boolean updateStatus(
      Long applicationNumber, String statusCode, String remark, String updateUserId) {
    // TODO: Port ApplicationsReviewSearchAction disapprove/status-change behavior to Oracle/JDBC.
    return false;
  }

  public boolean sendStatusEmail(
      Long applicationNumber, String statusCode, String clientEmailAddress, String remark) {
    // TODO: Port ApplicationsReviewSearchAction sendStatusEmail behavior.
    return false;
  }
}

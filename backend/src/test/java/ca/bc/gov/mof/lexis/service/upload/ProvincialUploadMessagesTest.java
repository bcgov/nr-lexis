package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProvincialUploadMessagesTest {

  @Test
  void shouldAskToReportAnIssueForAnySaveFailure() {
    assertThat(ProvincialUploadMessages.rewrite("We were unable to save this package. Please try again."))
        .isEqualTo(ProvincialUploadMessages.SAVE_FAILURE);
    assertThat(ProvincialUploadMessages.rewrite("We were unable to save this scale. Please try again."))
        .isEqualTo(ProvincialUploadMessages.SAVE_FAILURE);
  }

  @Test
  void shouldAskToTryAgainLaterWhenACheckIsUnavailable() {
    assertThat(
            ProvincialUploadMessages.rewrite(
                "Export schedule lookup is unavailable for LEXIS application submission."))
        .isEqualTo(ProvincialUploadMessages.CHECK_FAILURE);
  }

  @Test
  void shouldDescribeTextLexisCannotSaveInTheSubmittersTerms() {
    assertThat(
            ProvincialUploadMessages.rewrite(
                "Location of logs contains characters the current LEXIS database cannot store."))
        .isEqualTo("Location of logs has a character LEXIS can't save, such as an accented letter.");
    assertThat(ProvincialUploadMessages.rewrite("Owner contact name must not exceed 120 bytes."))
        .isEqualTo("Owner contact name must be 120 characters or fewer.");
  }

  @Test
  void shouldSayWhatToDoWhenThePackageAlreadyExists() {
    assertThat(ProvincialUploadMessages.rewrite("Package UX1016-V06 already exists."))
        .isEqualTo(
            "Package UX1016-V06 already exists. If this is a new package, use a different package number.");
  }

  @Test
  void shouldLeaveOtherMessagesAlone() {
    assertThat(ProvincialUploadMessages.rewrite("Timber mark ZZ999 does not exist."))
        .isEqualTo("Timber mark ZZ999 does not exist.");
  }

  @Test
  void shouldShowARepeatedSaveFailureOnceAndKeepTheRejectionSummaryInStep() {
    ApplicationSubmissionImportResultDto result =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            "submission.xml",
            10L,
            "rejected",
            "LEXIS application submission rejected: We were unable to save this package. Please try again.",
            null,
            null,
            0,
            List.of(
                "We were unable to save this package. Please try again.",
                "We were unable to save this scale. Please try again."),
            List.of());

    ApplicationSubmissionImportResultDto rewritten = ProvincialUploadMessages.apply(result);

    assertThat(rewritten.errors()).containsExactly(ProvincialUploadMessages.SAVE_FAILURE);
    assertThat(rewritten.message())
        .isEqualTo("LEXIS application submission rejected: " + ProvincialUploadMessages.SAVE_FAILURE);
  }
}

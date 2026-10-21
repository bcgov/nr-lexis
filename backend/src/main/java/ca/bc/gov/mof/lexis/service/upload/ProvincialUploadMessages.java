package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Wording the provincial upload page shows for errors that come from checks shared with other
 * screens and the federal endpoints, which keep their own wording.
 */
final class ProvincialUploadMessages {

  // The upload page links "report an issue" to the support email.
  static final String SAVE_FAILURE =
      "We couldn't save this application. Try again later. If it keeps happening, report an issue.";
  static final String CHECK_FAILURE =
      "We couldn't check this file. Try again later. If it keeps happening, report an issue.";

  private static final String REJECTED_MESSAGE_PREFIX = "LEXIS application submission rejected: ";
  private static final String SAVE_FAILURE_PREFIX = "We were unable to save this ";
  private static final String UNAVAILABLE_SUFFIX = " is unavailable for LEXIS application submission.";
  private static final Pattern UNSTORABLE_TEXT =
      Pattern.compile("^(.+) contains characters the current LEXIS database cannot store\\.$");
  private static final Pattern TEXT_TOO_LONG = Pattern.compile("^(.+) must not exceed (\\d+) bytes\\.$");
  private static final Pattern PACKAGE_EXISTS = Pattern.compile("^Package (.+) already exists\\.$");

  private ProvincialUploadMessages() {}

  static ApplicationSubmissionImportResultDto apply(ApplicationSubmissionImportResultDto result) {
    if (result == null || result.errors() == null || result.errors().isEmpty()) {
      return result;
    }
    Set<String> errors = new LinkedHashSet<>();
    result.errors().forEach(error -> errors.add(rewrite(error)));
    List<String> rewritten = List.copyOf(errors);
    if (rewritten.equals(result.errors())) {
      return result;
    }
    String message =
        result.message() != null && result.message().startsWith(REJECTED_MESSAGE_PREFIX)
            ? REJECTED_MESSAGE_PREFIX + rewritten.get(0)
            : result.message();
    return result.withErrors(rewritten, message);
  }

  static String rewrite(String error) {
    if (error == null) {
      return null;
    }
    if (error.startsWith(SAVE_FAILURE_PREFIX)) {
      return SAVE_FAILURE;
    }
    if (error.endsWith(UNAVAILABLE_SUFFIX)) {
      return CHECK_FAILURE;
    }
    Matcher unstorable = UNSTORABLE_TEXT.matcher(error);
    if (unstorable.matches()) {
      return unstorable.group(1) + " has a character LEXIS can't save, such as an accented letter.";
    }
    // Only plain letters can be saved, so a byte limit is also a character limit.
    Matcher tooLong = TEXT_TOO_LONG.matcher(error);
    if (tooLong.matches()) {
      return tooLong.group(1) + " must be " + tooLong.group(2) + " characters or fewer.";
    }
    Matcher packageExists = PACKAGE_EXISTS.matcher(error);
    if (packageExists.matches()) {
      return "Package "
          + packageExists.group(1)
          + " already exists. If this is a new package, use a different package number.";
    }
    return error;
  }
}

package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import ca.bc.gov.mof.lexis.repository.federal.FederalSubmissionPrevalidationRepository;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class FederalSubmissionPrevalidationService {

  private final FederalSubmissionPrevalidationRepository repository;

  public FederalSubmissionPrevalidationService(
      FederalSubmissionPrevalidationRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public FederalSubmissionPrevalidationDto validate(
      FederalSubmissionPrevalidationDto submission) {
    List<String> errors = new ArrayList<>();
    List<String> timberMarks =
        submission.timberMark() == null ? List.of() : new ArrayList<>(submission.timberMark());

    if (!repository.isClientNumberValid(submission.clientNumber())) {
      errors.add("clientNumber: " + submission.clientNumber());
    }
    if (!repository.isLocationCodeValid(
        submission.clientNumber(), submission.locationCode())) {
      errors.add("locationCode: " + submission.locationCode());
    }
    if (!repository.isBoomNumberValid(submission.boomNumber())) {
      errors.add("boomNumber: " + submission.boomNumber());
    }
    for (String timberMark : timberMarks) {
      if (!repository.isTimberMarkValid(timberMark)) {
        errors.add("timberMark: " + timberMark);
      }
    }

    return new FederalSubmissionPrevalidationDto(
        submission.boomNumber(),
        submission.clientNumber(),
        List.copyOf(errors),
        submission.locationCode(),
        timberMarks);
  }
}

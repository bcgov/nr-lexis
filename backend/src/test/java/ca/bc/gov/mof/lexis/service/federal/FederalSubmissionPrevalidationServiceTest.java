package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import ca.bc.gov.mof.lexis.repository.federal.FederalSubmissionPrevalidationRepository;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class FederalSubmissionPrevalidationServiceTest {

  private final FederalSubmissionPrevalidationRepository repository =
      mock(FederalSubmissionPrevalidationRepository.class);
  private final FederalSubmissionPrevalidationService service =
      new FederalSubmissionPrevalidationService(repository);

  @Test
  void shouldReturnLegacyErrorsInLegacyValidationOrder() {
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto(
            "DUPLICATE", "INACTIVE", List.of("stale client error"), "99", List.of("OK1", "BAD2"));
    when(repository.isClientNumberValid("INACTIVE")).thenReturn(false);
    when(repository.isLocationCodeValid("INACTIVE", "99")).thenReturn(false);
    when(repository.isBoomNumberValid("DUPLICATE")).thenReturn(false);
    when(repository.isTimberMarkValid("OK1")).thenReturn(true);
    when(repository.isTimberMarkValid("BAD2")).thenReturn(false);

    FederalSubmissionPrevalidationDto result = service.validate(request);

    assertThat(result.boomNumber()).isEqualTo("DUPLICATE");
    assertThat(result.clientNumber()).isEqualTo("INACTIVE");
    assertThat(result.locationCode()).isEqualTo("99");
    assertThat(result.timberMark()).containsExactly("OK1", "BAD2");
    assertThat(result.errors())
        .containsExactly(
            "clientNumber: INACTIVE",
            "locationCode: 99",
            "boomNumber: DUPLICATE",
            "timberMark: BAD2");
  }

  @Test
  void shouldReturnEmptyErrorsWhenAllLegacyChecksPass() {
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto(
            "NEW-BOOM", "00001234", null, "01", List.of("TM001"));
    when(repository.isClientNumberValid("00001234")).thenReturn(true);
    when(repository.isLocationCodeValid("00001234", "01")).thenReturn(true);
    when(repository.isBoomNumberValid("NEW-BOOM")).thenReturn(true);
    when(repository.isTimberMarkValid("TM001")).thenReturn(true);

    FederalSubmissionPrevalidationDto result = service.validate(request);

    assertThat(result.errors()).isEmpty();
    assertThat(result.timberMark()).containsExactly("TM001");
  }

  @Test
  void shouldSafelyValidateAnEmptyOrNullTimberMarkArray() {
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto("NEW-BOOM", "1234", null, "01", null);
    when(repository.isClientNumberValid("1234")).thenReturn(true);
    when(repository.isLocationCodeValid("1234", "01")).thenReturn(true);
    when(repository.isBoomNumberValid("NEW-BOOM")).thenReturn(true);

    FederalSubmissionPrevalidationDto result = service.validate(request);

    assertThat(result.errors()).isEmpty();
    assertThat(result.timberMark()).isEmpty();
    verify(repository, never()).isTimberMarkValid(null);
  }

  @Test
  void shouldPreserveNullTimberMarksLikeTheLegacyBean() {
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto(
            "NEW-BOOM", "1234", null, "01", Arrays.asList("TM001", null));
    when(repository.isClientNumberValid("1234")).thenReturn(true);
    when(repository.isLocationCodeValid("1234", "01")).thenReturn(true);
    when(repository.isBoomNumberValid("NEW-BOOM")).thenReturn(true);
    when(repository.isTimberMarkValid("TM001")).thenReturn(true);
    when(repository.isTimberMarkValid(null)).thenReturn(false);

    FederalSubmissionPrevalidationDto result = service.validate(request);

    assertThat(result.timberMark()).containsExactly("TM001", null);
    assertThat(result.errors()).containsExactly("timberMark: null");
    verify(repository).isTimberMarkValid(null);
  }
}

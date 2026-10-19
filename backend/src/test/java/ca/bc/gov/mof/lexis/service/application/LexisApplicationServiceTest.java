package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchOptionsDto;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | LexisApplicationService")
class LexisApplicationServiceTest {

  @Test
  void hasUpcomingListDateShouldBeTrueWhenAnUpcomingScheduleHasACode() {
    assertThat(
            serviceWithOptions(
                    optionsWithNextSchedules(
                        List.of(new CodeNameDto("989", "2026-08-12"), new CodeNameDto("", "Blank"))))
                .hasUpcomingListDate())
        .isTrue();
  }

  @Test
  void hasUpcomingListDateShouldBeFalseWhenOnlyTheBlankChoiceIsOpen() {
    assertThat(
            serviceWithOptions(optionsWithNextSchedules(List.of(new CodeNameDto("", "Blank"))))
                .hasUpcomingListDate())
        .isFalse();
    assertThat(
            serviceWithOptions(optionsWithNextSchedules(List.of())).hasUpcomingListDate())
        .isFalse();
  }

  @Test
  void hasUpcomingListDateShouldBeTrueWhenTheListDatesCannotBeRead() {
    assertThat(serviceWithOptions(null).hasUpcomingListDate()).isTrue();
    assertThat(serviceWithOptions(optionsWithNextSchedules(null)).hasUpcomingListDate()).isTrue();
  }

  private static LexisApplicationService serviceWithOptions(
      LexisApplicationSearchOptionsDto options) {
    LexisApplicationService service = mock(LexisApplicationService.class, CALLS_REAL_METHODS);
    doReturn(options).when(service).searchOptions();
    return service;
  }

  private static LexisApplicationSearchOptionsDto optionsWithNextSchedules(
      List<CodeNameDto> nextSchedules) {
    return new LexisApplicationSearchOptionsDto(
        List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), nextSchedules);
  }
}

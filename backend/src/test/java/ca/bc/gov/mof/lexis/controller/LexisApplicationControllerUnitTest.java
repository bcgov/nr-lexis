package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
class LexisApplicationControllerUnitTest {

  @Mock private LexisApplicationService service;
  @Mock private ApplicationEditLockService editLockService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private Authentication authentication;

  @InjectMocks private LexisApplicationController controller;

  @Test
  void searchShouldOverrideClientFiltersWhenUserHasScopedForestClient() {
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(LexisApplicationSearchCriteria.class)))
        .thenReturn(new LexisApplicationSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        "00099999",
        "00088888",
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        authentication);

    ArgumentCaptor<LexisApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(LexisApplicationSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    LexisApplicationSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.agentClientNumber()).isEqualTo("00077881");
  }

  @Test
  void detailShouldReturnNotFoundWhenScopedUserDoesNotOwnApplication() {
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(applicationDetail("00099999", "00088888")));

    ResponseEntity<LexisApplicationDetailDto> response =
        controller.getByApplicationNumber(1000456L, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByApplicationNumber(1000456L);
  }

  private static LexisApplicationDetailDto applicationDetail(
      String ownerClientNumber, String agentClientNumber) {
    return new LexisApplicationDetailDto(
        1000456L,
        null,
        "NEW",
        "New",
        ownerClientNumber,
        agentClientNumber,
        12L,
        "R2",
        "H",
        "S",
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 3, 2),
        180L,
        90.0,
        0.5,
        true,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(),
        List.of(),
        List.of());
  }
}

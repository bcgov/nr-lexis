package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import ca.bc.gov.mof.lexis.service.federal.FederalSubmissionPrevalidationService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;

class FederalSubmissionPrevalidationControllerTest {

  @Test
  void shouldReturnTheLegacyCompatibleValidationResponse() {
    @SuppressWarnings("unchecked")
    ObjectProvider<FederalSubmissionPrevalidationService> provider = mock(ObjectProvider.class);
    FederalSubmissionPrevalidationService service = mock(FederalSubmissionPrevalidationService.class);
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto("BOOM-1", "1234", null, "01", List.of("TM001"));
    FederalSubmissionPrevalidationDto result =
        new FederalSubmissionPrevalidationDto(
            "BOOM-1", "1234", List.of("timberMark: TM001"), "01", List.of("TM001"));
    when(provider.getIfAvailable()).thenReturn(service);
    when(service.validate(request)).thenReturn(result);

    var response = new FederalSubmissionPrevalidationController(provider).prevalidate(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(result);
  }

  @Test
  void shouldFailClosedWhenTheOracleValidationServiceIsUnavailable() {
    @SuppressWarnings("unchecked")
    ObjectProvider<FederalSubmissionPrevalidationService> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(null);
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto("BOOM-1", "1234", null, "01", List.of("TM001"));

    var response = new FederalSubmissionPrevalidationController(provider).prevalidate(request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(response.getBody()).isNull();
  }

  @Test
  void shouldRejectANullRequestBody() {
    @SuppressWarnings("unchecked")
    ObjectProvider<FederalSubmissionPrevalidationService> provider = mock(ObjectProvider.class);

    var response = new FederalSubmissionPrevalidationController(provider).prevalidate(null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNull();
  }
}

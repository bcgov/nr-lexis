package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import ca.bc.gov.mof.lexis.service.federal.FederalSubmissionPrevalidationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

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

  @Test
  void shouldAcceptPascalCaseJsonFromTheExistingDotNetModel() throws Exception {
    String json =
        """
        {
          "BoomNumber": "BOOM-1",
          "ClientNumber": "00123456",
          "LocationCode": "01",
          "TimberMark": ["TM001"]
        }
        """;

    FederalSubmissionPrevalidationDto submission =
        new ObjectMapper().readValue(json, FederalSubmissionPrevalidationDto.class);

    assertThat(submission.boomNumber()).isEqualTo("BOOM-1");
    assertThat(submission.clientNumber()).isEqualTo("00123456");
    assertThat(submission.locationCode()).isEqualTo("01");
    assertThat(submission.timberMark()).containsExactly("TM001");
  }

  @Test
  void shouldAcceptAndReturnRawLegacyXml() {
    @SuppressWarnings("unchecked")
    ObjectProvider<FederalSubmissionPrevalidationService> provider = mock(ObjectProvider.class);
    FederalSubmissionPrevalidationService service = mock(FederalSubmissionPrevalidationService.class);
    FederalSubmissionPrevalidationDto request =
        new FederalSubmissionPrevalidationDto("BOOM-1", "00123456", null, "01", List.of("TM001"));
    FederalSubmissionPrevalidationDto result =
        new FederalSubmissionPrevalidationDto(
            "BOOM-1", "00123456", List.of(), "01", List.of("TM001"));
    when(provider.getIfAvailable()).thenReturn(service);
    when(service.validate(request)).thenReturn(result);

    var response =
        new FederalSubmissionPrevalidationController(provider)
            .prevalidateXml(
                """
                <LogExportApplication>
                  <boomNumber>BOOM-1</boomNumber>
                  <clientNumber>00123456</clientNumber>
                  <locationCode>01</locationCode>
                  <timberMark><item>TM001</item></timberMark>
                </LogExportApplication>
                """);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_XML);
    assertThat(response.getBody())
        .contains("<boomNumber>BOOM-1</boomNumber>")
        .contains("<errors/>")
        .contains("<timberMark><item>TM001</item></timberMark>");
  }

  @Test
  void shouldRejectMalformedLegacyXml() {
    @SuppressWarnings("unchecked")
    ObjectProvider<FederalSubmissionPrevalidationService> provider = mock(ObjectProvider.class);

    var response =
        new FederalSubmissionPrevalidationController(provider)
            .prevalidateXml("<LogExportApplication>");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(response.getBody()).isNull();
  }
}

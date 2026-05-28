package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchCriteria;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewSearchResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusUpdateResultDto;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationReviewController")
class ApplicationReviewControllerTest {

  @Mock private ObjectProvider<ApplicationReviewService> serviceProvider;
  @Mock private ApplicationReviewService service;

  @InjectMocks private ApplicationReviewController controller;

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationReviewSearchOptionsDto dto =
        new ApplicationReviewSearchOptionsDto(
            List.of(new CodeNameDto("LOG", "Logs")),
            List.of(new CodeNameDto("12", "Coast")),
            List.of(new CodeNameDto("APR", "Approved")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<ApplicationReviewSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewSearchResponseDto> response =
        controller.search(null, null, null, null, null, null, null, null, 0, 25);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationReviewSearchResponseDto dto =
        new ApplicationReviewSearchResponseDto(
            List.of(
                new ApplicationReviewSearchResultDto(
                    1000456L,
                    80.3,
                    "Hemlock / Lumber",
                    LocalDate.of(2026, 2, 26),
                    "Pending",
                    "R2",
                    true)),
            1,
            0,
            25);
    when(service.search(any(ApplicationReviewSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<ApplicationReviewSearchResponseDto> response =
        controller.search(
            " 1000456 ",
            " LOG ",
            "2026-02-20",
            "03/10/2026",
            "2026-02-26",
            null,
            List.of(12L),
            "applicationNumber DESC",
            0,
            25);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<ApplicationReviewSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ApplicationReviewSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    ApplicationReviewSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicationNumber()).isEqualTo(" 1000456 ");
    assertThat(criteria.productTypeCode()).isEqualTo(" LOG ");
    assertThat(criteria.receivedFromDate()).isEqualTo(LocalDate.of(2026, 2, 20));
    assertThat(criteria.receivedToDate()).isEqualTo(LocalDate.of(2026, 3, 10));
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 26));
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("applicationNumber DESC");
  }

  @Test
  void approveShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.approve(1000456L, new MockHttpServletRequest());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void approveShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true, true, "APR", null, null, "Application approved.");
    when(service.approve(1000456L, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.approve(1000456L, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).approve(1000456L, "idir\\jsmith");
  }

  @Test
  void updateStatusShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setUserPrincipal(() -> "idir\\jsmith");
    ApplicationReviewStatusUpdateRequestDto body =
        new ApplicationReviewStatusUpdateRequestDto("REJ", "Missing docs", "client@gov.bc.ca");
    ApplicationReviewStatusUpdateResultDto dto =
        new ApplicationReviewStatusUpdateResultDto(
            true, true, "REJ", "client@gov.bc.ca", "Missing docs", "Application status updated.");
    when(service.updateStatus(1000456L, body, "idir\\jsmith")).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusUpdateResultDto> response =
        controller.updateStatus(1000456L, body, request);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).updateStatus(1000456L, body, "idir\\jsmith");
  }

  @Test
  void sendStatusEmailShouldForwardRequestToService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    ApplicationReviewStatusEmailRequestDto body =
        new ApplicationReviewStatusEmailRequestDto("REJ", "client@gov.bc.ca", "Missing docs");
    ApplicationReviewStatusEmailResultDto dto =
        new ApplicationReviewStatusEmailResultDto(true, "Status email sent.");
    when(service.sendStatusEmail(1000456L, body)).thenReturn(dto);

    ResponseEntity<ApplicationReviewStatusEmailResultDto> response =
        controller.sendStatusEmail(1000456L, body);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).sendStatusEmail(1000456L, body);
  }
}

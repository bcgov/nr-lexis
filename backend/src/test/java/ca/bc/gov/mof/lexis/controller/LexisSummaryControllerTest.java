package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeeItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOfferItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPaginationResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitItemDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.summary.LexisSummaryService;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisSummaryController")
class LexisSummaryControllerTest {

  @Mock private ObjectProvider<LexisSummaryService> summaryServiceProvider;
  @Mock private LexisSummaryService summaryService;
  @Mock private LexisSessionService sessionService;

  @Test
  void applicationsShouldReturnNoContentWhenServiceMissing() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<SummaryApplicationsResponseDto> response =
        controller.applications(null, 0, 10, null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(summaryService);
  }

  @Test
  void applicationsShouldUseLegacyPageAliasAndResolvedClientScope() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryApplicationsResponseDto payload =
        new SummaryApplicationsResponseDto(
            List.of(
                new SummaryApplicationItemDto(
                    1000456L,
                    "In Review",
                    "ER02",
                    "LUM",
                    "EX-205",
                    LocalDate.of(2026, 2, 21),
                    LocalDate.of(2026, 2, 26),
                    List.of("PKG-903"))),
            1,
            2,
            10);
    when(summaryService.applications("00077881", 2, 10, "application DESC")).thenReturn(payload);

    ResponseEntity<SummaryApplicationsResponseDto> response =
        controller.applications(null, 2, 10, "application DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).applications("00077881", 2, 10, "application DESC");
  }

  @Test
  void offersShouldReturnPayloadWhenServiceAvailable() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("FEDERAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryOffersResponseDto payload =
        new SummaryOffersResponseDto(
            List.of(new SummaryOfferItemDto(81009L, 1000456L, "PKG-903", LocalDate.of(2026, 2, 26))),
            1,
            0,
            10);
    when(summaryService.offers("00077881", 0, 10, "offerNumber DESC")).thenReturn(payload);

    ResponseEntity<SummaryOffersResponseDto> response =
        controller.offers(0, null, 10, "offerNumber DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).offers("00077881", 0, 10, "offerNumber DESC");
  }

  @Test
  void exemptionsShouldUseLegacyPageAliasAndResolvedClientScope() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryExemptionsResponseDto payload =
        new SummaryExemptionsResponseDto(
            List.of(
                new SummaryExemptionItemDto(
                    "EX-205",
                    "Ministerial",
                    "00077881",
                    "00055667",
                    "Approved",
                    95.0,
                    55.0,
                    LocalDate.of(2026, 2, 27),
                    LocalDate.of(2026, 5, 27))),
            1,
            3,
            10);
    when(summaryService.exemptions("00077881", 3, 10, "exemption DESC")).thenReturn(payload);

    ResponseEntity<SummaryExemptionsResponseDto> response =
        controller.exemptions(null, 3, 10, "exemption DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).exemptions("00077881", 3, 10, "exemption DESC");
  }

  @Test
  void permitsShouldUseResolvedClientScope() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("FEDERAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryPermitsResponseDto payload =
        new SummaryPermitsResponseDto(
            List.of(
                new SummaryPermitItemDto(
                    7000123L,
                    "Issued",
                    "00077881",
                    "00055667",
                    "EX-205",
                    28,
                    95.0,
                    "RCT-991",
                    LocalDate.of(2026, 3, 15))),
            1,
            0,
            10);
    when(summaryService.permits("00077881", 0, 10, "permitNumber DESC")).thenReturn(payload);

    ResponseEntity<SummaryPermitsResponseDto> response =
        controller.permits(0, null, 10, "permitNumber DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).permits("00077881", 0, 10, "permitNumber DESC");
  }

  @Test
  void feesShouldUseLegacyPageAliasAndResolvedClientScope() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryFeesResponseDto payload =
        new SummaryFeesResponseDto(
            List.of(new SummaryFeeItemDto(7000123L, "Issued", 95.0, 95.0, "RCT-991")),
            1,
            1,
            10);
    when(summaryService.fees("00077881", 1, 10, "permitNumber DESC")).thenReturn(payload);

    ResponseEntity<SummaryFeesResponseDto> response =
        controller.fees(null, 1, 10, "permitNumber DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).fees("00077881", 1, 10, "permitNumber DESC");
  }

  @Test
  void offersPlacedShouldUseLegacyPageAliasAndResolvedClientScope() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("FEDERAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    SummaryOffersResponseDto payload =
        new SummaryOffersResponseDto(
            List.of(new SummaryOfferItemDto(81010L, 1000456L, "PKG-904", LocalDate.of(2026, 2, 27))),
            1,
            2,
            10);
    when(summaryService.offersPlaced("00077881", 2, 10, "offerNumber DESC")).thenReturn(payload);

    ResponseEntity<SummaryOffersResponseDto> response =
        controller.offersPlaced(null, 2, 10, "offerNumber DESC", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(payload);
    verify(summaryService).offersPlaced("00077881", 2, 10, "offerNumber DESC");
  }

  @Test
  void applicationsPaginationShouldReturnLegacyPaginationHtml() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(summaryService);

    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "idir\\jsmith",
            "n/a",
            List.of(new SimpleGrantedAuthority("PROVINCIAL_SUBMITTER_00077881")));
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");

    when(summaryService.applications("00077881", 2, 10, null))
        .thenReturn(new SummaryApplicationsResponseDto(List.of(), 25, 2, 10));

    ResponseEntity<SummaryPaginationResponseDto> response =
        controller.applicationsPagination(2, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().paginationHTML()).contains("setApplicationPage");
    assertThat(response.getBody().paginationHTML()).contains("25 applications found");
    verify(summaryService).applications("00077881", 2, 10, null);
  }

  @Test
  void offersPlacedPaginationShouldReturnNoContentWhenServiceMissing() {
    LexisSummaryController controller =
        new LexisSummaryController(summaryServiceProvider, sessionService);
    when(summaryServiceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<SummaryPaginationResponseDto> response =
        controller.offersPlacedPagination(0, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(summaryService);
  }
}

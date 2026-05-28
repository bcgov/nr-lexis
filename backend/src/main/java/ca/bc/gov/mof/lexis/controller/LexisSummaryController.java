package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.summary.SummaryApplicationsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryExemptionsResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryFeesResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryOffersResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPaginationResponseDto;
import ca.bc.gov.mof.lexis.dto.summary.SummaryPermitsResponseDto;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.summary.LexisSummaryService;
import ca.bc.gov.mof.lexis.service.summary.SummaryPaginationHtmlRenderer;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/summary")
@Validated
public class LexisSummaryController {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisSummaryController.class);
  private static final int SUMMARY_PAGE_SIZE = 10;

  private final ObjectProvider<LexisSummaryService> summaryServiceProvider;
  private final LexisSessionService sessionService;

  public LexisSummaryController(
      ObjectProvider<LexisSummaryService> summaryServiceProvider, LexisSessionService sessionService) {
    this.summaryServiceProvider = summaryServiceProvider;
    this.sessionService = sessionService;
  }

  @GetMapping("/applications")
  public ResponseEntity<SummaryApplicationsResponseDto> applications(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "applicationPage", required = false) @PositiveOrZero Integer applicationPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for applications");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, applicationPage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.applications(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/offers")
  public ResponseEntity<SummaryOffersResponseDto> offers(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "offerPage", required = false) @PositiveOrZero Integer offerPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for offers");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, offerPage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.offers(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/exemptions")
  public ResponseEntity<SummaryExemptionsResponseDto> exemptions(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "exemptionPage", required = false) @PositiveOrZero Integer exemptionPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for exemptions");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, exemptionPage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.exemptions(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/permits")
  public ResponseEntity<SummaryPermitsResponseDto> permits(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "permitPage", required = false) @PositiveOrZero Integer permitPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for permits");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, permitPage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.permits(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/fees")
  public ResponseEntity<SummaryFeesResponseDto> fees(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "feePage", required = false) @PositiveOrZero Integer feePage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for fees");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, feePage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.fees(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/offers-placed")
  public ResponseEntity<SummaryOffersResponseDto> offersPlaced(
      @RequestParam(name = "page", required = false) @PositiveOrZero Integer page,
      @RequestParam(name = "offerPlacedPage", required = false) @PositiveOrZero Integer offerPlacedPage,
      @RequestParam(name = "size", defaultValue = "10") @Min(1) @Max(200) Integer size,
      @RequestParam(name = "sortField", required = false) String sortField,
      Authentication authentication) {

    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for offers placed");
      return ResponseEntity.noContent().build();
    }

    int resolvedPage = resolvePage(page, offerPlacedPage);
    String forestClientNumber = sessionService.resolveForestClientNumber(authentication);

    return ResponseEntity.ok(
        summaryService.offersPlaced(forestClientNumber, resolvedPage, size, sortField));
  }

  @GetMapping("/applications/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> applicationsPagination(
      @RequestParam(name = "applicationPage", required = false) @PositiveOrZero Integer applicationPage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for applications pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, applicationPage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.applications(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "application", "Application");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  @GetMapping("/exemptions/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> exemptionsPagination(
      @RequestParam(name = "exemptionPage", required = false) @PositiveOrZero Integer exemptionPage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for exemptions pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, exemptionPage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.exemptions(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "exemption", "Exemption");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  @GetMapping("/offers/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> offersPagination(
      @RequestParam(name = "offerPage", required = false) @PositiveOrZero Integer offerPage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for offers pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, offerPage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.offers(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "purchase offer", "Offer");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  @GetMapping("/permits/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> permitsPagination(
      @RequestParam(name = "permitPage", required = false) @PositiveOrZero Integer permitPage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for permits pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, permitPage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.permits(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "permit", "Permit");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  @GetMapping("/fees/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> feesPagination(
      @RequestParam(name = "feePage", required = false) @PositiveOrZero Integer feePage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for fees pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, feePage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.fees(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "fee", "Fee");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  @GetMapping("/offers-placed/pagination")
  public ResponseEntity<SummaryPaginationResponseDto> offersPlacedPagination(
      @RequestParam(name = "offerPlacedPage", required = false) @PositiveOrZero Integer offerPlacedPage,
      Authentication authentication) {
    LexisSummaryService summaryService = summaryServiceProvider.getIfAvailable();
    if (summaryService == null) {
      LOGGER.warn("Summary service unavailable - returning no content for offers placed pagination");
      return ResponseEntity.noContent().build();
    }

    int page = resolvePage(null, offerPlacedPage);
    String clientNumber = sessionService.resolveForestClientNumber(authentication);
    int total = summaryService.offersPlaced(clientNumber, page, SUMMARY_PAGE_SIZE, null).total();
    String html = SummaryPaginationHtmlRenderer.render(total, page, "purchase offer", "OfferPlaced");
    return ResponseEntity.ok(new SummaryPaginationResponseDto(html));
  }

  private int resolvePage(Integer page, Integer legacyPage) {
    if (page != null) {
      return page;
    }
    if (legacyPage != null) {
      return legacyPage;
    }
    return 0;
  }

}

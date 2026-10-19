package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationOfferDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.SharedRemarkNumberTestDatabase;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.review.ApplicationApprovalEligibilityService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | FederalApplicationOracleService")
class FederalApplicationOracleServiceTest {

  @Mock private FederalApplicationRepository repository;
  @Mock private ApplicationDetailsRpcRepository applicationDetailsRepository;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ApplicationReviewRepository applicationReviewRepository;
  @Mock private ApplicationApprovalEligibilityService approvalEligibilityService;
  @Mock private ClientLookupService clientLookupService;
  @InjectMocks private FederalApplicationOracleService service;

  @ParameterizedTest
  @CsvSource({"' pkg-903 ',PKG-903", "' pKg_% ',PKG_%", "'  ',", ","})
  void searchAndCountShouldNormalizePackageNumberLikeLegacy(String packageNumber, String expected) {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null,
            packageNumber,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.of(),
            0,
            25);
    when(repository.search(any(FederalApplicationSearchCriteria.class))).thenReturn(page(List.of(), 0));

    service.search(criteria);
    service.count(criteria);

    ArgumentCaptor<FederalApplicationSearchCriteria> searchCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    ArgumentCaptor<FederalApplicationSearchCriteria> countCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    verify(repository).search(searchCaptor.capture());
    verify(repository).count(countCaptor.capture());
    assertThat(searchCaptor.getValue().packageNumber()).isEqualTo(expected);
    assertThat(countCaptor.getValue().packageNumber()).isEqualTo(expected);
  }

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadApplicationStatusOptions()).thenReturn(List.of(new CodeNameDto("APR", "Approved")));
    when(repository.loadFederalExemptionTypeOptions()).thenReturn(List.of(new CodeNameDto("F", "Federal")));

    FederalApplicationSearchOptionsDto response = service.searchOptions();

    assertThat(response.applicationStatuses()).hasSize(1);
    assertThat(response.exemptionTypes()).hasSize(1);
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 1, 2);
    List<FederalApplicationSearchResultDto> rows =
        List.of(
            row(10003L, "FED-10003"),
            row(10004L, "FED-10004"));
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    FederalApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(FederalApplicationSearchResultDto::applicationNumber)
        .containsExactly(10003L, 10004L);
  }

  @Test
  void searchShouldPreserveInternalIdentityWhenFederalNumbersRepeat() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            "700123", null, null, null, null, null, null, null, null, null, 0, 25);
    List<FederalApplicationSearchResultDto> rows =
        List.of(
            row(10003L, "700123"),
            row(10004L, "700123"));
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(rows, 2));

    FederalApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.results())
        .extracting(FederalApplicationSearchResultDto::applicationNumber)
        .containsExactly(10003L, 10004L);
    assertThat(response.results())
        .extracting(FederalApplicationSearchResultDto::federalApplicationNumber)
        .containsExactly("700123", "700123");
  }

  @Test
  void editContextShouldUseTheAuthoritativeFederalMutationContext() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00077881",
                    "00",
                    "APP",
                    LocalDate.of(2026, 2, 26))));

    assertThat(service.findEditContext(1000456L))
        .contains(
            new FederalApplicationService.FederalApplicationEditContext(
                "APP", LocalDate.of(2026, 2, 26)));
  }

  @Test
  void searchShouldFailClosedWhenRepositoryReturnsNoAuthoritativePage() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 0, 25);
    when(repository.search(any(FederalApplicationSearchCriteria.class))).thenReturn(null);

    assertThatThrownBy(() -> service.search(criteria))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("no authoritative Oracle page");
  }

  @Test
  void searchShouldPropagateOracleFailure() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 0, 25);
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle search failed"));

    assertThatThrownBy(() -> service.search(criteria))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("Oracle search failed");
  }

  @Test
  void searchShouldNormalizeCriteriaBeforeRepositoryCall() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            " FED-1000456 ",
            " PKG-901 ",
            " EX-300 ",
            " APR ",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 3, 10),
            LocalDate.of(2026, 2, 26),
            LocalDate.of(2026, 3, 12),
            " 00077881 ",
            " 00055667 ",
            -3,
            0);
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<FederalApplicationSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(FederalApplicationSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    FederalApplicationSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.federalApplicationNumber()).isEqualTo("FED-1000456");
    assertThat(normalized.packageNumber()).isEqualTo("PKG-901");
    assertThat(normalized.exemptionNumber()).isEqualTo("EX-300");
    assertThat(normalized.applicationStatus()).isEqualTo("APR");
    assertThat(normalized.ownerClientNumber()).isEqualTo("00077881");
    assertThat(normalized.agentClientNumber()).isEqualTo("00055667");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void detailShouldIncludeStructuredOffersAuthoritativeEndUseAndCodeDescriptions() {
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            "00055667",
            "00",
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of("PKG-901"),
            List.of("Reviewed"),
            List.of(
                new FederalApplicationOfferDto(
                    "800", "Federal Buyer", LocalDate.of(2026, 2, 22))),
            null);
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(applicationDetailsService.getApplicationSpeciesEndUseSort(1000456L))
        .thenReturn("HE/FI/LUM");
    when(applicationDetailsRepository.findProductTypeDescription(dto.productType()))
        .thenReturn(Optional.of("Harvested Timber"));
    when(applicationDetailsRepository.findGrowthTypeDescription(dto.ageClass()))
        .thenReturn(Optional.of("Old Growth"));

    FederalApplicationDetailDto result = service.findByApplicationNumber(1000456L).orElseThrow();

    assertThat(result.endUse()).isEqualTo("HE/FI/LUM");
    assertThat(result.productType()).isEqualTo("Harvested Timber");
    assertThat(result.ageClass()).isEqualTo("Old Growth");
    assertThat(result.offers()).containsExactlyElementsOf(dto.offers());
    verify(repository).findByApplicationNumber(1000456L);
    verify(applicationDetailsService).getApplicationSpeciesEndUseSort(1000456L);
  }

  @Test
  void detailShouldIncludeAuthoritativeOwnerAndAgentClientLocationContext() {
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            "00055667",
            "02",
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of("PKG-901"),
            List.of(),
            List.of(),
            null);
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(clientLookupService.getClientDataRequired("00077881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00077881",
                    "Owner Company",
                    "1 Owner Road",
                    "Victoria",
                    "BC",
                    "V8V 1V1",
                    "Canada",
                    "250-555-0101",
                    "250-555-0102",
                    "owner@example.test",
                    null)));
    when(clientLookupService.getClientDataRequired("00055667", "02"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00055667",
                    "Agent Company",
                    "2 Agent Avenue",
                    "Nanaimo",
                    "BC",
                    "V9R 1R1",
                    "Canada",
                    "250-555-0201",
                    "250-555-0202",
                    "agent@example.test",
                    null)));

    FederalApplicationDetailDto result =
        service.findByApplicationNumber(1000456L).orElseThrow();

    assertThat(result.ownerClientContext()).isNotNull();
    assertThat(result.ownerClientContext().address()).isEqualTo("1 Owner Road");
    assertThat(result.ownerClientContext().phone()).isEqualTo("250-555-0101");
    assertThat(result.ownerClientContext().fax()).isEqualTo("250-555-0102");
    assertThat(result.ownerClientContext().email()).isEqualTo("owner@example.test");
    assertThat(result.agentClientContext()).isNotNull();
    assertThat(result.agentClientContext().address()).isEqualTo("2 Agent Avenue");
    assertThat(result.agentClientContext().phone()).isEqualTo("250-555-0201");
    assertThat(result.agentClientContext().fax()).isEqualTo("250-555-0202");
    assertThat(result.agentClientContext().email()).isEqualTo("agent@example.test");
  }

  @Test
  void detailShouldPropagateRequiredClientLocationLookupFailure() {
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            "00077881",
            "00",
            null,
            null,
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of(),
            List.of(),
            List.of(),
            null);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Client location lookup unavailable");
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(clientLookupService.getClientDataRequired("00077881", "00")).thenThrow(failure);

    assertThatThrownBy(() -> service.findByApplicationNumber(1000456L)).isSameAs(failure);
  }

  @Test
  void detailShouldPropagateRequiredSpeciesEndUseLookupFailure() {
    FederalApplicationDetailDto dto =
        new FederalApplicationDetailDto(
            1000456L,
            "FED-1000456",
            "APR",
            "Approved",
            null,
            null,
            null,
            null,
            "EX-300",
            "F",
            "Federal reason",
            LocalDate.of(2026, 2, 20),
            LocalDate.of(2026, 2, 26),
            false,
            List.of(),
            List.of(),
            List.of(),
            null);
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Species/end-use lookup unavailable");
    when(repository.findByApplicationNumber(1000456L)).thenReturn(Optional.of(dto));
    when(applicationDetailsService.getApplicationSpeciesEndUseSort(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findByApplicationNumber(1000456L)).isSameAs(failure);
  }

  @Test
  void detailShouldReturnEmptyForInvalidApplicationNumber() {
    assertThat(service.findByApplicationNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void detailShouldPropagateRepositoryFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findByApplicationNumber(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findByApplicationNumber(1000456L)).isSameAs(failure);
  }

  @Test
  void remarksShouldReturnStructuredRowsAfterFederalParentVerification() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarksByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L,
                    1000456L,
                    "Review note",
                    "idir\\reviewer",
                    Instant.parse("2026-07-10T20:00:00Z"))));

    var result = service.findRemarksByApplicationNumber(1000456L);

    assertThat(result).isPresent();
    assertThat(result.orElseThrow()).singleElement().satisfies(
        remark -> {
          assertThat(remark.remarkId()).isEqualTo(44L);
          assertThat(remark.remark()).isEqualTo("Review note");
          assertThat(remark.user()).isEqualTo("idir\\reviewer");
        });
  }

  @Test
  void remarksShouldFailClosedWhenRemarkDoesNotBelongToFederalParent() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarksByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000999L, "Wrong parent", "idir\\reviewer", Instant.EPOCH)));

    assertThatThrownBy(() -> service.findRemarksByApplicationNumber(1000456L))
        .isInstanceOf(DataRetrievalFailureException.class);
  }

  @Test
  void updateStatusShouldPersistRequiredRemark() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00077881",
                    "00",
                    "APP",
                    LocalDate.of(2026, 7, 11))));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L,
            "REJ",
            "Missing information",
            "idir\\approver",
            List.of("APP")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true,
                true,
                true,
                "APP",
                new ApplicationReviewRepository.ReviewRemarkRow(
                    1L, "Missing information", "idir\\approver", Instant.parse("2026-07-10T20:00:00Z"))));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z").updateStatus(
            1000456L,
            new FederalApplicationService.FederalStatusMutationRequest(
                "REJ", "Missing information"),
            "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.message()).isEqualTo("Federal application status updated.");
  }

  @Test
  void approveShouldPreserveModernApprovalExtensionFromPending() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("PND", LocalDate.of(2026, 7, 11))));
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(new ApplicationApprovalEligibilityService.Eligibility(true, List.of()));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L,
            "APP",
            null,
            "idir\\approver",
            List.of("NEW", "PND")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PND", null));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z").approve(1000456L, "idir\\approver");

    assertThat(result.success()).isTrue();
    verify(approvalEligibilityService).evaluate(1000456L);
  }

  @Test
  void approveShouldRejectApprovalWhenLegacyReadinessGateFails() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("NEW", LocalDate.of(2026, 7, 11))));
    when(approvalEligibilityService.evaluate(1000456L))
        .thenReturn(
            new ApplicationApprovalEligibilityService.Eligibility(
                false,
                List.of(
                    "Applications linked to an exemption cannot be approved.",
                    "Applications linked to a permit cannot be approved.")));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z").approve(1000456L, "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "Applications linked to an exemption cannot be approved.",
            "Applications linked to a permit cannot be approved.");
    verify(approvalEligibilityService).evaluate(1000456L);
    verifyNoInteractions(applicationReviewRepository);
  }

  @Test
  void approveShouldOnlyApproveNewOrPendingApplications() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", LocalDate.of(2026, 7, 11))));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z").approve(1000456L, "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal applications can only be approved from NEW or PND.");
    verifyNoInteractions(approvalEligibilityService, applicationReviewRepository);
  }

  @ParameterizedTest
  @CsvSource({"APP", "' app '", "EXP", "NEW"})
  void updateStatusShouldOnlyRejectOrWithdrawBeforeOracleAccess(String statusCode) {
    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest(statusCode, "Note"),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal status must be REJ or WDN.");
    verifyNoInteractions(repository, approvalEligibilityService, applicationReviewRepository);
  }

  @Test
  void updateStatusShouldRejectForgedSourceTransitions() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(federalContext("NEW", LocalDate.of(2026, 7, 11))),
            Optional.of(federalContext("REJ", LocalDate.of(2026, 7, 11))));
    FederalApplicationOracleService fixedService = serviceAt("2026-07-11T19:00:00Z");

    FederalApplicationService.FederalMutationResult forgedReject =
        fixedService.updateStatus(
            1000456L,
            new FederalApplicationService.FederalStatusMutationRequest("REJ", "Forged"),
            "idir\\approver");
    FederalApplicationService.FederalMutationResult terminal =
        fixedService.updateStatus(
            1000456L,
            new FederalApplicationService.FederalStatusMutationRequest("WDN", "Forged"),
            "idir\\approver");

    assertThat(forgedReject.success()).isFalse();
    assertThat(forgedReject.errors()).containsExactly(
        "Federal applications can only be rejected or withdrawn from APP.");
    assertThat(terminal.success()).isFalse();
    assertThat(terminal.errors()).containsExactly(
        "Federal applications can only be rejected or withdrawn from APP.");
    verifyNoInteractions(applicationReviewRepository);
  }

  @Test
  void updateStatusShouldAllowListingDayAndDenyTheNextVancouverBusinessDay() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", LocalDate.of(2026, 7, 11))));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-12T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest("WDN", "Too late"),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "Federal applications can only be rejected or withdrawn through the listing day.");
    verifyNoInteractions(applicationReviewRepository);
  }

  @Test
  void updateStatusShouldFailClosedWithoutAListingDate() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest("REJ", "Missing"),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "Federal application listing date could not be verified.");
    verifyNoInteractions(applicationReviewRepository);
  }

  @Test
  void updateStatusShouldFailClosedWhenStatusChangesDuringTheGuardedWrite() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", LocalDate.of(2026, 7, 11))));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "REJ", "Missing", "idir\\approver", List.of("APP")))
        .thenReturn(ApplicationReviewRepository.ApplicationStatusTransitionRow.notAllowed("REJ"));

    FederalApplicationService.FederalMutationResult result =
        serviceAt("2026-07-11T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest("REJ", "Missing"),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).singleElement().asString().contains("changed before the update");
  }

  @Test
  void addRemarkShouldPersistAgainstVerifiedFederalParent() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.insertRemark(
            eq(1000456L), eq("Review note"), eq("idir\\approver"), any(Instant.class)))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000456L, "Review note", "idir\\approver", Instant.EPOCH)));

    FederalApplicationService.FederalRemarkMutationResult result =
        service.addRemark(
            1000456L,
            new FederalApplicationService.FederalRemarkMutationRequest(" Review note "),
            "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.remark().remarkId()).isEqualTo(44L);
    assertThat(result.remark().remark()).isEqualTo("Review note");
  }

  @Test
  void addRemarkShouldEnforceLegacyRemarkLengthBeforeOracleMutation() {
    FederalApplicationService.FederalRemarkMutationResult result =
        service.addRemark(
            1000456L,
            new FederalApplicationService.FederalRemarkMutationRequest("x".repeat(251)),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Remark must not exceed 250 characters.");
    verifyNoInteractions(repository, applicationDetailsRepository, applicationReviewRepository);
  }

  @ParameterizedTest
  @ValueSource(strings = {"caf\u00e9", "it\u2019s a \u201cquote\u201d", "dash \u2013 here"})
  void remarkMutationsShouldRefuseNonAsciiTextBeforeOracleMutation(String text) {
    String message =
        "Application remarks contain unsupported special characters. Remove them and try again.";
    FederalApplicationService.FederalRemarkMutationRequest request =
        new FederalApplicationService.FederalRemarkMutationRequest(text);

    assertThat(service.addRemark(1000456L, request, "idir\\approver").errors())
        .containsExactly(message);
    assertThat(service.updateRemark(1000456L, 44L, request, "idir\\approver").errors())
        .containsExactly(message);
    assertThat(
            service
                .updateStatus(
                    1000456L,
                    new FederalApplicationService.FederalStatusMutationRequest("WDN", text),
                    "idir\\approver")
                .errors())
        .containsExactly(message);
    verifyNoInteractions(repository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void remarkMutationsShouldRejectStorageOverflowBeforeOracleMutation() {
    FederalApplicationService.FederalRemarkMutationRequest request =
        new FederalApplicationService.FederalRemarkMutationRequest("&".repeat(255));

    assertThat(service.addRemark(1000456L, request, "idir\\approver").success()).isFalse();
    assertThat(service.updateRemark(1000456L, 44L, request, "idir\\approver").success()).isFalse();
    assertThat(service.addRemark(
        1000456L,
        new FederalApplicationService.FederalRemarkMutationRequest("<".repeat(251)),
        "idir\\approver").errors())
        .containsExactly("Remark must not exceed 250 characters.");
    assertThat(service.updateStatus(
        1000456L,
        new FederalApplicationService.FederalStatusMutationRequest("REJ", request.remark()),
        "idir\\approver").errors())
        .containsExactly("Remark is too long to save. Shorten it and try again.");
    verifyNoInteractions(repository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void remarkMutationsShouldCountTheEscapedCharactersAgainstTheLimit() {
    FederalApplicationService.FederalRemarkMutationRequest request =
        new FederalApplicationService.FederalRemarkMutationRequest("x".repeat(246) + "&&");

    assertThat(service.addRemark(1000456L, request, "idir\\approver").errors())
        .containsExactly("Remark must not exceed 250 characters.");
    assertThat(service.updateRemark(1000456L, 44L, request, "idir\\approver").errors())
        .containsExactly("Remark must not exceed 250 characters.");
    verifyNoInteractions(repository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addRemarkShouldAcceptARemarkWhoseEscapedFormIsExactly250CharactersWithoutConvertingLiteralEntities() {
    String text = "&amp;".repeat(27) + "x".repeat(7);
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("NEW", LocalDate.of(2026, 3, 1))));
    when(applicationDetailsRepository.insertRemark(
        eq(1000456L), eq(text), eq("idir\\approver"), any(Instant.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.RemarkRow(
            44L, 1000456L, text, "idir\\approver", Instant.EPOCH)));

    FederalApplicationService.FederalRemarkMutationResult result = service.addRemark(
        1000456L, new FederalApplicationService.FederalRemarkMutationRequest(text), "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.remark().remark()).isEqualTo(text);
    verify(applicationDetailsRepository).insertRemark(
        eq(1000456L), eq(text), eq("idir\\approver"), any(Instant.class));
  }

  @Test
  void updateRemarkShouldRejectRemarkFromAnotherApplication() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarkRequired(44L, 1000456L))
        .thenReturn(Optional.empty());

    FederalApplicationService.FederalRemarkMutationResult result =
        service.updateRemark(
            1000456L,
            44L,
            new FederalApplicationService.FederalRemarkMutationRequest("Changed"),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal application remark was not found.");
    verify(applicationDetailsRepository, never())
        .updateRemark(any(), any(), any(), any(), any());
  }

  @Test
  void updateRemarkShouldUpdateAndReloadTheBoundRemark() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarkRequired(44L, 1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000456L, "Original", "idir\\reviewer", Instant.EPOCH)),
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000456L, "Changed", "idir\\reviewer", Instant.EPOCH)));
    when(applicationDetailsRepository.updateRemark(
            eq(44L),
            eq(1000456L),
            eq("Changed"),
            eq("idir\\approver"),
            any(Instant.class)))
        .thenReturn(true);

    FederalApplicationService.FederalRemarkMutationResult result =
        service.updateRemark(
            1000456L,
            44L,
            new FederalApplicationService.FederalRemarkMutationRequest("Changed"),
            "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.remark().remark()).isEqualTo("Changed");
    assertThat(result.remark().user()).isEqualTo("idir\\reviewer");
  }

  @Test
  void updateRemarkShouldRefuseASharedRemarkNumberWithoutCallingTheProcedure() {
    try (SharedRemarkNumberTestDatabase database = new SharedRemarkNumberTestDatabase()) {
      long applicationNumber = SharedRemarkNumberTestDatabase.APPLICATION_NUMBER;
      when(repository.findMutationContextRequired(applicationNumber))
          .thenReturn(
              Optional.of(
                  new FederalApplicationRepository.FederalMutationContextRow(
                      applicationNumber, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
      SharedRemarkNumberTestDatabase.RemarkProcedureRepository remarkRepository =
          database.repository();
      FederalApplicationOracleService sharedNumberService =
          new FederalApplicationOracleService(
              repository,
              remarkRepository,
              applicationDetailsService,
              applicationReviewRepository,
              approvalEligibilityService,
              clientLookupService);
      List<Map<String, Object>> before = database.rows();

      FederalApplicationService.FederalRemarkMutationResult refused =
          sharedNumberService.updateRemark(
              applicationNumber,
              SharedRemarkNumberTestDatabase.REMARK_NUMBER,
              new FederalApplicationService.FederalRemarkMutationRequest("Corrected remark"),
              "idir\\approver");

      assertThat(refused.success()).isFalse();
      assertThat(refused.errors())
          .containsExactly(ApplicationDetailsRpcService.SHARED_REMARK_NUMBER_MESSAGE);
      assertThat(remarkRepository.remarkUpdateCalls()).isEmpty();
      assertThat(database.rows()).isEqualTo(before);

      FederalApplicationService.FederalRemarkMutationResult updated =
          sharedNumberService.updateRemark(
              applicationNumber,
              SharedRemarkNumberTestDatabase.UNIQUE_REMARK_NUMBER,
              new FederalApplicationService.FederalRemarkMutationRequest("Corrected remark"),
              "idir\\approver");

      assertThat(updated.success()).isTrue();
      assertThat(updated.remark().remark()).isEqualTo("Corrected remark");
      assertThat(remarkRepository.remarkUpdateCalls()).hasSize(1);
    }
  }

  @Test
  void updateRemarkShouldFailClosedWhenRemarkLookupFails() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarkRequired(44L, 1000456L))
        .thenThrow(new DataRetrievalFailureException("Oracle lookup failed"));

    FederalApplicationService.FederalRemarkMutationResult result =
        service.updateRemark(
            1000456L,
            44L,
            new FederalApplicationService.FederalRemarkMutationRequest("Changed"),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal application remark could not be updated.");
    verify(applicationDetailsRepository, never())
        .updateRemark(any(), any(), any(), any(), any());
  }

  private FederalApplicationSearchResultDto row(Long applicationNumber, String federalApplicationNumber) {
    return new FederalApplicationSearchResultDto(
        applicationNumber,
        federalApplicationNumber,
        "Approved",
        "00077881",
        "Federal reason",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 26));
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }

  private FederalApplicationOracleService serviceAt(String instant) {
    return new FederalApplicationOracleService(
        repository,
        applicationDetailsRepository,
        applicationDetailsService,
        applicationReviewRepository,
        approvalEligibilityService,
        clientLookupService,
        Clock.fixed(Instant.parse(instant), LexisBusinessTime.ZONE));
  }

  private FederalApplicationRepository.FederalMutationContextRow federalContext(
      String statusCode, LocalDate listingDate) {
    return new FederalApplicationRepository.FederalMutationContextRow(
        1000456L,
        LocalDate.of(2026, 2, 20),
        1909L,
        "00077881",
        "00",
        statusCode,
        listingDate);
  }
}

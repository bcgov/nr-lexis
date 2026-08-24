package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationOfferDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalPermitDetailRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.review.ApplicationApprovalEligibilityService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | FederalApplicationOracleService")
class FederalApplicationOracleServiceTest {

  @Mock private FederalApplicationRepository repository;
  @Mock private FederalPermitDetailRepository permitRepository;
  @Mock private ApplicationDetailsRpcRepository applicationDetailsRepository;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private ApplicationReviewRepository applicationReviewRepository;
  @Mock private ApplicationApprovalEligibilityService approvalEligibilityService;
  @Mock private ClientLookupService clientLookupService;
  @Mock private ApplicationEditLockService editLockService;
  @InjectMocks private FederalApplicationOracleService service;

  @BeforeEach
  void setUpLockSnapshot() {
    lenient().when(editLockService.lockedApplicationNumbers(any())).thenReturn(Set.of());
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
  void searchShouldResolveAllPageLockStatesInOneRegistryCall() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 0, 25);
    List<FederalApplicationSearchResultDto> rows =
        List.of(row(10003L, "FED-10003"), row(10004L, "FED-10004"));
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenReturn(page(rows, 2));
    when(editLockService.lockedApplicationNumbers(List.of(10003L, 10004L)))
        .thenReturn(Set.of(10004L));

    FederalApplicationSearchResponseDto response = service.search(criteria);

    assertThat(response.results())
        .extracting(FederalApplicationSearchResultDto::locked)
        .containsExactly(false, true);
    verify(editLockService).lockedApplicationNumbers(List.of(10003L, 10004L));
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
    verifyNoInteractions(editLockService);
  }

  @Test
  void searchShouldPropagateOracleFailureBeforeResolvingLockState() {
    FederalApplicationSearchCriteria criteria =
        new FederalApplicationSearchCriteria(
            null, null, null, null, null, null, null, null, null, null, 0, 25);
    when(repository.search(any(FederalApplicationSearchCriteria.class)))
        .thenThrow(new DataAccessResourceFailureException("Oracle search failed"));

    assertThatThrownBy(() -> service.search(criteria))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessageContaining("Oracle search failed");
    verifyNoInteractions(editLockService);
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
                    "owner@example.test")));
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
                    "agent@example.test")));

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
  void permitShouldPassThroughRepository() {
    FederalApplicationPermitDto dto =
        new FederalApplicationPermitDto(
            99123L,
            LocalDate.of(2026, 3, 12),
            "US",
            "S",
            "MV Federal",
            LocalDate.of(2026, 3, 15),
            "VA",
            null);
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.of(dto));

    Optional<FederalApplicationPermitDto> result = service.findPermitByApplicationNumber(1000456L);

    assertThat(result).contains(dto);
    verify(repository).findPermitByApplicationNumberRequired(1000456L);
  }

  @Test
  void permitShouldReturnEmptyForInvalidApplicationNumber() {
    assertThat(service.findPermitByApplicationNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void permitShouldReturnEmptyWhenFederalApplicationIsMissing() {
    when(repository.findMutationContextRequired(1000456L)).thenReturn(Optional.empty());

    assertThat(service.findPermitByApplicationNumber(1000456L)).isEmpty();
    verify(repository, never()).findPermitByApplicationNumberRequired(any());
  }

  @Test
  void permitShouldReturnEmptyWhenApplicationExistsWithoutPermit() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());

    assertThat(service.findPermitByApplicationNumber(1000456L)).isEmpty();
  }

  @Test
  void permitShouldPropagateApplicationLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle application lookup failed");
    when(repository.findMutationContextRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findPermitByApplicationNumber(1000456L)).isSameAs(failure);
    verify(repository, never()).findPermitByApplicationNumberRequired(any());
  }

  @Test
  void permitShouldPropagatePermitLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle permit lookup failed");
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.findPermitByApplicationNumber(1000456L)).isSameAs(failure);
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
  void verifyClientsShouldPassThroughRepositoryWhenInputIsValid() {
    when(repository.verifyApplicationClientsRequired(List.of(1000456L, 1000999L)))
        .thenReturn(true);

    boolean result = service.verifyApplicationClients(List.of(1000456L, 1000999L));

    assertThat(result).isTrue();
    verify(repository).verifyApplicationClientsRequired(List.of(1000456L, 1000999L));
  }

  @Test
  void verifyClientsShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("federal client lookup unavailable");
    when(repository.verifyApplicationClientsRequired(List.of(1000456L, 1000999L)))
        .thenThrow(failure);

    assertThatThrownBy(
            () -> service.verifyApplicationClients(List.of(1000456L, 1000999L)))
        .isSameAs(failure);
  }

  @Test
  void verifyClientsShouldShortCircuitWhenInputIsInvalid() {
    boolean result = service.verifyApplicationClients(Arrays.asList(null, 0L, -1L));

    assertThat(result).isFalse();
    verifyNoInteractions(repository);
  }

  @Test
  void addPermitShouldPersistAndReturnFederalPermit() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901"), List.of("PKG-901"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageMutationRow(null)), List.of(packageMutationRow(9001L)));
    when(applicationDetailsRepository.updatePackagePreservingEndUses(any())).thenReturn(true);

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                " us ",
                " s ",
                " Carrier ",
                LocalDate.of(2026, 7, 15),
                " va ",
                "Stale other port"),
            "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.permit().permitNumber()).isEqualTo(9001L);
    verify(permitRepository).insertFederalPermitDetail(
        org.mockito.ArgumentMatchers.argThat(
            row ->
                "idir\\approver".equals(row.entryUserId())
                    && Long.valueOf(1909L).equals(row.orgUnitNumber())
                    && "00077881".equals(row.clientNumber())
                    && "US".equals(row.countryCode())
                    && "S".equals(row.transportTypeCode())
                    && "VA".equals(row.portOfExportCode())
                    && "Carrier".equals(row.transportName())
                    && row.otherPortOfExport() == null));
    verify(applicationDetailsRepository, org.mockito.Mockito.times(2))
        .findPackageMutationsByApplicationNumber(1000456L);
    verify(applicationDetailsRepository, never()).findPackageMutationByPackageNumber(any());
    verify(applicationDetailsRepository, never()).findEndUsesByPackageNumberRequired(any());
  }

  @Test
  void addPermitShouldRollBackWhenApplicationHasNoPackagesToLink() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "Federal permit was created, but its application packages could not be linked.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verifyNoInteractions(applicationDetailsRepository);
  }

  @Test
  void addPermitShouldRollBackWhenPackageLinkDoesNotPersist() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901"), List.of("PKG-901"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageMutationRow(null)), List.of(packageMutationRow(null)));
    when(applicationDetailsRepository.updatePackagePreservingEndUses(any())).thenReturn(true);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "Federal permit was created, but its application packages could not be linked.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPermitShouldRollBackWhenPackageSetChangesDuringLinking() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901"), List.of("PKG-901", "PKG-902"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageMutationRow("PKG-901", 1000456L, null)));
    when(applicationDetailsRepository.updatePackagePreservingEndUses(any())).thenReturn(true);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPermitShouldRollBackWhenLaterPackageUpdateFails() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901", "PKG-902"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                packageMutationRow("PKG-901", 1000456L, null),
                packageMutationRow("PKG-902", 1000456L, null)));
    when(applicationDetailsRepository.updatePackagePreservingEndUses(any()))
        .thenReturn(true, false);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(applicationDetailsRepository, org.mockito.Mockito.times(2))
        .updatePackagePreservingEndUses(any());
  }

  @Test
  void addPermitShouldRollBackWhenPackageDoesNotBelongToApplication() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(Optional.of(insertedFederalPermit()));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageMutationRow(1000999L, null)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(applicationDetailsRepository, never()).updatePackagePreservingEndUses(any());
  }

  @Test
  void addPermitShouldRollBackWhenInsertReturnsMalformedRow() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(
            Optional.of(
                new FederalPermitDetailRepository.FederalPermitDetailRow(
                    null,
                    LocalDate.of(2026, 7, 10),
                    LocalDate.of(2026, 7, 15),
                    "US",
                    "S",
                    "Carrier",
                    "VA",
                    null,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00",
                    "00077881")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal permit could not be saved.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(repository, never()).findPackageNumbersByApplicationNumberRequired(any());
  }

  @Test
  void addPermitShouldRollBackWhenInsertReturnsZeroIdOrWrongBusinessValue() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(
            Optional.of(
                new FederalPermitDetailRepository.FederalPermitDetailRow(
                    0L,
                    LocalDate.of(2026, 7, 10),
                    LocalDate.of(2026, 7, 15),
                    "CA",
                    "S",
                    "Carrier",
                    "VA",
                    null,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00",
                    "00077881")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal permit could not be saved.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(repository, never()).findPackageNumbersByApplicationNumberRequired(any());
  }

  @Test
  void addPermitShouldFailClosedWhenExistingPermitLookupFails() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenThrow(new DataRetrievalFailureException("Oracle lookup failed"));

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                "Carrier",
                LocalDate.of(2026, 7, 15),
                "VA",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "Federal permit availability could not be verified.");
    verify(permitRepository, never()).insertFederalPermitDetail(any());
  }

  @Test
  void addPermitShouldFailClosedWhenPackageListLookupFails() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(
            Optional.of(
                new FederalPermitDetailRepository.FederalPermitDetailRow(
                    9001L,
                    LocalDate.of(2026, 7, 10),
                    LocalDate.of(2026, 7, 15),
                    "US",
                    "S",
                    "Carrier",
                    "VA",
                    null,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00",
                    "00077881")));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenThrow(new DataRetrievalFailureException("Oracle lookup failed"));

    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .addPermit(
                1000456L,
                new FederalApplicationService.FederalPermitMutationRequest(
                    null,
                    LocalDate.of(2026, 7, 10),
                    "US",
                    "S",
                    "Carrier",
                    LocalDate.of(2026, 7, 15),
                    "VA",
                    null),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "Federal permit was created, but its application packages could not be linked.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verifyNoInteractions(applicationDetailsRepository);
  }

  @Test
  void addPermitShouldFailClosedWhenBulkPackageLookupFails() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenReturn(Optional.empty());
    when(permitRepository.insertFederalPermitDetail(any()))
        .thenReturn(
            Optional.of(
                new FederalPermitDetailRepository.FederalPermitDetailRow(
                    9001L,
                    LocalDate.of(2026, 7, 10),
                    LocalDate.of(2026, 7, 15),
                    "US",
                    "S",
                    "Carrier",
                    "VA",
                    null,
                    LocalDate.of(2026, 2, 20),
                    1909L,
                    "00",
                    "00077881")));
    when(repository.findPackageNumbersByApplicationNumberRequired(1000456L))
        .thenReturn(List.of("PKG-901"));
    when(applicationDetailsRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenThrow(new DataRetrievalFailureException("Oracle lookup failed"));

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                "Carrier",
                LocalDate.of(2026, 7, 15),
                "VA",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly(
        "Federal permit was created, but its application packages could not be linked.");
    verify(applicationDetailsRepository, never()).updatePackagePreservingEndUses(any());
  }

  @Test
  void addPermitShouldRequireTransportNameBeforeOracleAccess() {
    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                " ",
                LocalDate.of(2026, 7, 15),
                "VA",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Transport name is required.");
    verifyNoInteractions(
        repository, permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addPermitShouldRejectNonexistentReferenceCodes() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(permitRepository.countryCodeExistsRequired("XX")).thenReturn(false);
    when(permitRepository.portOfExportCodeExistsRequired("ZZ")).thenReturn(false);
    when(permitRepository.transportTypeCodeExistsRequired("Z")).thenReturn(false);

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "XX",
                "Z",
                "Carrier",
                LocalDate.of(2026, 7, 15),
                "ZZ",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "Destination country is invalid.",
            "Port of export is invalid.",
            "Transport type is invalid.");
    verify(repository, never()).findPermitByApplicationNumberRequired(any());
    verify(permitRepository, never()).insertFederalPermitDetail(any());
  }

  @Test
  void addPermitShouldFailClosedWhenCodeLookupFails() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(permitRepository.countryCodeExistsRequired("US"))
        .thenThrow(new DataRetrievalFailureException("Oracle lookup failed"));

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                "Carrier",
                LocalDate.of(2026, 7, 15),
                "VA",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal permit reference codes could not be verified.");
    verify(permitRepository, never()).insertFederalPermitDetail(any());
    verify(repository, never()).findPermitByApplicationNumberRequired(any());
  }

  @Test
  void addPermitShouldRejectSchemaWidthsBeforeOracleAccess() {
    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "USA",
                "SEA",
                "C".repeat(27),
                LocalDate.of(2026, 7, 15),
                "VAN",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Destination country must be exactly 2 characters.",
            "Transport type must be exactly 1 character.",
            "Transport name must not exceed 26 bytes.",
            "Port of export must be exactly 2 characters.");
    verifyNoInteractions(
        repository, permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addPermitShouldRejectTextThatOracleCannotRepresentBeforeOracleAccess() {
    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                "Navire Étoile",
                LocalDate.of(2026, 7, 15),
                "OT",
                "Québec"),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Transport name contains characters the current LEXIS database cannot store.",
            "Other port of export contains characters the current LEXIS database cannot store.");
    verifyNoInteractions(
        repository, permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addPermitShouldVerifyTheFederalParentBeforeCodeLookups() {
    when(repository.findMutationContextRequired(1000456L)).thenReturn(Optional.empty());

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(
            1000456L,
            new FederalApplicationService.FederalPermitMutationRequest(
                null,
                LocalDate.of(2026, 7, 10),
                "US",
                "S",
                "Carrier",
                LocalDate.of(2026, 7, 15),
                "VA",
                null),
            "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal application was not found.");
    verifyNoInteractions(permitRepository);
  }

  @Test
  void addPermitShouldRejectAnUnapprovedFederalApplicationBeforeCodeLookups() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("PND", null)));

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal permits can only be added to approved applications.");
    verifyNoInteractions(
        permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addPermitShouldFailClosedWhenTheFederalApplicationStatusIsMissing() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext(null, null)));

    FederalApplicationService.FederalMutationResult result =
        service.addPermit(1000456L, validPermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal application status could not be verified.");
    verifyNoInteractions(
        permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void addPermitShouldPropagateFederalParentLookupFailure() {
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle lookup failed");
    when(repository.findMutationContextRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(
            () -> service.addPermit(1000456L, validPermitRequest(), "idir\\approver"))
        .isSameAs(failure);

    verifyNoInteractions(
        permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void updatePermitShouldReportNotFoundWhenFederalParentIsMissing() {
    when(repository.findMutationContextRequired(1000456L)).thenReturn(Optional.empty());

    FederalApplicationService.FederalMutationResult result =
        service.updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal permit was not found.");
    verify(repository, never()).findPermitByApplicationNumberRequired(any());
    verifyNoInteractions(permitRepository);
  }

  @Test
  void updatePermitShouldPropagateFederalParentLookupFailure() {
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle parent lookup failed");
    when(repository.findMutationContextRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.updatePermit(
                    1000456L, validUpdatePermitRequest(), "idir\\approver"))
        .isSameAs(failure);

    verify(repository, never()).findPermitByApplicationNumberRequired(any());
    verifyNoInteractions(permitRepository);
  }

  @Test
  void updatePermitShouldReportNotFoundWhenFederalPermitIsMissing() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.empty());

    FederalApplicationService.FederalMutationResult result =
        service.updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors()).containsExactly("Federal permit was not found.");
    verifyNoInteractions(permitRepository);
  }

  @Test
  void updatePermitShouldPropagateFederalPermitLookupFailure() {
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle permit lookup failed");
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.updatePermit(
                    1000456L, validUpdatePermitRequest(), "idir\\approver"))
        .isSameAs(failure);

    verifyNoInteractions(permitRepository);
  }

  @Test
  void updatePermitShouldReturnAuthoritativePersistedPermit() {
    stubValidPermitCodes();
    FederalPermitDetailRepository.FederalPermitDetailRow persisted = insertedFederalPermit();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(validFederalPermit()));
    when(permitRepository.updateFederalPermitDetail(eq(9001L), any(), eq("idir\\approver")))
        .thenReturn(true);
    when(permitRepository.findFederalPermitDetailByIdRequired(9001L))
        .thenReturn(Optional.of(persisted));

    FederalApplicationService.FederalMutationResult result =
        service.updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isTrue();
    assertThat(result.permit()).isEqualTo(validFederalPermit());
    verify(repository).findPermitByApplicationNumberRequired(1000456L);
    verify(permitRepository).findFederalPermitDetailByIdRequired(9001L);
  }

  @Test
  void updatePermitShouldRollBackWhenOracleUpdateDoesNotPersistExpectedValues() {
    stubValidPermitCodes();
    FederalPermitDetailRepository.FederalPermitDetailRow stale =
        new FederalPermitDetailRepository.FederalPermitDetailRow(
            9001L,
            LocalDate.of(2026, 7, 10),
            LocalDate.of(2026, 7, 15),
            "US",
            "S",
            "Stale carrier",
            "VA",
            null,
            LocalDate.of(2026, 2, 20),
            1909L,
            "00",
            "00077881");
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(validFederalPermit()));
    when(permitRepository.updateFederalPermitDetail(eq(9001L), any(), eq("idir\\approver")))
        .thenReturn(true);
    when(permitRepository.findFederalPermitDetailByIdRequired(9001L))
        .thenReturn(Optional.of(stale));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal permit update could not be verified.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void updatePermitShouldRollBackWhenAuthoritativeContextDoesNotPersist() {
    stubValidPermitCodes();
    FederalPermitDetailRepository.FederalPermitDetailRow staleContext =
        new FederalPermitDetailRepository.FederalPermitDetailRow(
            9001L,
            LocalDate.of(2026, 7, 10),
            LocalDate.of(2026, 7, 15),
            "US",
            "S",
            "Carrier",
            "VA",
            null,
            LocalDate.of(2026, 2, 20),
            9999L,
            "00",
            "00077881");
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(validFederalPermit()));
    when(permitRepository.updateFederalPermitDetail(eq(9001L), any(), eq("idir\\approver")))
        .thenReturn(true);
    when(permitRepository.findFederalPermitDetailByIdRequired(9001L))
        .thenReturn(Optional.of(staleContext));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal permit update could not be verified.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void updatePermitShouldRollBackWhenOracleUpdateReturnsButPermitDisappears() {
    stubValidPermitCodes();
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(validFederalPermit()));
    when(permitRepository.updateFederalPermitDetail(eq(9001L), any(), eq("idir\\approver")))
        .thenReturn(true);
    when(permitRepository.findFederalPermitDetailByIdRequired(9001L))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    FederalApplicationService.FederalMutationResult result =
        transactionalService(transactionManager)
            .updatePermit(1000456L, validUpdatePermitRequest(), "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly("Federal permit update could not be verified.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void updatePermitShouldRollBackAndPropagatePostWriteVerificationFailure() {
    stubValidPermitCodes();
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle verification failed");
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(Optional.of(federalContext("APP", null)));
    when(repository.findPermitByApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(validFederalPermit()));
    when(permitRepository.updateFederalPermitDetail(eq(9001L), any(), eq("idir\\approver")))
        .thenReturn(true);
    when(permitRepository.findFederalPermitDetailByIdRequired(9001L)).thenThrow(failure);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    assertThatThrownBy(
            () ->
                transactionalService(transactionManager)
                    .updatePermit(
                        1000456L, validUpdatePermitRequest(), "idir\\approver"))
        .isSameAs(failure);
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
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
  void updateStatusShouldPreserveModernApprovalExtensionFromPending() {
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
        serviceAt("2026-07-11T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest("APP", null),
                "idir\\approver");

    assertThat(result.success()).isTrue();
    verify(approvalEligibilityService).evaluate(1000456L);
  }

  @Test
  void updateStatusShouldRejectApprovalWhenLegacyReadinessGateFails() {
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
        serviceAt("2026-07-11T19:00:00Z")
            .updateStatus(
                1000456L,
                new FederalApplicationService.FederalStatusMutationRequest("APP", null),
                "idir\\approver");

    assertThat(result.success()).isFalse();
    assertThat(result.errors())
        .containsExactly(
            "Applications linked to an exemption cannot be approved.",
            "Applications linked to a permit cannot be approved.");
    verify(approvalEligibilityService).evaluate(1000456L);
    verifyNoInteractions(applicationReviewRepository);
  }

  @Test
  void updateStatusShouldRejectSameTerminalAndForgedSourceTransitions() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(federalContext("APP", LocalDate.of(2026, 7, 11))),
            Optional.of(federalContext("NEW", LocalDate.of(2026, 7, 11))),
            Optional.of(federalContext("REJ", LocalDate.of(2026, 7, 11))));
    FederalApplicationOracleService fixedService = serviceAt("2026-07-11T19:00:00Z");

    FederalApplicationService.FederalMutationResult sameStatus =
        fixedService.updateStatus(
            1000456L,
            new FederalApplicationService.FederalStatusMutationRequest("APP", null),
            "idir\\approver");
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

    assertThat(sameStatus.success()).isFalse();
    assertThat(sameStatus.errors()).containsExactly(
        "Federal applications can only be approved from NEW or PND.");
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
    verifyNoInteractions(repository, permitRepository, applicationDetailsRepository, applicationReviewRepository);
  }

  @Test
  void updateRemarkShouldRejectRemarkFromAnotherApplication() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarkByNumberRequired(44L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000999L, "Other note", "idir\\reviewer", Instant.EPOCH)));

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
    when(applicationDetailsRepository.findRemarkByNumberRequired(44L))
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
  void updateRemarkShouldFailClosedWhenRemarkLookupFails() {
    when(repository.findMutationContextRequired(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationRepository.FederalMutationContextRow(
                    1000456L, LocalDate.of(2026, 3, 1), 76L, "00077881", "00")));
    when(applicationDetailsRepository.findRemarkByNumberRequired(44L))
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
        "Federal",
        "EX-300",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 26),
        true,
        false);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
  }

  private void stubValidPermitCodes() {
    when(permitRepository.countryCodeExistsRequired("US")).thenReturn(true);
    when(permitRepository.portOfExportCodeExistsRequired("VA")).thenReturn(true);
    when(permitRepository.transportTypeCodeExistsRequired("S")).thenReturn(true);
  }

  private FederalApplicationService.FederalPermitMutationRequest validPermitRequest() {
    return new FederalApplicationService.FederalPermitMutationRequest(
        null,
        LocalDate.of(2026, 7, 10),
        "US",
        "S",
        "Carrier",
        LocalDate.of(2026, 7, 15),
        "VA",
        null);
  }

  private FederalApplicationService.FederalPermitMutationRequest validUpdatePermitRequest() {
    return new FederalApplicationService.FederalPermitMutationRequest(
        9001L,
        LocalDate.of(2026, 7, 10),
        "US",
        "S",
        "Carrier",
        LocalDate.of(2026, 7, 15),
        "VA",
        null);
  }

  private FederalApplicationPermitDto validFederalPermit() {
    return new FederalApplicationPermitDto(
        9001L,
        LocalDate.of(2026, 7, 10),
        "US",
        "S",
        "Carrier",
        LocalDate.of(2026, 7, 15),
        "VA",
        null);
  }

  private FederalPermitDetailRepository.FederalPermitDetailRow insertedFederalPermit() {
    return new FederalPermitDetailRepository.FederalPermitDetailRow(
        9001L,
        LocalDate.of(2026, 7, 10),
        LocalDate.of(2026, 7, 15),
        "US",
        "S",
        "Carrier",
        "VA",
        null,
        LocalDate.of(2026, 2, 20),
        1909L,
        "00",
        "00077881");
  }

  private ApplicationDetailsRpcRepository.PackageMutationRow packageMutationRow(
      Long federalPermitNumber) {
    return packageMutationRow("PKG-901", 1000456L, federalPermitNumber);
  }

  private ApplicationDetailsRpcRepository.PackageMutationRow packageMutationRow(
      Long applicationNumber, Long federalPermitNumber) {
    return packageMutationRow("PKG-901", applicationNumber, federalPermitNumber);
  }

  private ApplicationDetailsRpcRepository.PackageMutationRow packageMutationRow(
      String packageNumber, Long applicationNumber, Long federalPermitNumber) {
    return new ApplicationDetailsRpcRepository.PackageMutationRow(
        packageNumber,
        applicationNumber,
        null,
        10.0,
        null,
        null,
        null,
        null,
        federalPermitNumber,
        null,
        "ACT",
        null,
        null,
        "idir\\creator",
        Instant.EPOCH);
  }

  private FederalApplicationOracleService serviceAt(String instant) {
    return new FederalApplicationOracleService(
        repository,
        permitRepository,
        applicationDetailsRepository,
        applicationDetailsService,
        applicationReviewRepository,
        approvalEligibilityService,
        clientLookupService,
        editLockService,
        Clock.fixed(Instant.parse(instant), LexisBusinessTime.ZONE));
  }

  private FederalApplicationService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    return (FederalApplicationService) proxyFactory.getProxy();
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

  private static final class RecordingTransactionManager
      extends AbstractPlatformTransactionManager {

    private int commits;
    private int rollbacks;

    @Override
    protected Object doGetTransaction() {
      return new Object();
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
      // Nothing to enlist for this transaction-boundary test.
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
      commits++;
    }

    @Override
    protected void doRollback(DefaultTransactionStatus status) {
      rollbacks++;
    }
  }
}

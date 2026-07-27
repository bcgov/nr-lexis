package ca.bc.gov.mof.lexis.service.offer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchCriteria;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferSearchResultDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import ca.bc.gov.mof.lexis.repository.offer.PurchaseOfferRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationNotificationRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | PurchaseOfferOracleService")
class PurchaseOfferOracleServiceTest {

  @Mock private PurchaseOfferRepository repository;
  @Mock private ApplicationNotificationRecipientResolver clientEmailResolver;
  @Mock private EmailNotificationService notificationService;
  @Mock private RegionalMailRecipientResolver regionalRecipientResolver;
  @Mock private PermitRpcRepository permitRepository;
  private PurchaseOfferOracleService service;

  @BeforeEach
  void setUp() {
    Clock clock =
        Clock.fixed(Instant.parse("2026-03-11T06:30:00Z"), LexisBusinessTime.ZONE);
    service =
        new PurchaseOfferOracleService(
            repository,
            clientEmailResolver,
            notificationService,
            regionalRecipientResolver,
            permitRepository,
            clock);
    org.mockito.Mockito.lenient()
        .when(
            regionalRecipientResolver.resolveGroupForRoute(
                org.mockito.ArgumentMatchers.nullable(RegionalMailRoute.class)))
        .thenAnswer(
            invocation ->
                new RegionalMailRecipientResolver.RecipientGroup(
                    invocation.getArgument(0, RegionalMailRoute.class), List.of()));
  }

  @Test
  void searchOptionsShouldReturnRepositoryValues() {
    when(repository.loadRegionOptions()).thenReturn(List.of(new CodeNameDto("12", "Coast")));

    PurchaseOfferSearchOptionsDto response = service.searchOptions();

    assertThat(response.regions()).hasSize(1);
  }

  @Test
  void searchShouldReturnOfferingClientOnlyRowsWithinScopedAccess() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "00077881",
            false,
            false,
            List.of(),
            null,
            0,
            25);
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(List.of(row(81001L, LocalDate.of(2026, 2, 1))), 1));

    PurchaseOfferSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(1);
    assertThat(response.results()).extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(81001L);
    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().clientNumber()).isNull();
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00077881");
  }

  @Test
  void searchShouldReturnRepositoryPage() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null, null, null, null, null, null, null, List.of(12L), null, 1, 2);
    List<PurchaseOfferSearchResultDto> rows =
        List.of(
            row(81003L, LocalDate.of(2026, 2, 3)),
            row(81004L, LocalDate.of(2026, 2, 4)));
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(rows, 4));

    PurchaseOfferSearchResponseDto response = service.search(criteria);

    assertThat(response.total()).isEqualTo(4);
    assertThat(response.page()).isEqualTo(1);
    assertThat(response.size()).isEqualTo(2);
    assertThat(response.results()).extracting(PurchaseOfferSearchResultDto::offerNumber)
        .containsExactly(81003L, 81004L);
  }

  @Test
  void searchShouldNormalizeIndependentClientAndAccessCriteriaBeforeRepositoryCall() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            " 1000456 ",
            " pkg-903 ",
            null,
            null,
            null,
            null,
            " 00077881 ",
            " 00088999 ",
            " 00055667 ",
            false,
            false,
            Arrays.asList(12L, null, 12L, -1L, 0L),
            " offerNumber DESC ",
            -3,
            0);
    when(repository.search(any(PurchaseOfferSearchCriteria.class)))
        .thenReturn(page(List.of(), 0));

    service.search(criteria);

    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(repository).search(criteriaCaptor.capture());

    PurchaseOfferSearchCriteria normalized = criteriaCaptor.getValue();
    assertThat(normalized.applicationNumber()).isEqualTo("1000456");
    assertThat(normalized.packageNumber()).isEqualTo("pkg-903");
    assertThat(normalized.clientNumber()).isEqualTo("00077881");
    assertThat(normalized.offeringClientNumber()).isEqualTo("00088999");
    assertThat(normalized.accessClientNumber()).isEqualTo("00055667");
    assertThat(normalized.regionNumbers()).containsExactly(12L);
    assertThat(normalized.sortField()).isEqualTo("offerNumber DESC");
    assertThat(normalized.page()).isZero();
    assertThat(normalized.size()).isEqualTo(1);
  }

  @Test
  void countShouldPreserveNormalizedScopedAccessCriterion() {
    PurchaseOfferSearchCriteria criteria =
        new PurchaseOfferSearchCriteria(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            " 00055667 ",
            false,
            false,
            List.of(),
            null,
            0,
            1);
    when(repository.count(any(PurchaseOfferSearchCriteria.class))).thenReturn(4);

    int result = service.count(criteria);

    assertThat(result).isEqualTo(4);
    ArgumentCaptor<PurchaseOfferSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(PurchaseOfferSearchCriteria.class);
    verify(repository).count(criteriaCaptor.capture());
    assertThat(criteriaCaptor.getValue().clientNumber()).isNull();
    assertThat(criteriaCaptor.getValue().accessClientNumber()).isEqualTo("00055667");
  }

  @Test
  void detailShouldPassThroughRepository() {
    PurchaseOfferDetailDto dto =
        new PurchaseOfferDetailDto(
            81009L,
            1000456L,
            "PKG-903",
            null,
            null,
            "Example Lumber",
            "Sample Contact",
            12500.25,
            LocalDate.of(2026, 3, 2),
            null,
            LocalDate.of(2026, 3, 18),
            "N",
            "Y",
            "N",
            "Initial offer",
            null,
            "P",
            "Mill details",
            "00077881",
            "Port Moody",
            "Condition notes",
            LocalDate.of(2026, 2, 26),
            LocalDate.of(2026, 3, 19),
            90.0,
            "R2");
    when(repository.findByOfferNumber(81009L)).thenReturn(Optional.of(dto));

    Optional<PurchaseOfferDetailDto> result = service.findByOfferNumber(81009L);

    assertThat(result).contains(dto);
    verify(repository).findByOfferNumber(81009L);
  }

  @Test
  void detailShouldReturnEmptyForInvalidOfferNumber() {
    assertThat(service.findByOfferNumber(0L)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void addOfferShouldReturnValidationErrorsBeforeOracleInsert() {
    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                null, null, null, null, null, 0.0d, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "A valid application number is required.",
            "A valid company name is required.",
            "A valid contact name is required.",
            "The purchase offer amount must be greater than 0",
            "A valid pickup location is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addOfferShouldSetCreateLifecycleFieldsServerSide() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                "No Packages",
                " Example Lumber ",
                " Sample Contact ",
                99_999.99d,
                LocalDate.of(1999, 1, 1),
                LocalDate.of(2026, 3, 12),
                LocalDate.of(2026, 3, 18),
                null,
                null,
                " Initial offer ",
                null,
                " forged withdrawal ",
                null,
                null,
                " 00077881 ",
                " Port Moody ",
                " Condition notes ",
                9_999_999.99d),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The purchase offer was saved successfully.");
    assertThat(response.applicationNumber()).isEqualTo(1000456L);
    assertThat(response.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(response.sendEmail()).isTrue();
    assertThat(response.update()).isFalse();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferInsertRecord.class);
    verify(repository).insertOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferInsertRecord record = recordCaptor.getValue();
    assertThat(record.packageNumber()).isNull();
    assertThat(record.companyName()).isEqualTo("Example Lumber");
    assertThat(record.contactName()).isEqualTo("Sample Contact");
    assertThat(record.purchaseOfferAmount()).isEqualTo(99_999.99d);
    assertThat(record.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 10));
    assertThat(record.offerWithdrawalDate()).isNull();
    assertThat(record.withdrawReason()).isNull();
    assertThat(record.fairOfferIndicator()).isEqualTo("N");
    assertThat(record.validOfferIndicator()).isEqualTo("Y");
    assertThat(record.approvalIndicator()).isEqualTo("N");
    assertThat(record.exportJurisdictionCode()).isEqualTo("P");
    assertThat(record.manufacturingFacilityInfo()).isEqualTo(" ");
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.applicationNumber()).isEqualTo(1000456L);
    assertThat(record.offerVolume()).isEqualTo(9_999_999.99d);
  }

  @Test
  void addOfferShouldRejectOracleStorageViolationsBeforeInsert() {
    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                null,
                "Québec Lumber",
                "C".repeat(121),
                100_000.001d,
                null,
                null,
                null,
                "N",
                "Y",
                "R".repeat(255),
                "N",
                null,
                "P",
                "M".repeat(501),
                "00077881",
                "Montréal",
                "O".repeat(255),
                9_999_999.999d),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Company name must contain ASCII characters only",
            "Contact name must be 120 ASCII characters or fewer",
            "Purchase offer amount must be 99999.99 or less",
            "Purchase offer amount must have no more than 2 decimal places",
            "Offer remarks must be 254 ASCII characters or fewer",
            "Manufacturing facility information must be 500 ASCII characters or fewer",
            "Pickup location must contain ASCII characters only",
            "Offer conditions must be 254 ASCII characters or fewer",
            "Offer volume must be 9999999.99 or less",
            "Offer volume must have no more than 2 decimal places");
    verifyNoInteractions(repository);
  }

  @Test
  void addOfferShouldRejectNonFiniteNumbersBeforeInsert() {
    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                null,
                "Example Lumber",
                "Sample Contact",
                Double.NaN,
                null,
                null,
                null,
                "N",
                "Y",
                null,
                "N",
                null,
                "P",
                null,
                "00077881",
                "Port Moody",
                null,
                Double.POSITIVE_INFINITY),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The purchase offer amount must be a finite number",
            "Offer volume must be a finite number");
    verifyNoInteractions(repository);
  }

  @Test
  void addOfferShouldRollBackWhenInsertReturnsMalformedRow() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(null)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PurchaseOfferService.CreateOfferResult response =
        transactionalService(transactionManager)
            .addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.exportPurchaseOfferNumber()).isNull();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verifyNoInteractions(clientEmailResolver, notificationService);
  }

  @Test
  void addOfferShouldSendLegacyEquivalentClientNotification() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.clientHasEmail()).isTrue();
    assertThat(response.toEmails()).isEqualTo("client@example.com");
    assertThat(response.warnings())
        .containsExactly(
            "Offer saved and applicant email sent, but no ministry regional recipient was configured.");
    ArgumentCaptor<WorkflowEmailEvent> eventCaptor =
        ArgumentCaptor.forClass(WorkflowEmailEvent.class);
    verify(notificationService).publish(eventCaptor.capture());
    assertThat(eventCaptor.getValue())
        .isEqualTo(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "client@example.com",
                List.of(),
                "REGION_RCO"));
    assertThat(eventCaptor.getValue().senderRoute()).isEqualTo(RegionalMailRoute.GENERAL);
    verify(clientEmailResolver)
        .resolve(1000456L, "O", "00077881", "00", null, null);
  }

  @Test
  void addOfferShouldCopyThePersistedApplicationsRegionalMailbox() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    when(regionalRecipientResolver.resolveGroupForRoute(RegionalMailRoute.RCO))
        .thenReturn(
            new RegionalMailRecipientResolver.RecipientGroup(
                RegionalMailRoute.RCO, List.of("coast.review@gov.bc.ca")));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings()).isEmpty();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "client@example.com",
                List.of("coast.review@gov.bc.ca"),
                "REGION_RCO"));
  }

  @Test
  void addOfferShouldRetainRegionalRouteForNonProductionInterception() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    when(regionalRecipientResolver.resolveGroupForRoute(RegionalMailRoute.RCO))
        .thenReturn(new RegionalMailRecipientResolver.RecipientGroup(RegionalMailRoute.RCO, List.of()));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings())
        .containsExactly(
            "Offer saved and applicant email sent, but no ministry regional recipient was configured.");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "client@example.com",
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void addOfferShouldApplyTheLegacySkeenaGradePriorityToTheCopiedMailbox() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1908L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    when(permitRepository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetail("PKG-903", "1A")));
    when(regionalRecipientResolver.resolveGroupForRoute(RegionalMailRoute.RCO))
        .thenReturn(
            new RegionalMailRecipientResolver.RecipientGroup(
                RegionalMailRoute.RCO, List.of("coast@example.com")));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-903"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings()).isEmpty();
    verify(permitRepository).findScaleDetailsByPackageNumber("PKG-903");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "client@example.com",
                List.of("coast@example.com"),
                "REGION_RCO"));
  }

  @Test
  void addOfferShouldCopyRniForANumericSkeenaScaleGrade() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1908L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    when(permitRepository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetail("PKG-903", "1")));
    when(regionalRecipientResolver.resolveGroupForRoute(RegionalMailRoute.RNI))
        .thenReturn(
            new RegionalMailRecipientResolver.RecipientGroup(
                RegionalMailRoute.RNI, List.of("northern@example.com")));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-903"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings()).isEmpty();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "client@example.com",
                List.of("northern@example.com"),
                "REGION_RNI"));
  }

  @Test
  void addOfferShouldWarnWithoutQueuingWhenSkeenaGradesDoNotDetermineARoute() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1908L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));
    when(permitRepository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetail("PKG-903", "Z")));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-903"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.clientHasEmail()).isFalse();
    assertThat(response.warnings())
        .containsExactly("Offer saved, but notification recipients could not be resolved.");
    verifyNoInteractions(notificationService);
  }

  @Test
  void addOfferShouldResolveAgentRecipientForAgentApplications() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "A", "00011111", "01", "00077881", "02", 1834L)));
    when(clientEmailResolver.resolve(
            1000456L, "A", "00011111", "01", "00077881", "02"))
        .thenReturn(Optional.of("agent@example.com"));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.clientHasEmail()).isTrue();
    assertThat(response.toEmails()).isEqualTo("agent@example.com");
    verify(clientEmailResolver)
        .resolve(1000456L, "A", "00011111", "01", "00077881", "02");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.NEW,
                "agent@example.com",
                List.of(),
                "REGION_RSI"));
  }

  @Test
  void addOfferShouldWarnWhenApplicationHasNoRecipient() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L)).thenReturn(Optional.empty());

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.clientHasEmail()).isFalse();
    assertThat(response.toEmails()).isNull();
    assertThat(response.warnings())
        .containsExactly("Offer saved, but no client email address was found.");
    verifyNoInteractions(clientEmailResolver, notificationService);
  }

  @Test
  void addOfferShouldWarnWhenAuthoritativeResolverRejectsInvalidEmail() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.empty());

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.clientHasEmail()).isFalse();
    assertThat(response.warnings())
        .containsExactly("Offer saved, but no client email address was found.");
    verifyNoInteractions(notificationService);
  }

  @Test
  void addOfferShouldCommitAndWarnWhenAuthoritativeResolverIsUnavailable() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenThrow(failure);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PurchaseOfferService.CreateOfferResult response =
        transactionalService(transactionManager)
            .addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings())
        .containsExactly("Offer saved, but notification recipients could not be resolved.");
    assertThat(transactionManager.commits).isEqualTo(1);
    assertThat(transactionManager.rollbacks).isZero();
    verifyNoInteractions(notificationService);
  }

  @Test
  void addOfferShouldWarnWhenApplicationRecipientLookupIsUnavailable() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("application recipient unavailable");
    when(repository.findApplicationRecipient(1000456L)).thenThrow(failure);

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.warnings())
        .containsExactly("Offer saved, but notification recipients could not be resolved.");
    verifyNoInteractions(clientEmailResolver, notificationService);
  }

  @Test
  void addOfferShouldRejectMissingApplicationBeforeOracleInsert() {
    when(repository.findApplicationReference(2L)).thenReturn(Optional.empty());

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(2L, null), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Application 2 does not exist.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldRejectUnknownPackageBeforeOracleInsert() {
    stubProvincialApplication(1000456L);
    when(repository.findPackageApplicationNumber("PKG-404")).thenReturn(Optional.empty());

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-404"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Package PKG-404 does not exist.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldRejectPackageForDifferentApplicationBeforeOracleInsert() {
    stubProvincialApplication(1000456L);
    when(repository.findPackageApplicationNumber("PKG-903")).thenReturn(Optional.of(1000457L));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, "PKG-903"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Package PKG-903 does not belong to application 1000456.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldRejectNonProvincialParentBeforeOracleInsert() {
    when(repository.findApplicationReference(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationReferenceRow(1000456L, "F")));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(validCreateRequest(1000456L, null), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application 1000456 does not have a valid jurisdiction to accept offers.");
    verify(repository, never()).insertOffer(any());
  }

  @Test
  void addOfferShouldIgnoreForgedJurisdictionAndPersistProvincial() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));
    PurchaseOfferService.CreateOfferRequest request =
        new PurchaseOfferService.CreateOfferRequest(
            1000456L,
            null,
            null,
            "Example Lumber",
            "Sample Contact",
            12500.25d,
            LocalDate.of(2026, 3, 2),
            null,
            null,
            "N",
            "Y",
            null,
            "N",
            null,
            "F",
            " ",
            "00077881",
            "Port Moody",
            null,
            null);

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(request, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferInsertRecord> captor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferInsertRecord.class);
    verify(repository).insertOffer(captor.capture());
    assertThat(captor.getValue().exportJurisdictionCode()).isEqualTo("P");
  }

  @Test
  void addOfferShouldDefaultEntryUserWhenPrincipalIsMissing() {
    stubProvincialApplication(1000456L);
    when(repository.insertOffer(any(PurchaseOfferRepository.PurchaseOfferInsertRecord.class)))
        .thenReturn(Optional.of(new PurchaseOfferRepository.PurchaseOfferInsertRow(81001L)));

    PurchaseOfferService.CreateOfferResult response =
        service.addOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                null,
                "No Packages",
                "Example Lumber",
                "Sample Contact",
                12500.25d,
                LocalDate.of(2026, 3, 2),
                null,
                LocalDate.of(2026, 3, 18),
                null,
                null,
                "Initial offer",
                null,
                null,
                null,
                null,
                "00077881",
                "Port Moody",
                "Condition notes",
                99.99d),
            null);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferInsertRecord.class);
    verify(repository).insertOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("system");
  }

  @Test
  void updateOfferShouldRejectMissingOfferNumberBeforeOracleLookup() {
    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.update()).isTrue();
    assertThat(response.errors()).containsExactly("A valid purchase offer number is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void updateOfferShouldRejectOracleStorageViolationsBeforeUpdate() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, null, "P")));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                "Québec Lumber",
                "C".repeat(121),
                100_000.0d,
                null,
                LocalDate.of(2026, 3, 10),
                null,
                null,
                null,
                "Résumé",
                null,
                "W".repeat(255),
                null,
                "M".repeat(501),
                null,
                "P".repeat(251),
                "Condition é",
                1.234d),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Company name must contain ASCII characters only",
            "Contact name must be 120 ASCII characters or fewer",
            "Purchase offer amount must be 99999.99 or less",
            "Offer remarks must contain ASCII characters only",
            "Withdraw reason must be 254 ASCII characters or fewer",
            "Manufacturing facility information must be 500 ASCII characters or fewer",
            "Pickup location must be 250 ASCII characters or fewer",
            "Offer conditions must contain ASCII characters only",
            "Offer volume must have no more than 2 decimal places");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldAllowReceivedDateExactlySevenDaysOld() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSourceWithReceivedDate(LocalDate.of(2026, 3, 4))));
    stubProvincialApplication(1000456L);
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            updateRequestWithReceivedDate(LocalDate.of(2026, 3, 3)), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> captor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(captor.capture());
    assertThat(captor.getValue().purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 3));
  }

  @Test
  void updateOfferShouldRejectReceivedDateMoreThanSevenDaysOld() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSourceWithReceivedDate(LocalDate.of(2026, 3, 4))));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            updateRequestWithReceivedDate(LocalDate.of(2026, 3, 2)), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Offer Received Date can't be before 7 days from now.");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldRejectFutureReceivedDate() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSourceWithReceivedDate(LocalDate.of(2026, 3, 4))));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            updateRequestWithReceivedDate(LocalDate.of(2026, 3, 11)), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Offer Received Date can't be in the future.");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldNotRevalidateUnchangedHistoricalReceivedDate() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSourceWithReceivedDate(LocalDate.of(2026, 2, 1))));
    stubProvincialApplication(1000456L);
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            updateRequestWithReceivedDate(LocalDate.of(2026, 2, 1)), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).updateOffer(any());
  }

  @Test
  void updateOfferShouldRejectApplicationReparentBeforeOracleUpdate() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, null, "P")));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000457L, 81001L, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A purchase offer cannot be moved to a different application.");
    verify(repository, never()).updateOffer(any());
    verifyNoInteractions(notificationService);
  }

  @Test
  void updateOfferShouldRejectAddingPackageToOfferCreatedWithoutOne() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, null, "P")));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, 81001L, "PKG-904", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A package cannot be added to an offer that was created without one.");
    verify(repository, never()).findPackageApplicationNumber(any());
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldRejectForgedJurisdictionBeforeOracleUpdate() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, null, "P")));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, 81001L, null, null, null, null, null, null, null, null, null,
                null, null, null, "F", null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A purchase offer cannot be moved to a different jurisdiction.");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldRejectReplacementPackageForDifferentApplication() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, "PKG-903", "P")));
    stubProvincialApplication(1000456L);
    when(repository.findPackageApplicationNumber("PKG-904"))
        .thenReturn(Optional.of(1000457L));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, 81001L, "PKG-904", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Package PKG-904 does not belong to application 1000456.");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldAllowReplacementPackageForCurrentApplication() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, "PKG-903", "P")));
    stubProvincialApplicationWithPackage(1000456L, "PKG-904");
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L, 81001L, "PKG-904", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> captor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(captor.capture());
    assertThat(captor.getValue().packageNumber()).isEqualTo("PKG-904");
    assertThat(captor.getValue().exportJurisdictionCode()).isEqualTo("P");
  }

  @Test
  void updateOfferShouldPersistLegacyNotifiedFieldsAndQueueUpdatedNotification() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Sample Contact",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                13000.0d,
                LocalDate.of(2026, 3, 3),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                " Campbell River ",
                null,
                99.99d),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.update()).isTrue();
    assertThat(response.sendEmail()).isTrue();
    assertThat(response.exportPurchaseOfferNumber()).isEqualTo(81001L);

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferUpdateRecord record = recordCaptor.getValue();
    assertThat(record.exportPurchaseOfferNumber()).isEqualTo(81001L);
    assertThat(record.companyName()).isEqualTo("Example Lumber");
    assertThat(record.contactName()).isEqualTo("Sample Contact");
    assertThat(record.purchaseOfferAmount()).isEqualTo(13000.0d);
    assertThat(record.purchaseOfferDate()).isEqualTo(LocalDate.of(2026, 3, 3));
    assertThat(record.offerWithdrawalDate()).isNull();
    assertThat(record.fairOfferIndicator()).isEqualTo("Y");
    assertThat(record.validOfferIndicator()).isEqualTo("Y");
    assertThat(record.approvalIndicator()).isEqualTo("Y");
    assertThat(record.exportJurisdictionCode()).isEqualTo("P");
    assertThat(record.manufacturingFacilityInfo()).isEqualTo("Existing mill");
    assertThat(record.pickupLocation()).isEqualTo("Campbell River");
    assertThat(record.offerCondition()).isEqualTo("Existing condition");
    assertThat(record.entryUserId()).isEqualTo("creator");
    assertThat(record.entryTimestamp()).isEqualTo(entryTimestamp);
    assertThat(record.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.offerVolume()).isEqualTo(99.99d);
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.UPDATED,
                "client@example.com",
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void updateOfferShouldPersistInternalFieldsWithoutApplicantNotification() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Sample Contact",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "N",
                    "Y",
                    "Existing remark",
                    "N",
                    null,
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                "Updated Lumber",
                "Updated Contact",
                null,
                null,
                null,
                LocalDate.of(2026, 3, 19),
                "Y",
                "N",
                "Updated internal remark",
                "Y",
                null,
                null,
                null,
                null,
                null,
                null,
                null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.sendEmail()).isFalse();
    assertThat(response.clientHasEmail()).isFalse();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferUpdateRecord record = recordCaptor.getValue();
    assertThat(record.fairOfferIndicator()).isEqualTo("Y");
    assertThat(record.validOfferIndicator()).isEqualTo("N");
    assertThat(record.approvalIndicator()).isEqualTo("Y");
    assertThat(record.companyName()).isEqualTo("Updated Lumber");
    assertThat(record.contactName()).isEqualTo("Updated Contact");
    assertThat(record.teacReviewDate()).isEqualTo(LocalDate.of(2026, 3, 19));
    assertThat(record.offerRemark()).isEqualTo("Updated internal remark");
    verifyNoInteractions(clientEmailResolver, notificationService);
  }

  @Test
  void updateOfferShouldNotNotifyForCaseOnlyOrBlankTextChanges() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, "PKG-903", "P")));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "   ",
                null,
                null,
                null,
                "port moody",
                "EXISTING CONDITION",
                null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.sendEmail()).isFalse();
    verify(repository).updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class));
    verifyNoInteractions(clientEmailResolver, notificationService);
  }

  @Test
  void updateOfferSnapshotShouldClearOptionalValuesAndQueueUpdatedNotification() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Sample Contact",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    LocalDate.of(2026, 3, 10),
                    LocalDate.of(2026, 3, 18),
                    "N",
                    "Y",
                    "Existing remark",
                    "N",
                    "Withdrawn by buyer",
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    Instant.parse("2026-03-01T18:00:00Z"),
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOfferSnapshot(
            new PurchaseOfferService.UpdateOfferRequest(
                1000456L,
                81001L,
                "PKG-903",
                "Example Lumber",
                "Sample Contact",
                12500.25d,
                LocalDate.of(2026, 3, 2),
                null,
                null,
                "N",
                "Y",
                null,
                "N",
                null,
                null,
                null,
                "00077881",
                "Port Moody",
                null,
                null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.sendEmail()).isTrue();
    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    PurchaseOfferRepository.PurchaseOfferUpdateRecord record = recordCaptor.getValue();
    assertThat(record.offerWithdrawalDate()).isNull();
    assertThat(record.withdrawReason()).isNull();
    assertThat(record.teacReviewDate()).isNull();
    assertThat(record.offerRemark()).isNull();
    assertThat(record.offerCondition()).isNull();
    assertThat(record.offerVolume()).isNull();
    assertThat(record.exportJurisdictionCode()).isEqualTo("P");
    assertThat(record.manufacturingFacilityInfo()).isEqualTo("Existing mill");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.UPDATED,
                "client@example.com",
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void updateOfferSnapshotShouldQueueWithdrawnNotificationForNewWithdrawalDate() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, "PKG-903", "P")));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationRecipient(1000456L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationRecipientRow(
                    "O", "00077881", "00", null, null, 1835L)));
    when(clientEmailResolver.resolve(1000456L, "O", "00077881", "00", null, null))
        .thenReturn(Optional.of("client@example.com"));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOfferSnapshot(
            new PurchaseOfferService.UpdateOfferRequest(
                1000456L,
                81001L,
                "PKG-903",
                "Example Lumber",
                "Sample Contact",
                12500.25d,
                LocalDate.of(2026, 3, 2),
                LocalDate.of(2026, 3, 10),
                LocalDate.of(2026, 3, 18),
                "N",
                "Y",
                "Existing remark",
                "N",
                "Withdrawn by buyer",
                "P",
                "Existing mill",
                "00077881",
                "Port Moody",
                "Existing condition",
                95.5d),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.sendEmail()).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.PurchaseOffer(
                1000456L,
                81001L,
                WorkflowEmailEvent.OfferAction.WITHDRAWN,
                "client@example.com",
                List.of(),
                "REGION_RCO"));
  }

  @Test
  void updateOfferSnapshotShouldValidateRequiredValuesInsteadOfMergingCurrentValues() {
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(Optional.of(updateSource(1000456L, null, "P")));

    PurchaseOfferService.CreateOfferResult response =
        service.updateOfferSnapshot(
            new PurchaseOfferService.UpdateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "A valid company name is required.",
            "A valid contact name is required.",
            "The purchase offer amount must be greater than 0",
            "A valid purchase offer date is required.",
            "A valid pickup location is required.",
            "A valid fair offer indicator is required.");
    verify(repository, never()).updateOffer(any());
  }

  @Test
  void updateOfferShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Sample Contact",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    "Existing mill",
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                13000.0d,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Campbell River",
                null,
                99.99d),
            null);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("creator");
    assertThat(recordCaptor.getValue().updateUserId()).isEqualTo("system");
  }

  @Test
  void updateOfferShouldDefaultMissingManufacturingFacilityBeforeOracleUpdate() {
    stubProvincialApplicationWithPackage(1000456L, "PKG-903");
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    when(repository.findUpdateSourceByOfferNumber(81001L))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
                    81001L,
                    1000456L,
                    "PKG-903",
                    "Example Lumber",
                    "Sample Contact",
                    12500.25d,
                    LocalDate.of(2026, 3, 2),
                    null,
                    LocalDate.of(2026, 3, 18),
                    "Y",
                    "Y",
                    "Existing remark",
                    "Y",
                    null,
                    "P",
                    null,
                    "Port Moody",
                    "Existing condition",
                    "creator",
                    entryTimestamp,
                    95.5d)));
    when(repository.updateOffer(any(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class)))
        .thenReturn(true);

    PurchaseOfferService.CreateOfferResult response =
        service.updateOffer(
            new PurchaseOfferService.CreateOfferRequest(
                1000456L,
                81001L,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "   ",
                null,
                null,
                null,
                null),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();

    ArgumentCaptor<PurchaseOfferRepository.PurchaseOfferUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(PurchaseOfferRepository.PurchaseOfferUpdateRecord.class);
    verify(repository).updateOffer(recordCaptor.capture());
    assertThat(recordCaptor.getValue().manufacturingFacilityInfo()).isEqualTo(" ");
  }

  private PurchaseOfferSearchResultDto row(Long offerNumber, LocalDate listingDate) {
    return new PurchaseOfferSearchResultDto(
        offerNumber,
        1000456L,
        "PKG-903",
        listingDate,
        "R2",
        LocalDate.of(2026, 3, 15));
  }

  private PurchaseOfferService.CreateOfferRequest validCreateRequest(
      Long applicationNumber, String packageNumber) {
    return new PurchaseOfferService.CreateOfferRequest(
        applicationNumber,
        null,
        packageNumber,
        "Example Lumber",
        "Sample Contact",
        12500.25d,
        LocalDate.of(2026, 3, 2),
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "00077881",
        "Port Moody",
        null,
        null);
  }

  private PermitRpcRepository.PermitScaleDetailRow scaleDetail(
      String packageNumber, String gradeCode) {
    return new PermitRpcRepository.PermitScaleDetailRow(
        "scale-1",
        "TM-1",
        "SP",
        gradeCode,
        1.0d,
        1L,
        1000456L,
        "permit-detail-1",
        packageNumber,
        null,
        null,
        null,
        null);
  }

  private void stubProvincialApplication(Long applicationNumber) {
    when(repository.findApplicationReference(applicationNumber))
        .thenReturn(
            Optional.of(
                new PurchaseOfferRepository.ApplicationReferenceRow(
                    applicationNumber, "P")));
  }

  private void stubProvincialApplicationWithPackage(
      Long applicationNumber, String packageNumber) {
    stubProvincialApplication(applicationNumber);
    when(repository.findPackageApplicationNumber(packageNumber))
        .thenReturn(Optional.of(applicationNumber));
  }

  private PurchaseOfferService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    return (PurchaseOfferService) proxyFactory.getProxy();
  }

  private PurchaseOfferRepository.PurchaseOfferUpdateSourceRow updateSource(
      Long applicationNumber, String packageNumber, String jurisdictionCode) {
    return new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
        81001L,
        applicationNumber,
        packageNumber,
        "Example Lumber",
        "Sample Contact",
        12500.25d,
        LocalDate.of(2026, 3, 2),
        null,
        LocalDate.of(2026, 3, 18),
        "N",
        "Y",
        "Existing remark",
        "N",
        null,
        jurisdictionCode,
        "Existing mill",
        "Port Moody",
        "Existing condition",
        "creator",
        Instant.parse("2026-03-01T18:00:00Z"),
        95.5d);
  }

  private PurchaseOfferRepository.PurchaseOfferUpdateSourceRow updateSourceWithReceivedDate(
      LocalDate receivedDate) {
    PurchaseOfferRepository.PurchaseOfferUpdateSourceRow source =
        updateSource(1000456L, null, "P");
    return new PurchaseOfferRepository.PurchaseOfferUpdateSourceRow(
        source.exportPurchaseOfferNumber(),
        source.applicationNumber(),
        source.packageNumber(),
        source.companyName(),
        source.contactName(),
        source.purchaseOfferAmount(),
        receivedDate,
        source.offerWithdrawalDate(),
        source.teacReviewDate(),
        source.fairOfferIndicator(),
        source.validOfferIndicator(),
        source.offerRemark(),
        source.approvalIndicator(),
        source.withdrawReason(),
        source.exportJurisdictionCode(),
        source.manufacturingFacilityInfo(),
        source.pickupLocation(),
        source.offerCondition(),
        source.entryUserId(),
        source.entryTimestamp(),
        source.offerVolume());
  }

  private PurchaseOfferService.CreateOfferRequest updateRequestWithReceivedDate(
      LocalDate receivedDate) {
    return new PurchaseOfferService.CreateOfferRequest(
        1000456L,
        81001L,
        null,
        null,
        null,
        null,
        receivedDate,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private static <T> Page<T> page(List<T> content, long total) {
    return new PageImpl<>(content, PageRequest.of(0, Math.max(1, content.size())), total);
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

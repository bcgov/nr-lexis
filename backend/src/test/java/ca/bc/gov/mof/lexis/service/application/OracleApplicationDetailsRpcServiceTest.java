package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.DuplicatePackageNumberException;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleApplicationDetailsRpcService")
class OracleApplicationDetailsRpcServiceTest {

  @Mock private ApplicationDetailsRpcRepository repository;
  @Mock private ClientLookupRepository clientRepository;
  @Mock private ExemptionService exemptionService;
  @InjectMocks private OracleApplicationDetailsRpcService service;

  @BeforeEach
  void stubValidApplicationReferences() {
    org.mockito.Mockito.lenient()
        .when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    org.mockito.Mockito.lenient()
        .when(repository.isProductTypeCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isGrowthTypeCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isPackageStatusCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.findSpeciesCodeRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenAnswer(
            invocation ->
                Optional.of(
                    new ApplicationDetailsRpcRepository.CodeRow(
                        invocation.getArgument(0), invocation.getArgument(0), 1L, 1L)));
    org.mockito.Mockito.lenient()
        .when(repository.findEndUseCodeRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenAnswer(
            invocation ->
                Optional.of(
                    new ApplicationDetailsRpcRepository.CodeRow(
                        invocation.getArgument(0), invocation.getArgument(0), 1L, 1L)));
    org.mockito.Mockito.lenient()
        .when(
            repository.findCandidateExcolCodesRequired(
                org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyLong()))
        .thenAnswer(
            invocation ->
                List.of(
                    new ApplicationDetailsRpcRepository.ExcolValidationRow(
                        invocation.<String>getArgument(1)
                            + "/"
                            + invocation.<String>getArgument(2))));
    org.mockito.Mockito.lenient()
        .when(repository.isExemptionReasonCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isApplicationStatusCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isApplicantTypeCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isJurisdictionCodeValidRequired(org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(repository.isOrgUnitValidRequired(org.mockito.ArgumentMatchers.anyLong()))
        .thenReturn(true);
    org.mockito.Mockito.lenient()
        .when(
            clientRepository.findLocationByClientNumberCodeRequired(
                org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyString()))
        .thenReturn(
            Optional.of(
                new ClientLookupRepository.ClientLocationRow(
                    "00000000",
                    "01",
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
                    null)));
  }

  @Test
  void getDocumentDetailsShouldMergeApplicationAndPermitDocuments() {
    when(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.DocumentRow(
                    10L, "application-a.pdf", null, "UPLOAD")));
    when(repository.findPermitNumbersByApplicationNumber(1000456L)).thenReturn(List.of(7000123L));
    when(repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.DocumentRow(
                    20L, "permit-a.pdf", "Permit copy", "UPLOAD")));
    when(repository.findAttachmentTypeDescription("UPLOAD")).thenReturn(Optional.of("Uploaded document"));

    List<ApplicationDetailsRpcService.DocumentItem> response = service.getDocumentDetails(1000456L);

    assertThat(response).hasSize(2);
    assertThat(response.get(0).description()).isEqualTo("Not on file");
    assertThat(response.get(0).type()).isEqualTo("Uploaded document");
    assertThat(response.get(0).source()).isEqualTo("application");
    assertThat(response.get(0).sourceApplicationNumber()).isEqualTo(1000456L);
    assertThat(response.get(0).deletable()).isTrue();
    assertThat(response.get(1).name()).isEqualTo("permit-a.pdf");
    assertThat(response.get(1).source()).isEqualTo("permit");
    assertThat(response.get(1).sourcePermitNumber()).isEqualTo(7000123L);
    assertThat(response.get(1).deletable()).isFalse();
    verify(repository).findApplicationDocumentDetailsByApplicationNumber(1000456L);
    verify(repository).findPermitNumbersByApplicationNumber(1000456L);
    verify(repository).findPermitDocumentDetailsByPermitNumber(7000123L);
    verify(repository).findAttachmentTypeDescription("UPLOAD");
  }

  @Test
  void getRemarkShouldReturnEmptyForInvalidRemarkId() {
    assertThat(service.getRemark(null)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void persistRemarkShouldInsertWhenRemarkIdIsNew() {
    Instant now = Instant.parse("2026-05-27T17:30:00Z");
    when(repository.insertRemark(org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.eq("hello"), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), any(Instant.class)))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    12L, 1000456L, "hello", "idir\\jsmith", now)));

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        service.persistRemark("new", 1000456L, "hello", "idir\\jsmith");

    assertThat(response).isPresent();
    assertThat(response.get().remarkId()).isEqualTo(12L);
    assertThat(response.get().displayRemark()).isEqualTo("hello");
  }

  @Test
  void persistRemarkShouldRollBackWhenInsertReturnsNoRow() {
    when(repository.insertRemark(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("hello"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class)))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        transactionalService(transactionManager)
            .persistRemark("new", 1000456L, "hello", "idir\\jsmith");

    assertThat(response).isEmpty();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void persistRemarkShouldRollBackWhenInsertReturnsMapperZeroId() {
    when(repository.insertRemark(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("hello"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class)))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    0L, 1000456L, "hello", "idir\\jsmith", Instant.now())));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        transactionalService(transactionManager)
            .persistRemark("new", 1000456L, "hello", "idir\\jsmith");

    assertThat(response).isEmpty();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void persistRemarkShouldUpdateWhenRemarkIdExists() {
    Instant now = Instant.parse("2026-05-27T17:45:00Z");
    when(repository.updateRemark(org.mockito.ArgumentMatchers.eq(44L), org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.eq("updated"), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), any(Instant.class))).thenReturn(true);
    when(repository.findRemarkByNumberRequired(44L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, 1000456L, "updated", "idir\\jsmith", now)));

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        service.persistRemark("44", 1000456L, "updated", "idir\\jsmith");

    assertThat(response).isPresent();
    assertThat(response.get().remarkId()).isEqualTo(44L);
    verify(repository)
        .updateRemark(
            org.mockito.ArgumentMatchers.eq(44L),
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("updated"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class));
    verify(repository).findRemarkByNumberRequired(44L);
  }

  @Test
  void persistRemarkShouldRollBackWhenUpdatedRemarkCannotBeVerified() {
    when(repository.updateRemark(
            org.mockito.ArgumentMatchers.eq(44L),
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("updated"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class)))
        .thenReturn(true);
    when(repository.findRemarkByNumberRequired(44L)).thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    ApplicationDetailsRpcService transactionalService =
        (ApplicationDetailsRpcService) proxyFactory.getProxy();

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        transactionalService.persistRemark("44", 1000456L, "updated", "idir\\jsmith");

    assertThat(response).isEmpty();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void persistRemarkShouldReturnEmptyWhenApplicationInvalid() {
    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        service.persistRemark("new", null, "hello", "idir\\jsmith");

    assertThat(response).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void persistRemarkShouldRejectTextOracleCannotStoreBeforeWriting() {
    assertThat(service.persistRemark("new", 1000456L, "café", "idir\\jsmith")).isEmpty();
    assertThat(service.persistRemark("new", 1000456L, "r".repeat(255), "idir\\jsmith"))
        .isEmpty();

    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldReturnValidationErrorsBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("A valid application date is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void hiddenBlanketOicApplicationShouldStillEnforceOracleTextStorageLimits() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addHiddenBlanketOicApplication(
            withApplicationText(
                withAgentApplicant(validCreateApplicationRequest(180L)),
                "café",
                "Agent ".repeat(21),
                "Owner ".repeat(21),
                "r".repeat(255)),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Location of logs contains characters the current LEXIS database cannot store.",
            "Agent contact name must not exceed 120 bytes.",
            "Owner contact name must not exceed 120 bytes.",
            "Application remark must not exceed 254 bytes.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldIgnoreCallerControlledValidationBypass() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, false),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("A valid application date is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addHiddenBlanketOicApplicationShouldUseExplicitTrustedBypass() {
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addHiddenBlanketOicApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                180L,
                LocalDate.of(2026, 3, 1),
                9_999_999.0d,
                99.9d,
                "NA",
                null,
                null,
                null,
                "00011111",
                "01",
                "BOIC-1",
                "S",
                "EXE",
                "O",
                11L,
                "S",
                "P",
                "O",
                null,
                "No contacts on file for this location",
                "Y",
                "OT",
                List.of(),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.applicationNumber()).isEqualTo(1000456L);
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicationStatusCode()).isEqualTo("EXE");
    assertThat(recordCaptor.getValue().oicIndicator()).isEqualTo("Y");
  }

  @Test
  void addApplicationShouldRejectMissingProductLocationBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                null,
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("A valid location of logs is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldRejectOversizedClientLocationCodesBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "12345678",
                "00011111",
                "12345678",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application owner location code must be 2 characters or fewer.",
            "The application agent location code must be 2 characters or fewer.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldRejectOversizedExemptionReasonCodeBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "ALL",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("The application exemption reason code must be 1 character or fewer.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldRejectLegacyVolumeRangeBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                10_000_000.0d,
                100.0d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application volume must be less than or equal to 9999999.99.",
            "The average log volume must be less than or equal to 99.9.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldRejectLegacyVolumePrecisionBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.555d,
                2.44d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application volume must have no more than two decimal places.",
            "The average log volume must have no more than one decimal place.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldInsertWhenRequestIsValid() {
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/LU")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                9_999_999.99d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                "LU",
                List.of("FI", "HE"),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.applicationNumber()).isEqualTo(1000456L);
    assertThat(response.message()).isEqualTo("The application was saved successfully.");

    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    ApplicationDetailsRpcRepository.ApplicationInsertRecord record = recordCaptor.getValue();
    assertThat(record.applicationStatusCode()).isEqualTo("NEW");
    assertThat(record.jurisdictionCode()).isEqualTo("P");
    assertThat(record.oicIndicator()).isEqualTo("N");
    assertThat(record.applicantTypeCode()).isEqualTo("A");
    assertThat(record.agentClientNumber()).isEqualTo("00022222");
    assertThat(record.agentClientLocationCode()).isEqualTo("01");
    assertThat(record.ownerClientNumber()).isEqualTo("00011111");
    assertThat(record.ownerClientLocationCode()).isEqualTo("02");
    assertThat(record.applicationVolume()).isEqualTo(9_999_999.99d);
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    verify(clientRepository)
        .findLocationByClientNumberCodeRequired("00011111", "02");
    verify(repository).replaceApplicationEndUses(
        org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList());
  }

  @Test
  void addApplicationShouldPropagateOwnerLocationLookupFailureBeforeInsert() {
    DataAccessResourceFailureException lookupFailure =
        new DataAccessResourceFailureException("Oracle lookup failed");
    when(clientRepository.findLocationByClientNumberCodeRequired("00011111", "02"))
        .thenThrow(lookupFailure);

    assertThatThrownBy(
            () -> service.addApplication(validCreateApplicationRequest(180L), "idir\\jsmith"))
        .isSameAs(lookupFailure);

    verify(repository, never()).insertApplication(any());
  }

  @Test
  void addApplicationShouldRollBackWhenInsertReturnsMalformedRow() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(null)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.CreateApplicationResult response =
        transactionalService(transactionManager)
            .addApplication(validCreateApplicationRequest(180L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.applicationNumber()).isNull();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addApplicationShouldRollBackWhenRemarkCursorHasWrongParent() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);
    when(repository.insertRemark(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("Application remark"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class)))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    91L, 1000999L, "Application remark", "idir\\jsmith", Instant.now())));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.CreateApplicationResult response =
        transactionalService(transactionManager)
            .addApplication(
                withRemark(validCreateApplicationRequest(180L), "Application remark"),
                "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addApplicationShouldForceProvincialNewIdentityAtPublicBoundary() {
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/LU")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000457L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000457L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                700123L,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "APP",
                "A",
                11L,
                "H",
                "F",
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                "LU",
                List.of("FI", "HE"),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicationStatusCode()).isEqualTo("NEW");
    assertThat(recordCaptor.getValue().jurisdictionCode()).isEqualTo("P");
    assertThat(recordCaptor.getValue().federalApplicationNumber()).isNull();
  }

  @Test
  void addFederalImportedApplicationShouldPreserveTrustedFederalIdentity() {
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/LU")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000457L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000457L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addFederalImportedApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                700123L,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                77L,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "APP",
                "A",
                11L,
                "H",
                "F",
                "O",
                "Agent Contact",
                "Owner Contact",
                "N",
                "LU",
                List.of("FI", "HE"),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicationStatusCode()).isEqualTo("APP");
    assertThat(recordCaptor.getValue().jurisdictionCode()).isEqualTo("F");
    assertThat(recordCaptor.getValue().federalApplicationNumber()).isEqualTo(700123L);
  }

  @Test
  void addFederalImportedApplicationShouldRejectNonFederalWorkflowData() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addFederalImportedApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                null,
                null,
                "00011111",
                "02",
                null,
                "U",
                "NEW",
                "O",
                11L,
                "H",
                "P",
                "O",
                null,
                "Owner Contact",
                "N",
                "LU",
                List.of("FI", "HE"),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Federal application imports must use jurisdiction F.",
            "A valid federal application number is required for federal imports.",
            "Federal application imports must enter LEXIS in approved status.");
    verifyNoInteractions(repository);
  }

  @Test
  void validateApplicationShouldUseExactSpeciesEndUseLookupWithoutInsert() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 1909L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.validateApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 6, 17),
                180L,
                LocalDate.of(2026, 6, 17),
                525.0d,
                0.3d,
                "Port Alberni c/o Pacific Towing",
                null,
                null,
                null,
                "1074",
                "03",
                null,
                "S",
                "O",
                1909L,
                "H",
                "P",
                "S",
                null,
                "CUSTOMER SERVICE",
                "N",
                "PL",
                List.of("HE"),
                true));

    assertThat(response.valid()).isTrue();
    assertThat(response.errors()).isEmpty();
    verify(repository).findCandidateExcolCodesRequired(1, "HE", "PL", 1909L);
    verify(repository, never()).insertApplication(any());
  }

  @Test
  void addApplicationShouldRejectLegacyTermMaximumBeforeOracleLookup() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(validCreateApplicationRequest(100_000L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("The application term days must be no more than 99999.");
    verifyNoInteractions(repository);
    verifyNoInteractions(clientRepository);
  }

  @Test
  void addApplicationShouldRejectUnknownReferenceCodesAndClientLocation() {
    when(repository.isProductTypeCodeValidRequired("H")).thenReturn(false);
    when(clientRepository.findLocationByClientNumberCodeRequired("00011111", "02"))
        .thenReturn(Optional.empty());
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(validCreateApplicationRequest(180L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Application product type code does not exist.",
            "Application owner location does not exist.");
    verify(repository, never()).insertApplication(any());
  }

  @Test
  void addApplicationShouldRejectInvalidSpeciesEndUseBeforeOracleInsert() {
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/BA/LU")));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                "LU",
                List.of("FI", "HE"),
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("The application species/enduse sort is not valid for the selected region.");
    verify(repository).findCandidateExcolCodesRequired(2, "FI", "LU", 11L);
    verify(repository, never()).insertApplication(any());
  }

  @Test
  void addApplicationShouldPersistCreateCommentsAsRemark() {
    Instant now = Instant.parse("2026-05-27T17:30:00Z");
    when(repository.findCandidateExcolCodesRequired(1, "HE", "SA", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/SA")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);
    when(repository.insertRemark(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.eq("Ready for review"),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            any(Instant.class)))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    12L, 1000456L, "Ready for review", "idir\\jsmith", now)));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                null,
                null,
                "00011111",
                "02",
                null,
                "U",
                "O",
                11L,
                "T",
                null,
                null,
                null,
                "Owner Contact",
                null,
                "SA",
                List.of("HE"),
                " Ready for review ",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.applicationNumber()).isEqualTo(1000456L);
    verify(repository).replaceApplicationEndUses(
        org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList());
    verify(repository).insertRemark(
        org.mockito.ArgumentMatchers.eq(1000456L),
        org.mockito.ArgumentMatchers.eq("Ready for review"),
        org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
        any(Instant.class));
  }

  @Test
  void addApplicationShouldDefaultMissingApplicantTypeToOwnerBeforeOracleInsert() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "OT", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/OT")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                null,
                null,
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                null,
                11L,
                "T",
                null,
                null,
                "Agent Contact",
                "Owner Contact",
                null,
                null,
                List.of("HE"),
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    ApplicationDetailsRpcRepository.ApplicationInsertRecord record = recordCaptor.getValue();
    assertThat(record.applicantTypeCode()).isEqualTo("O");
    assertThat(record.agentClientNumber()).isNull();
    assertThat(record.agentClientLocationCode()).isNull();
    assertThat(record.agentContactName()).isNull();
    assertThat(record.averageLogVolume()).isZero();
    assertThat(record.productLocation()).isEqualTo(" ");
    assertThat(record.jurisdictionCode()).isEqualTo("P");
    assertThat(record.oicIndicator()).isEqualTo("N");
  }

  @ParameterizedTest
  @ValueSource(strings = {"S", "T"})
  void addApplicationShouldIgnoreHarvestedOnlyValidationForOtherProductTypes(
      String productTypeCode) {
    when(repository.insertApplication(any()))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);
    ApplicationDetailsRpcService.CreateApplicationRequest request =
        withProductFields(
            validCreateApplicationRequest(30L),
            productTypeCode,
            100.0d,
            null,
            "S".equals(productTypeCode) ? "O" : null);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(request, "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().averageLogVolume()).isZero();
    assertThat(recordCaptor.getValue().productLocation()).isEqualTo(" ");
  }

  @Test
  void addApplicationShouldAllowZeroAverageLogVolumeForHarvestedTimber() {
    when(repository.insertApplication(any()))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);
    ApplicationDetailsRpcService.CreateApplicationRequest request =
        withProductFields(validCreateApplicationRequest(30L), "H", 0.0d, "Camp 1", "O");

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(request, "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    verify(repository).insertApplication(any());
  }

  @Test
  void addApplicationShouldRejectHarvestedWithoutGrowthTypeBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                null,
                null,
                "00011111",
                "02",
                null,
                "U",
                "O",
                11L,
                "H",
                null,
                null,
                null,
                "Owner Contact",
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("A valid growth type code is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldRejectInvalidApplicantTypeBeforeOracleInsert() {
    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                null,
                null,
                "00011111",
                "02",
                null,
                "U",
                "X",
                11L,
                "H",
                null,
                null,
                null,
                "Owner Contact",
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("The applicant type code must be O, M, or A.");
    verifyNoInteractions(repository);
  }

  @Test
  void addApplicationShouldDefaultEntryUserWhenPrincipalIsMissing() {
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/LU")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.addApplication(
            new ApplicationDetailsRpcService.CreateApplicationRequest(
                null,
                LocalDate.of(2026, 3, 1),
                30L,
                LocalDate.of(2026, 3, 2),
                125.5d,
                2.4d,
                "Camp 1",
                null,
                "00022222",
                "01",
                "00011111",
                "02",
                null,
                "U",
                "A",
                11L,
                "H",
                null,
                "O",
                "Agent Contact",
                "Owner Contact",
                null,
                "LU",
                List.of("FI", "HE"),
                true),
            null);

    assertThat(response.valid()).isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class);
    verify(repository).insertApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("system");
  }

  @Test
  void getApplicationClientSnapshotShouldMapStoredApplicationClientFields() {
    when(repository.findApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationClientSnapshotRow(
                    " 00022222 ",
                    " 01 ",
                    " Agent Contact ",
                    " 00011111 ",
                    " 02 ",
                    " Owner Contact ")));

    Optional<ApplicationDetailsRpcService.ApplicationClientSnapshot> response =
        service.getApplicationClientSnapshot(1000456L);

    assertThat(response).isPresent();
    assertThat(response.get().agentClientNumber()).isEqualTo("00022222");
    assertThat(response.get().agentClientLocationCode()).isEqualTo("01");
    assertThat(response.get().agentContactName()).isEqualTo("Agent Contact");
    assertThat(response.get().ownerClientNumber()).isEqualTo("00011111");
    assertThat(response.get().ownerClientLocationCode()).isEqualTo("02");
    assertThat(response.get().ownerContactName()).isEqualTo("Owner Contact");
    verify(repository).findApplicationClientSnapshot(1000456L);
  }

  @Test
  void getApplicationClientSnapshotShouldReturnEmptyForInvalidApplicationNumber() {
    assertThat(service.getApplicationClientSnapshot(null)).isEmpty();
    verifyNoInteractions(repository);
  }

  @Test
  void getSpeciesCodesShouldMapOracleCodeRows() {
    when(repository.findAllSpeciesCodesRequired())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.CodeRow(" FIR ", " Douglas-fir ", 1L, 1L),
                new ApplicationDetailsRpcRepository.CodeRow(" HEM ", " Hemlock ", 1L, 2L)));

    List<ApplicationDetailsRpcService.CodeItem> response = service.getSpeciesCodes();

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("FIR", "Douglas-fir"), tuple("HEM", "Hemlock"));
    verify(repository).findAllSpeciesCodesRequired();
  }

  @Test
  void getPackageStatusCodesShouldMapOracleCodeRows() {
    when(repository.findAllPackageStatusCodesRequired())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.CodeRow(" ACT ", " Active ", 1L, 1L),
                new ApplicationDetailsRpcRepository.CodeRow(" SHT ", " Shutout ", 1L, 2L)));

    List<ApplicationDetailsRpcService.CodeItem> response = service.getPackageStatusCodes();

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("ACT", "Active"), tuple("SHT", "Shutout"));
    verify(repository).findAllPackageStatusCodesRequired();
  }

  @Test
  void requiredPackageOptionFailureShouldPropagateInsteadOfAppearingEmpty() {
    when(repository.findAllSpeciesCodesRequired())
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(service::getSpeciesCodes)
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void getGradeCodesShouldDeduplicateSortAndResolveDescriptions() {
    when(repository.findSpeciesEndUsesByRegionSpeciesRequired("11", "FIR"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "U", "LUM", "FIR/U", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "J", "PUL", "FIR/J", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "J", "LUM", "FIR/J", 11L)));
    when(repository.findGradeCodeRequired("J"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("J", "Grade J", 1L, 1L)));
    when(repository.findGradeCodeRequired("U"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("U", "Grade U", 1L, 2L)));

    List<ApplicationDetailsRpcService.CodeItem> response = service.getGradeCodes("11", "FIR");

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("J", "Grade J"), tuple("U", "Grade U"));
    verify(repository).findSpeciesEndUsesByRegionSpeciesRequired("11", "FIR");
    verify(repository).findGradeCodeRequired("J");
    verify(repository).findGradeCodeRequired("U");
  }

  @Test
  void getEndUsesForSpeciesRegionShouldUseCandidateEndUsesAndResolveDescriptions() {
    when(repository.findCandidateEndUseCodesRequired(2, "FI", 11L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ExcolValidationRow("UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("LU"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("ZZ")));
    when(repository.findEndUseCodeRequired("LU"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("LU", "Lumber", 1L, 1L)));
    when(repository.findEndUseCodeRequired("UT"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("UT", "Utility", 1L, 2L)));
    when(repository.findEndUseCodeRequired("ZZ")).thenReturn(Optional.empty());

    List<ApplicationDetailsRpcService.CodeItem> response =
        service.getEndUsesForSpeciesRegion("11", List.of(" FI ", "HE"));

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("LU", "Lumber"), tuple("UT", "Utility"));
    verify(repository).findCandidateEndUseCodesRequired(2, "FI", 11L);
    verify(repository).findEndUseCodeRequired("LU");
    verify(repository).findEndUseCodeRequired("UT");
    verify(repository).findEndUseCodeRequired("ZZ");
  }

  @Test
  void getRemainingSpeciesShouldReturnRegionSpeciesWhenNoneSelected() {
    when(repository.findSpeciesEndUsesByRegionRequired("11"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("CE", "J", "UT", "CE/UT", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("HE", "J", "UT", "HE/UT", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FI", "J", "UT", "FI/UT", 11L)));

    List<ApplicationDetailsRpcService.SpeciesCodeItem> response =
        service.getRemainingSpecies("11", "S", List.of());

    assertThat(response)
        .extracting(ApplicationDetailsRpcService.SpeciesCodeItem::code)
        .containsExactly("FI", "HE");
    verify(repository).findSpeciesEndUsesByRegionRequired("11");
  }

  @Test
  void getRemainingSpeciesShouldFilterCandidateExcolCombinations() {
    when(repository.findCandidateExcolCombinationsRequired(2, "FI", 11L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/HE/CE/UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/BA/UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/SP/UT")));

    List<ApplicationDetailsRpcService.SpeciesCodeItem> response =
        service.getRemainingSpecies("11", "S", List.of("FI", "HE"));

    assertThat(response)
        .extracting(ApplicationDetailsRpcService.SpeciesCodeItem::code)
        .containsExactly("SP");
    verify(repository).findCandidateExcolCombinationsRequired(2, "FI", 11L);
  }

  @Test
  void getSelectedEndUseShouldReturnFirstApplicationEndUse() {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.EndUseRow("FIR", " LUM "),
                new ApplicationDetailsRpcRepository.EndUseRow("HEM", "PUL")));

    Optional<String> response = service.getSelectedEndUse(1000456L);

    assertThat(response).contains("LUM");
    verify(repository).findEndUsesByApplicationNumberRequired(1000456L);
  }

  @Test
  void getPackageSelectedEndUseShouldReturnFirstPackageEndUse() {
    when(repository.findEndUsesByPackageNumberRequired("PKG-903"))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("FIR", "LUM")));

    Optional<String> response = service.getPackageSelectedEndUse(" PKG-903 ");

    assertThat(response).contains("LUM");
    verify(repository).findEndUsesByPackageNumberRequired("PKG-903");
  }

  @Test
  void getSpeciesForApplicationShouldResolveEndUseDescriptions() {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.EndUseRow(" FIR ", " LUM "),
                new ApplicationDetailsRpcRepository.EndUseRow(" HEM ", " LUM ")));
    when(repository.findEndUseCode("LUM"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("LUM", " Lumber ", 1L, 1L)));

    List<ApplicationDetailsRpcService.SpeciesEndUseItem> response =
        service.getSpeciesForApplication(1000456L);

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.SpeciesEndUseItem::species,
            ApplicationDetailsRpcService.SpeciesEndUseItem::endUse,
            ApplicationDetailsRpcService.SpeciesEndUseItem::endUseDescription)
        .containsExactly(tuple("FIR", "LUM", "Lumber"), tuple("HEM", "LUM", "Lumber"));
    verify(repository).findEndUsesByApplicationNumberRequired(1000456L);
    verify(repository).findEndUseCode("LUM");
  }

  @Test
  void applicationSpeciesEndUseSortShouldUseCanonicalLegacyCandidate() {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.EndUseRow("FI", "LUM"),
                new ApplicationDetailsRpcRepository.EndUseRow("HE", "LUM")));
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LUM", 11L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/HE/OT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/FI/LUM")));

    String result = service.getApplicationSpeciesEndUseSort(1000456L);

    assertThat(result).isEqualTo("HE/FI/LUM");
  }

  @Test
  void applicationSpeciesEndUseSortShouldBeBlankWhenNoCandidateMatches() {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("FI", "LUM")));
    when(repository.findCandidateExcolCodesRequired(1, "FI", "LUM", 11L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/OT")));

    String result = service.getApplicationSpeciesEndUseSort(1000456L);

    assertThat(result).isEmpty();
  }

  @Test
  void getSpeciesForPackageShouldResolveEndUseDescriptions() {
    when(repository.findEndUsesByPackageNumberRequired("PKG-903"))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("CED", "PUL")));
    when(repository.findEndUseCode("PUL"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("PUL", "Pulp", 1L, 2L)));

    List<ApplicationDetailsRpcService.SpeciesEndUseItem> response =
        service.getSpeciesForPackage("PKG-903");

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.SpeciesEndUseItem::species,
            ApplicationDetailsRpcService.SpeciesEndUseItem::endUse,
            ApplicationDetailsRpcService.SpeciesEndUseItem::endUseDescription)
        .containsExactly(tuple("CED", "PUL", "Pulp"));
    verify(repository).findEndUsesByPackageNumberRequired("PKG-903");
    verify(repository).findEndUseCode("PUL");
  }

  @Test
  void endUseLookupFailuresShouldPropagateInsteadOfAppearingEmpty() {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenThrow(new IllegalStateException("Oracle application end-use lookup failed"));
    when(repository.findEndUsesByPackageNumberRequired("PKG-903"))
        .thenThrow(new IllegalStateException("Oracle package end-use lookup failed"));

    assertThatThrownBy(() -> service.getSpeciesForApplication(1000456L))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("application end-use lookup failed");
    assertThatThrownBy(() -> service.getSpeciesForPackage("PKG-903"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("package end-use lookup failed");
  }

  @Test
  void packageDetailLookupFailureShouldPropagateInsteadOfReturningAnEmptyForm() {
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenThrow(new IllegalStateException("Oracle package detail lookup failed"));

    assertThatThrownBy(() -> service.getPackageDetails("PKG-903"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("package detail lookup failed");
  }

  @Test
  void getSpeciesEndUseLookupsShouldReturnEmptyForInvalidInputs() {
    assertThat(service.getSelectedEndUse(null)).isEmpty();
    assertThat(service.getPackageSelectedEndUse(" ")).isEmpty();
    assertThat(service.getSpeciesForApplication(null)).isEmpty();
    assertThat(service.getSpeciesForPackage(" ")).isEmpty();
    assertThat(service.getEndUsesForSpeciesRegion("11", List.of())).isEmpty();
    assertThat(service.getRemainingSpecies(null, "S", List.of("FI"))).isEmpty();
  }

  @Test
  void getUniqueScalesForApplicationShouldDeduplicateAndSortTimberMarks() {
    when(repository.findScaleDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleRow(" TM002 "),
                new ApplicationDetailsRpcRepository.ApplicationScaleRow("TM001"),
                new ApplicationDetailsRpcRepository.ApplicationScaleRow("TM002"),
                new ApplicationDetailsRpcRepository.ApplicationScaleRow(" ")));

    List<ApplicationDetailsRpcService.ApplicationScaleItem> response =
        service.getUniqueScalesForApplication(1000456L);

    assertThat(response)
        .extracting(ApplicationDetailsRpcService.ApplicationScaleItem::timberMark)
        .containsExactly("TM001", "TM002");
    verify(repository).findScaleDetailsByApplicationNumber(1000456L);
  }

  @Test
  void findPermitsShouldDeduplicateByPermitNumberPreservingFirstStatus() {
    when(repository.findPermitsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000123L, " Complete "),
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000123L, "Duplicate"),
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000456L, "Active"),
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(null, "Ignored")));

    List<ApplicationDetailsRpcService.ApplicationPermitItem> response =
        service.findPermits(1000456L);

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.ApplicationPermitItem::permitNumber,
            ApplicationDetailsRpcService.ApplicationPermitItem::permitStatusDescription)
        .containsExactly(tuple(7000123L, "Complete"), tuple(7000456L, "Active"));
    verify(repository).findPermitsByApplicationNumber(1000456L);
  }

  @Test
  void permitMutationKeysShouldUnionOrdinaryAndOicRelationships() {
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000124L, "Active"),
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000123L, "Complete")));
    when(repository.findPermitsByOicApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000125L, "Active"),
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(7000123L, "Complete")));

    List<Long> permitNumbers =
        service.getPermitNumbersForApplicationMutation(1000456L);

    assertThat(permitNumbers).containsExactly(7000123L, 7000124L, 7000125L);
  }

  @Test
  void permitMutationKeysShouldAllowAuthoritativeNoLinkResult() {
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(List.of());
    when(repository.findPermitsByOicApplicationNumberRequired(1000456L))
        .thenReturn(List.of());

    assertThat(service.getPermitNumbersForApplicationMutation(1000456L)).isEmpty();
  }

  @Test
  void permitMutationKeysShouldFailClosedForInvalidRelationship() {
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationPermitRow(null, "Unknown")));
    when(repository.findPermitsByOicApplicationNumberRequired(1000456L))
        .thenReturn(List.of());

    assertThatThrownBy(() -> service.getPermitNumbersForApplicationMutation(1000456L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid permit number");
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD", "EXP", "CAN"})
  void getScalesForPackageShouldMarkLockedPermitRowsAsImmutable(String permitStatus) {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "56", null, "HEM", "U", 6.0d, 8L, 1000456L, null, "PKG-903", null),
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "55", "TM001", "FIR", "J", 10.55d, 12L, 1000456L, "7000123", "PKG-903", "C")));
    when(repository.findSpeciesCode("FIR"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("FIR", "Douglas-fir", 1L, 1L)));
    when(repository.findSpeciesCode("HEM"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("HEM", "Hemlock", 1L, 2L)));
    when(repository.findGradeCode("J"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("J", "Grade J", 1L, 1L)));
    when(repository.findGradeCode("U"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("U", "Grade U", 1L, 2L)));
    when(repository.findPermitStatusCodeByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitStatus));

    List<ApplicationDetailsRpcService.ApplicationPackageScaleItem> response =
        service.getScalesForPackage(" PKG-903 ");

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::permitted,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::timberMark,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::species,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::pieces,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::grade,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::volume,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::id,
            ApplicationDetailsRpcService.ApplicationPackageScaleItem::cascadeSplitCode)
        .containsExactly(
            tuple(true, "TM001", "Douglas-fir", 12L, "Grade J", "10.6", "55", "C"),
            tuple(false, "Unmanufactured", "Hemlock", 8L, "Grade U", "6.0", "56", ""));
    verify(repository).findScaleDetailsByPackageNumber("PKG-903");
    verify(repository).findPermitStatusCodeByPermitNumber(7000123L);
  }

  @Test
  void getScaleByIdShouldReturnLegacyScaleEditPayload() {
    when(repository.findScaleDetailById("55"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "55", null, "FIR", "J", 10.55d, 12L, 1000456L, null, "PKG-903", "C")));

    ApplicationDetailsRpcService.ApplicationScaleDetailItem response = service.getScaleById(" 55 ");

    assertThat(response.success()).isTrue();
    assertThat(response.timberMark()).isEqualTo("Unmanufactured");
    assertThat(response.species()).isEqualTo("FIR");
    assertThat(response.pieces()).isEqualTo("12");
    assertThat(response.grade()).isEqualTo("J");
    assertThat(response.volume()).isEqualTo("10.6");
    assertThat(response.id()).isEqualTo("55");
    verify(repository).findScaleDetailById("55");
  }

  @Test
  void getScaleByIdShouldReturnFalsePayloadWhenMissing() {
    when(repository.findScaleDetailById("999")).thenReturn(Optional.empty());

    ApplicationDetailsRpcService.ApplicationScaleDetailItem response = service.getScaleById("999");

    assertThat(response.success()).isFalse();
    assertThat(response.timberMark()).isNull();
    verify(repository).findScaleDetailById("999");
  }

  @Test
  void isPackageValidShouldReturnLegacyExistsMessageWhenPackageExists() {
    when(repository.packageExists("PKG-903")).thenReturn(true);

    ApplicationDetailsRpcService.PackageValidityItem response = service.isPackageValid(" PKG-903 ");

    assertThat(response.valid()).isFalse();
    assertThat(response.message()).isEqualTo("Package PKG-903 already exists.");
    verify(repository).packageExists("PKG-903");
  }

  @Test
  void isPackageValidShouldReturnTrueWhenPackageMissing() {
    when(repository.packageExists("PKG-903")).thenReturn(false);

    ApplicationDetailsRpcService.PackageValidityItem response = service.isPackageValid("PKG-903");

    assertThat(response.valid()).isTrue();
    assertThat(response.message()).isNull();
    verify(repository).packageExists("PKG-903");
  }

  @Test
  void addPackageShouldInsertPackageWithLegacyEndUseRows() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findCandidateExcolCodesRequired(2, "FI", "LU", 11L))
        .thenReturn(
            List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("FI/HE/LU")));
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 99.5d, 12.0d, 24.0d, "Test", null,
                    null, null, "A", "S", "H", "idir\\jsmith", Instant.now())));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                " PKG-903 ",
                null,
                1000456L,
                99.5d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                "S",
                "H",
                "LU",
                List.of("FI", "HE")),
            " idir\\jsmith ");

    assertThat(response.valid()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.volume()).isEqualTo("99.5");

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).insertPackage(recordCaptor.capture());
    ApplicationDetailsRpcRepository.PackageMutationRecord record = recordCaptor.getValue();
    assertThat(record.packageNumber()).isEqualTo("PKG-903");
    assertThat(record.applicationNumber()).isEqualTo(1000456L);
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.endUses())
        .extracting(
            ApplicationDetailsRpcRepository.EndUseMutationRecord::speciesCode,
            ApplicationDetailsRpcRepository.EndUseMutationRecord::endUseCode)
        .containsExactly(tuple("FI", "LU"), tuple("HE", "LU"));
  }

  @Test
  void addPackageShouldRejectPackageTextOracleCannotStore() {
    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            packageMutationRequest("PKG-\u00e9", null, " ".repeat(181)), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Package number contains characters the current LEXIS database cannot store.",
            "Package comments must not exceed 180 bytes.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldReturnDuplicateValidationAndRollBackExactKeyConflict() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.insertPackage(any()))
        .thenThrow(
            new DuplicatePackageNumberException(
                "PKG-903", new DuplicateKeyException("package header duplicate")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    ApplicationDetailsRpcService transactionalService =
        transactionalService(transactionManager);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        transactionalService.addPackage(
            validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.errors()).containsExactly("Package PKG-903 already exists.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPackageShouldRollBackWhenInsertReturnsNoRow() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.insertPackage(any())).thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        transactionalService(transactionManager)
            .addPackage(validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("We were unable to save this package. Please try again.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPackageShouldRollBackWhenInsertReturnsMismatchedBusinessKey() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-OTHER",
                    1000456L,
                    "N",
                    100.0d,
                    10.0d,
                    20.0d,
                    "Test",
                    null,
                    null,
                    null,
                    "A",
                    "O",
                    "H",
                    "idir\\jsmith",
                    Instant.now())));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        transactionalService(transactionManager)
            .addPackage(validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPackageShouldPropagateOtherIntegrityFailures() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    DataIntegrityViolationException failure =
        new DataIntegrityViolationException("foreign key failure");
    when(repository.insertPackage(any())).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.addPackage(
                    validPackageMutationRequest("PKG-903", null), "idir\\jsmith"))
        .isSameAs(failure);
  }

  @Test
  void addPackageShouldCarryFederalPermitLinkFieldsToOracleRecord() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 99.5d, 12.0d, 24.0d, "Test", null,
                    7000123L, 8000123L, "A", "S", "H", "idir\\jsmith", Instant.now())));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                99.5d,
                12.0d,
                24.0d,
                "A",
                "Test",
                7000123L,
                8000123L,
                "N",
                "S",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).insertPackage(recordCaptor.capture());
    ApplicationDetailsRpcRepository.PackageMutationRecord record = recordCaptor.getValue();
    assertThat(record.federalPermitNumber()).isEqualTo(7000123L);
    assertThat(record.reservePermitNumber()).isEqualTo(8000123L);
  }

  @Test
  void addPackageShouldRejectWhenTotalPackageVolumeExceedsApplicationVolume() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L))
        .thenReturn(List.of(packageDetailsRow("PKG-1", 75.0d)));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                25.1d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                "S",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("The total package volume must not exceed the application volume (100.0).");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldRejectMissingPackageProductAndGrowthTypeBeforeOracleInsert() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                25.0d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                null,
                null,
                "LU",
                List.of("FI")),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).containsExactly("A valid package product type code is required.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldRejectMissingPackageGrowthTypeForHarvestedProductBeforeOracleInsert() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                25.0d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                null,
                "H",
                "LU",
                List.of("FI")),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).containsExactly("A valid package growth type code is required.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldRejectUnknownReferenceCodesBeforeOracleInsert() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.isPackageStatusCodeValidRequired("A")).thenReturn(false);
    when(repository.isProductTypeCodeValidRequired("H")).thenReturn(false);
    when(repository.isGrowthTypeCodeValidRequired("O")).thenReturn(false);
    when(repository.findSpeciesCodeRequired("FI")).thenReturn(Optional.empty());
    when(repository.findEndUseCodeRequired("LU")).thenReturn(Optional.empty());

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                25.0d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                "O",
                "H",
                "LU",
                List.of("FI")),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Package status code does not exist.",
            "Package product type code does not exist.",
            "Package growth type code does not exist.",
            "Package species code FI does not exist.",
            "Package end-use code does not exist.");
    verify(repository, never())
        .findCandidateExcolCodesRequired(
            org.mockito.ArgumentMatchers.anyInt(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong());
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldRejectSpeciesEndUseCombinationOutsideApplicationRegion() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.findCandidateExcolCodesRequired(1, "FI", "LU", 11L))
        .thenReturn(List.of());

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                25.0d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                "O",
                "H",
                "LU",
                List.of("FI")),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("The package species/enduse sort is not valid for the selected region.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldPropagateReferenceLookupFailureBeforeOracleInsert() {
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.isPackageStatusCodeValidRequired("A"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () -> service.addPackage(validPackageMutationRequest("PKG-903", null), "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void addPackageShouldRejectSystemOwnedBlanketOicApplication() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));
    when(repository.packageExists("PKG-903")).thenReturn(false);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Blanket OIC system applications can only be changed through Blanket OIC workflows.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void hiddenBlanketOicPackageAddShouldAcceptOnlyASystemOwnedApplication() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903",
                    1000456L,
                    "N",
                    100.0d,
                    10.0d,
                    20.0d,
                    "Test",
                    null,
                    null,
                    null,
                    "A",
                    "O",
                    "H",
                    "idir\\jsmith",
                    Instant.now())));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addHiddenBlanketOicPackage(
            validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    verify(repository).insertPackage(any());
  }

  @Test
  void hiddenBlanketOicPackageAddShouldRejectAnOrdinaryApplication() {
    when(repository.packageExists("PKG-903")).thenReturn(false);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addHiddenBlanketOicPackage(
            validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Blanket OIC system applications can only be changed through Blanket OIC workflows.");
    verify(repository, never()).insertPackage(any());
  }

  @Test
  void hiddenBlanketOicPackageUpdateShouldUseTheTrustedSystemPath() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", entryTimestamp)));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackagesByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.updatePackage(any())).thenReturn(true);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updateHiddenBlanketOicPackage(
            validPackageMutationRequest("PKG-903", null), "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    verify(repository).updatePackage(any());
  }

  @Test
  void hiddenBlanketOicPackageUpdateShouldRejectCommentsOracleCannotStore() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", entryTimestamp)));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updateHiddenBlanketOicPackage(
            packageMutationRequest("PKG-903", null, "R\u00e9view"), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Package comments contains characters the current LEXIS database cannot store.");
    verify(repository, never()).updatePackage(any());
  }

  @Test
  void hiddenBlanketOicPackageDeleteShouldRequireTheExpectedSystemApplication() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", entryTimestamp)));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));
    when(repository.hasPurchaseOffersForPackageRequired(1000456L, "PKG-903"))
        .thenReturn(false);
    when(repository.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    assertThat(
            service.deleteHiddenBlanketOicPackageById(
                "PKG-903", 1000456L, "idir\\jsmith"))
        .isTrue();
    verify(repository).deletePackageById("PKG-903", "idir\\jsmith");
  }

  @Test
  void updatePackageShouldRenamePackageAndMoveScales() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 100.0d, 10.0d, 20.0d, "Old", null,
                    null, null, "A", "O", "H", "idir\\old", entryTimestamp)));
    when(repository.packageExists("PKG-904")).thenReturn(false);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.hasPurchaseOffersForPackageRequired(1000456L, "PKG-903"))
        .thenReturn(false);
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-904", 1000456L, "N", 100.0d, 10.0d, 20.0d, "New", null,
                    null, null, "A", "O", "H", "idir\\old", entryTimestamp)));
    when(repository.findScaleMutationDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ScaleMutationRow(
                    "55", "TM001", 10L, 12.5d, "PKG-903", "FI", "1", 1000456L,
                    null, "idir\\old", entryTimestamp)));
    when(repository.updateScaleDetail(any())).thenReturn(true);
    when(repository.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                "PKG-904",
                1000456L,
                100.0d,
                10.0d,
                20.0d,
                "A",
                "New",
                "N",
                "O",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-904");

    ArgumentCaptor<ApplicationDetailsRpcRepository.ScaleMutationRecord> scaleCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ScaleMutationRecord.class);
    verify(repository).updateScaleDetail(scaleCaptor.capture());
    assertThat(scaleCaptor.getValue().packageNumber()).isEqualTo("PKG-904");
    assertThat(scaleCaptor.getValue().updateUserId()).isEqualTo("idir\\jsmith");
    verify(repository).deletePackageById("PKG-903", "idir\\jsmith");
  }

  @Test
  void updatePackageShouldRejectNewPackageNumberOverOracleByteLimit() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", entryTimestamp)));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            packageMutationRequest("PKG-903", "P".repeat(21), "Test"), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("New package number must not exceed 20 bytes.");
    verify(repository, never()).insertPackage(any());
    verify(repository, never()).updatePackage(any());
  }

  @Test
  void updatePackageShouldRejectRenameWhenPurchaseOffersAreLinked() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", entryTimestamp)));
    when(repository.packageExists("PKG-904")).thenReturn(false);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.hasPurchaseOffersForPackageRequired(1000456L, "PKG-903"))
        .thenReturn(true);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            validPackageMutationRequest("PKG-903", "PKG-904"), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("Package cannot be renamed while purchase offers are linked.");
    verify(repository, never()).insertPackage(any());
    verify(repository, never()).deletePackageById(any(), any());
  }

  @Test
  void updatePackageRenameShouldReturnDuplicateValidationAndRollBackExactKeyConflict() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903",
                    1000456L,
                    "N",
                    100.0d,
                    10.0d,
                    20.0d,
                    "Old",
                    null,
                    null,
                    null,
                    "A",
                    "O",
                    "H",
                    "idir\\old",
                    entryTimestamp)));
    when(repository.packageExists("PKG-904")).thenReturn(false);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.insertPackage(any()))
        .thenThrow(
            new DuplicatePackageNumberException(
                "PKG-904", new DuplicateKeyException("package header duplicate")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();
    ApplicationDetailsRpcService transactionalService =
        transactionalService(transactionManager);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        transactionalService.updatePackage(
            validPackageMutationRequest("PKG-903", "PKG-904"), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.packageNumber()).isEqualTo("PKG-904");
    assertThat(response.errors()).containsExactly("Package PKG-904 already exists.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(repository, never()).findScaleMutationDetailsByPackageNumber("PKG-903");
    verify(repository, never()).deletePackageById("PKG-903", "idir\\jsmith");
  }

  @Test
  void updatePackageShouldPreserveExistingFederalPermitLinkFieldsWhenNotSupplied() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 100.0d, 10.0d, 20.0d, "Old", null,
                    7000123L, 8000123L, "A", "O", "H", "idir\\old", entryTimestamp)));
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.updatePackage(any())).thenReturn(true);

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                100.0d,
                10.0d,
                20.0d,
                "A",
                "Updated",
                "N",
                "O",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).updatePackage(recordCaptor.capture());
    ApplicationDetailsRpcRepository.PackageMutationRecord record = recordCaptor.getValue();
    assertThat(record.federalPermitNumber()).isEqualTo(7000123L);
    assertThat(record.reservePermitNumber()).isEqualTo(8000123L);
  }

  @Test
  void updatePackageShouldRejectWhenTotalPackageVolumeExceedsApplicationVolume() {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 20.0d, 10.0d, 20.0d, "Old", null,
                    null, null, "A", "O", "H", "idir\\old", entryTimestamp)));
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L))
        .thenReturn(List.of(packageDetailsRow("PKG-903", 20.0d), packageDetailsRow("PKG-904", 80.0d)));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                20.1d,
                10.0d,
                20.0d,
                "A",
                "Updated",
                "N",
                "O",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("The total package volume must not exceed the application volume (100.0).");
    verify(repository, never()).updatePackage(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD", "EXP", "CAN"})
  void updatePackageShouldRejectWhenPackageHasLockedPermitScale(String permitStatus) {
    Instant entryTimestamp = Instant.parse("2026-05-01T12:00:00Z");
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 20.0d, 10.0d, 20.0d, "Old", null,
                    null, null, "A", "O", "H", "idir\\old", entryTimestamp)));
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetailsRow("55", "PKG-903", 0L, 5.0d, "7000123")));
    when(repository.findPermitStatusCodeByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitStatus));
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L))
        .thenReturn(List.of(packageDetailsRow("PKG-903", 20.0d)));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.updatePackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                "PKG-903",
                null,
                1000456L,
                20.0d,
                10.0d,
                20.0d,
                "A",
                "Updated",
                "N",
                "O",
                "H",
                null,
                List.of()),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("Package changes are not allowed after a scale has been permitted.");
    verify(repository, never()).updatePackage(any());
  }

  @Test
  void addScaleToPackageShouldInsertScaleAndReturnLegacyResult() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L)).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "A", "", "N", "O", "H")));
    when(repository.insertScaleDetail(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "55", "TM001", "FI", "1", 12.5d, 10L, 1000456L, null, "PKG-903", "")));
    when(repository.findSpeciesCode("FI"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("FI", "Douglas-fir", 1L, 1L)));
    when(repository.findGradeCode("1"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("1", "Sawlog", 1L, 1L)));
    when(repository.findSpeciesCodeRequired("FI"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow(
                    "FI", "Douglas-fir", 1L, 1L)));
    when(repository.findGradeCodeRequired("1"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow("1", "Sawlog", 1L, 1L)));

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        service.addScaleToPackage(
            new ApplicationDetailsRpcService.ScaleMutationRequest(
                "TM001", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.result()).isNotNull();
    assertThat(response.result().timberMark()).isEqualTo("TM001");
    assertThat(response.result().species()).isEqualTo("Douglas-fir");
    assertThat(response.result().grade()).isEqualTo("Sawlog");
    assertThat(response.result().id()).isEqualTo("55");

    ArgumentCaptor<ApplicationDetailsRpcRepository.ScaleMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ScaleMutationRecord.class);
    verify(repository).insertScaleDetail(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(recordCaptor.getValue().speciesGradeVolume()).isEqualTo(12.5d);
  }

  @Test
  void addScaleToPackageShouldRollBackWhenInsertReturnsNoRow() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L))
        .thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(Optional.of(packageDetailsRow("PKG-903", 100.0d)));
    when(repository.findSpeciesCodeRequired("FI"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow(
                    "FI", "Douglas-fir", 1L, 1L)));
    when(repository.findGradeCodeRequired("1"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow("1", "Sawlog", 1L, 1L)));
    when(repository.insertScaleDetail(any())).thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        transactionalService(transactionManager)
            .addScaleToPackage(
                new ApplicationDetailsRpcService.ScaleMutationRequest(
                    "TM001", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
                "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("We were unable to save this scale. Please try again.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addScaleToPackageShouldRollBackWhenInsertReturnsMismatchedParent() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L))
        .thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(Optional.of(packageDetailsRow("PKG-903", 100.0d)));
    when(repository.findSpeciesCodeRequired("FI"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow(
                    "FI", "Douglas-fir", 1L, 1L)));
    when(repository.findGradeCodeRequired("1"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow("1", "Sawlog", 1L, 1L)));
    when(repository.insertScaleDetail(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "55",
                    "TM001",
                    "FI",
                    "1",
                    12.5d,
                    10L,
                    1000999L,
                    null,
                    "PKG-OTHER",
                    null)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        transactionalService(transactionManager)
            .addScaleToPackage(
                new ApplicationDetailsRpcService.ScaleMutationRequest(
                    "TM001", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
                "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addScaleToPackageShouldRejectUnknownSpeciesAndGradeCodes() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L))
        .thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findSpeciesCodeRequired("BAD-SP")).thenReturn(Optional.empty());
    when(repository.findGradeCodeRequired("BAD-GR")).thenReturn(Optional.empty());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(Optional.of(packageDetailsRow("PKG-903", 100.0d)));

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        service.addScaleToPackage(
            new ApplicationDetailsRpcService.ScaleMutationRequest(
                "TM001", "PKG-903", "BAD-GR", "BAD-SP", 1000456L, 10L, 12.5d),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Species code BAD-SP does not exist.",
            "Grade code BAD-GR does not exist.");
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void addScaleToPackageShouldRejectMissingTimberMarkBeforeInsert() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findTimberMark("NOPE")).thenReturn(Optional.empty());
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(Optional.of(packageDetailsRow("PKG-903", 100.0d)));

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        service.addScaleToPackage(
            new ApplicationDetailsRpcService.ScaleMutationRequest(
                "NOPE", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("Timber mark NOPE does not exist.");
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void validateApplicationSubmissionImportShouldRejectInvalidFederalTimberMarkBeforeInsert() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(validTimberMarkRow()));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L)).thenReturn(Optional.of(validTimberMarkRow()));

    ApplicationDetailsRpcService.SubmissionImportValidationResult response =
        service.validateApplicationSubmissionImport(
            importApplicationRequest("F"),
            importPackageRequest(),
            List.of(
                new ApplicationDetailsRpcService.ScaleMutationRequest(
                    "TM001", "PKG-903", "1", "HE", null, 1L, 10.0d)));

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).contains("Timber mark TM001 is not valid for federal applications.");
    verify(repository, never()).insertApplication(any());
    verify(repository, never()).insertPackage(any());
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void validateApplicationSubmissionImportShouldRejectPackageTextOracleCannotStore() {
    ApplicationDetailsRpcService.SubmissionImportValidationResult response =
        service.validateApplicationSubmissionImport(
            importApplicationRequest("F"),
            packageMutationRequest("P".repeat(21), null, "R\u00e9view"),
            List.of());

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Package number must not exceed 20 bytes.",
            "Package comments contains characters the current LEXIS database cannot store.");
    verify(repository, never()).insertApplication(any());
    verify(repository, never()).insertPackage(any());
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void validateApplicationSubmissionImportShouldAcceptValidFederalTimberMarkWithoutInsert() {
    ApplicationDetailsRpcRepository.TimberMarkRow federalTimberMark =
        new ApplicationDetailsRpcRepository.TimberMarkRow("TM001", "ACT", "FF-1", "B08");
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(federalTimberMark));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L)).thenReturn(Optional.of(federalTimberMark));
    when(repository.findSpeciesCodeRequired("HE"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow("HE", "Hemlock", 1L, 1L)));
    when(repository.findGradeCodeRequired("1"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.CodeRow("1", "Sawlog", 1L, 1L)));

    ApplicationDetailsRpcService.SubmissionImportValidationResult response =
        service.validateApplicationSubmissionImport(
            importApplicationRequest("F"),
            importPackageRequest(),
            List.of(
                new ApplicationDetailsRpcService.ScaleMutationRequest(
                    "TM001", "PKG-903", "1", "HE", null, 1L, 10.0d)));

    assertThat(response.valid()).isTrue();
    assertThat(response.errors()).isEmpty();
    verify(repository, never()).insertApplication(any());
    verify(repository, never()).insertPackage(any());
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void validateApplicationSubmissionImportShouldRejectUnknownScaleCodes() {
    ApplicationDetailsRpcRepository.TimberMarkRow federalTimberMark =
        new ApplicationDetailsRpcRepository.TimberMarkRow("TM001", "ACT", "FF-1", "B08");
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.packageExists("PKG-903")).thenReturn(false);
    when(repository.findTimberMark("TM001")).thenReturn(Optional.of(federalTimberMark));
    when(repository.findTimberMarkByOrgUnit("TM001", 11L))
        .thenReturn(Optional.of(federalTimberMark));
    when(repository.findSpeciesCodeRequired("XX")).thenReturn(Optional.empty());
    when(repository.findGradeCodeRequired("QQ")).thenReturn(Optional.empty());

    ApplicationDetailsRpcService.SubmissionImportValidationResult response =
        service.validateApplicationSubmissionImport(
            importApplicationRequest("F"),
            importPackageRequest(),
            List.of(
                new ApplicationDetailsRpcService.ScaleMutationRequest(
                    "TM001", "PKG-903", "QQ", "XX", null, 1L, 10.0d)));

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("Species code XX does not exist.", "Grade code QQ does not exist.");
    verify(repository, never()).insertScaleDetail(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD", "EXP", "CAN"})
  void addScaleToPackageShouldRejectWhenPackageHasLockedPermitScale(String permitStatus) {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetailsRow("55", "PKG-903", 1L, 12.5d, "7000123")));
    when(repository.findPermitStatusCodeByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitStatus));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "A", "", "N", "O", "H")));

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        service.addScaleToPackage(
            new ApplicationDetailsRpcService.ScaleMutationRequest(
                "TM002", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("Scale changes are not allowed after a permit has been completed.");
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void addScaleToPackageShouldRejectSystemOwnedBlanketOicApplication() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());

    ApplicationDetailsRpcService.ScalePersistenceResult response =
        service.addScaleToPackage(
            new ApplicationDetailsRpcService.ScaleMutationRequest(
                "TM001", "PKG-903", "1", "FI", 1000456L, 10L, 12.5d),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Blanket OIC system applications can only be changed through Blanket OIC workflows.");
    verify(repository, never()).insertScaleDetail(any());
  }

  @Test
  void getPackageDetailsShouldReturnLegacyPackagePayload() {
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageDetailsRow(
                    "PKG-903", 10.25d, 6.0d, 24.0d, "ACT", "Reviewed", "N", "S", "H")));
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "101", "TM1", "HEM", "J", 2.35d, 4L, 1000456L, null, "PKG-903", null),
                new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
                    "102", "TM2", "FIR", "K", 1.24d, 2L, 1000456L, null, "PKG-903", null)));
    when(repository.findPackageStatusDescription("ACT")).thenReturn(Optional.of("Active"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("H")).thenReturn(Optional.of("Harvested"));

    ApplicationDetailsRpcService.PackageDetailsItem response = service.getPackageDetails(" PKG-903 ");

    assertThat(response.success()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.volume()).isEqualTo("10.3");
    assertThat(response.scaledVolume()).isEqualTo(3.6d);
    assertThat(response.length()).isEqualTo("6.0");
    assertThat(response.diameter()).isEqualTo("24.0");
    assertThat(response.status()).isEqualTo("ACT");
    assertThat(response.comments()).isEqualTo("Reviewed");
    assertThat(response.statusDescription()).isEqualTo("Active");
    assertThat(response.reprocessed()).isEqualTo("N");
    assertThat(response.ageClass()).isEqualTo("S");
    assertThat(response.ageClassDescription()).isEqualTo("Standing");
    assertThat(response.productType()).isEqualTo("H");
    assertThat(response.productTypeDescription()).isEqualTo("Harvested");
    verify(repository).findPackageDetailsByPackageNumberRequired("PKG-903");
    verify(repository).findScaleDetailsByPackageNumber("PKG-903");
  }

  @Test
  void deleteScaleByIdShouldDelegateToOracleRepository() {
    when(repository.findScaleDetailById("55"))
        .thenReturn(Optional.of(scaleDetailsRow("55", "PKG-903", 0L, 12.5d, null)));
    when(repository.deleteScaleById("55", "idir\\jsmith")).thenReturn(true);

    boolean response = service.deleteScaleById(" 55 ", " idir\\jsmith ");

    assertThat(response).isTrue();
    verify(repository).findScaleDetailById("55");
    verify(repository).deleteScaleById("55", "idir\\jsmith");
  }

  @Test
  void deleteScaleByIdShouldRejectSystemOwnedBlanketOicApplication() {
    when(repository.findScaleDetailById("55"))
        .thenReturn(Optional.of(scaleDetailsRow("55", "PKG-903", 0L, 12.5d, null)));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));

    boolean response = service.deleteScaleById("55", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).deleteScaleById(any(), any());
  }

  @Test
  void deleteScaleByIdShouldRejectPermitAttachedScale() {
    when(repository.findScaleDetailById("55"))
        .thenReturn(Optional.of(scaleDetailsRow("55", "PKG-903", 0L, 12.5d, "7000123")));

    boolean response = service.deleteScaleById("55", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).findPermitStatusCodeByPermitNumber(any());
    verify(repository, never()).deleteScaleById(any(), any());
  }

  @Test
  void deleteScaleByIdShouldFailClosedForMalformedPermitReference() {
    when(repository.findScaleDetailById("55"))
        .thenReturn(Optional.of(scaleDetailsRow("55", "PKG-903", 0L, 12.5d, "not-a-permit")));

    boolean response = service.deleteScaleById("55", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).findPermitStatusCodeByPermitNumber(any());
    verify(repository, never()).deleteScaleById(any(), any());
  }

  @Test
  void deletePackageByIdShouldDelegateToOracleRepository() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", Instant.EPOCH)));
    when(repository.hasPurchaseOffersForPackageRequired(1000456L, "PKG-903"))
        .thenReturn(false);
    when(repository.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    boolean response = service.deletePackageById(" PKG-903 ", " idir\\jsmith ");

    assertThat(response).isTrue();
    verify(repository).findScaleDetailsByPackageNumber("PKG-903");
    verify(repository).deletePackageById("PKG-903", "idir\\jsmith");
  }

  @Test
  void deletePackageByIdShouldRejectPackageWithPurchaseOffers() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", Instant.EPOCH)));
    when(repository.hasPurchaseOffersForPackageRequired(1000456L, "PKG-903"))
        .thenReturn(true);

    boolean response = service.deletePackageById("PKG-903", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).deletePackageById(any(), any());
  }

  @Test
  void deletePackageByIdShouldRejectSystemOwnedBlanketOicApplication() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(packageMutationRow("PKG-903", Instant.EPOCH)));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));

    boolean response = service.deletePackageById("PKG-903", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).hasPurchaseOffersForPackageRequired(any(), any());
    verify(repository, never()).deletePackageById(any(), any());
  }

  @Test
  void deletePackageByIdShouldRejectPackageWithScales() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetailsRow("55", "PKG-903", 3L, 12.5d, null)));

    boolean response = service.deletePackageById("PKG-903", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).deletePackageById(any(), any());
  }

  @Test
  void deletePackageByIdShouldRejectPackageWithZeroPieceScale() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scaleDetailsRow("55", "PKG-903", 0L, 12.5d, null)));

    boolean response = service.deletePackageById("PKG-903", "idir\\jsmith");

    assertThat(response).isFalse();
    verify(repository, never()).findPermitStatusCodeByPermitNumber(any());
    verify(repository, never()).deletePackageById(any(), any());
  }

  @Test
  void synchronizeApplicationOwnerShouldBypassUiStatusAndPreserveEveryOtherField() {
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord existing =
        applicationUpdateRecordWithStatus("EXP");
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord persisted =
        applicationUpdateRecordWithOwner(existing, "00022222", "02", "idir\\jsmith");
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updateApplication(any(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class)))
        .thenReturn(true);

    boolean response =
        service.synchronizeApplicationOwner(
            1000456L, " 00022222 ", " 02 ", " idir\\jsmith ");

    assertThat(response).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord update = recordCaptor.getValue();
    assertThat(update)
        .usingRecursiveComparison()
        .ignoringFields(
            "ownerClientNumber", "ownerClientLocationCode", "updateUserId", "updateTimestamp")
        .isEqualTo(existing);
    assertThat(update.ownerClientNumber()).isEqualTo("00022222");
    assertThat(update.ownerClientLocationCode()).isEqualTo("02");
    assertThat(update.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(update.updateTimestamp()).isNotNull();
    assertThat(update.applicationStatusCode()).isEqualTo("EXP");
  }

  @Test
  void synchronizeApplicationOwnerShouldFailClosedWhenApplicationIsMissing() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.empty());

    assertThat(
            service.synchronizeApplicationOwner(
                1000456L, "00022222", "02", "idir\\jsmith"))
        .isFalse();

    verify(repository, never()).updateApplication(any());
  }

  @Test
  void synchronizePackageForPermitTransitionShouldPreserveFieldsAndEndUses() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903",
            1000456L,
            "Y",
            12.3d,
            8.5d,
            4.2d,
            "Original comments",
            18.75d,
            70001L,
            80002L,
            "ACT",
            null,
            null,
            "idir\\creator",
            entryTimestamp);
    ApplicationDetailsRpcRepository.PackageMutationRow persisted =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903",
            1000456L,
            "Y",
            27.4d,
            8.5d,
            4.2d,
            "Original comments",
            18.75d,
            70001L,
            80002L,
            "ACT",
            "S",
            "H",
            "idir\\creator",
            entryTimestamp);
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updatePackagePreservingEndUses(any())).thenReturn(true);

    boolean response =
        service.synchronizePackageForPermitTransition(
            " PKG-903 ", 27.4d, " S ", " H ", " idir\\jsmith ");

    assertThat(response).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).updatePackagePreservingEndUses(recordCaptor.capture());
    ApplicationDetailsRpcRepository.PackageMutationRecord update = recordCaptor.getValue();
    assertThat(update.packageNumber()).isEqualTo("PKG-903");
    assertThat(update.applicationNumber()).isEqualTo(1000456L);
    assertThat(update.reprocessedIndicator()).isEqualTo("Y");
    assertThat(update.packageVolume()).isEqualTo(27.4d);
    assertThat(update.averageLength()).isEqualTo(8.5d);
    assertThat(update.averageDiameter()).isEqualTo(4.2d);
    assertThat(update.comments()).isEqualTo("Original comments");
    assertThat(update.packageFee()).isEqualTo(18.75d);
    assertThat(update.federalPermitNumber()).isEqualTo(70001L);
    assertThat(update.reservePermitNumber()).isEqualTo(80002L);
    assertThat(update.packageStatusCode()).isEqualTo("ACT");
    assertThat(update.growthTypeCode()).isEqualTo("S");
    assertThat(update.productTypeCode()).isEqualTo("H");
    assertThat(update.entryUserId()).isEqualTo("idir\\creator");
    assertThat(update.entryTimestamp()).isEqualTo(entryTimestamp);
    assertThat(update.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(update.endUses()).isEmpty();
    verify(repository, never()).findEndUsesByPackageNumberRequired(any());
    verify(repository, never()).updatePackage(any());
  }

  @Test
  void synchronizePackageForPermitTransitionShouldKeepExistingClassificationCodes() {
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        packageMutationRow("PKG-903", Instant.parse("2026-03-01T18:00:00Z"));
    ApplicationDetailsRpcRepository.PackageMutationRow persisted =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            existing.packageNumber(),
            existing.applicationNumber(),
            existing.reprocessedIndicator(),
            20.0d,
            existing.averageLength(),
            existing.averageDiameter(),
            existing.comments(),
            existing.packageFee(),
            existing.federalPermitNumber(),
            existing.reservePermitNumber(),
            existing.packageStatusCode(),
            existing.growthTypeCode(),
            existing.productTypeCode(),
            existing.entryUserId(),
            existing.entryTimestamp());
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updatePackagePreservingEndUses(any())).thenReturn(true);

    assertThat(
            service.synchronizePackageForPermitTransition(
                "PKG-903", 20.0d, "O", "T", "idir\\jsmith"))
        .isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).updatePackagePreservingEndUses(recordCaptor.capture());
    assertThat(recordCaptor.getValue().growthTypeCode()).isEqualTo("S");
    assertThat(recordCaptor.getValue().productTypeCode()).isEqualTo("H");
  }

  @Test
  void synchronizePackageForPermitTransitionShouldFailClosedWhenMissingCodeCannotBeFilled() {
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903",
            1000456L,
            "N",
            10.0d,
            5.0d,
            3.0d,
            null,
            null,
            null,
            null,
            "ACT",
            null,
            null,
            "idir\\creator",
            Instant.parse("2026-03-01T18:00:00Z"));
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing));

    assertThat(
            service.synchronizePackageForPermitTransition(
                "PKG-903", 20.0d, null, "H", "idir\\jsmith"))
        .isFalse();

    verify(repository, never()).updatePackagePreservingEndUses(any());
  }

  @Test
  void synchronizePackageForPermitTransitionShouldAllowUnmanufacturedWithoutGrowthType() {
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903",
            1000456L,
            "N",
            10.0d,
            5.0d,
            3.0d,
            null,
            null,
            null,
            null,
            "ACT",
            null,
            null,
            "idir\\creator",
            Instant.parse("2026-03-01T18:00:00Z"));
    ApplicationDetailsRpcRepository.PackageMutationRow persisted =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903",
            1000456L,
            "N",
            20.0d,
            5.0d,
            3.0d,
            null,
            null,
            null,
            null,
            "ACT",
            null,
            "T",
            "idir\\creator",
            Instant.parse("2026-03-01T18:00:00Z"));
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updatePackagePreservingEndUses(any())).thenReturn(true);

    assertThat(
            service.synchronizePackageForPermitTransition(
                "PKG-903", 20.0d, null, "T", "idir\\jsmith"))
        .isTrue();
  }

  @Test
  void synchronizePackageForPermitTransitionShouldPreserveNullVolumeWhenFillingCodesOnly() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903", 1000456L, "N", null, 5.0d, 3.0d, null, null, null, null,
            "ACT", null, null, "idir\\creator", entryTimestamp);
    ApplicationDetailsRpcRepository.PackageMutationRow persisted =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903", 1000456L, "N", null, 5.0d, 3.0d, null, null, null, null,
            "ACT", "S", "H", "idir\\creator", entryTimestamp);
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updatePackagePreservingEndUses(any())).thenReturn(true);

    assertThat(
            service.synchronizePackageForPermitTransition(
                "PKG-903", null, "S", "H", "idir\\jsmith"))
        .isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).updatePackagePreservingEndUses(recordCaptor.capture());
    assertThat(recordCaptor.getValue().packageVolume()).isNull();
  }

  @Test
  void synchronizePackageVolumeForPermitTransitionShouldPreserveMissingClassification() {
    Instant entryTimestamp = Instant.parse("2026-03-01T18:00:00Z");
    ApplicationDetailsRpcRepository.PackageMutationRow existing =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903", 1000456L, "N", 10.0d, 5.0d, 3.0d, null, null, null, null,
            "ACT", null, null, "idir\\creator", entryTimestamp);
    ApplicationDetailsRpcRepository.PackageMutationRow persisted =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-903", 1000456L, "N", 20.0d, 5.0d, 3.0d, null, null, null, null,
            "ACT", null, null, "idir\\creator", entryTimestamp);
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(existing), Optional.of(persisted));
    when(repository.updatePackagePreservingEndUses(any())).thenReturn(true);

    assertThat(
            service.synchronizePackageVolumeForPermitTransition(
                "PKG-903", 20.0d, "idir\\jsmith"))
        .isTrue();

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).updatePackagePreservingEndUses(recordCaptor.capture());
    assertThat(recordCaptor.getValue().growthTypeCode()).isNull();
    assertThat(recordCaptor.getValue().productTypeCode()).isNull();
  }

  @Test
  void synchronizePackageForPermitTransitionShouldPropagateRequiredLookupFailure() {
    when(repository.findPackageMutationByPackageNumber("PKG-903"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () ->
                service.synchronizePackageForPermitTransition(
                    "PKG-903", 20.0d, "S", "H", "idir\\jsmith"))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");

    verify(repository, never()).updatePackagePreservingEndUses(any());
  }

  @Test
  void updateApplicationSummaryShouldOverlayEditableFieldsAndPersistApplicantType() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("HE", "PL")));
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 12L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.updateApplication(any(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class)))
        .thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                45L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "U",
                "Camp 2",
                12L,
                "00033333",
                "01",
                "00022222",
                "02",
                "NEW",
                "a",
                12L,
                "S",
                "P",
                "S",
                "Agent Contact",
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    assertThat(response.applicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record = recordCaptor.getValue();
    assertThat(record.applicationDate()).isEqualTo(LocalDate.of(2026, 4, 1));
    assertThat(record.termDays()).isEqualTo(45L);
    assertThat(record.receivedDate()).isEqualTo(LocalDate.of(2026, 4, 2));
    assertThat(record.applicationVolume()).isEqualTo(125.5d);
    assertThat(record.averageLogVolume()).isEqualTo(2.1d);
    assertThat(record.exemptionReasonCode()).isEqualTo("U");
    assertThat(record.applicationStatusCode()).isEqualTo("NEW");
    assertThat(record.ownerClientNumber()).isEqualTo("00022222");
    assertThat(record.ownerClientLocationCode()).isEqualTo("02");
    assertThat(record.agentClientNumber()).isEqualTo("00033333");
    assertThat(record.agentClientLocationCode()).isEqualTo("01");
    assertThat(record.productLocation()).isEqualTo("Camp 2");
    assertThat(record.exportScheduleId()).isEqualTo(12L);
    assertThat(record.applicantTypeCode()).isEqualTo("A");
    assertThat(record.orgUnitNumber()).isEqualTo(12L);
    assertThat(record.productTypeCode()).isEqualTo("S");
    assertThat(record.jurisdictionCode()).isEqualTo("P");
    assertThat(record.growthTypeCode()).isEqualTo("S");
    assertThat(record.agentContactName()).isEqualTo("Agent Contact");
    assertThat(record.ownerContactName()).isEqualTo("Owner Two");
    assertThat(record.updateUserId()).isEqualTo("idir\\jsmith");
  }

  @ParameterizedTest
  @ValueSource(strings = {"S", "T"})
  void updateApplicationSummaryShouldAllowLegacyBlankHarvestedOnlyFields(
      String productTypeCode) {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(
            Optional.of(
                applicationUpdateRecordWithProductFields(
                    productTypeCode,
                    "S".equals(productTypeCode) ? "O" : null,
                    100.0d,
                    null)));
    stubPersistedApplicationEndUse(11L, true);
    when(repository.updateApplication(any())).thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
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
                "NEW",
                null,
                null,
                null,
                "P",
                null,
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().averageLogVolume()).isZero();
    assertThat(recordCaptor.getValue().productLocation()).isEqualTo(" ");
  }

  @Test
  void updateApplicationSummaryShouldDiscardSubmittedAgentFieldsForOwnerApplicant() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    stubPersistedApplicationEndUse(11L, true);
    when(repository.updateApplication(any())).thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "00099999",
                "99",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Injected Agent",
                null,
                null,
                true),
            "idir\\submitter");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicantTypeCode()).isEqualTo("O");
    assertThat(recordCaptor.getValue().agentClientNumber()).isNull();
    assertThat(recordCaptor.getValue().agentClientLocationCode()).isNull();
    assertThat(recordCaptor.getValue().agentContactName()).isNull();
  }

  @Test
  void updateApplicationSummaryShouldClearStaleAgentFieldsWhenChangingToOwner() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithAgent()));
    stubPersistedApplicationEndUse(11L, true);
    when(repository.updateApplication(any())).thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
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
                "O",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicantTypeCode()).isEqualTo("O");
    assertThat(recordCaptor.getValue().agentClientNumber()).isNull();
    assertThat(recordCaptor.getValue().agentClientLocationCode()).isNull();
    assertThat(recordCaptor.getValue().agentContactName()).isNull();
  }

  @Test
  void updateApplicationSummaryShouldPersistMinisterialAndClearStaleAgentFields() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithAgent()));
    stubPersistedApplicationEndUse(11L, true);
    when(repository.updateApplication(any())).thenReturn(true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
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
                "M",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isTrue();
    ArgumentCaptor<ApplicationDetailsRpcRepository.ApplicationUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.ApplicationUpdateRecord.class);
    verify(repository).updateApplication(recordCaptor.capture());
    assertThat(recordCaptor.getValue().applicantTypeCode()).isEqualTo("M");
    assertThat(recordCaptor.getValue().agentClientNumber()).isNull();
    assertThat(recordCaptor.getValue().agentClientLocationCode()).isNull();
    assertThat(recordCaptor.getValue().agentContactName()).isNull();
  }

  @Test
  void updateApplicationSummaryShouldRejectVolumeBelowPersistedPackageTotal() {
    ApplicationDetailsRpcRepository.PackageMutationRow packageRow =
        new ApplicationDetailsRpcRepository.PackageMutationRow(
            "PKG-120",
            1000456L,
            "N",
            120.0d,
            5.0d,
            3.0d,
            null,
            null,
            null,
            null,
            "ACT",
            "S",
            "H",
            "idir\\creator",
            Instant.parse("2026-03-02T18:00:00Z"));
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageRow));
    stubPersistedApplicationEndUse(11L, true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            minimalApplicationSummaryUpdateRequest(1000456L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("Application volume cannot be less than the total package volume.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectFirstScaleOutsideMergedRegion() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ScaleMutationRow(
                    "55",
                    "TM001",
                    10L,
                    5.0d,
                    "PKG-1",
                    "HE",
                    "1",
                    1000456L,
                    null,
                    "idir\\creator",
                    Instant.parse("2026-03-02T18:00:00Z"))));
    when(repository.findTimberMarkByOrgUnitRequired("TM001", 11L))
        .thenReturn(Optional.empty());
    stubPersistedApplicationEndUse(11L, true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            minimalApplicationSummaryUpdateRequest(1000456L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains("The first scale timber mark is not valid for the application region.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRevalidatePersistedEndUseForMergedRegion() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("HE", "PL")));
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 12L))
        .thenReturn(List.of());

    ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest regionUpdate =
        new ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest(
            1000456L,
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
            12L,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            true);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(regionUpdate, "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application species/enduse sort is not valid for the selected region.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void getApplicationSummarySnapshotShouldExposeEditableLegacyFields() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    Optional<ApplicationDetailsRpcService.ApplicationSummarySnapshot> response =
        service.getApplicationSummarySnapshot(1000456L);

    assertThat(response).isPresent();
    assertThat(response.get().applicationNumber()).isEqualTo(1000456L);
    assertThat(response.get().productLocation()).isEqualTo("Camp 1");
    assertThat(response.get().ownerClientLocationCode()).isEqualTo("00");
    assertThat(response.get().ownerContactName()).isEqualTo("Owner Contact");
    assertThat(response.get().orgUnitNumber()).isEqualTo(11L);
    verify(repository).findApplicationUpdateRecord(1000456L);
  }

  @Test
  void isApplicationVolumeUsedShouldReturnTrueWhenRoundedPackageVolumeMatchesApplicationVolume() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L))
        .thenReturn(List.of(packageDetailsRow("PKG-1", 49.95d), packageDetailsRow("PKG-2", 50.04d)));

    assertThat(service.isApplicationVolumeUsed(1000456L)).isTrue();

    verify(repository).findApplicationUpdateRecord(1000456L);
    verify(repository).findPackagesByApplicationNumber(1000456L);
  }

  @Test
  void isApplicationVolumeUsedShouldReturnFalseWhenPackageVolumeDoesNotMeetApplicationVolume() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));
    when(repository.findPackagesByApplicationNumber(1000456L))
        .thenReturn(List.of(packageDetailsRow("PKG-1", 40.0d), packageDetailsRow("PKG-2", 59.9d)));

    assertThat(service.isApplicationVolumeUsed(1000456L)).isFalse();
  }

  @Test
  void isApplicationVolumeUsedShouldDefaultTrueWhenApplicationIsMissing() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.empty());

    assertThat(service.isApplicationVolumeUsed(1000456L)).isTrue();

    verify(repository).findApplicationUpdateRecord(1000456L);
  }

  @Test
  void isApplicationVolumeUsedShouldDefaultTrueForInvalidApplicationNumber() {
    assertThat(service.isApplicationVolumeUsed(null)).isTrue();

    verifyNoInteractions(repository);
  }

  @Test
  void updateApplicationSummaryShouldValidateBeforeOracleUpdate() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                0L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "ALL",
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
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application term days must be greater than 0.",
            "The application exemption reason code must be 1 character or fewer.");
    verify(repository).findApplicationUpdateRecord(1000456L);
  }

  @Test
  void updateApplicationSummaryShouldRejectUnknownRegionBeforeOracleUpdate() {
    stubPersistedApplicationEndUse(9999L, true);
    when(repository.isOrgUnitValidRequired(9999L)).thenReturn(false);

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
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
                9999L,
                null,
                null,
                null,
                null,
                null,
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).containsExactly("Application region does not exist.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectOracleTextStorageViolationsBeforeWriting() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                null,
                null,
                null,
                null,
                null,
                null,
                "p".repeat(251),
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
                "Owner ".repeat(21),
                null,
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "Location of logs must not exceed 250 bytes.",
            "Owner contact name must not exceed 120 bytes.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldIgnoreCallerControlledValidationBypass() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                0L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "ALL",
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
                false),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application term days must be greater than 0.",
            "The application exemption reason code must be 1 character or fewer.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectNonEditableStoredStatusBeforeOracleUpdate() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithStatus("EXP")));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                30L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "U",
                "Camp 2",
                null,
                null,
                null,
                "00022222",
                "02",
                "NEW",
                "O",
                12L,
                "H",
                "P",
                "O",
                null,
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application details can only be edited while the application is new or approved.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectStatusChangesOutsideApplicationReview() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                30L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "U",
                "Camp 2",
                null,
                null,
                null,
                "00022222",
                "02",
                "APP",
                null,
                12L,
                "H",
                "P",
                "O",
                null,
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application status cannot be changed from the application summary. Use application review.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectJurisdictionChanges() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                30L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "U",
                "Camp 2",
                null,
                null,
                null,
                "00022222",
                "02",
                "NEW",
                null,
                12L,
                "H",
                "F",
                "O",
                null,
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application jurisdiction cannot be changed and must remain P.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectUnsupportedApplicantType() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                30L,
                LocalDate.of(2026, 4, 2),
                125.5d,
                2.1d,
                "U",
                "Camp 2",
                null,
                null,
                null,
                "00022222",
                "02",
                "NEW",
                "X",
                12L,
                "H",
                "P",
                "O",
                null,
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors()).containsExactly("The applicant type code must be O, M, or A.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectSystemOwnedBlanketOicApplication() {
    when(repository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(applicationUpdateRecordWithOicIndicator("Y")));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            minimalApplicationSummaryUpdateRequest(1000456L), "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Blanket OIC system applications can only be changed through Blanket OIC workflows.");
    verify(repository, never()).updateApplication(any());
  }

  @Test
  void updateApplicationSummaryShouldRejectLegacyVolumeRangeBeforeOracleUpdate() {
    when(repository.findApplicationUpdateRecord(1000456L)).thenReturn(Optional.of(applicationUpdateRecord()));

    ApplicationDetailsRpcService.CreateApplicationResult response =
        service.updateApplicationSummary(
            applicationSummaryUpdateRequest(
                1000456L,
                LocalDate.of(2026, 4, 1),
                30L,
                LocalDate.of(2026, 4, 2),
                10_000_000.0d,
                100.0d,
                "U",
                "Camp 2",
                null,
                null,
                null,
                "00022222",
                "02",
                "NEW",
                "O",
                12L,
                "H",
                "P",
                "O",
                null,
                "Owner Two",
                "N",
                true),
            "idir\\jsmith");

    assertThat(response.valid()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application volume must be less than or equal to 9999999.99.",
            "The average log volume must be less than or equal to 99.9.");
    verify(repository, never()).updateApplication(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD", "EXP", "CAN"})
  void applicationEditContextUsesApprovalChildAndLockedPermitFacts(String permitStatus) {
    Instant approvalDate = Instant.parse("2026-07-01T19:00:00Z");
    when(repository.findApplicationEditContext(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationEditContextRow(
                    1000456L,
                    "APP",
                    "P",
                    "H",
                    12L,
                    LocalDate.of(2026, 7, 8),
                    approvalDate,
                    null,
                    null,
                    null)));
    when(repository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                packageMutationRow(
                    "PKG-1", Instant.parse("2026-06-30T19:00:00Z"))));
    when(repository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutationRow(
                    "55", 7000123L, Instant.parse("2026-07-02T19:00:00Z"))));
    when(repository.findPermitStatusCodeByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitStatus));

    Optional<ApplicationDetailsRpcService.ApplicationEditContext> context =
        service.getApplicationEditContext(1000456L);

    assertThat(context).isPresent();
    assertThat(context.get().applicationStatusCode()).isEqualTo("APP");
    assertThat(context.get().productTypeCode()).isEqualTo("H");
    assertThat(context.get().advertisingDate()).isEqualTo(LocalDate.of(2026, 7, 8));
    assertThat(context.get().hasPackageBeforeApproval()).isTrue();
    assertThat(context.get().hasScaleBeforeApproval()).isFalse();
    assertThat(context.get().hasCompletePermit()).isTrue();
  }

  @Test
  void applicationEditContextTreatsUnknownReferencedPermitAsNonEditable() {
    when(repository.findApplicationEditContext(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationEditContextRow(
                    1000456L,
                    "NEW",
                    "P",
                    "H",
                    12L,
                    LocalDate.of(2026, 7, 8),
                    null,
                    "Y",
                    null,
                    null)));
    when(repository.findPackageMutationsByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutationRow("55", 7000123L, Instant.now())));
    when(repository.findPermitStatusCodeByPermitNumber(7000123L)).thenReturn(Optional.empty());

    Optional<ApplicationDetailsRpcService.ApplicationEditContext> context =
        service.getApplicationEditContext(1000456L);

    assertThat(context).isPresent();
    assertThat(context.get().hasCompletePermit()).isTrue();
    assertThat(context.get().oicIndicator()).isEqualTo("Y");
  }

  @Test
  void applicationEditContextAllowsInteriorMinisterialItemsWithRemainingVolume() {
    stubApplicationEditContext("EX-205", 1903L, List.of());
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", 10.0d)));

    Optional<ApplicationDetailsRpcService.ApplicationEditContext> context =
        service.getApplicationEditContext(1000456L);

    assertThat(context).isPresent();
    assertThat(context.get().interiorMinisterialItemOverrideEligible()).isTrue();
  }

  @Test
  void applicationEditContextRejectsCoastalMinisterialItemOverride() {
    stubApplicationEditContext("EX-205", 1909L, List.of());
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", 10.0d)));

    Optional<ApplicationDetailsRpcService.ApplicationEditContext> context =
        service.getApplicationEditContext(1000456L);

    assertThat(context).isPresent();
    assertThat(context.get().interiorMinisterialItemOverrideEligible()).isFalse();
  }

  @Test
  void applicationEditContextClassifiesSkeenaFromFirstDecisiveScaleGrade() {
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", 10.0d)));
    stubApplicationEditContext(
        "EX-205",
        1908L,
        List.of(scaleMutationRowWithGrade("S-1", "Z"), scaleMutationRowWithGrade("S-2", "1")));

    assertThat(
            service
                .getApplicationEditContext(1000456L)
                .orElseThrow()
                .interiorMinisterialItemOverrideEligible())
        .isTrue();

    when(repository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutationRowWithGrade("S-1", "Z"),
                scaleMutationRowWithGrade("S-2", "A")));
    assertThat(
            service
                .getApplicationEditContext(1000456L)
                .orElseThrow()
                .interiorMinisterialItemOverrideEligible())
        .isFalse();

    when(repository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutationRowWithGrade("S-1", "Z"),
                scaleMutationRowWithGrade("S-2", null)));
    assertThat(
            service
                .getApplicationEditContext(1000456L)
                .orElseThrow()
                .interiorMinisterialItemOverrideEligible())
        .isFalse();
  }

  @Test
  void applicationEditContextRequiresAuthoritativePositiveMinisterialExemption() {
    stubApplicationEditContext("EX-205", 1903L, List.of());

    when(exemptionService.findByExemptionNumber("EX-205")).thenReturn(Optional.empty());
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-OTHER", "M", 10.0d)));
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "O", 10.0d)));
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", 0.0d)));
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", Double.NaN)));
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();

    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemption("EX-205", "M", Double.POSITIVE_INFINITY)));
    assertThat(interiorMinisterialItemOverrideEligible()).isFalse();
  }

  @Test
  void applicationEditContextPropagatesExemptionLookupFailure() {
    stubApplicationEditContext("EX-205", 1903L, List.of());
    when(exemptionService.findByExemptionNumber("EX-205"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> service.getApplicationEditContext(1000456L))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private ApplicationDetailsRpcRepository.PackageMutationRow packageMutationRow(
      String packageNumber, Instant entryTimestamp) {
    return new ApplicationDetailsRpcRepository.PackageMutationRow(
        packageNumber,
        1000456L,
        "N",
        10.0d,
        5.0d,
        3.0d,
        null,
        null,
        null,
        null,
        "ACT",
        "S",
        "H",
        "idir\\creator",
        entryTimestamp);
  }

  private ApplicationDetailsRpcRepository.ScaleMutationRow scaleMutationRow(
      String scaleId, Long permitNumber, Instant entryTimestamp) {
    return new ApplicationDetailsRpcRepository.ScaleMutationRow(
        scaleId,
        "TM001",
        10L,
        5.0d,
        "PKG-1",
        "FI",
        "1",
        1000456L,
        permitNumber,
        "idir\\creator",
        entryTimestamp);
  }

  private void stubApplicationEditContext(
      String exemptionNumber,
      Long orgUnitNumber,
      List<ApplicationDetailsRpcRepository.ScaleMutationRow> scales) {
    when(repository.findApplicationEditContext(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.ApplicationEditContextRow(
                    1000456L,
                    "PMT",
                    "P",
                    "H",
                    12L,
                    LocalDate.of(2026, 7, 8),
                    null,
                    null,
                    exemptionNumber,
                    orgUnitNumber)));
    when(repository.findPackageMutationsByApplicationNumber(1000456L)).thenReturn(List.of());
    when(repository.findScaleMutationsByApplicationNumber(1000456L)).thenReturn(scales);
  }

  private ApplicationDetailsRpcRepository.ScaleMutationRow scaleMutationRowWithGrade(
      String scaleId, String gradeCode) {
    return new ApplicationDetailsRpcRepository.ScaleMutationRow(
        scaleId,
        "TM001",
        10L,
        5.0d,
        "PKG-1",
        "FI",
        gradeCode,
        1000456L,
        null,
        "idir\\creator",
        Instant.parse("2026-07-01T19:00:00Z"));
  }

  private boolean interiorMinisterialItemOverrideEligible() {
    return service
        .getApplicationEditContext(1000456L)
        .orElseThrow()
        .interiorMinisterialItemOverrideEligible();
  }

  private ExemptionDetailDto exemption(
      String exemptionNumber, String exemptionTypeCode, double remainingVolume) {
    return new ExemptionDetailDto(
        exemptionNumber,
        exemptionTypeCode,
        null,
        "ACT",
        null,
        null,
        null,
        1000456L,
        "PMT",
        null,
        null,
        100.0d,
        100.0d - remainingVolume,
        remainingVolume,
        null,
        false,
        List.of(),
        List.of());
  }

  private ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest applicationSummaryUpdateRequest(
      Long applicationNumber,
      LocalDate applicationDate,
      Long termDays,
      LocalDate receivedDate,
      Double applicationVolume,
      Double averageLogVolume,
      String exemptionReasonCode,
      String productLocation,
      Long exportScheduleId,
      String agentClientNumber,
      String agentClientLocationCode,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String applicationStatusCode,
      String applicantTypeCode,
      Long orgUnitNumber,
      String productTypeCode,
      String jurisdictionCode,
      String growthTypeCode,
      String agentContactName,
      String ownerContactName,
      String oicIndicator,
      boolean validationEnabled) {
    return new ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest(
        applicationNumber,
        applicationDate,
        termDays,
        receivedDate,
        applicationVolume,
        averageLogVolume,
        exemptionReasonCode,
        productLocation,
        exportScheduleId,
        agentClientNumber,
        agentClientLocationCode,
        ownerClientNumber,
        ownerClientLocationCode,
        applicationStatusCode,
        applicantTypeCode,
        orgUnitNumber,
        productTypeCode,
        jurisdictionCode,
        growthTypeCode,
        agentContactName,
        ownerContactName,
        oicIndicator,
        validationEnabled);
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest validCreateApplicationRequest(
      Long termDays) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        null,
        LocalDate.of(2026, 3, 1),
        termDays,
        LocalDate.of(2026, 3, 2),
        125.5d,
        2.4d,
        "Camp 1",
        null,
        null,
        null,
        "00011111",
        "02",
        null,
        "U",
        "O",
        11L,
        "H",
        "P",
        "O",
        null,
        "Owner Contact",
        "N",
        "PL",
        List.of("HE"),
        true);
  }

  private void stubSuccessfulApplicationInsert() {
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", 11L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL")));
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));
    when(repository.replaceApplicationEndUses(
            org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.anyList()))
        .thenReturn(true);
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest withRemark(
      ApplicationDetailsRpcService.CreateApplicationRequest request, String remark) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        request.federalApplicationNumber(),
        request.applicationDate(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        request.averageLogVolume(),
        request.productLocation(),
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        request.applicationStatusCode(),
        request.applicantTypeCode(),
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.jurisdictionCode(),
        request.growthTypeCode(),
        request.agentContactName(),
        request.ownerContactName(),
        request.oicIndicator(),
        request.endUseCode(),
        request.speciesCodes(),
        remark,
        request.validationEnabled());
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest withProductFields(
      ApplicationDetailsRpcService.CreateApplicationRequest request,
      String productTypeCode,
      Double averageLogVolume,
      String productLocation,
      String growthTypeCode) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        request.federalApplicationNumber(),
        request.applicationDate(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        averageLogVolume,
        productLocation,
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        request.applicationStatusCode(),
        request.applicantTypeCode(),
        request.orgUnitNumber(),
        productTypeCode,
        request.jurisdictionCode(),
        growthTypeCode,
        request.agentContactName(),
        request.ownerContactName(),
        request.oicIndicator(),
        request.endUseCode(),
        request.speciesCodes(),
        request.remarkBody(),
        request.validationEnabled());
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest withApplicationText(
      ApplicationDetailsRpcService.CreateApplicationRequest request,
      String productLocation,
      String agentContactName,
      String ownerContactName,
      String remarkBody) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        request.federalApplicationNumber(),
        request.applicationDate(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        request.averageLogVolume(),
        productLocation,
        request.exportScheduleId(),
        request.agentClientNumber(),
        request.agentClientLocationCode(),
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        request.applicationStatusCode(),
        request.applicantTypeCode(),
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.jurisdictionCode(),
        request.growthTypeCode(),
        agentContactName,
        ownerContactName,
        request.oicIndicator(),
        request.endUseCode(),
        request.speciesCodes(),
        remarkBody,
        request.validationEnabled());
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest withAgentApplicant(
      ApplicationDetailsRpcService.CreateApplicationRequest request) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        request.federalApplicationNumber(),
        request.applicationDate(),
        request.termDays(),
        request.receivedDate(),
        request.applicationVolume(),
        request.averageLogVolume(),
        request.productLocation(),
        request.exportScheduleId(),
        "00022222",
        "01",
        request.ownerClientNumber(),
        request.ownerClientLocationCode(),
        request.exemptionNumber(),
        request.exemptionReasonCode(),
        request.applicationStatusCode(),
        "A",
        request.orgUnitNumber(),
        request.productTypeCode(),
        request.jurisdictionCode(),
        request.growthTypeCode(),
        "Agent Contact",
        request.ownerContactName(),
        request.oicIndicator(),
        request.endUseCode(),
        request.speciesCodes(),
        request.remarkBody(),
        request.validationEnabled());
  }

  private ApplicationDetailsRpcService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    return (ApplicationDetailsRpcService) proxyFactory.getProxy();
  }

  private ApplicationDetailsRpcService.PackageMutationRequest validPackageMutationRequest(
      String packageNumber, String newPackageNumber) {
    return packageMutationRequest(packageNumber, newPackageNumber, "Test");
  }

  private ApplicationDetailsRpcService.PackageMutationRequest packageMutationRequest(
      String packageNumber, String newPackageNumber, String comments) {
    return new ApplicationDetailsRpcService.PackageMutationRequest(
        packageNumber,
        newPackageNumber,
        1000456L,
        100.0d,
        10.0d,
        20.0d,
        "A",
        comments,
        "N",
        "O",
        "H",
        null,
        List.of());
  }

  private ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest
      minimalApplicationSummaryUpdateRequest(Long applicationNumber) {
    return new ApplicationDetailsRpcService.ApplicationSummaryUpdateRequest(
        applicationNumber,
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
        null,
        null,
        null,
        null,
        null,
        null,
        true);
  }

  private void stubPersistedApplicationEndUse(Long orgUnitNumber, boolean valid) {
    when(repository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("HE", "PL")));
    when(repository.findCandidateExcolCodesRequired(1, "HE", "PL", orgUnitNumber))
        .thenReturn(
            valid
                ? List.of(new ApplicationDetailsRpcRepository.ExcolValidationRow("HE/PL"))
                : List.of());
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

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord applicationUpdateRecord() {
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        1000456L,
        null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        100.0d,
        1.5d,
        "Camp 1",
        "idir\\creator",
        Instant.parse("2026-03-01T18:00:00Z"),
        null,
        null,
        99L,
        null,
        null,
        "00011111",
        "00",
        "EX-100",
        "S",
        "NEW",
        "O",
        11L,
        "H",
        "P",
        "O",
        null,
        "Owner Contact",
        "N");
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord
      applicationUpdateRecordWithProductFields(
          String productTypeCode,
          String growthTypeCode,
          Double averageLogVolume,
          String productLocation) {
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record = applicationUpdateRecord();
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        averageLogVolume,
        productLocation,
        record.entryUserId(),
        record.entryTimestamp(),
        record.updateUserId(),
        record.updateTimestamp(),
        record.exportScheduleId(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        record.applicantTypeCode(),
        record.orgUnitNumber(),
        productTypeCode,
        record.jurisdictionCode(),
        growthTypeCode,
        record.agentContactName(),
        record.ownerContactName(),
        record.oicIndicator());
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord applicationUpdateRecordWithStatus(
      String applicationStatusCode) {
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record = applicationUpdateRecord();
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.productLocation(),
        record.entryUserId(),
        record.entryTimestamp(),
        record.updateUserId(),
        record.updateTimestamp(),
        record.exportScheduleId(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        applicationStatusCode,
        record.applicantTypeCode(),
        record.orgUnitNumber(),
        record.productTypeCode(),
        record.jurisdictionCode(),
        record.growthTypeCode(),
        record.agentContactName(),
        record.ownerContactName(),
        record.oicIndicator());
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord
      applicationUpdateRecordWithOicIndicator(String oicIndicator) {
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record = applicationUpdateRecord();
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.productLocation(),
        record.entryUserId(),
        record.entryTimestamp(),
        record.updateUserId(),
        record.updateTimestamp(),
        record.exportScheduleId(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        record.applicantTypeCode(),
        record.orgUnitNumber(),
        record.productTypeCode(),
        record.jurisdictionCode(),
        record.growthTypeCode(),
        record.agentContactName(),
        record.ownerContactName(),
        oicIndicator);
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord applicationUpdateRecordWithAgent() {
    ApplicationDetailsRpcRepository.ApplicationUpdateRecord record = applicationUpdateRecord();
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.productLocation(),
        record.entryUserId(),
        record.entryTimestamp(),
        record.updateUserId(),
        record.updateTimestamp(),
        record.exportScheduleId(),
        "00033333",
        "01",
        record.ownerClientNumber(),
        record.ownerClientLocationCode(),
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        "A",
        record.orgUnitNumber(),
        record.productTypeCode(),
        record.jurisdictionCode(),
        record.growthTypeCode(),
        "Agent Contact",
        record.ownerContactName(),
        record.oicIndicator());
  }

  private ApplicationDetailsRpcRepository.ApplicationUpdateRecord applicationUpdateRecordWithOwner(
      ApplicationDetailsRpcRepository.ApplicationUpdateRecord record,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String updateUserId) {
    return new ApplicationDetailsRpcRepository.ApplicationUpdateRecord(
        record.applicationNumber(),
        record.federalApplicationNumber(),
        record.applicationDate(),
        record.termDays(),
        record.receivedDate(),
        record.applicationVolume(),
        record.averageLogVolume(),
        record.productLocation(),
        record.entryUserId(),
        record.entryTimestamp(),
        updateUserId,
        Instant.parse("2026-07-10T18:00:00Z"),
        record.exportScheduleId(),
        record.agentClientNumber(),
        record.agentClientLocationCode(),
        ownerClientNumber,
        ownerClientLocationCode,
        record.exemptionNumber(),
        record.exemptionReasonCode(),
        record.applicationStatusCode(),
        record.applicantTypeCode(),
        record.orgUnitNumber(),
        record.productTypeCode(),
        record.jurisdictionCode(),
        record.growthTypeCode(),
        record.agentContactName(),
        record.ownerContactName(),
        record.oicIndicator());
  }

  private ApplicationDetailsRpcRepository.PackageDetailsRow packageDetailsRow(
      String packageNumber, double packageVolume) {
    return new ApplicationDetailsRpcRepository.PackageDetailsRow(
        packageNumber, packageVolume, 0.0d, 0.0d, "ACT", null, "N", "S", "H");
  }

  private ApplicationDetailsRpcService.CreateApplicationRequest importApplicationRequest(
      String jurisdictionCode) {
    return new ApplicationDetailsRpcService.CreateApplicationRequest(
        "F".equals(jurisdictionCode) ? 700123L : null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        10.0d,
        1.0d,
        "Camp 1",
        null,
        null,
        null,
        "00011111",
        "00",
        null,
        "S",
        "O",
        11L,
        "H",
        jurisdictionCode,
        "S",
        null,
        "Owner Contact",
        "N",
        "PL",
        List.of("HE"),
        true);
  }

  private ApplicationDetailsRpcService.PackageMutationRequest importPackageRequest() {
    return new ApplicationDetailsRpcService.PackageMutationRequest(
        "PKG-903",
        null,
        null,
        10.0d,
        5.0d,
        3.0d,
        "ACT",
        "",
        "N",
        "S",
        "H",
        "PL",
        List.of("HE"));
  }

  private ApplicationDetailsRpcRepository.TimberMarkRow validTimberMarkRow() {
    return new ApplicationDetailsRpcRepository.TimberMarkRow("TM001", "ACT", "FF-1", "A01");
  }

  private ApplicationDetailsRpcRepository.ApplicationScaleDetailRow scaleDetailsRow(
      String scaleDetailId,
      String packageNumber,
      long pieces,
      double volume,
      String exportPermitDetailNumber) {
    return new ApplicationDetailsRpcRepository.ApplicationScaleDetailRow(
        scaleDetailId,
        "TM001",
        "FI",
        "1",
        volume,
        pieces,
        1000456L,
        exportPermitDetailNumber,
        packageNumber,
        "");
  }
}

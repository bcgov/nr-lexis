package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitApprovedExemptionVolumeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailableApplicationListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitAvailablePackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCountryListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitConversionRateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitCoreTabsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDataAfterScaleUpdateRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitDocumentItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitExemptionVolumeRemainingRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitFileTypeRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitGbmsInvoiceHistoryItemRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitHasApplicationsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitInvoiceListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRequestDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitNumberAvailabilityRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageDetailsRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageInfoRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageListRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPackageVolumeSumRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScaleFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitScalesForPackageRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitSummaryRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitTotalFeesRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.AttachmentTypeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.BoicScaleMutationRecord;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.CountryCodeRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.DocumentRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.EndUsePairRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.GbmsInvoiceHistoryRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageDetailsRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageCandidateRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PackageInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitFeeOverrideRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitCorePackageRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitPolicyContextRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.SalesInvoiceRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ScaleMutationRecord;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ScaleMutationRow;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationNotificationRecipientResolver;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService.ClientData;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceLine;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.GbmsInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.InternalInvoiceSnapshot;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService.Transition;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OraclePermitDetailsRpcService")
class OraclePermitDetailsRpcServiceTest {

  private static final LocalDate FEE_MASK_EFFECTIVE_DATE = LocalDate.of(2024, 6, 27);

  @Mock private PermitRpcRepository repository;
  @Mock private LexisApplicationService applicationService;
  @Mock private ExemptionService exemptionService;
  @Mock private ApplicationReviewRepository applicationReviewRepository;
  @Mock private ClientLookupService clientLookupService;
  @Mock private ApplicationNotificationRecipientResolver notificationRecipientResolver;
  @Mock private PermitNotificationEmailService permitEmailService;
  @Mock private ApplicationDetailsRpcService applicationDetailsRpcService;
  @Mock
  private ObjectProvider<PermitInvoiceOrchestrationService>
      permitInvoiceOrchestrationServiceProvider;
  @Mock private PermitInvoiceOrchestrationService permitInvoiceOrchestrationService;

  @InjectMocks private OraclePermitDetailsRpcService service;
  private Logger permitLogger;
  private Level originalPermitLogLevel;
  private ListAppender<ILoggingEvent> permitAppender;

  @BeforeEach
  void permitValidationDependenciesAreAvailable() {
    permitLogger = (Logger) LoggerFactory.getLogger(OraclePermitDetailsRpcService.class);
    originalPermitLogLevel = permitLogger.getLevel();
    permitLogger.setLevel(Level.WARN);
    permitAppender = new ListAppender<>();
    permitAppender.start();
    permitLogger.addAppender(permitAppender);
    lenient().when(repository.isPermitStatusCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isCountryCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isPortCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isScaleMethodCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isTransportTypeCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.hasApplicationForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient()
        .when(repository.hasPackageForPermitCompletionRequired(anyLong(), anyBoolean()))
        .thenReturn(true);
    lenient().when(repository.hasScaleForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient().when(repository.isPermitMu44Required(anyLong())).thenReturn(false);
    lenient()
        .when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L));
    lenient()
        .when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    lenient()
        .when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000456L,
                    "EX-700",
                    1835L,
                    "00070001",
                    "01",
                    "00070002",
                    "02",
                    "T",
                    "S")));
    lenient()
        .when(repository.findGrowthTypeDescription("S"))
        .thenReturn(Optional.of("Standing"));
    lenient()
        .when(repository.findProductTypeDescription("T"))
        .thenReturn(Optional.of("Unmanufactured Timber"));
    lenient()
        .when(clientLookupService.getClientDataRequired(any(), any()))
        .thenReturn(
            Optional.of(
                new ClientData(
                    "00077881", "Client", null, null, null, null, null, null, null, null)));
  }

  @AfterEach
  void detachPermitAppender() {
    permitLogger.detachAppender(permitAppender);
    permitAppender.stop();
    permitLogger.setLevel(originalPermitLogLevel);
  }

  @Test
  void requestEmailShouldRequireAnActivePermitWithApplicationPackageAndScale() {
    PermitMutationRow permit = permitMutationRow();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "J", 7.6d, 11L, "7000123", "PKG-903")));
    when(permitEmailService.sendRequest(7000123L, 1835L, null)).thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendRequestPermitEmail(7000123L, null, "idir\\submitter");

    assertThat(response.success()).isTrue();
    assertThat(response.permitRequestDate()).isEqualTo("2026-03-15");
    verify(permitEmailService).sendRequest(7000123L, 1835L, null);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void requestEmailShouldRecordTheFirstBlanketOicRequestDate() {
    PermitMutationRow permit = blanketOicPermitMutationRow(null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    stubOicApplicationBinding("EX-700");
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("BOIC-1"));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "J", 7.6d, 11L, "7000123", "BOIC-1")));
    when(permitEmailService.sendRequest(7000123L, 1835L, "copy@example.test")).thenReturn(true);
    when(repository.updatePermitDetail(any(PermitMutationRow.class), eq("idir\\submitter"), eq(null)))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendRequestPermitEmail(
            7000123L, "Applicant <copy@example.test>", "idir\\submitter");

    String today = LexisBusinessTime.today().toString();
    assertThat(response.success()).isTrue();
    assertThat(response.permitRequestDate()).isEqualTo(today);
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(permitCaptor.capture(), eq("idir\\submitter"), eq(null));
    assertThat(permitCaptor.getValue().applicationDate()).isEqualTo(LexisBusinessTime.today());
    assertThat(permitCaptor.getValue().receivedDate()).isEqualTo(LexisBusinessTime.today());
    verify(permitEmailService).sendRequest(7000123L, 1835L, "copy@example.test");
  }

  @Test
  void requestEmailShouldFailClosedWhenNoPackageIsAttached() {
    PermitMutationRow permit = permitMutationRow();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendRequestPermitEmail(7000123L, null, "idir\\submitter");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("not ready for review");
    verify(permitEmailService, never()).sendRequest(anyLong(), any(), any());
  }

  @Test
  void requestEmailShouldRejectAMalformedOptionalRecipientBeforePublishing() {
    PermitMutationRow permit = permitMutationRow();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "J", 7.6d, 11L, "7000123", "PKG-903")));

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendRequestPermitEmail(7000123L, "not-an-email", "idir\\submitter");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("one valid email address");
    verify(permitEmailService, never()).sendRequest(anyLong(), any(), any());
  }

  @Test
  void approvalEmailDefaultShouldResolveTheRecordedApplicantWithoutPublishing() {
    PermitMutationRow permit = permitMutationRow("COM");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenReturn(Optional.of("agent@example.test"));

    Optional<String> result = service.getApprovalPermitEmailDefault(7000123L);

    assertThat(result).contains("agent@example.test");
    verifyNoInteractions(permitEmailService);
  }

  @Test
  void approvalEmailDefaultShouldReturnEmptyWhenPermitDoesNotExist() {
    when(repository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.empty());

    Optional<String> result = service.getApprovalPermitEmailDefault(7000123L);

    assertThat(result).isEmpty();
    verifyNoInteractions(notificationRecipientResolver, permitEmailService);
  }

  @Test
  void approvalEmailDefaultShouldPropagateRecipientLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenThrow(failure);

    assertThatThrownBy(() -> service.getApprovalPermitEmailDefault(7000123L))
        .isSameAs(failure);
    verifyNoInteractions(permitEmailService);
  }

  @Test
  void approvalEmailShouldHonorAValidRequestedRecipient() {
    PermitMutationRow permit = permitMutationRow("COM");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(permitEmailService.sendApproval(
            7000123L,
            "COM",
            List.of("PKG-903"),
            "edited@example.test",
            RegionalMailRoute.RCO))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(
            7000123L, " Applicant <edited@example.test> ");

    assertThat(response.success()).isTrue();
    verify(permitEmailService)
        .sendApproval(
            7000123L,
            "COM",
            List.of("PKG-903"),
            "edited@example.test",
            RegionalMailRoute.RCO);
    verifyNoInteractions(notificationRecipientResolver);
  }

  @Test
  void approvalEmailShouldUseTheRecordedAgentWhenRequestedRecipientIsBlank() {
    PermitMutationRow permit = permitMutationRow("PPD");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenReturn(Optional.of("agent@example.test"));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());
    when(permitEmailService.sendApproval(
            7000123L, "PPD", List.of(), "agent@example.test", RegionalMailRoute.RCO))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, " ");

    assertThat(response.success()).isTrue();
    verify(permitEmailService)
        .sendApproval(7000123L, "PPD", List.of(), "agent@example.test", RegionalMailRoute.RCO);
    verify(notificationRecipientResolver, never())
        .resolveClientLocation(eq("00077881"), eq("01"));
  }

  @Test
  void approvalEmailShouldUseTheRecordedOwnerForBlanketOic() {
    PermitMutationRow permit =
        withAggregateRelationships(permitMutationRow("COM"), "EX-700", 111L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(notificationRecipientResolver.resolveClientLocation("00077881", "01"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());
    when(permitEmailService.sendApproval(
            7000123L, "COM", List.of(), "owner@example.test", RegionalMailRoute.RCO))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, " ");

    assertThat(response.success()).isTrue();
    verify(permitEmailService)
        .sendApproval(7000123L, "COM", List.of(), "owner@example.test", RegionalMailRoute.RCO);
    verify(notificationRecipientResolver, never())
        .resolveClientLocation(eq("00077880"), eq("01"));
  }

  @Test
  void approvalEmailShouldRejectAMalformedRequestedRecipient() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, "not-an-email");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("one valid email address");
    verifyNoInteractions(notificationRecipientResolver, permitEmailService);
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(anyLong());
  }

  @Test
  void approvalEmailShouldRejectAnActivePermitWithoutResolvingOrPublishing() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, "attacker@example.test");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("completed or payment-pending");
    verifyNoInteractions(notificationRecipientResolver, permitEmailService);
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(anyLong());
  }

  @Test
  void approvalEmailShouldNotPreferAnIncompleteAgentOverTheRecordedOwner() {
    PermitMutationRow permit =
        permitMutationRowWithClients("00077881", "01", "00077880", null, "COM");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(notificationRecipientResolver.resolveClientLocation("00077881", "01"))
        .thenReturn(Optional.of("owner@example.test"));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());
    when(permitEmailService.sendApproval(
            7000123L, "COM", List.of(), "owner@example.test", RegionalMailRoute.RCO))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, " ");

    assertThat(response.success()).isTrue();
    verify(permitEmailService)
        .sendApproval(7000123L, "COM", List.of(), "owner@example.test", RegionalMailRoute.RCO);
    verify(notificationRecipientResolver, never())
        .resolveClientLocation(eq("00077880"), eq(null));
  }

  @Test
  void approvalEmailShouldPublishNothingWhenTheAuthoritativeEmailIsInvalid() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenReturn(Optional.empty());

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, " ");

    assertThat(response.success()).isFalse();
    verify(permitEmailService, never()).sendApproval(any(), any(), any(), any(), any());
  }

  @Test
  void approvalEmailShouldPropagateLookupOutagesWithoutPublishing() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenThrow(failure);

    assertThatThrownBy(
            () -> service.sendApprovalPermitEmail(7000123L, " "))
        .isSameAs(failure);
    verify(permitEmailService, never()).sendApproval(any(), any(), any(), any(), any());
  }

  @Test
  void approvalEmailShouldPropagatePackageLookupOutagesWithoutPublishing() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("package lookup unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(notificationRecipientResolver.resolveClientLocation("00077880", "01"))
        .thenReturn(Optional.of("agent@example.test"));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenThrow(failure);

    assertThatThrownBy(
            () -> service.sendApprovalPermitEmail(7000123L, " "))
        .isSameAs(failure);
    verify(permitEmailService, never()).sendApproval(any(), any(), any(), any(), any());
  }

  @ParameterizedTest
  @CsvSource({"A,RCO", "7,RNI"})
  void approvalEmailShouldApplyTheLegacySkeenaGradeRoute(
      String gradeCode, RegionalMailRoute expectedRoute) {
    PermitMutationRow permit = permitMutationRow(7000123L, "COM", 1908L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", gradeCode, 7.6d, 11L, "7000123", "PKG-903")));
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(permitEmailService.sendApproval(
            7000123L,
            "COM",
            List.of("PKG-903"),
            "edited@example.test",
            expectedRoute))
        .thenReturn(true);

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, "edited@example.test");

    assertThat(response.success()).isTrue();
    verify(permitEmailService)
        .sendApproval(
            7000123L,
            "COM",
            List.of("PKG-903"),
            "edited@example.test",
            expectedRoute);
  }

  @Test
  void approvalEmailShouldNotQueueWhenSkeenaGradesDoNotDetermineARoute() {
    PermitMutationRow permit = permitMutationRow(7000123L, "COM", 1908L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "Z", 7.6d, 11L, "7000123", "PKG-903")));

    PermitDetailsRpcService.PermitEmailResult response =
        service.sendApprovalPermitEmail(7000123L, "edited@example.test");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("could not be queued");
    assertThat(permitAppender.list)
        .filteredOn(
            event ->
                event
                    .getFormattedMessage()
                    .contains("event=lexis_permit_approval_email operation=prepare outcome=not_queued"))
        .extracting(ILoggingEvent::getLevel)
        .containsOnly(Level.WARN);
    verify(permitEmailService, never()).sendApproval(any(), any(), any(), any(), any());
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(7000123L);
  }

  @Test
  void editContextShouldExposePersistedFeeOverride() {
    when(repository.findPermitFeeOverrideByPermitNumber(7000123L))
        .thenReturn(Optional.of(new PermitFeeOverrideRow(45.25d, "Reviewed calculation")));

    PermitDetailsRpcService.PermitEditContext response = service.getEditContext(7000123L);

    assertThat(response.overrideEnabled()).isTrue();
    assertThat(response.overrideFee()).isEqualTo("45.25");
    assertThat(response.overrideComment()).isEqualTo("Reviewed calculation");
    verify(repository).findPermitFeeOverrideByPermitNumber(7000123L);
    verify(repository, never()).findPermitMutationByPermitNumber(7000123L);
  }

  @Test
  void permitSummaryShouldAggregateVolumeAndSelectedPackageRows() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 10.25d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(125.0d)));

    PermitSummaryRpcResponseDto response =
        service.getPermitSummary(7000123L, "US", "2026-03-15", "PKG-903", true);

    assertThat(response.volume()).isEqualTo("15.8");
    assertThat(response.pieces()).isEqualTo(20L);
    assertThat(response.totalFees()).isEqualTo("$15.75");
    assertThat(response.totalFeeForPackage()).isEqualTo("$10.25");
    assertThat(response.growthType()).isEqualTo("Standing");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).timbermark()).isEqualTo("TM1");
    assertThat(response.scaleList().get(0).species()).isEqualTo("HEM");
    assertThat(response.scaleList().get(0).grade()).isEqualTo("J");
    assertThat(response.scaleList().get(0).fee()).isEqualTo("$10.25");
    assertThat(response.scaleList().get(0).permit()).isEqualTo("7000123");
  }

  @Test
  void permitSummaryShouldApplyFixedExemptionRateWhenPolicyContextRequiresIt() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), "EX-700", "US", 0.0d)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findFixedExemptionRate("EX-700")).thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenReturn(BigDecimal.ZERO);
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 10.25d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(125.0d)));

    PermitSummaryRpcResponseDto response =
        service.getPermitSummary(7000123L, "US", "2026-01-15", "PKG-903", true);

    assertThat(response.totalFees()).isEqualTo("$39.38");
    assertThat(response.totalFeeForPackage()).isEqualTo("$25.63");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).fee()).isEqualTo("$25.63");
  }

  @Test
  void totalFeesShouldMaskForCanadaAfterCutoverDate() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 12.40d, 5L, "7000123", "PKG-903")));

    PermitTotalFeesRpcResponseDto response =
        service.getTotalFeesForPermit(7000123L, "CA", "2024-06-27");

    assertThat(response.totalFees()).isEqualTo("$");
  }

  @Test
  void scaleFeesShouldUseDescriptionsAndFeeFormatting() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 7.60d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(125.0d)));

    PermitScaleFeesRpcResponseDto response =
        service.getScaleFeesForPackage("PKG-903", 7000123L, true);

    assertThat(response.totalFeeForPackage()).isEqualTo("$7.60");
    assertThat(response.growthType()).isEqualTo("Standing");
    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).species()).isEqualTo("Hemlock");
    assertThat(response.scaleList().get(0).grade()).isEqualTo("Grade J");
    assertThat(response.scaleList().get(0).fee()).isEqualTo("$7.60");
  }

  @Test
  void scaleFeesShouldResolveRepeatedSpeciesAndGradeDescriptionsOncePerRequest() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "HEM", "J", 3.40d, 5L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 11.0d, "S")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(125.0d)));
    when(repository.findAverageMarketValueByScaleId("102"))
        .thenReturn(Optional.of(BigDecimal.valueOf(125.0d)));

    PermitScaleFeesRpcResponseDto response =
        service.getScaleFeesForPackage("PKG-903", 7000123L, true);

    assertThat(response.totalFeeForPackage()).isEqualTo("$11.00");
    assertThat(response.scaleList()).hasSize(2);
    verify(repository, times(1)).findSpeciesDescription("HEM");
    verify(repository, times(1)).findGradeDescription("J");
  }

  @Test
  void scalesForPackageShouldMapScaleDetailsDescriptionsAndRegion() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "RCO", "T", "S", "HE/UT")));

    PermitScalesForPackageRpcResponseDto response = service.getScalesForPackage("PKG-903");

    assertThat(response.scaleList()).hasSize(1);
    assertThat(response.scaleList().get(0).timbermark()).isEqualTo("TM1");
    assertThat(response.scaleList().get(0).pieces()).isEqualTo(11L);
    assertThat(response.scaleList().get(0).species()).isEqualTo("Hemlock");
    assertThat(response.scaleList().get(0).grade()).isEqualTo("Grade J");
    assertThat(response.scaleList().get(0).volume()).isEqualTo("7.6");
    assertThat(response.scaleList().get(0).permit()).isEqualTo("7000123");
    assertThat(response.scaleList().get(0).cascadeSplitCode()).isEqualTo("C");
    assertThat(response.scaleList().get(0).region()).isEqualTo("RCO");
  }

  @Test
  void scalesForPackageShouldResolveRepeatedSpeciesAndGradeDescriptionsOncePerRequest() {
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 7.60d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "HEM", "J", 3.40d, 5L, "7000123", "PKG-903")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "RCO", "T", "S", "HE/UT")));

    PermitScalesForPackageRpcResponseDto response = service.getScalesForPackage("PKG-903");

    assertThat(response.scaleList()).hasSize(2);
    verify(repository, times(1)).findSpeciesDescription("HEM");
    verify(repository, times(1)).findGradeDescription("J");
  }

  @Test
  void invalidInputsShouldReturnEmptyDefaults() {
    PermitSummaryRpcResponseDto summary = service.getPermitSummary(null, null, null, null, true);
    PermitTotalFeesRpcResponseDto total = service.getTotalFeesForPermit(null, null, null);
    PermitScaleFeesRpcResponseDto packageFees = service.getScaleFeesForPackage(null, null, true);

    assertThat(summary.totalFees()).isEqualTo("$0.00");
    assertThat(total.totalFees()).isEqualTo("$0.00");
    assertThat(packageFees.totalFeeForPackage()).isEqualTo("$0.00");
    assertThat(packageFees.scaleList()).isEmpty();
  }

  @Test
  void permitDataAfterScaleUpdateShouldAggregateVolumePiecesFeesAndExemptionVolume() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), "EX-700", "US", 0.0d)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findFixedExemptionRate("EX-700")).thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenReturn(BigDecimal.ZERO);
    when(exemptionService.findByExemptionNumber("EX-700")).thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitDataAfterScaleUpdateRpcResponseDto response =
        service.getPermitDataAfterScaleUpdate(7000123L);

    assertThat(response.packageVolume()).isEqualTo("15.8");
    assertThat(response.pieces()).isEqualTo(20L);
    assertThat(response.totalFees()).isEqualTo("$39.38");
    assertThat(response.exemptionVolume()).isEqualTo(55.5d);
  }

  @Test
  void packageVolumeSumShouldOnlyIncludeSelectedPackageOnPermit() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 10.25d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 5.50d, 8L, "7000123", "PKG-999")));

    PermitPackageVolumeSumRpcResponseDto response =
        service.getPackageVolumeSum(7000123L, "PKG-903");

    assertThat(response.volume()).isEqualTo("10.3");
  }

  @Test
  void packageVolumeSumShouldReturnZeroForInvalidInput() {
    PermitPackageVolumeSumRpcResponseDto response = service.getPackageVolumeSum(null, null);
    assertThat(response.volume()).isEqualTo("0.0");
  }

  @Test
  void packageListShouldReturnNoPackagesWhenPermitHasNone() {
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());

    PermitPackageListRpcResponseDto response = service.getPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("No Packages");
  }

  @Test
  void packageListShouldReturnRepositoryPackageNumbers() {
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-200", "PKG-100"));

    PermitPackageListRpcResponseDto response = service.getPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("PKG-200", "PKG-100");
  }

  @Test
  void packageMembershipShouldUseDirectRepositoryPredicateInsteadOfLoadingPackageLists() {
    when(repository.isPackageAssignedToPermitRequired("PKG-903", 7000123L)).thenReturn(true);

    assertThat(service.packageBelongsToPermit(" PKG-903 ", 7000123L)).isTrue();

    verify(repository).isPackageAssignedToPermitRequired("PKG-903", 7000123L);
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(anyLong());
    verify(repository, never()).findPackageNumbersByOicPermitNumber(anyLong());
  }

  @Test
  void packageMembershipShouldRejectInvalidInputWithoutARepositoryCall() {
    assertThat(service.packageBelongsToPermit(" ", 7000123L)).isFalse();
    assertThat(service.packageBelongsToPermit("PKG-903", 0L)).isFalse();

    verifyNoInteractions(repository);
  }

  @Test
  void packageListShouldPropagateRelationshipLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("package relationship lookup unavailable");
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenThrow(failure);

    assertThatThrownBy(() -> service.getPackageList(7000123L)).isSameAs(failure);
  }

  @Test
  void oicPackageListShouldReturnNoPackagesWhenOicPermitHasNone() {
    when(repository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of());

    PermitPackageListRpcResponseDto response = service.getOicPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("No Packages");
  }

  @Test
  void oicPackageListShouldReturnRepositoryPackageNumbers() {
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-OIC-2", "PKG-OIC-1"));

    PermitPackageListRpcResponseDto response = service.getOicPackageList(7000123L);

    assertThat(response.packageList()).containsExactly("PKG-OIC-2", "PKG-OIC-1");
  }

  @Test
  void permitHasApplicationsShouldReflectPackageAssignments() {
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-100"));

    PermitHasApplicationsRpcResponseDto response = service.getPermitHasApplications(7000123L);

    assertThat(response.hasApplications()).isTrue();
  }

  @Test
  void permitHasApplicationsShouldBeFalseWhenNoPackagesFound() {
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L)).thenReturn(List.of());

    PermitHasApplicationsRpcResponseDto response = service.getPermitHasApplications(7000123L);

    assertThat(response.hasApplications()).isFalse();
  }

  @Test
  void checkPermitNumberShouldReturnAvailableWhenPermitMissing() {
    when(repository.findPermitPolicyContextByPermitNumber(7000123L)).thenReturn(Optional.empty());

    PermitNumberAvailabilityRpcResponseDto response = service.checkPermitNumber(7000123L);

    assertThat(response.available()).isTrue();
  }

  @Test
  void applicationListShouldReturnDistinctSortedApplicationsForPermit() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L, 1000457L));

    PermitApplicationListRpcResponseDto response =
        service.getApplicationList(7000123L, ignored -> true);

    assertThat(response.applicationList()).containsExactly("1000456", "1000457");
  }

  @Test
  void applicationListShouldFilterUnauthorizedApplications() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L, 1000457L));

    PermitApplicationListRpcResponseDto response =
        service.getApplicationList(
            7000123L, applicationNumber -> applicationNumber == 1000456L);

    assertThat(response.applicationList()).containsExactly("1000456");
  }

  @Test
  void coreTabsShouldReuseNormalPackageAndApplicationScaleCursors() {
    service.setPermitCoreTabsExecutor(Runnable::run);
    when(repository.findCorePackageRowsByPermitNumberRequired(7000123L))
        .thenReturn(
            List.of(
                corePackage("PKG-100", 1000456L), corePackage("PKG-200", 1000456L)));
    when(repository.findPermitScaleDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scale("200-current", "TM1", null, null, 1.0d, 1L, "7000123", "PKG-200", null),
                scale("200-unassigned", "TM2", null, null, 2.0d, 2L, null, "PKG-200", null),
                scale("200-other", "TM3", null, null, 3.0d, 3L, "7000999", "PKG-200", null),
                scale("100-current", "TM4", null, null, 4.0d, 4L, "7000123", "PKG-100", null)));

    PermitCoreTabsRpcResponseDto response =
        service.getCoreTabs(7000123L, false, applicationNumber -> applicationNumber == 1000456L);

    assertThat(response.applicationList()).containsExactly("1000456");
    assertThat(response.packageList())
        .extracting(corePackage -> corePackage.packageNumber())
        .containsExactly("PKG-100", "PKG-200");
    assertThat(response.packageList().get(0).packageDetails()).isNull();
    assertThat(response.packageList().get(1).scaleList())
        .extracting(scale -> scale.id())
        .containsExactly("200-current", "200-unassigned");
    assertThat(response.packageList().get(0).scaleList())
        .extracting(scale -> scale.id())
        .containsExactly("100-current");
    verify(repository).findCorePackageRowsByPermitNumberRequired(7000123L);
    verify(repository).findPermitScaleDetailsByApplicationNumber(1000456L);
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(7000123L);
    verify(repository, never()).findApplicationNumbersByPermitNumberRequired(7000123L);
    verify(repository, never()).findPackageNumbersByOicPermitNumber(7000123L);
    verify(repository, never()).findPackageInfoByPackageNumber(any());
    verify(repository, never()).findScaleDetailsByPackageNumber(any());
    verify(repository, never()).findPackageDetailsByPackageNumberRequired(any());
  }

  @Test
  void coreTabsShouldReuseOicPackageAndApplicationScaleCursors() {
    service.setPermitCoreTabsExecutor(Runnable::run);
    when(repository.findCorePackageRowsByOicPermitNumber(7000123L))
        .thenReturn(
            List.of(
                corePackage("PKG-OIC-1", 1000456L), corePackage("PKG-OIC-2", 1000456L)));
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findPermitScaleDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scale("oic-other", "TM1", null, null, 1.0d, 1L, "7000999", "PKG-OIC-2", null),
                scale("oic-current", "TM2", null, null, 2.0d, 2L, "7000123", "PKG-OIC-1", null)));

    PermitCoreTabsRpcResponseDto response =
        service.getCoreTabs(7000123L, true, ignored -> true);

    assertThat(response.applicationList()).containsExactly("1000456");
    assertThat(response.packageList())
        .extracting(corePackage -> corePackage.packageNumber())
        .containsExactly("PKG-OIC-1", "PKG-OIC-2");
    assertThat(response.packageList())
        .allSatisfy(corePackage -> assertThat(corePackage.packageDetails().success()).isTrue());
    assertThat(response.packageList().get(1).scaleList())
        .extracting(scale -> scale.id())
        .containsExactly("oic-other");
    verify(repository).findCorePackageRowsByOicPermitNumber(7000123L);
    verify(repository).findPermitScaleDetailsByApplicationNumber(1000456L);
    verify(repository, never()).findPackageNumbersByPermitNumberRequired(7000123L);
    verify(repository, never()).findPackageInfoByPackageNumber(any());
    verify(repository, never()).findPackageDetailsByPackageNumberRequired(any());
    verify(repository, never()).findScaleDetailsByPackageNumber(any());
  }

  @Test
  void availableApplicationListShouldExcludeSelectedAndAssignedApplications() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901"),
                new PackageCandidateRow(1000457L, "PKG-902"),
                new PackageCandidateRow(1000458L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, "PKG-901", null)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000457L))
        .thenReturn(List.of(scaleMutation("102", 1000457L, "PKG-902", 7000123L)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000458L))
        .thenReturn(List.of(scaleMutation("103", 1000458L, "PKG-903", null)));

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList("EX-700", "1000458", ignored -> true);

    assertThat(response.applicationList()).containsExactly("1000456");
    assertThat(response.errorMessage()).isNull();
  }

  @Test
  void availableApplicationListShouldIncludeApplicationsWithUnassignedScaleRows() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1001456L, "PKG-UNASSIGNED-901"),
                new PackageCandidateRow(1001457L, "PKG-ASSIGNED-902")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1001456L, "PKG-UNASSIGNED-901", null)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001457L))
        .thenReturn(
            List.of(scaleMutation("102", 1001457L, "PKG-ASSIGNED-902", 7001123L)));

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList("EX-700", "", ignored -> true);

    assertThat(response.applicationList()).containsExactly("1001456");
    assertThat(response.errorMessage()).isNull();
  }

  @Test
  void availableApplicationListShouldIncludeApplicationsWithMixedAssignedAndUnassignedScaleRows() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1001456L, "PKG-UNASSIGNED-901"),
                new PackageCandidateRow(1001457L, "PKG-ASSIGNED-902")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1001456L, "PKG-UNASSIGNED-901", 7001123L),
                scaleMutation("102", 1001456L, "PKG-UNASSIGNED-901", null)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001457L))
        .thenReturn(
            List.of(scaleMutation("103", 1001457L, "PKG-ASSIGNED-902", 7001123L)));

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList("EX-700", "", ignored -> true);

    assertThat(response.applicationList()).containsExactly("1001456");
    assertThat(response.errorMessage()).isNull();
  }

  @Test
  void availableApplicationListShouldMatchPackageIdentifiersCaseInsensitively() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1001456L, "pkg-901")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001456L))
        .thenReturn(List.of(scaleMutation("101", 1001456L, " PKG-901 ", null)));

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList("EX-700", "", ignored -> true);

    assertThat(response.applicationList()).containsExactly("1001456");
    assertThat(response.errorMessage()).isNull();
  }

  @Test
  void availableApplicationListShouldFailClosedOnMismatchedScaleApplication() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1001456L, "PKG-901")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001456L))
        .thenReturn(List.of(scaleMutation("101", 1001457L, "PKG-901", null)));

    assertThatThrownBy(
            () -> service.getAvailableApplicationList("EX-700", "", ignored -> true))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid scale relationship")
        .hasMessageContaining("1001456");
  }

  @Test
  void availableApplicationListShouldFailClosedOnInvalidAssignedPermitNumber() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1001456L, "PKG-901")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1001456L))
        .thenReturn(List.of(scaleMutation("101", 1001456L, "PKG-901", 0L)));

    assertThatThrownBy(
            () -> service.getAvailableApplicationList("EX-700", "", ignored -> true))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid scale relationship")
        .hasMessageContaining("1001456");
  }

  @Test
  void availableApplicationListShouldFilterAndCacheApplicationAccessDecisions() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901"),
                new PackageCandidateRow(1000456L, "PKG-902"),
                new PackageCandidateRow(1000457L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, "PKG-901", null),
                scaleMutation("102", 1000456L, "PKG-902", null)));
    AtomicInteger decisions = new AtomicInteger();

    PermitAvailableApplicationListRpcResponseDto response =
        service.getAvailableApplicationList(
            "EX-700",
            "",
            applicationNumber -> {
              decisions.incrementAndGet();
              return applicationNumber == 1000456L;
            });

    assertThat(response.applicationList()).containsExactly("1000456");
    assertThat(response.errorMessage()).isNull();
    assertThat(decisions).hasValue(2);
  }

  @Test
  void availableApplicationListShouldUseSameGenericErrorForHiddenAndEmptyRows() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(new PackageCandidateRow(1000456L, "PKG-901")),
            List.of());

    PermitAvailableApplicationListRpcResponseDto hidden =
        service.getAvailableApplicationList("EX-700", "", ignored -> false);
    PermitAvailableApplicationListRpcResponseDto empty =
        service.getAvailableApplicationList("EX-700", "", ignored -> true);

    assertThat(hidden.applicationList()).isEmpty();
    assertThat(empty.applicationList()).isEmpty();
    assertThat(hidden.errorMessage())
        .isEqualTo("No applications are currently available.")
        .isEqualTo(empty.errorMessage());
  }

  @Test
  void availablePackageListShouldExcludeSelectedAndAssignedPackages() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901"),
                new PackageCandidateRow(1000456L, "PKG-902"),
                new PackageCandidateRow(1000457L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, "PKG-901", null),
                scaleMutation("102", 1000456L, "PKG-902", 7000123L)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000457L))
        .thenReturn(List.of(scaleMutation("103", 1000457L, "PKG-903", null)));

    PermitAvailablePackageListRpcResponseDto response =
        service.getAvailablePackageList("EX-700", "PKG-903", ignored -> true);

    assertThat(response.packageList()).containsExactly("PKG-901");
    assertThat(response.errorMessage()).isNull();
    verify(repository, times(1)).findPackagesByExemptionNumberRequired("EX-700");
    verify(repository, never()).findApplicationNumbersByExemptionNumber("EX-700");
    verify(repository, never()).findPackagesByApplicationNumber(anyLong());
  }

  @Test
  void availablePackageListShouldFilterAndCacheApplicationAccessDecisions() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-901"),
                new PackageCandidateRow(1000456L, "PKG-902"),
                new PackageCandidateRow(1000457L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, "PKG-901", null),
                scaleMutation("102", 1000456L, "PKG-902", null)));
    AtomicInteger decisions = new AtomicInteger();

    PermitAvailablePackageListRpcResponseDto response =
        service.getAvailablePackageList(
            "EX-700",
            "",
            applicationNumber -> {
              decisions.incrementAndGet();
              return applicationNumber == 1000456L;
            });

    assertThat(response.packageList()).containsExactly("PKG-901", "PKG-902");
    assertThat(response.errorMessage()).isNull();
    assertThat(decisions).hasValue(2);
  }

  @Test
  void availablePackageListShouldUseGenericEmptyErrorWhenAllRowsAreHidden() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(new PackageCandidateRow(1000456L, "PKG-901")));

    PermitAvailablePackageListRpcResponseDto response =
        service.getAvailablePackageList("EX-700", "", ignored -> false);

    assertThat(response.packageList()).isEmpty();
    assertThat(response.errorMessage())
        .isEqualTo("No applications are currently available.");
  }

  @Test
  void availablePackageListShouldPropagateApplicationAccessFailure() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(new PackageCandidateRow(1000456L, "PKG-901")));
    IllegalStateException failure = new IllegalStateException("authorization unavailable");

    assertThatThrownBy(
            () ->
                service.getAvailablePackageList(
                    "EX-700",
                    "",
                    ignored -> {
                      throw failure;
                    }))
        .isSameAs(failure);
  }

  @Test
  void availableApplicationListShouldPropagateRequiredPackageLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle packages unavailable");
    when(repository.findPackagesByExemptionNumberRequired("EX-700")).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.getAvailableApplicationList(
                    "EX-700", "", ignored -> true))
        .isSameAs(failure);
  }

  @Test
  void availablePackageListShouldPreserveLegitimatelyEmptyPackageCursor() {
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of());

    PermitAvailablePackageListRpcResponseDto response =
        service.getAvailablePackageList("EX-700", "", ignored -> true);

    assertThat(response.packageList()).isEmpty();
    assertThat(response.errorMessage()).isEqualTo("No applications are currently available.");
  }

  @Test
  void approvedExemptionVolumeShouldReturnValueFromExemptionService() {
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitApprovedExemptionVolumeRpcResponseDto response =
        service.getApprovedExemptionVolume("EX-700");

    assertThat(response.approvedExemptionVolume()).isEqualTo(100.0d);
  }

  @Test
  void exemptionVolumeRemainingShouldReturnValueFromExemptionService() {
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(exemptionDetail("EX-700", 55.5d)));

    PermitExemptionVolumeRemainingRpcResponseDto response =
        service.getExemptionVolumeRemaining("EX-700");

    assertThat(response.exemptionVolumeRemaining()).isEqualTo(55.5d);
  }

  @Test
  void countryListShouldReturnSortedCountryItems() {
    when(repository.findAllCountryCodesRequired())
        .thenReturn(
            List.of(
                new CountryCodeRow("US", "United States", 2L, 2L),
                new CountryCodeRow("CA", "Canada", 1L, 1L),
                new CountryCodeRow("GB", "United Kingdom", 0L, 1L)));

    PermitCountryListRpcResponseDto response = service.getCountryList();

    assertThat(response.countryList()).hasSize(3);
    assertThat(response.countryList().get(0).code()).isEqualTo("CA");
    assertThat(response.countryList().get(1).code()).isEqualTo("US");
    assertThat(response.countryList().get(2).code()).isEqualTo("GB");
  }

  @Test
  void countryListShouldPreserveLegitimateEmptyOracleResult() {
    when(repository.findAllCountryCodesRequired()).thenReturn(List.of());

    PermitCountryListRpcResponseDto response = service.getCountryList();

    assertThat(response.countryList()).isEmpty();
  }

  @Test
  void countryListShouldPropagateOracleLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("country lookup unavailable");
    when(repository.findAllCountryCodesRequired()).thenThrow(failure);

    assertThatThrownBy(service::getCountryList).isSameAs(failure);
  }

  @Test
  void invoicesForPermitShouldReturnInvoiceList() {
    when(repository.findInvoiceNumbersByPermitRequired(7000123L))
        .thenReturn(List.of("INV-100", "INV-101"));

    PermitInvoiceListRpcResponseDto response = service.getInvoicesForPermit(7000123L);

    assertThat(response.invoiceList()).containsExactly("INV-100", "INV-101");
  }

  @Test
  void invoiceDetailsShouldReturnComputedCadAmounts() {
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 20.0d)));

    PermitInvoiceDetailsRpcResponseDto response =
        service.getInvoiceDetails(7000123L, "INV-100");

    assertThat(response.invoicefound()).isTrue();
    assertThat(response.rate()).isEqualTo("1.25");
    assertThat(response.fee()).isEqualTo("$25.00");
    assertThat(response.value()).isEqualTo("$125.00");
  }

  @Test
  void gbmsInvoiceHistoryShouldReturnLegacyFormattedRows() {
    when(repository.findGbmsInvoiceHistoryForDisplay("RCPT-1", 7000123L, true))
        .thenReturn(
            List.of(
                new GbmsInvoiceHistoryRow(
                    "GBMS-1",
                    null,
                    "GBMS-2",
                    7000123L,
                    125.0d,
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 3, 2))));

    List<PermitGbmsInvoiceHistoryItemRpcResponseDto> response =
        service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true);

    assertThat(response).hasSize(1);
    assertThat(response.get(0).gbmsInvoiceNumber()).isEqualTo("GBMS-1");
    assertThat(response.get(0).cancelledByInvoice()).isEmpty();
    assertThat(response.get(0).replacedByInvoice()).isEqualTo("GBMS-2");
    assertThat(response.get(0).invoiceAmount()).isEqualTo("125.00");
    assertThat(response.get(0).printedDate()).isEqualTo("2026-03-01");
    assertThat(response.get(0).entryDate()).isEqualTo("2026-03-01");
    assertThat(response.get(0).updateDate()).isEqualTo("2026-03-02");
  }

  @Test
  void gbmsInvoiceHistoryShouldRetainUnprintedZeroAndNegativeRows() {
    when(repository.findGbmsInvoiceHistoryForDisplay("RCPT-1", 7000123L, true))
        .thenReturn(
            List.of(
                new GbmsInvoiceHistoryRow(
                    "A007488",
                    null,
                    null,
                    7000123L,
                    0.0d,
                    null,
                    LocalDate.of(2022, 9, 29),
                    LocalDate.of(2022, 9, 29)),
                new GbmsInvoiceHistoryRow(
                    "A007321",
                    null,
                    null,
                    7000123L,
                    -1939.50d,
                    null,
                    LocalDate.of(2022, 2, 15),
                    LocalDate.of(2022, 2, 15))));

    List<PermitGbmsInvoiceHistoryItemRpcResponseDto> response =
        service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true);

    assertThat(response)
        .extracting(
            PermitGbmsInvoiceHistoryItemRpcResponseDto::gbmsInvoiceNumber,
            PermitGbmsInvoiceHistoryItemRpcResponseDto::invoiceAmount,
            PermitGbmsInvoiceHistoryItemRpcResponseDto::printedDate,
            PermitGbmsInvoiceHistoryItemRpcResponseDto::entryDate,
            PermitGbmsInvoiceHistoryItemRpcResponseDto::updateDate)
        .containsExactly(
            tuple("A007488", "0.00", "", "2022-09-29", "2022-09-29"),
            tuple("A007321", "-1939.50", "", "2022-02-15", "2022-02-15"));
  }

  @Test
  void financialHistoryReadsShouldPropagateOracleFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("invoice history unavailable");
    when(repository.findInvoiceNumbersByPermitRequired(7000123L)).thenThrow(failure);
    when(repository.findGbmsInvoiceHistoryForDisplay("RCPT-1", 7000123L, true))
        .thenThrow(failure);

    assertThatThrownBy(() -> service.getInvoicesForPermit(7000123L)).isSameAs(failure);
    assertThatThrownBy(() -> service.getGbmsInvoiceHistory("RCPT-1", 7000123L, true))
        .isSameAs(failure);
  }

  @Test
  void createPermitFromExemptionShouldPersistAnAuthoritativeMinisterialLegacyShell() {
    stubValidMinisterialPermitCreationContext();
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenAnswer(
            invocation ->
                Optional.of(
                    withPermitNumber(invocation.getArgument(0), 7000123L)));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption(" EX-700 ", " idir\\jsmith ");

    assertThat(response.success()).isTrue();
    assertThat(response.permitNumber()).isEqualTo(7000123L);
    assertThat(response.permitStatus()).isEqualTo("ACT");
    assertThat(response.message()).isEqualTo("The permit was created successfully.");

    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository).insertPermitDetail(permitCaptor.capture(), eq("idir\\jsmith"));
    PermitMutationRow inserted = permitCaptor.getValue();
    assertThat(inserted.permitNumber()).isNull();
    assertThat(inserted.applicationDate()).isEqualTo(LexisBusinessTime.today());
    assertThat(inserted.expiryDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    assertThat(inserted.permitStatusCode()).isEqualTo("ACT");
    assertThat(inserted.scaleMethodCode()).isEqualTo("W");
    assertThat(inserted.clientNumber()).isEqualTo("00077881");
    assertThat(inserted.clientLocationCode()).isEqualTo("01");
    assertThat(inserted.agentNumber()).isEqualTo("00077880");
    assertThat(inserted.agentLocationCode()).isEqualTo("02");
    assertThat(inserted.exemptionNumber()).isEqualTo("EX-700");
    assertThat(inserted.orgUnitNo()).isEqualTo(1835L);
    assertThat(inserted.growthTypeCode()).isEqualTo("S");
    assertThat(inserted.productTypeCode()).isEqualTo("T");
    assertThat(inserted.permitVolume()).isZero();
    assertThat(inserted.numberOfPieces()).isZero();
    assertThat(inserted.feeInLieuVolume()).isZero();
    assertThat(inserted.destinationCompanyName()).isNull();
    assertThat(inserted.transportName()).isNull();
    assertThat(inserted.estimatedShippingDate()).isNull();
    assertThat(inserted.receivedDate()).isNull();
    assertThat(inserted.permitIssueDate()).isNull();
    assertThat(inserted.countryCode()).isNull();
    assertThat(inserted.portOfExportCode()).isNull();
    assertThat(inserted.transportTypeCode()).isNull();
  }

  @Test
  void createPermitFromExemptionShouldAttachUnassignedScalesWithoutChangingApplicationStatus() {
    stubValidMinisterialPermitCreationContext();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000457L)).thenReturn(Optional.of("EXE"));
    when(repository.findApplicationInfoByNumber(1000457L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000457L,
                    "EX-700",
                    1835L,
                    "00077881",
                    "01",
                    "00077880",
                    "02",
                    "T",
                    "S")));
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenAnswer(
            invocation ->
                Optional.of(
                    withPermitNumber(invocation.getArgument(0), 7000123L)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-903"),
                new PackageCandidateRow(1000457L, "PKG-904")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, "PKG-903", null, entryTimestamp),
                scaleMutation("102", 1000456L, "PKG-903", 7000999L, entryTimestamp)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000457L)).thenReturn(List.of());
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903")));
    permitTotalsUpdateSucceeds();

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<ScaleMutationRecord> scaleCaptor =
        ArgumentCaptor.forClass(ScaleMutationRecord.class);
    verify(repository, times(1))
        .updateScaleDetail(scaleCaptor.capture(), eq("idir\\jsmith"));
    assertThat(scaleCaptor.getValue().scaleDetailId()).isEqualTo("101");
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isEqualTo(7000123L);
    verify(repository).findScaleMutationDetailsByApplicationNumber(1000457L);
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRollBackWhenScaleAttachmentFails() {
    stubValidMinisterialPermitCreationContext();
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenAnswer(
            invocation ->
                Optional.of(
                    withPermitNumber(invocation.getArgument(0), 7000123L)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, "PKG-903", null)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(false);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager)
            .createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to attach exemption scales to the new permit.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void createPermitFromExemptionShouldRollBackWhenInitialPermitTotalsCannotBeUpdated() {
    stubValidMinisterialPermitCreationContext();
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenAnswer(
            invocation ->
                Optional.of(
                    withPermitNumber(invocation.getArgument(0), 7000123L)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, "PKG-903", null)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903")));
    when(repository.updatePermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith"), any()))
        .thenReturn(false);
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager)
            .createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to recalculate the new permit totals.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void createPermitFromExemptionShouldRejectAnInactiveMinisterialExemption() {
    stubPermitCreationExemption(
        "EX-700", "M", "EXP", "00077881", "00077880");

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A new permit can only be created from an active exemption.");
    verify(repository, never()).findApplicationInfoByNumber(anyLong());
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRequireAtLeastOneMinisterialApplication() {
    stubPermitCreationExemption(
        "EX-700", "M", "ACT", "00077881", "00077880");
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of());

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "A Ministerial exemption must have at least one linked application before a permit can be created.");
    verify(repository, never()).findApplicationInfoByNumber(anyLong());
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRejectApplicationsOutsideExemptedOrPermittedStatus() {
    stubPermitCreationExemption(
        "EX-700", "M", "ACT", "00077881", "00077880");
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("APP"));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Every application linked to a Ministerial exemption must be exempted or permitted before a permit can be created.");
    verify(repository, never()).findApplicationInfoByNumber(anyLong());
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldAllowAdditionalPermitsForPermittedApplications() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findApplicationInfoByNumber(1000457L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000457L,
                    "EX-700",
                    1835L,
                    "00077881",
                    "01",
                    "00077880",
                    "02",
                    "T",
                    "S")));
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenAnswer(
            invocation ->
                Optional.of(withPermitNumber(invocation.getArgument(0), 7000123L)));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.permitNumber()).isEqualTo(7000123L);
  }

  @Test
  void createPermitFromExemptionShouldRejectDivergentApplicationPermitContext() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findApplicationInfoByNumber(1000457L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000457L,
                    "EX-700",
                    1908L,
                    "00077881",
                    "01",
                    "00077880",
                    "02",
                    "L",
                    "O")));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Linked applications do not share one permit client, region, growth, and product context.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRejectBlanketOicCreation() {
    stubPermitCreationExemption("BOIC-1", "B", "ACT", null, null);

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("BOIC-1", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Only a Ministerial exemption can use the one-step permit creation action.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRejectOrdinaryOicCreation() {
    stubPermitCreationExemption("OIC-1", "O", "ACT", null, null);

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("OIC-1", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).isNotEmpty();
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedWhenApplicationContextIsMissing() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationInfoByNumber(1000456L)).thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The permit application context could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedWhenApplicationContextIsMismatched() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000457L,
                    "EX-OTHER",
                    1835L,
                    "00077881",
                    "01",
                    "00077880",
                    "02",
                    "T",
                    "S")));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The permit application context could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForMissingOwnerAndAgentBindings() {
    stubMinisterialPermitCreationContext(
        "00077881",
        "00077880",
        permitCreationApplication(
            1000456L,
            "EX-700",
            1835L,
            null,
            null,
            null,
            null,
            "T",
            "S"));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The permit owner does not match the selected exemption.",
            "The permit agent does not match the selected exemption.",
            "The application owner and location could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForUnexpectedOwnerAndAgentBindings() {
    stubMinisterialPermitCreationContext(
        null, null, permitCreationApplication());

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "The permit owner does not match the selected exemption.",
            "The permit agent does not match the selected exemption.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForMissingClientAgentAndRegionContext() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000456L,
                    "EX-700",
                    null,
                    null,
                    null,
                    "00077880",
                    null,
                    "T",
                    "S")));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The application region could not be verified.",
            "The application owner and location could not be verified.",
            "The application agent and location could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForMismatchedClientBindings() {
    stubValidMinisterialPermitCreationContext();
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000456L,
                    "EX-700",
                    1835L,
                    "00099991",
                    "01",
                    "00099992",
                    "02",
                    "T",
                    "S")));

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The permit owner does not match the selected exemption.",
            "The permit agent does not match the selected exemption.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForInvalidClientLocations() {
    stubValidMinisterialPermitCreationContext();
    when(clientLookupService.getClientDataRequired("00077881", "01"))
        .thenReturn(Optional.empty());
    when(clientLookupService.getClientDataRequired("00077880", "02"))
        .thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "The application owner and location could not be verified.",
            "The application agent and location could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldFailClosedForInvalidLegacyCodes() {
    stubValidMinisterialPermitCreationContext();
    when(repository.isPermitStatusCodeValidRequired("ACT")).thenReturn(false);
    when(repository.isScaleMethodCodeValidRequired("W")).thenReturn(false);
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.empty());
    when(repository.findProductTypeDescription("T")).thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response =
        service.createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "The active permit status code could not be verified.",
            "The weight scale method code could not be verified.",
            "The application growth type could not be verified.",
            "The application product type could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void createPermitFromExemptionShouldRollBackWhenInsertReturnsNoRow() {
    stubValidMinisterialPermitCreationContext();
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager)
            .createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to create permit.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void createPermitFromExemptionShouldRollBackWhenInsertedRowDoesNotMatch() {
    stubValidMinisterialPermitCreationContext();
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenReturn(Optional.of(permitMutationRow()));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager)
            .createPermitFromExemption("EX-700", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to create permit.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPermitShouldPersistWhenInputIsValid() {
    PermitMutationRequestDto request =
        new PermitMutationRequestDto(
            "7000123",
            "ACT",
            "2026-05-27",
            "2026-05-27",
            "2026-06-27",
            null,
            "EX-700",
            "Acme Lumber",
            "US",
            "S",
            "Hauler 1",
            "2026-06-01",
            "VA",
            null,
            null,
            null,
            "S",
            "100.0",
            "25",
            "1835",
            "00070001",
            "01",
            "00070002",
            "02",
            null,
            null,
            null,
            null,
            "S",
            "T",
            null,
            null,
            null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findExemptionExpiryDate("EX-700"))
        .thenReturn(Optional.of(LocalDate.of(2026, 6, 27)));
    when(repository.insertPermitDetail(
            org.mockito.ArgumentMatchers.any(PermitMutationRow.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            Optional.of(
                new PermitMutationRow(
                    7000123L,
                    "Acme Lumber",
                    "Hauler 1",
                    LocalDate.of(2026, 6, 1),
                    null,
                    LocalDate.of(2026, 5, 27),
                    LocalDate.of(2026, 5, 27),
                    LocalDate.of(2026, 5, 27),
                    null,
                    LocalDate.of(2026, 6, 27),
                    100.0d,
                    25L,
                    0L,
                    null,
                    null,
                    "idir\\jsmith",
                    null,
                    "S",
                    "W",
                    "00070001",
                    "01",
                    "00070002",
                    "02",
                    "EX-700",
                    1835L,
                    "VA",
                    "ACT",
                    "S",
                    "US",
                    null,
                    null,
                    null,
                    null,
                    null,
                    "T")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.permitNumber()).isEqualTo(7000123L);
    assertThat(response.permitStatus()).isEqualTo("ACT");
  }

  @Test
  void addPermitShouldRejectDivergentMinisterialApplicationContext() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findApplicationInfoByNumber(1000457L))
        .thenReturn(
            Optional.of(
                permitCreationApplication(
                    1000457L,
                    "EX-700",
                    1908L,
                    "00070001",
                    "01",
                    "00070002",
                    "02",
                    "T",
                    "S")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Linked applications do not share one permit client, region, growth, and product context.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRollBackWhenInsertReturnsNoRow() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findExemptionExpiryDate("EX-700"))
        .thenReturn(Optional.of(LocalDate.of(2026, 6, 27)));
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager).addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to save permit.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPermitShouldRollBackWhenInsertReturnsMapperZeroId() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findExemptionExpiryDate("EX-700"))
        .thenReturn(Optional.of(LocalDate.of(2026, 6, 27)));
    when(repository.insertPermitDetail(any(PermitMutationRow.class), eq("idir\\jsmith")))
        .thenReturn(Optional.of(permitMutationRow(0L, "ACT")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager).addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to save permit.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addPermitShouldRejectAnInvalidCountryBeforeInsert() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findExemptionExpiryDate("EX-700"))
        .thenReturn(Optional.of(LocalDate.of(2026, 6, 27)));
    when(repository.isCountryCodeValidRequired("US")).thenReturn(false);

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid country code is required.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRejectAnInvoiceBoundaryStatus() {
    PermitMutationRequestDto request =
        permitMutationRequest(
            "EX-700", "00070001", "00070002", null, "COM");
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findExemptionExpiryDate("EX-700"))
        .thenReturn(Optional.of(LocalDate.of(2026, 6, 27)));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("A new permit must have active status.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldFailClosedWhenTheAuthoritativeExemptionIsMissing() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700")).thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("A valid exemption number is required.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRequireAnActiveExemption() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClientsAndStatus(
                    "EX-700", "M", "EXP", "00070001", "00070002")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("A new permit can only be created from an active exemption.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRequireMinisterialApplications() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of());

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "A Ministerial exemption must have at least one linked application before a permit can be created.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRejectApplicationsOutsideExemptedOrPermittedStatus() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("APP"));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Every application linked to a Ministerial exemption must be exempted or permitted before a permit can be created.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldFailClosedWhenApplicationStatusIsMissing() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00070001", "00070002")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Application 1000456 status could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRejectAnUnsupportedExemptionType() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-FED", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-FED")).thenReturn(Optional.of("F"));
    when(exemptionService.findByExemptionNumber("EX-FED"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-FED", "F", "00070001", "00070002")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The exemption type or identity could not be verified.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRejectClientDetailsBoundToAnotherExemption() {
    PermitMutationRequestDto request =
        permitMutationRequest("EX-700", "00070001", "00070002", null);
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00099999", "00070002")));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The permit owner does not match the selected exemption.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void addPermitShouldRejectAPreassignedOicApplication() {
    PermitMutationRequestDto request =
        permitMutationRequest("BOIC-1", "00070001", null, "1000999");
    when(repository.findExemptionTypeCode("BOIC-1")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("BOIC-1"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients("BOIC-1", "B", null, null)));

    PermitMutationRpcResponseDto response = service.addPermit(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The OIC application relationship is assigned when the first Blanket OIC package is created.");
    verify(repository, never()).insertPermitDetail(any(), any());
  }

  @Test
  void updatePermitShouldKeepTheCurrentExemptionWhenTheRequestOmitsIt() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, null, null, null), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().exemptionNumber()).isEqualTo("EX-700");
  }

  @Test
  void updatePermitShouldRejectExpiredCanonicalPermitWithoutWriting() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("EXP")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("ACT", "42", "forged resurrection"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Expired permits are read-only.");
    verify(repository, never()).findExemptionTypeCode(any());
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldPersistInteriorCompletionWithoutReceiptAsPaymentPending() {
    stubInvoiceOrchestration();
    stubNonCanadianInvoiceSnapshot(1903L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(interiorPermitMutationRowWithReceipt()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes", "", "1903"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.permitStatus()).isEqualTo("PPD");
    assertThat(response.warnings())
        .containsExactly(ProvincialPermitMutationValidator.PAYMENT_PENDING_WARNING);
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().permitStatusCode()).isEqualTo("PPD");
    assertThat(permitCaptor.getValue().receiptNumber()).isNull();
  }

  @Test
  void updatePermitShouldClearExplicitlyBlankOptionalTextFields() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRowWithClearableFields()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(clearOptionalPermitStringsRequest(), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().otherPortOfExport()).isNull();
    assertThat(permitCaptor.getValue().remarks()).isNull();
    assertThat(permitCaptor.getValue().agentNumber()).isNull();
    assertThat(permitCaptor.getValue().agentLocationCode()).isNull();
    assertThat(permitCaptor.getValue().overrideComment()).isNull();
  }

  @Test
  void updatePermitShouldRejectNonFiniteSubmittedVolumes() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(invalidPermitVolumesRequest(), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactlyInAnyOrder(
            "A valid permit volume is required.",
            "A valid Permit Request Volume is required.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectForgedBlanketOicLimitsForANonBlanketPermit() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            oicRequestLimitsRequest("ACT", "101", "101.0"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Blanket OIC request limits can only be changed on Blanket OIC permits.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectBlanketOicLimitsThatExceedOracleStorage() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            oicRequestLimitsRequest("ACT", "10000000000", "1234567.89"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactlyInAnyOrder(
            "Permit Request Pieces must be a positive whole number no greater than 9999999999.",
            "Permit Request Volume must be a positive number of 9 characters or fewer with no more than 2 decimal places.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldAcceptBlanketOicLimitsAtOracleStorageBoundaries() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            oicRequestLimitsRequest("ACT", "9999999999", "999999999"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().oicRequestPieces()).isEqualTo(9_999_999_999L);
    assertThat(permitCaptor.getValue().oicRequestVolume()).isEqualTo(999_999_999.0d);
  }

  @Test
  void updatePermitShouldRejectANonFiniteOverrideFee() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(invalidOverrideFeeRequest(), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Override fee must be greater than zero.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectOverrideRateChangesWhenCompletedPermitRemainsInvoiced() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithOverride("COM", 25.0d, "Reviewed calculation")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("COM", "true", "30.00", "Reviewed calculation"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Fee overrides cannot be changed after permit invoicing.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verifyNoInteractions(permitInvoiceOrchestrationService);
  }

  @Test
  void updatePermitShouldRejectOverrideCommentChangesWhenPaymentPendingPermitRemainsInvoiced() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithOverride("PPD", 25.0d, "Reviewed calculation")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("PPD", "true", "25.00", "Changed after invoicing"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Fee overrides cannot be changed after permit invoicing.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verifyNoInteractions(permitInvoiceOrchestrationService);
  }

  @Test
  void updatePermitShouldRejectDisablingOverrideAcrossInvoicedStatuses() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithOverride("COM", 25.0d, "Reviewed calculation")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("PPD", "false", "", ""), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Fee overrides cannot be changed after permit invoicing.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verifyNoInteractions(permitInvoiceOrchestrationService);
  }

  @Test
  void updatePermitShouldAllowAnUnchangedOverrideWhilePermitRemainsInvoiced() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithOverride("PPD", 25.0d, "Reviewed calculation")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("PPD", "true", "25.00", "Reviewed calculation"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository)
        .updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE));
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectInvoiceMaterialChangesWhilePermitRemainsInvoiced() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("PPD")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectBlanketOicRequestLimitChangesAfterInvoicing() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRowWithStatus("PPD")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            oicRequestLimitsRequest("PPD", "101", "101.0"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @ParameterizedTest
  @ValueSource(strings = {"ACT", "CAN"})
  void updatePermitShouldRejectInvoiceMaterialChangesWhileLeavingInvoicedStatus(
      String targetStatus) {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("PPD")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest(targetStatus, "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectInteractiveExpiryTransition() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("EXP", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Permit expiry is managed by the expiry process.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldAllowCancelledPermitReactivationWithoutMaterialChanges() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("CAN")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "EXE", null));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("ACT", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository)
        .updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE));
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE"));
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectInvoiceNotationChangesWhilePermitRemainsInvoiced() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("PPD")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes", "RCPT-CHANGED"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectPermitTotalChangesAfterInvoicing() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "43", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldAllowFirstReceiptWhenCompletingPaymentPendingPermit() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithIssueAndReceipt(
                    "PPD", LocalDate.of(2026, 3, 16), null)));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes", "RCPT-200"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().permitStatusCode()).isEqualTo("COM");
    assertThat(permitCaptor.getValue().receiptNumber()).isEqualTo("RCPT-200");
    assertThat(permitCaptor.getValue().permitIssueDate())
        .isEqualTo(LocalDate.of(2026, 3, 16));
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectIssueDateChangeDuringPaymentPendingCompletion() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithIssueAndReceipt(
                    "PPD", LocalDate.of(2026, 3, 15), null)));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes", "RCPT-200"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice-related permit details cannot be changed after permit invoicing. Reactivate or cancel the permit first.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldAllowSettingOverrideBeforeEnteringInvoicedStatus() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(withOrgUnit(permitMutationRow("ACT"), 1903L)));
    stubTargetMinisterialExemption("EX-700");
    stubInvoiceOrchestration();
    stubNonCanadianInvoiceSnapshot(1903L);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("COM", "true", "25.00", "Reviewed calculation"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().overrideFee()).isEqualTo(25.0d);
    assertThat(permitCaptor.getValue().overrideComment()).isEqualTo("Reviewed calculation");
    verify(permitInvoiceOrchestrationService).orchestrate(any(), eq("idir\\jsmith"));
  }

  @Test
  void updatePermitShouldRejectChangingOverrideWhileLeavingInvoicedStatus() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                permitMutationRowWithOverride("COM", 25.0d, "Reviewed calculation")));
    stubTargetMinisterialExemption("EX-700");
    PermitMutationRpcResponseDto response =
        service.updatePermit(
            feeOverrideRequest("ACT", "true", "30.00", "Changed after cancellation"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Fee overrides cannot be changed after permit invoicing.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verifyNoInteractions(permitInvoiceOrchestrationService);
  }

  @Test
  void updatePermitShouldFailClosedWhenALinkedApplicationHasAnUnexpectedStatus() {
    stubInvoiceOrchestrationAvailability();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(withOrgUnit(permitMutationRow("ACT"), 1903L)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000457L, 1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("APP"));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to update linked application statuses.");
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updatePermitShouldRevertPermittedApplicationsWhenCompletedPermitIsCancelled() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    stubInvoiceOrchestration();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PMT", null));

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT"));
  }

  @Test
  void updatePermitShouldPreserveLegacyPermittedStatusWhenPaymentPendingPermitIsCancelled() {
    stubInvoiceOrchestration();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("PPD")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository, never()).findApplicationNumbersByPermitNumberRequired(anyLong());
    verify(repository, never()).findApplicationStatusCodeByNumber(anyLong());
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updatePermitShouldPreservePermittedApplicationWhenAnotherEffectivePermitRemains() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    stubInvoiceOrchestration();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, 7000123L, entryTimestamp),
                scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));
    when(repository.findPermitMutationByPermitNumber(7000999L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updatePermitShouldFailClosedWhenAnotherLinkedPermitCannotBeResolved() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    stubInvoiceOrchestrationAvailability();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, 7000123L, entryTimestamp),
                scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));
    when(repository.findPermitMutationByPermitNumber(7000999L)).thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to update linked application statuses.");
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updatePermitShouldFailTheAggregateWhenLinkedApplicationStatusCannotBeSaved() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    stubInvoiceOrchestrationAvailability();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                false, true, true, "PMT", null));

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Unable to update linked application statuses.");
  }

  @Test
  void updatePermitShouldFailWhenLinkedApplicationStatusChangesConcurrently() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    stubInvoiceOrchestrationAvailability();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            ApplicationReviewRepository.ApplicationStatusTransitionRow.notAllowed("APP"));

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Unable to update linked application statuses.");
  }

  @Test
  void updatePermitShouldFailClosedWhenInvoiceOrchestrationIsUnavailable() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Invoice processing is unavailable for this destination; the permit was not changed.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldFailClosedWhenInvoiceCancellationIsUnavailable() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("CAN", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Invoice processing is unavailable for this destination; the permit was not changed.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldFailBeforeMutationWhenModeDoesNotSupportTheDestination() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("US")).thenReturn(false);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Invoice processing is unavailable for this destination; the permit was not changed.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
  }

  @Test
  void updatePermitShouldRequireCountryToBeSavedBeforeCompletion() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice policy and billing fields must be saved while the permit is active before it can be completed.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRequireOrganizationToBeSavedBeforeCompletion() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("COM", "42", "Legacy notes", "RCPT-100", "1909"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Invoice policy and billing fields must be saved while the permit is active before it can be completed.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldKeepTheSubmitDateImmutableAfterCreation() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"),
            LocalDate.of(2025, 3, 15),
            "US",
            "00077880",
            "01");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("ACT", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The permit submit date cannot be changed after the permit is created.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldBindOrganizationChangesToLinkedApplications() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    stubCanadianInvoiceApplication(1835L, "EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            formCheckRequest("ACT", "42", "Legacy notes", "RCPT-100", "1909"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The permit organization must match every linked application.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldBuildLegacyCompatibleCanadianInternalInvoiceSnapshot() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"),
            LocalDate.of(2026, 3, 15),
            "CA",
            "00077880",
            "01");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(1835L, "EX-700");
    stubInvoiceOrchestration();
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM-1", "FI", "A", 10.0d, 20L, "7000123", "PKG-1")));
    when(repository.findFixedExemptionRate("EX-700"))
        .thenReturn(Optional.of(BigDecimal.valueOf(3.25)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 3, 15), 1835L))
        .thenReturn(BigDecimal.valueOf(5));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(100.25)));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<Transition> transitionCaptor = ArgumentCaptor.forClass(Transition.class);
    verify(permitInvoiceOrchestrationService)
        .orchestrate(transitionCaptor.capture(), eq("idir\\jsmith"));
    Transition transition = transitionCaptor.getValue();
    assertThat(transition.countryCode()).isEqualTo("CA");
    InternalInvoiceSnapshot invoice = transition.internalInvoice();
    assertThat(invoice.invoiceTotal()).isEqualByComparingTo(BigDecimal.ZERO);
    assertThat(invoice.billingClientNumber()).isEqualTo("00077880");
    assertThat(invoice.billingClientLocationCode()).isEqualTo("01");
    assertThat(invoice.exemptionOverrideRate()).isEqualByComparingTo("3.25");
    assertThat(invoice.permitOverrideAmount()).isEqualByComparingTo(BigDecimal.ZERO);
    assertThat(invoice.originOrgNumber()).isEqualTo(1835L);
    assertThat(invoice.adminOrgNumber()).isEqualTo(1835L);
    assertThat(invoice.details()).hasSize(1);
    assertThat(invoice.details().get(0).amount()).isEqualByComparingTo("32.50");
    assertThat(invoice.details().get(0).amvRate()).isEqualByComparingTo("100.25");
    assertThat(invoice.details().get(0).feePolicyAdmin()).isEqualByComparingTo(BigDecimal.ZERO);
    assertThat(invoice.details().get(0).feePercentage()).isEqualByComparingTo(BigDecimal.ZERO);
    assertThat(transition.gbmsInvoice()).isNull();
  }

  @ParameterizedTest
  @CsvSource({
    "1833,EXF", "1834,EXF", "1835,FLM",
    "1903,EXF", "1904,EXF", "1905,EXF", "1906,EXF", "1907,EXF", "1908,EXF",
    "1909,FLM", "1910,FLM"
  })
  void updatePermitShouldBuildLegacyGbmsPackageInvoiceSnapshot(
      long orgUnitNumber, String expectedAckMask) {
    PermitMutationRow current = withOrgUnit(permitMutationRow("ACT"), orgUnitNumber);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(orgUnitNumber, "EX-700");
    stubInvoiceOrchestration();
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM-1", "FI", "A", 10.0d, 20L, "7000123", "PKG-1"),
                scale("102", "TM-2", "FI", "A", 5.0d, 10L, "7000123", "PKG-1"),
                scale("103", "TM-3", "FI", "A", 2.0d, 4L, "7000123", "PKG-2")));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 3, 15), orgUnitNumber))
        .thenReturn(BigDecimal.ZERO);
    when(repository.isApplicationUnmanufactured(1000456L)).thenReturn(true);
    when(repository.findAverageMarketValueByScaleId(any()))
        .thenReturn(Optional.of(BigDecimal.ONE));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<Transition> transitionCaptor = ArgumentCaptor.forClass(Transition.class);
    verify(permitInvoiceOrchestrationService)
        .orchestrate(transitionCaptor.capture(), eq("idir\\jsmith"));
    Transition transition = transitionCaptor.getValue();
    InternalInvoiceSnapshot internal = transition.internalInvoice();
    GbmsInvoiceSnapshot gbms = transition.gbmsInvoice();
    assertThat(internal.invoiceTotal()).isEqualByComparingTo("17.00");
    assertThat(internal.billingClientNumber()).isEqualTo("00077881");
    assertThat(internal.ackMaskAcode()).isEqualTo(expectedAckMask);
    assertThat(gbms.invoiceTotal()).isEqualByComparingTo("17.00");
    assertThat(gbms.ownerClientNumber()).isEqualTo("00077881");
    assertThat(gbms.ownerClientLocationCode()).isEqualTo("01");
    assertThat(gbms.ackMaskAcode()).isEqualTo(expectedAckMask);
    assertThat(gbms.lines())
        .extracting(line -> line.description() + ":" + line.amount().toPlainString())
        .containsExactly("PACKAGE PKG-1:15.00", "PACKAGE PKG-2:2.00");
    assertThat(gbms.notationText())
        .isEqualTo("EXPORT FEES FOR PERMIT 7000123 ISSUED 2026-03-16 RN:RCPT-100");
  }

  @Test
  void updatePermitShouldBuildLegacyGbmsOverrideDescription() {
    PermitMutationRow current =
        withOrgUnit(
            permitMutationRowWithOverride(25.0d, "Reviewed calculation"), 1909L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(1909L, "EX-700");
    stubInvoiceOrchestration();
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM-1", "FI", "A", 10.0d, 20L, "7000123", "PKG-1"),
                scale("102", "TM-2", "FI", "A", 5.0d, 10L, "7000123", "PKG-2")));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 3, 15), 1909L))
        .thenReturn(BigDecimal.ZERO);
    when(repository.isApplicationUnmanufactured(1000456L)).thenReturn(true);
    when(repository.findAverageMarketValueByScaleId(any()))
        .thenReturn(Optional.of(BigDecimal.ONE));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<Transition> transition = ArgumentCaptor.forClass(Transition.class);
    verify(permitInvoiceOrchestrationService)
        .orchestrate(transition.capture(), eq("idir\\jsmith"));
    assertThat(transition.getValue().internalInvoice().invoiceTotal())
        .isEqualByComparingTo("25.0");
    assertThat(transition.getValue().gbmsInvoice().lines())
        .containsExactly(new GbmsInvoiceLine(BigDecimal.valueOf(25.0), "PKGS: PKG-1, PKG-2"));
  }

  @Test
  void updatePermitShouldRejectAnUnsupportedGbmsOrganization() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    stubTargetMinisterialExemption("EX-700");
    stubInvoiceOrchestrationAvailability();
    stubNonCanadianInvoiceSnapshot(9999L);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to coordinate the permit invoice status change.");
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
  }

  @Test
  void updatePermitShouldPersistPreCutoverCanadianInvoiceTotalAndPolicyFactors() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRowWithOverride(25.0d, "Reviewed calculation"),
            LocalDate.of(2024, 1, 15),
            "CA",
            null,
            null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(1835L, "EX-700");
    stubInvoiceOrchestration();
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM-1", "FI", "A", 10.0d, 20L, "7000123", "PKG-1")));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2024, 1, 15), 1835L))
        .thenReturn(BigDecimal.valueOf(5));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(100)));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<Transition> transitionCaptor = ArgumentCaptor.forClass(Transition.class);
    verify(permitInvoiceOrchestrationService)
        .orchestrate(transitionCaptor.capture(), eq("idir\\jsmith"));
    InternalInvoiceSnapshot invoice = transitionCaptor.getValue().internalInvoice();
    assertThat(invoice.invoiceTotal()).isEqualByComparingTo("157.50");
    assertThat(invoice.billingClientNumber()).isEqualTo("00077881");
    assertThat(invoice.billingClientLocationCode()).isEqualTo("01");
    assertThat(invoice.exemptionOverrideRate()).isEqualByComparingTo(BigDecimal.ZERO);
    assertThat(invoice.permitOverrideAmount()).isEqualByComparingTo("25.0");
    assertThat(invoice.details().get(0).amount()).isEqualByComparingTo("157.50");
    assertThat(invoice.details().get(0).feePolicyAdmin()).isEqualByComparingTo("5");
    assertThat(invoice.details().get(0).feePercentage()).isEqualByComparingTo("0.15");
  }

  @Test
  void updatePermitShouldFailTheAggregateWhenCanadianInvoiceSnapshotCannotBeBuilt() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"),
            LocalDate.of(2026, 3, 15),
            "CA",
            "00077880",
            "01");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("CA")).thenReturn(true);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Unable to coordinate the permit invoice status change.");
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
    verify(applicationReviewRepository, never()).updateStatus(anyLong(), any(), any(), any());
  }

  @Test
  void updatePermitShouldFailClosedForNonNumericCanadianFeeFactors() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"), LocalDate.of(2026, 3, 15), "CA", null, null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(1835L, "EX-700");
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("CA")).thenReturn(true);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                new PermitScaleDetailRow(
                    "101",
                    "TM-1",
                    "FI",
                    "A",
                    10.0d,
                    20L,
                    1000456L,
                    "7000123",
                    "PKG-1",
                    "C",
                    "100.00",
                    "ERR",
                    "1.5")));
    when(repository.findAverageMarketValueByScaleId("101"))
        .thenReturn(Optional.of(BigDecimal.valueOf(100)));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Unable to coordinate the permit invoice status change.");
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
    verify(applicationReviewRepository, never()).updateStatus(anyLong(), any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectInvoiceOrganizationThatDoesNotMatchScaleApplications() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"),
            LocalDate.of(2026, 3, 15),
            "CA",
            "00077880",
            "01");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");
    stubCanadianInvoiceApplication(1909L, "EX-700");
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("CA")).thenReturn(true);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM-1", "FI", "A", 10.0d, 20L, "7000123", "PKG-1")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Unable to coordinate the permit invoice status change.");
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
    verify(applicationReviewRepository, never()).updateStatus(anyLong(), any(), any(), any());
  }

  @Test
  void updatePermitShouldFailClosedWhenCanadianInvoiceApplicationDateIsMissing() {
    PermitMutationRow current =
        withInvoiceContext(permitMutationRow("ACT"), null, "CA", null, null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A valid submit date is required to complete a permit.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
    verify(permitInvoiceOrchestrationService, never()).orchestrate(any(), any());
  }

  @Test
  void updatePermitShouldRejectFutureSubmitDateBeforeCanadianInvoicing() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"), LexisBusinessTime.today().plusDays(1), "CA", null, null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Submit Date can't be in the future.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRejectClientSelectedPaymentPendingStatus() {
    PermitMutationRow current =
        withInvoiceContext(
            permitMutationRow("ACT"),
            LocalDate.of(2026, 3, 15),
            "CA",
            "00077880",
            "01");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(current));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("PPD", "CA"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Payment pending is assigned automatically when an interior permit is completed without a receipt.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldRollBackWhenInvoiceOrchestrationThrows() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(withOrgUnit(permitMutationRow("ACT"), 1903L)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("US")).thenReturn(true);
    stubNonCanadianInvoiceSnapshot(1903L);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(permitInvoiceOrchestrationService.orchestrate(any(), eq("idir\\jsmith")))
        .thenThrow(new IllegalStateException("simulated GBMS outage"));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitMutationRpcResponseDto response =
        transactionalService(transactionManager)
            .updatePermit(invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Unable to coordinate the permit invoice status change.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verify(applicationReviewRepository, never()).updateStatus(anyLong(), any(), any(), any());
  }

  @Test
  void updatePermitShouldSurfaceReconciliationBeforeRetry() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(withOrgUnit(permitMutationRow("ACT"), 1903L)));
    stubTargetMinisterialExemption("EX-700");
    stubNonCanadianInvoiceSnapshot(1903L);
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry("US")).thenReturn(true);
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(permitInvoiceOrchestrationService.orchestrate(any(), eq("idir\\jsmith")))
        .thenReturn(
            PermitInvoiceOrchestrationService.TransitionResult.failed(
                "Permit invoicing failed after GBMS processing began; reconcile before retry."));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Permit invoicing failed after GBMS processing began; reconcile before retry.");
  }

  @Test
  void updatePermitShouldSynchronizeMinisterialPackageCodesAndVolume() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageInfoRow("PKG-903", 1000456L, 12.0d, 10.0d, 2.0d, null, null)));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L,
                    "EX-700",
                    1835L,
                    "South Coast",
                    "T",
                    "S",
                    "HE/OT")));
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HE", "J", 10.3d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "CE", "U", 5.5d, 4L, "7000123", "PKG-903"),
                scale("103", "TM3", "FI", "X", 99.0d, 1L, "8000999", "PKG-903")));
    when(applicationDetailsRpcService.synchronizePackageForPermitTransition(
            "PKG-903", 15.8d, "S", "T", "idir\\jsmith"))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("ACT", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationDetailsRpcService)
        .synchronizePackageForPermitTransition(
            "PKG-903", 15.8d, "S", "T", "idir\\jsmith");
    verify(permitInvoiceOrchestrationServiceProvider, never()).getIfAvailable();
  }

  @Test
  void updatePermitShouldFailClosedWhenLinkedPackageExemptionTypeIsUnavailable() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageInfoRow("PKG-903", 1000456L, 12.0d, 10.0d, 2.0d, null, null)));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L,
                    "EX-MISSING",
                    1835L,
                    "South Coast",
                    "T",
                    "S",
                    "HE/OT")));
    when(repository.findExemptionTypeCode("EX-MISSING")).thenReturn(Optional.empty());

    PermitMutationRpcResponseDto response =
        service.updatePermit(formCheckRequest("ACT", "42", "Legacy notes"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Unable to synchronize linked application or package data.");
    verify(applicationDetailsRpcService, never())
        .synchronizePackageForPermitTransition(any(), any(), any(), any(), any());
  }

  @Test
  void updatePermitShouldSynchronizeBlanketOicHiddenApplicationOwner() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(applicationDetailsRpcService.synchronizeApplicationOwner(
            1000999L, "00099999", "01", "idir\\jsmith"))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, "00099999", null, "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationDetailsRpcService)
        .synchronizeApplicationOwner(1000999L, "00099999", "01", "idir\\jsmith");
  }

  @Test
  void updatePermitShouldOnlySynchronizeBlanketOicPackageVolume() {
    stubInvoiceOrchestration();
    stubNonCanadianInvoiceSnapshot(1903L);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(withOrgUnit(blanketOicPermitMutationRow(), 1903L)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageInfoRow("PKG-903", 1000999L, 12.0d, 10.0d, 2.0d, null, null)));
    stubOicApplicationBinding("EX-700", "Y", 1903L);
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HE", "J", 10.3d, 11L, "7000123", "PKG-903"),
                scale("102", "TM2", "CE", "U", 5.5d, 4L, "7000123", "PKG-903")));
    when(applicationDetailsRpcService.synchronizePackageVolumeForPermitTransition(
            "PKG-903", 15.8d, "idir\\jsmith"))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            invoiceMaterialChangeRequest("COM", "US"), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationDetailsRpcService)
        .synchronizePackageVolumeForPermitTransition(
            "PKG-903", 15.8d, "idir\\jsmith");
    verify(applicationDetailsRpcService, never())
        .synchronizePackageForPermitTransition(any(), any(), any(), any(), any());
  }

  @Test
  void permitMutationApplicationsShouldIncludeTheHiddenOicApplication() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000457L, 1000456L));
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    stubOicApplicationBinding("EX-700");

    assertThat(service.getApplicationNumbersForPermitMutation(7000123L))
        .containsExactly(1000456L, 1000457L, 1000999L);
  }

  @Test
  void permitMutationExemptionShouldComeFromTheAuthoritativePermitRow() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));

    assertThat(service.getExemptionNumberForPermitMutation(7000123L))
        .isEqualTo("EX-700");
  }

  @Test
  void permitMutationExemptionShouldFailClosedWhenPermitCannotBeLoaded() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.getExemptionNumberForPermitMutation(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("could not be loaded");
  }

  @Test
  void permitMutationExemptionShouldFailClosedWhenStoredParentIsBlank() {
    PermitMutationRow permit =
        withAggregateRelationships(permitMutationRow(), "  ", null);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));

    assertThatThrownBy(() -> service.getExemptionNumberForPermitMutation(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("no authoritative exemption relationship");
  }

  @Test
  void permitMutationApplicationsShouldFailClosedForInvalidStoredOicRelationship() {
    PermitMutationRow permit =
        withAggregateRelationships(permitMutationRow(), "EX-700", 0L);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permit));

    assertThatThrownBy(() -> service.getApplicationNumbersForPermitMutation(7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid OIC application relationship");
  }

  @Test
  void exemptionMutationApplicationsShouldUseStrictRelationshipDiscovery() {
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000457L, 1000456L));

    assertThat(service.getApplicationNumbersForExemptionMutation(" EX-700 "))
        .containsExactly(1000456L, 1000457L);
    verify(repository).findApplicationNumbersByExemptionNumberRequired("EX-700");
  }

  @Test
  void updatePermitShouldRejectClientMutationOutsideTheCurrentExemptionBinding() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest("EX-700", "00099999", "00077880", null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The permit owner does not match the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectReparentingAcrossApplicationBindings() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    stubTargetMinisterialExemption("EX-800");
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationNumbersByExemptionNumber("EX-800"))
        .thenReturn(List.of(1000999L));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest("EX-800", "00077881", "00077880", null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The permit has applications that do not belong to the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectReparentingAcrossPackageBindings() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    stubTargetMinisterialExemption("EX-800");
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of("PKG-OLD"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackagesByExemptionNumberRequired("EX-800"))
        .thenReturn(List.of(new PackageCandidateRow(1000999L, "PKG-NEW")));

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest("EX-800", "00077881", "00077880", null),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The permit has packages that do not belong to the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectAssigningAnOicApplicationThroughGenericPermitUpdate() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("BOIC-2")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("BOIC-2"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients("BOIC-2", "B", null, null)));
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPackageNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of());

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest("BOIC-2", "00077881", "00077880", "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The OIC application relationship cannot be changed through permit update.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectAStoredOicApplicationOutsideTheAuthoritativeExemption() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("BOIC-OTHER");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, "00077881", "00077880", "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The OIC application does not belong to the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectAnOrdinaryApplicationStoredAsTheOicRelationship() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700", "N");

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, "00077881", "00077880", "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The OIC application does not belong to the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldRejectAnOicRelationshipWithoutAnAuthoritativeIndicator() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700", null);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, "00077881", "00077880", "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The OIC application does not belong to the selected exemption.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updatePermitShouldAcceptAnAuthoritativeOicApplicationRelationship() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "B", "00077881", "00077880")));
    stubOicApplicationBinding("EX-700", "Y");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updatePermit(
            updatePermitRequest(null, "00077881", "00077880", "1000999"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository)
        .updatePermitDetail(
            any(PermitMutationRow.class), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
  }

  @Test
  void updateShippingShouldRejectInvalidDate() {
    PermitMutationRequestDto request = updateShippingRequest("bad-date");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitMutationRow(
                    7000123L,
                    null,
                    null,
                    null,
                    null,
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 1),
                    LocalDate.of(2026, 5, 2),
                    null,
                    LocalDate.of(2026, 6, 1),
                    10.0d,
                    10L,
                    0L,
                    null,
                    null,
                    "idir\\jsmith",
                    null,
                    "S",
                    "W",
                    "00070001",
                    "01",
                    null,
                    null,
                    "EX-700",
                    1835L,
                    null,
                    "ACT",
                    "S",
                    "US",
                    null,
                    null,
                    null,
                    null,
                    null,
                    "T")));

    PermitMutationRpcResponseDto response = service.updateShipping(request, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Invalid Date Format");
  }

  @Test
  void updateShippingShouldValidateTheMergedPermitBeforeUpdate() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber("EX-700"))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    "EX-700", "M", "00077881", "00077880")));

    PermitMutationRpcResponseDto response =
        service.updateShipping(
            updateShippingRequest("2026-06-10", ""), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("A valid company name on the Shipping tab is required.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updateShippingShouldRejectExpiredCanonicalPermitWithoutWriting() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("EXP")));

    PermitMutationRpcResponseDto response =
        service.updateShipping(
            updateShippingRequest("2026-06-10", "Forged destination"), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Expired permits are read-only.");
    verify(repository, never()).findExemptionTypeCode(any());
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updateShippingShouldRejectCancelledCanonicalPermitWithoutWriting() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("CAN")));

    PermitMutationRpcResponseDto response =
        service.updateShipping(
            updateShippingRequest("2026-06-10", "Forged destination"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Cancelled permits must be reactivated before shipping details can be changed.");
    verify(repository, never()).findExemptionTypeCode(any());
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"COM", "PPD"})
  void updateShippingShouldRejectDestinationCountryChangeAfterInvoicing(
      String permitStatus) {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow(permitStatus)));
    stubTargetMinisterialExemption("EX-700");

    PermitMutationRpcResponseDto response =
        service.updateShipping(
            updateShippingRequest("2026-06-10", "Destination Co", "CA"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Destination country cannot be changed after permit invoicing.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void updateShippingShouldAllowNonInvoiceShippingChangesAfterInvoicing() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("COM")));
    stubTargetMinisterialExemption("EX-700");
    when(repository.updatePermitDetail(
            any(PermitMutationRow.class),
            eq("idir\\jsmith"),
            eq(FEE_MASK_EFFECTIVE_DATE)))
        .thenReturn(true);

    PermitMutationRpcResponseDto response =
        service.updateShipping(
            updateShippingRequest("2026-06-10", "Updated destination"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<PermitMutationRow> permitCaptor =
        ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), eq("idir\\jsmith"), eq(FEE_MASK_EFFECTIVE_DATE));
    assertThat(permitCaptor.getValue().destinationCompanyName())
        .isEqualTo("Updated destination");
    assertThat(permitCaptor.getValue().countryCode()).isEqualTo("US");
  }

  @Test
  void addInvoiceShouldPersistWhenInputIsValid() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L)).thenReturn(Optional.empty());
    when(repository.insertSalesInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 12.0d)));

    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The sales invoice was saved successfully.");
    assertThat(response.errors()).isEmpty();
  }

  @Test
  void addInvoiceShouldRollBackWhenInsertReturnsNoRow() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.empty());
    when(repository.insertSalesInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitPersistenceRpcResponseDto response =
        transactionalService(transactionManager)
            .addInvoice(
                7000123L,
                "INV-100",
                new BigDecimal("100.00"),
                new BigDecimal("1.25"),
                new BigDecimal("12.00"),
                "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to save sales invoice.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addInvoiceShouldRollBackWhenInsertReturnsMismatchedInvoice() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.empty());
    when(repository.insertSalesInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith"))
        .thenReturn(
            Optional.of(
                new SalesInvoiceRow("INV-OTHER", 99.0d, 1.25d, 12.0d)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitPersistenceRpcResponseDto response =
        transactionalService(transactionManager)
            .addInvoice(
                7000123L,
                "INV-100",
                new BigDecimal("100.00"),
                new BigDecimal("1.25"),
                new BigDecimal("12.00"),
                "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Unable to save sales invoice.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addInvoiceShouldReturnValidationErrors() {
    PermitPersistenceRpcResponseDto response =
        service.addInvoice(null, "", null, null, null, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).isNotEmpty();
  }

  @Test
  void addInvoiceShouldRejectOversizedSalesInvoiceNumberBeforeOracleInsert() {
    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-123456",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The sales invoice number must be 9 characters or fewer.");
  }

  @Test
  void addInvoiceShouldRejectDuplicateInvoice() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findSalesInvoiceByNumberAndPermit("INV-100", 7000123L))
        .thenReturn(Optional.of(new SalesInvoiceRow("INV-100", 100.0d, 1.25d, 12.0d)));

    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Sales invoice INV-100 already exists.");
  }

  @Test
  void addInvoiceShouldRejectMissingPermitBeforeInvoiceLookup() {
    when(repository.findPermitMutationByPermitNumber(7000123L)).thenReturn(Optional.empty());

    PermitPersistenceRpcResponseDto response =
        service.addInvoice(
            7000123L,
            "INV-100",
            new BigDecimal("100.00"),
            new BigDecimal("1.25"),
            new BigDecimal("12.00"),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Permit not found.");
    verify(repository, never()).findSalesInvoiceByNumberAndPermit(any(), any());
    verify(repository, never()).insertSalesInvoice(any(), any(), any(), any(), any(), any());
  }

  @Test
  void addInvoiceShouldRejectNonActivePermitBeforeInvoiceLookup() {
    for (String status : List.of("COM", "PPD", "CAN", "EXP")) {
      when(repository.findPermitMutationByPermitNumber(7000123L))
          .thenReturn(Optional.of(permitMutationRow(status)));

      PermitPersistenceRpcResponseDto response =
          service.addInvoice(
              7000123L,
              "INV-100",
              new BigDecimal("100.00"),
              new BigDecimal("1.25"),
              new BigDecimal("12.00"),
              "idir\\jsmith");

      assertThat(response.success()).isFalse();
      assertThat(response.errors()).containsExactly("Invoices can only be added to active permits.");
    }
    verify(repository, never()).findSalesInvoiceByNumberAndPermit(any(), any());
    verify(repository, never()).insertSalesInvoice(any(), any(), any(), any(), any(), any());
  }

  @Test
  void conversionRateShouldReturnSuccessWhenRateExists() {
    when(repository.findCurrencyConversionRateByDate(LexisBusinessTime.today(), "USD"))
        .thenReturn(Optional.of(1.333d));

    PermitConversionRateRpcResponseDto response = service.getConversionRate();

    assertThat(response.success()).isTrue();
    assertThat(response.conversionRate()).isEqualTo("1.33");
  }

  @Test
  void conversionRateShouldFailClosedWhenRateIsMissingOrNonPositive() {
    when(repository.findCurrencyConversionRateByDate(LexisBusinessTime.today(), "USD"))
        .thenReturn(Optional.of(0.0d));

    PermitConversionRateRpcResponseDto response = service.getConversionRate();

    assertThat(response.success()).isFalse();
    assertThat(response.conversionRate()).isEmpty();
  }

  @Test
  void feeCalculationShouldPropagateFeePolicyLookupOutages() {
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), null, "US", 0.0d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () -> service.getTotalFeesForPermit(7000123L, "US", "2026-01-15"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void feeCalculationShouldPropagateUnmanufacturedLookupOutages() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "J", 10.0d, 2L, "7000123", "PKG-1")));
    when(repository.isApplicationUnmanufactured(1000456L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () -> service.getTotalFeesForPermit(7000123L, "US", "2026-01-15"))
        .isInstanceOf(DataAccessResourceFailureException.class);
  }

  @Test
  void feeCalculationShouldFailClosedWhenAverageMarketValueIsMissing() {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(scale("101", "TM1", "HEM", "J", 10.0d, 2L, "7000123", "PKG-1")));
    when(repository.findPermitPolicyContextByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitPolicyContextRow(
                    7000123L, 1835L, LocalDate.of(2026, 1, 15), null, "US", 0.0d)));
    when(repository.findFeePolicyPercentIncrease(LocalDate.of(2026, 1, 15), 1835L))
        .thenReturn(BigDecimal.ZERO);
    when(repository.isApplicationUnmanufactured(1000456L)).thenReturn(false);
    when(repository.findAverageMarketValueByScaleId("101")).thenReturn(Optional.empty());

    assertThatThrownBy(
            () -> service.getTotalFeesForPermit(7000123L, "US", "2026-01-15"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("Average market value was unavailable");
  }

  @Test
  void fileTypesShouldReturnSortedFileTypeItems() {
    when(repository.findAllAttachmentTypes())
        .thenReturn(
            List.of(
                new AttachmentTypeRow("INS", "Application Document", 2L, 1L),
                new AttachmentTypeRow("INV", "Invoice", 1L, 1L)));

    List<PermitFileTypeRpcResponseDto> response = service.getFileTypes();

    assertThat(response).hasSize(2);
    assertThat(response.get(0).code()).isEqualTo("INV");
    assertThat(response.get(1).code()).isEqualTo("INS");
  }

  @Test
  void documentDetailsShouldIncludePermitAndApplicationDocuments() {
    when(repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(new DocumentRow(50L, "permit.pdf", "", "INV")));
    when(repository.isPermitFileAttachmentRequired(50L)).thenReturn(false);
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L, 1000456L));
    when(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(new DocumentRow(75L, "application.pdf", "", "INS")));
    when(repository.findAttachmentTypeDescription("INV")).thenReturn(Optional.of("Invoice"));
    when(repository.findAttachmentTypeDescription("INS")).thenReturn(Optional.of("Insurance"));

    List<PermitDocumentItemRpcResponseDto> response = service.getDocumentDetails(7000123L);

    assertThat(response).hasSize(2);
    assertThat(response.get(0).name()).isEqualTo("permit.pdf");
    assertThat(response.get(0).type()).isEqualTo("Invoice");
    assertThat(response.get(0).source()).isEqualTo("invoice");
    assertThat(response.get(0).sourcePermitNumber()).isEqualTo(7000123L);
    assertThat(response.get(0).deletable()).isTrue();
    assertThat(response.get(1).name()).isEqualTo("application.pdf");
    assertThat(response.get(1).type()).isEqualTo("Insurance");
    assertThat(response.get(1).source()).isEqualTo("application");
    assertThat(response.get(1).sourceApplicationNumber()).isEqualTo(1000456L);
    assertThat(response.get(1).deletable()).isFalse();
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
    verify(repository, times(1)).findApplicationDocumentDetailsByApplicationNumber(1000456L);
  }

  @Test
  void documentDetailsShouldFailClosedOnRelationshipTypeMismatch() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                new DocumentRow(50L, "valid-permit.pdf", "", "PMT"),
                new DocumentRow(51L, "invoice-code-on-permit-row.pdf", "", "INV"),
                new DocumentRow(52L, "permit-code-on-invoice-row.pdf", "", "PMT")));
    when(repository.isPermitFileAttachmentRequired(50L)).thenReturn(true);
    when(repository.isPermitFileAttachmentRequired(51L)).thenReturn(true);
    when(repository.isPermitFileAttachmentRequired(52L)).thenReturn(false);

    List<PermitDocumentItemRpcResponseDto> response =
        service.getDocumentDetails(7000123L);

    assertThat(response)
        .extracting(
            PermitDocumentItemRpcResponseDto::source,
            PermitDocumentItemRpcResponseDto::deletable)
        .containsExactly(
            tuple("permit", true),
            tuple("unknown", false),
            tuple("unknown", false));
  }

  @Test
  void documentDetailsShouldPropagatePermitRelationshipLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("permit attachment lookup unavailable");
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of());
    when(repository.findPermitDocumentDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(new DocumentRow(50L, "invoice.pdf", "", "INV")));
    when(repository.isPermitFileAttachmentRequired(50L)).thenThrow(failure);

    assertThatThrownBy(() -> service.getDocumentDetails(7000123L)).isSameAs(failure);
  }

  @Test
  void documentDetailsShouldPropagateApplicationRelationshipLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("application relationship lookup unavailable");
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L)).thenThrow(failure);

    assertThatThrownBy(() -> service.getDocumentDetails(7000123L)).isSameAs(failure);
  }

  @Test
  void applicationDocumentMutationShouldResolveOneAuthoritativeParent() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationDocumentDetailsByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new DocumentRow(44L, "application.pdf", "", "INS")));
    when(repository.findApplicationDocumentDetailsByApplicationNumberRequired(1000457L))
        .thenReturn(List.of());

    assertThat(service.getApplicationNumberForDocumentMutation(44L, 7000123L))
        .contains(1000456L);
  }

  @Test
  void applicationDocumentMutationShouldFailClosedForAmbiguousOwnership() {
    when(repository.findApplicationNumbersByPermitNumberRequired(7000123L))
        .thenReturn(List.of(1000456L, 1000457L));
    when(repository.findApplicationDocumentDetailsByApplicationNumberRequired(anyLong()))
        .thenReturn(List.of(new DocumentRow(44L, "application.pdf", "", "INS")));

    assertThatThrownBy(
            () -> service.getApplicationNumberForDocumentMutation(44L, 7000123L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("ambiguous");
  }

  @Test
  void packageInfoShouldReturnBlankFieldsWhenPackageNotFound() {
    when(repository.findPackageInfoByPackageNumber("PKG-903")).thenReturn(Optional.empty());

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.region()).isEmpty();
    assertThat(response.enduse()).isEmpty();
    assertThat(response.ageclass()).isEmpty();
    assertThat(response.volume()).isEmpty();
  }

  @Test
  void packageInfoShouldMapApplicationAndCodeDescriptions() {
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(new PackageInfoRow("PKG-903", 1000456L, 10.25d, 6.0d, 24.0d, "S", "T")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", 1835L, "Coast Region", "T", "S", "HE/UT")));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("T")).thenReturn(Optional.of("Unmanufactured Timber"));

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.region()).isEqualTo("Coast Region");
    assertThat(response.enduse()).isEqualTo("HE/UT");
    assertThat(response.ageclass()).isEqualTo("Standing");
    assertThat(response.volume()).isEqualTo("10.3");
    assertThat(response.length()).isEqualTo("6.0");
    assertThat(response.diameter()).isEqualTo("24.0");
    assertThat(response.productType()).isEqualTo("Unmanufactured Timber");
  }

  @Test
  void packageInfoShouldLeaveApplicationEndUseBlankWhenNoLegacyCandidateMatches() {
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(new PackageInfoRow("PKG-903", 1000456L, 10.25d, 6.0d, 24.0d, "S", "H")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(1000456L, "EX-700", 1835L, "Coast Region", "H", "S", null)));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findEndUsesByApplicationNumber(1000456L))
        .thenReturn(List.of(new EndUsePairRow("FI", "LUM")));
    when(repository.findCandidateExcolCodes(1, "FI", "LUM", 1835L))
        .thenReturn(List.of("HE/PL", "FI/OT"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("H")).thenReturn(Optional.of("Harvested Timber"));

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.enduse()).isEmpty();
  }

  @Test
  void packageInfoShouldUsePackageEndUseForBlanketOic() {
    when(repository.findPackageInfoByPackageNumber("PKG-903"))
        .thenReturn(
            Optional.of(new PackageInfoRow("PKG-903", 1000456L, 10.25d, 6.0d, 24.0d, "S", "T")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-701", 1835L, "Coast Region", "T", "O", "APP-ENDUSE")));
    when(repository.findExemptionTypeCode("EX-701")).thenReturn(Optional.of("B"));
    when(repository.findEndUsesByPackageNumber("PKG-903"))
        .thenReturn(List.of(new EndUsePairRow("HE", "UT")));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));
    when(repository.findProductTypeDescription("T")).thenReturn(Optional.of("Unmanufactured Timber"));

    PermitPackageInfoRpcResponseDto response = service.getPackageInfo("PKG-903");

    assertThat(response.enduse()).isEqualTo("HE/UT\n");
    assertThat(response.ageclass()).isEqualTo("Standing");
  }

  @Test
  void packageDetailsShouldReturnEmptyDefaultsWhenPackageNotFound() {
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(Optional.empty());

    PermitPackageDetailsRpcResponseDto response = service.getPackageDetails("PKG-903");

    assertThat(response.success()).isFalse();
    assertThat(response.packageNumber()).isEmpty();
    assertThat(response.scaledVolume()).isEqualTo(0.0d);
  }

  @Test
  void packageDetailsShouldMapPackageFieldsAndScaledVolume() {
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 10.25d, 6.0d, 24.0d, "ACT", "Reviewed", "N", "S")));
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 2.35d, 4L, "7000123", "PKG-903"),
                scale("102", "TM2", "FIR", "K", 1.24d, 2L, "7000123", "PKG-903")));
    when(repository.findPackageStatusDescription("ACT")).thenReturn(Optional.of("Active"));
    when(repository.findGrowthTypeDescription("S")).thenReturn(Optional.of("Standing"));

    PermitPackageDetailsRpcResponseDto response = service.getPackageDetails("PKG-903");

    assertThat(response.success()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.volume()).isEqualTo("10.3");
    assertThat(response.scaledVolume()).isEqualTo(3.6d);
    assertThat(response.length()).isEqualTo("6.0");
    assertThat(response.diameter()).isEqualTo("24.0");
    assertThat(response.status()).isEqualTo("ACT");
    assertThat(response.comments()).isEqualTo("Reviewed");
    assertThat(response.statusDesc()).isEqualTo("Active");
    assertThat(response.reprocessed()).isEqualTo("N");
    assertThat(response.ageClass()).isEqualTo("Standing");
  }

  @Test
  void hasFormChangesShouldReturnFalseWhenTrackedFieldsMatch() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));

    PermitMutationRequestDto request = formCheckRequest(" ACT ", "42", " Legacy notes ");

    boolean changed = service.hasFormChanges(request);

    assertThat(changed).isFalse();
  }

  @Test
  void hasFormChangesShouldReturnTrueWhenTrackedFieldDiffers() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));

    PermitMutationRequestDto request = formCheckRequest("ACT", "43", "Legacy notes");

    boolean changed = service.hasFormChanges(request);

    assertThat(changed).isTrue();
  }

  @Test
  void updateScaleAttachmentShouldPersistScaleAndRecalculatePermitTotals() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findScaleMutationById("101"))
        .thenReturn(
            Optional.of(
                new ScaleMutationRow(
                    "101",
                    "TM1",
                    12L,
                    34.5d,
                    "PKG-903",
                    "HEM",
                    "J",
                    1000456L,
                    null,
                    "entry-user",
                    entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "EXE", null));
    when(repository.updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903"),
                scale("102", "TM2", "CED", "B", 8.25d, 4L, "7000123", "PKG-903")));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Scale detail was added to the permit.");

    org.mockito.ArgumentCaptor<ScaleMutationRecord> scaleCaptor =
        org.mockito.ArgumentCaptor.forClass(ScaleMutationRecord.class);
    verify(repository)
        .updateScaleDetail(
            scaleCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(scaleCaptor.getValue().scaleDetailId()).isEqualTo("101");
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isEqualTo(7000123L);
    assertThat(scaleCaptor.getValue().entryUserId()).isEqualTo("entry-user");
    assertThat(scaleCaptor.getValue().entryTimestamp()).isEqualTo(entryTimestamp);
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE"));

    org.mockito.ArgumentCaptor<PermitMutationRow> permitCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), org.mockito.ArgumentMatchers.isNull());
    assertThat(permitCaptor.getValue().permitVolume()).isEqualTo(42.75d);
    assertThat(permitCaptor.getValue().numberOfPieces()).isEqualTo(16L);
  }

  @Test
  void updateScaleAttachmentShouldPropagateEligibilityLookupFailureBeforeWriting() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle packages unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(Optional.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700")).thenThrow(failure);

    assertThatThrownBy(
            () -> service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith"))
        .isSameAs(failure);
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void updateScaleAttachmentShouldPreserveAlreadyPermittedApplicationStatus() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(Optional.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903")));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updateScaleAttachmentShouldRejectApplicationOutsideExemptedOrPermittedStatus() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(Optional.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("APP"));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application 1000456 must be exempted or permitted before a scale can be added to a permit.");
    verify(repository, never()).updateScaleDetail(any(), any());
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updateScaleAttachmentShouldRejectMissingApplicationStatus() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(Optional.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.empty());

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application 1000456 status could not be verified.");
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void updateScaleAttachmentShouldFailWhenExemptedStatusChangesConcurrently() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(Optional.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            ApplicationReviewRepository.ApplicationStatusTransitionRow.notAllowed("APP"));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to reconcile application 1000456 status.");
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void updateScaleAttachmentShouldDetachScaleAndRecalculatePermitTotals() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findScaleMutationById("101"))
        .thenReturn(
            Optional.of(
                new ScaleMutationRow(
                    "101",
                    "TM1",
                    12L,
                    34.5d,
                    "PKG-903",
                    "HEM",
                    "J",
                    1000456L,
                    7000123L,
                    "entry-user",
                    entryTimestamp)));
    when(repository.updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of());
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PMT", null));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("102", "TM2", "CED", "B", 8.25d, 4L, "7000123", "PKG-903")));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, false, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Scale detail was removed from the permit.");

    org.mockito.ArgumentCaptor<ScaleMutationRecord> scaleCaptor =
        org.mockito.ArgumentCaptor.forClass(ScaleMutationRecord.class);
    verify(repository)
        .updateScaleDetail(
            scaleCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(scaleCaptor.getValue().scaleDetailId()).isEqualTo("101");
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isNull();
    assertThat(scaleCaptor.getValue().entryUserId()).isEqualTo("entry-user");
    assertThat(scaleCaptor.getValue().entryTimestamp()).isEqualTo(entryTimestamp);
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT"));

    org.mockito.ArgumentCaptor<PermitMutationRow> permitCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), org.mockito.ArgumentMatchers.isNull());
    assertThat(permitCaptor.getValue().permitVolume()).isEqualTo(8.25d);
    assertThat(permitCaptor.getValue().numberOfPieces()).isEqualTo(4L);
  }

  @Test
  void updateScaleAttachmentShouldPreservePermittedStatusWithAnotherPermitLink() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(
            Optional.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));
    when(repository.findPermitMutationByPermitNumber(7000999L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, false, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).findApplicationStatusCodeByNumber(1000456L);
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void updateScaleAttachmentShouldPropagatePostDetachRelationshipLookupOutage() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(
            Optional.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenThrow(failure);

    assertThatThrownBy(
            () -> service.updateScaleAttachment("101", 7000123L, false, "idir\\jsmith"))
        .isSameAs(failure);

    verify(repository).updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith"));
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void updateScaleAttachmentShouldRejectScaleAssignedToAnotherPermit() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationById("101"))
        .thenReturn(
            Optional.of(
                new ScaleMutationRow(
                    "101",
                    "TM1",
                    12L,
                    34.5d,
                    "PKG-903",
                    "HEM",
                    "J",
                    1000456L,
                    7000999L,
                    "entry-user",
                    Timestamp.valueOf("2026-01-01 10:00:00"))));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("Scale detail is already assigned to another permit.");
    verify(repository, never())
        .updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateScaleAttachmentShouldRejectExpiredPermit() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("EXP")));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Scale rows cannot be changed for a completed, payment-pending, expired, or cancelled permit.");
    verify(repository, never()).findScaleMutationById("101");
    verify(repository, never())
        .updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.any());
  }

  @Test
  void updateScaleAttachmentShouldRejectPaymentPendingPermit() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow("PPD")));

    PermitPersistenceRpcResponseDto response =
        service.updateScaleAttachment("101", 7000123L, true, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Scale rows cannot be changed for a completed, payment-pending, expired, or cancelled permit.");
    verify(repository, never()).findScaleMutationById("101");
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void addApplicationsToPermitShouldAttachUnassignedScaleRowsAndMarkApplicationsPermitted() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, null, entryTimestamp),
                scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(true);
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "EXE", null));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903")));

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Application scale row was added to the permit.");

    org.mockito.ArgumentCaptor<ScaleMutationRecord> scaleCaptor =
        org.mockito.ArgumentCaptor.forClass(ScaleMutationRecord.class);
    verify(repository)
        .updateScaleDetail(
            scaleCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(scaleCaptor.getValue().scaleDetailId()).isEqualTo("101");
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isEqualTo(7000123L);
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE"));
  }

  @Test
  void addApplicationsToPermitShouldPropagateEligibilityLookupFailureBeforeWriting() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle packages unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findPackagesByExemptionNumberRequired("EX-700")).thenThrow(failure);

    assertThatThrownBy(
            () -> service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith"))
        .isSameAs(failure);
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void addApplicationsToPermitShouldPreserveAlreadyPermittedStatus() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(scale("101", "TM1", "HEM", "J", 34.5d, 12L, "7000123", "PKG-903")));

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void addApplicationsToPermitShouldPreflightEveryStatusBeforeWritingScales() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(
            List.of(
                new PackageCandidateRow(1000456L, "PKG-903"),
                new PackageCandidateRow(1000457L, "PKG-904")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000457L))
        .thenReturn(
            List.of(
                scaleMutation(
                    "102", 1000457L, "PKG-904", null, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findApplicationStatusCodeByNumber(1000457L))
        .thenReturn(Optional.of("APP"));

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456,1000457", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application 1000457 must be exempted or permitted before it can be added to a permit.");
    verify(repository, never()).updateScaleDetail(any(), any());
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void addApplicationsToPermitShouldRejectMissingApplicationStatusBeforeWriting() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.empty());

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application 1000456 status could not be verified.");
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void addApplicationsToPermitShouldFailWhenEligibilityDisappearsBeforeWriting() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, null, entryTimestamp)),
            List.of(scaleMutation("101", 1000456L, 7000999L, entryTimestamp)));

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application 1000456 is no longer eligible to be added to this permit.");
    verify(repository, never()).findApplicationStatusCodeByNumber(1000456L);
    verify(repository, never()).updateScaleDetail(any(), any());
  }

  @Test
  void addApplicationsToPermitShouldFailWhenExemptedStatusChangesConcurrently() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            ApplicationReviewRepository.ApplicationStatusTransitionRow.notAllowed("APP"));

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to reconcile application 1000456 status.");
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void addApplicationsToPermitShouldStopAndFailWhenAnyScaleWriteFails() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findPackagesByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(new PackageCandidateRow(1000456L, "PKG-903")));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, null, entryTimestamp),
                scaleMutation("102", 1000456L, null, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(true, false);

    PermitPersistenceRpcResponseDto response =
        service.addApplicationsToPermit(7000123L, "1000456", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to add application 1000456 to the permit.");
    verify(repository, times(2))
        .updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void removeApplicationFromPermitShouldPreservePermittedStatusWithOneRemainingPermitLink() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, 7000123L, entryTimestamp),
                scaleMutation("102", 1000456L, 7000999L, entryTimestamp)),
            List.of(scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));
    when(repository.findPermitMutationByPermitNumber(7000999L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.updateScaleDetail(
            org.mockito.ArgumentMatchers.any(ScaleMutationRecord.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Application scale row was removed from the permit.");

    org.mockito.ArgumentCaptor<ScaleMutationRecord> scaleCaptor =
        org.mockito.ArgumentCaptor.forClass(ScaleMutationRecord.class);
    verify(repository)
        .updateScaleDetail(
            scaleCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(scaleCaptor.getValue().scaleDetailId()).isEqualTo("101");
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isNull();
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any());
  }

  @Test
  void removeApplicationFromPermitShouldRestoreExemptedStatusWithZeroRemainingPermitLinks() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)),
            List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PMT", null));

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT"));
  }

  @Test
  void removeApplicationFromPermitShouldFailClosedForAnUnexpectedApplicationStatus() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)),
            List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("APP"));

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to reconcile application 1000456 status.");
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void removeApplicationFromPermitShouldRestoreExemptedStatusWhenOnlyInactiveLinksRemain() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    ScaleMutationRow inactiveRelationship =
        scaleMutation("102", 1000456L, 7000999L, entryTimestamp);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, 7000123L, entryTimestamp),
                inactiveRelationship),
            List.of(inactiveRelationship));
    when(repository.findPermitMutationByPermitNumber(7000999L))
        .thenReturn(Optional.of(permitMutationRow("CAN")));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PMT", null));

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT"));
  }

  @Test
  void removeApplicationFromPermitShouldPreservePermittedStatusWithMultipleRemainingPermitLinks() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    ScaleMutationRow firstRemaining =
        scaleMutation("102", 1000456L, 7000999L, entryTimestamp);
    ScaleMutationRow secondRemaining =
        scaleMutation("103", 1000456L, 7000888L, entryTimestamp);
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                scaleMutation("101", 1000456L, 7000123L, entryTimestamp),
                firstRemaining,
                secondRemaining),
            List.of(firstRemaining, secondRemaining));
    when(repository.findPermitMutationByPermitNumber(7000999L))
        .thenReturn(Optional.of(permitMutationRow("ACT")));
    when(repository.findPermitMutationByPermitNumber(7000888L))
        .thenReturn(Optional.of(permitMutationRow("CAN")));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(
            anyLong(), any(), any(), any(), any());
  }

  @Test
  void removeApplicationFromPermitShouldFailWhenPermittedStatusChangesConcurrently() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)),
            List.of(scaleMutation("101", 1000456L, null, entryTimestamp)));
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("PMT"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000456L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            ApplicationReviewRepository.ApplicationStatusTransitionRow.notAllowed("APP"));

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to reconcile application 1000456 status.");
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void removeApplicationFromPermitShouldPropagateRequiredPostRemovalLookupOutage() {
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    DataRetrievalFailureException failure =
        new DataRetrievalFailureException("Oracle unavailable");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleMutation("101", 1000456L, 7000123L, entryTimestamp)))
        .thenThrow(failure);
    when(repository.updateScaleDetail(any(ScaleMutationRecord.class), eq("idir\\jsmith")))
        .thenReturn(true);

    assertThatThrownBy(
            () -> service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith"))
        .isSameAs(failure);

    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
    verify(repository, never()).findScaleDetailsByPermitNumber(7000123L);
  }

  @Test
  void removeApplicationFromPermitShouldNotReconcileStatusWithoutAnActualDetach() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    when(repository.findScaleMutationDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(scaleMutation("102", 1000456L, 7000999L, entryTimestamp)));

    PermitPersistenceRpcResponseDto response =
        service.removeApplicationFromPermit(7000123L, 1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository, times(1)).findScaleMutationDetailsByApplicationNumber(1000456L);
    verify(repository, never()).findApplicationStatusCodeByNumber(anyLong());
    verify(applicationReviewRepository, never())
        .updateStatusWithRemarkFromAllowedSources(anyLong(), any(), any(), any(), any());
  }

  @Test
  void addBlanketOicScaleShouldPersistScaleAndRecalculatePermitTotals() {
    permitTotalsUpdateSucceeds();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L)).thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));
    stubOicApplicationBinding("EX-700");
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("EXE"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000999L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "EXE", null));
    when(repository.findFixedExemptionRate("EX-700")).thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.insertBoicScaleDetail(
            org.mockito.ArgumentMatchers.any(BoicScaleMutationRecord.class)))
        .thenReturn(
            Optional.of(
                scale(
                    "103", "TM3", "HE", "A", 12.5d, 7L, "7000123", "PKG-903", 1000999L)));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(),
            List.of(
                scale(
                    "103", "TM3", "HE", "A", 12.5d, 7L, "7000123", "PKG-903", 1000999L)));

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "12.5", 7L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Blanket OIC scale detail was added.");

    org.mockito.ArgumentCaptor<BoicScaleMutationRecord> scaleCaptor =
        org.mockito.ArgumentCaptor.forClass(BoicScaleMutationRecord.class);
    verify(repository).insertBoicScaleDetail(scaleCaptor.capture());
    assertThat(scaleCaptor.getValue().timberMark()).isEqualTo("TM3");
    assertThat(scaleCaptor.getValue().piecesCount()).isEqualTo(7L);
    assertThat(scaleCaptor.getValue().speciesGradeVolume()).isEqualTo(12.5d);
    assertThat(scaleCaptor.getValue().packageNumber()).isEqualTo("PKG-903");
    assertThat(scaleCaptor.getValue().exportSpeciesCode()).isEqualTo("HE");
    assertThat(scaleCaptor.getValue().exportGradeCode()).isEqualTo("A");
    assertThat(scaleCaptor.getValue().applicationNumber()).isEqualTo(1000999L);
    assertThat(scaleCaptor.getValue().exportPermitDetailNumber()).isEqualTo(7000123L);
    assertThat(scaleCaptor.getValue().exemptionOverrideRate()).isEqualTo(2.5d);
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000999L, "PMT", null, "idir\\jsmith", List.of("EXE"));

    org.mockito.ArgumentCaptor<PermitMutationRow> permitCaptor =
        org.mockito.ArgumentCaptor.forClass(PermitMutationRow.class);
    verify(repository)
        .updatePermitDetail(
            permitCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), org.mockito.ArgumentMatchers.isNull());
    assertThat(permitCaptor.getValue().permitVolume()).isEqualTo(12.5d);
    assertThat(permitCaptor.getValue().numberOfPieces()).isEqualTo(7L);
  }

  @Test
  void addBlanketOicScaleShouldRollBackWhenInsertReturnsNoRow() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));
    stubOicApplicationBinding("EX-700");
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findFixedExemptionRate("EX-700"))
        .thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.insertBoicScaleDetail(any(BoicScaleMutationRecord.class)))
        .thenReturn(Optional.empty());
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitPersistenceRpcResponseDto response =
        transactionalService(transactionManager)
            .addBlanketOicScale(
                7000123L,
                "PKG-903",
                "TM3",
                "12.5",
                7L,
                "HE",
                "A",
                "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to add Blanket OIC scale detail.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verifyNoInteractions(applicationReviewRepository);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void addBlanketOicScaleShouldRollBackWhenInsertReturnsMismatchedParent() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));
    stubOicApplicationBinding("EX-700");
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findFixedExemptionRate("EX-700"))
        .thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.insertBoicScaleDetail(any(BoicScaleMutationRecord.class)))
        .thenReturn(
            Optional.of(
                scale(
                    "103",
                    "TM3",
                    "HE",
                    "A",
                    12.5d,
                    7L,
                    "7000123",
                    "PKG-OTHER",
                    1000456L)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    PermitPersistenceRpcResponseDto response =
        transactionalService(transactionManager)
            .addBlanketOicScale(
                7000123L,
                "PKG-903",
                "TM3",
                "12.5",
                7L,
                "HE",
                "A",
                "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to add Blanket OIC scale detail.");
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
    verifyNoInteractions(applicationReviewRepository);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void addBlanketOicScaleShouldRejectAHiddenApplicationOutsideThePermitExemption() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));
    stubOicApplicationBinding("BOIC-OTHER");

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "12.5", 7L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "The hidden OIC application does not belong to this permit's exemption.");
    verify(repository, never())
        .insertBoicScaleDetail(any(BoicScaleMutationRecord.class));
    verify(repository, never()).findApplicationStatusCodeByNumber(anyLong());
  }

  @Test
  void addBlanketOicScaleShouldFailWhenHiddenApplicationStatusChangesConcurrently() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));
    stubOicApplicationBinding("EX-700");
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findFixedExemptionRate("EX-700"))
        .thenReturn(Optional.of(BigDecimal.valueOf(2.5d)));
    when(repository.insertBoicScaleDetail(any(BoicScaleMutationRecord.class)))
        .thenReturn(
            Optional.of(
                scale(
                    "103", "TM3", "HE", "A", 12.5d, 7L, "7000123", "PKG-903", 1000999L)));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000999L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, false, false, "PMT", null));

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "12.5", 7L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Unable to reconcile the hidden OIC application status.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void addBlanketOicScaleShouldRejectInvalidTimberMarkForExemption() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(false);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "12.5", 7L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Timber mark TM3 is not valid for exemption EX-700.");
    verify(repository, never())
        .insertBoicScaleDetail(org.mockito.ArgumentMatchers.any(BoicScaleMutationRecord.class));
  }

  @Test
  void addBlanketOicScaleShouldEnforceDuplicateAndAggregateCeilings() {
    PermitScaleDetailRow existingScale =
        scale("102", "TM3", "HE", "A", 95.0d, 95L, "7000123", "PKG-903");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findPackageNumbersByOicPermitNumber(7000123L))
        .thenReturn(List.of("PKG-903"));
    when(repository.isValidBoicTimberMarkRequired("TM3", "EX-700")).thenReturn(true);
    when(repository.isSpeciesCodeValidRequired("HE")).thenReturn(true);
    when(repository.isGradeCodeValidRequired("A")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903"))
        .thenReturn(List.of(existingScale));
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(List.of(existingScale));
    when(repository.findPackageDetailsByPackageNumberRequired("PKG-903"))
        .thenReturn(
            Optional.of(
                new PackageDetailsRow(
                    "PKG-903", 100.0d, 10.0d, 20.0d, "ACT", null, "N", "S")));

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "10.0", 10L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "A scale with the same Timber Mark/Species/Grade combination already exists.",
            "The total scale volume exceeds the package volume.",
            "The total scale pieces exceed the permit request pieces.",
            "The total scale volume exceeds the permit request volume.");
    verify(repository, never())
        .insertBoicScaleDetail(org.mockito.ArgumentMatchers.any(BoicScaleMutationRecord.class));
  }

  @Test
  void addBlanketOicScaleShouldEnforceLegacyNumericMaxima() {
    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L,
            "PKG-903",
            "TM3",
            "100000.0",
            1_000_000_000L,
            "HE",
            "A",
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The scale pieces must be less than 999999999.",
            "The scale volume must be less than 99999.9.");
    verify(repository, never()).findPermitMutationByPermitNumber(org.mockito.ArgumentMatchers.anyLong());
  }

  @Test
  void addBlanketOicScaleShouldRejectPermitWithoutOicApplicationNumber() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(permitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));

    PermitPersistenceRpcResponseDto response =
        service.addBlanketOicScale(
            7000123L, "PKG-903", "TM3", "12.5", 7L, "HE", "A", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("The permit does not have an OIC application number.");
    verify(repository, never())
        .insertBoicScaleDetail(org.mockito.ArgumentMatchers.any(BoicScaleMutationRecord.class));
  }

  @Test
  void deleteBlanketOicScaleShouldRemoveScaleAndRecalculatePermitTotals() {
    permitTotalsUpdateSucceeds();
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findScaleMutationById("103"))
        .thenReturn(
            Optional.of(
                new ScaleMutationRow(
                    "103",
                    "TM3",
                    7L,
                    12.5d,
                    "PKG-903",
                    "HE",
                    "A",
                    1000999L,
                    7000123L,
                    "entry-user",
                    Timestamp.valueOf("2026-01-01 10:00:00"))));
    stubOicApplicationBinding("EX-700");
    when(repository.deleteScaleDetailById("103", "idir\\jsmith")).thenReturn(true);
    when(repository.findScaleMutationDetailsByApplicationNumber(1000999L))
        .thenReturn(List.of());
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("PMT"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000999L, "EXE", null, "idir\\jsmith", List.of("PMT")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "PMT", null));
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitPersistenceRpcResponseDto response =
        service.deleteBlanketOicScale("103", 7000123L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Blanket OIC scale detail was removed.");
    verify(repository).deleteScaleDetailById("103", "idir\\jsmith");
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000999L, "EXE", null, "idir\\jsmith", List.of("PMT"));
  }

  @Test
  void deleteBlanketOicScaleShouldRestorePermittedStatusWhenAnEffectiveLinkRemains() {
    permitTotalsUpdateSucceeds();
    Timestamp entryTimestamp = Timestamp.valueOf("2026-01-01 10:00:00");
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findScaleMutationById("103"))
        .thenReturn(
            Optional.of(scaleMutation("103", 1000999L, 7000123L, entryTimestamp)));
    stubOicApplicationBinding("EX-700");
    when(repository.deleteScaleDetailById("103", "idir\\jsmith")).thenReturn(true);
    when(repository.findScaleMutationDetailsByApplicationNumber(1000999L))
        .thenReturn(
            List.of(scaleMutation("104", 1000999L, 7000123L, entryTimestamp)));
    when(repository.findApplicationStatusCodeByNumber(1000999L))
        .thenReturn(Optional.of("EXE"));
    when(applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            1000999L, "PMT", null, "idir\\jsmith", List.of("EXE")))
        .thenReturn(
            new ApplicationReviewRepository.ApplicationStatusTransitionRow(
                true, true, true, "EXE", null));
    when(repository.findScaleDetailsByPermitNumber(7000123L)).thenReturn(List.of());

    PermitPersistenceRpcResponseDto response =
        service.deleteBlanketOicScale("103", 7000123L, "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(applicationReviewRepository)
        .updateStatusWithRemarkFromAllowedSources(
            1000999L, "PMT", null, "idir\\jsmith", List.of("EXE"));
  }

  @Test
  void deleteBlanketOicScaleShouldRejectAHiddenApplicationOutsideThePermitExemption() {
    when(repository.findPermitMutationByPermitNumber(7000123L))
        .thenReturn(Optional.of(blanketOicPermitMutationRow()));
    when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    when(repository.findScaleMutationById("103"))
        .thenReturn(
            Optional.of(
                new ScaleMutationRow(
                    "103",
                    "TM3",
                    7L,
                    12.5d,
                    "PKG-903",
                    "HE",
                    "A",
                    1000999L,
                    7000123L,
                    "entry-user",
                    Timestamp.valueOf("2026-01-01 10:00:00"))));
    stubOicApplicationBinding("BOIC-OTHER");

    PermitPersistenceRpcResponseDto response =
        service.deleteBlanketOicScale("103", 7000123L, "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "The hidden OIC application does not belong to this permit's exemption.");
    verify(repository, never()).deleteScaleDetailById(any(), any());
  }

  private void permitTotalsUpdateSucceeds() {
    when(repository.updatePermitDetail(
            org.mockito.ArgumentMatchers.any(PermitMutationRow.class),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith"),
            org.mockito.ArgumentMatchers.isNull()))
        .thenReturn(true);
  }

  private PermitScaleDetailRow scale(
      String id,
      String timbermark,
      String species,
      String grade,
      double volume,
      long pieces,
      String permitNumber,
      String packageNumber) {
    return scale(
        id,
        timbermark,
        species,
        grade,
        volume,
        pieces,
        permitNumber,
        packageNumber,
        1000456L);
  }

  private PermitScaleDetailRow scale(
      String id,
      String timbermark,
      String species,
      String grade,
      double volume,
      long pieces,
      String permitNumber,
      String packageNumber,
      Long applicationNumber) {
    return new PermitScaleDetailRow(
        id,
        timbermark,
        species,
        grade,
        volume,
        pieces,
        applicationNumber,
        permitNumber,
        packageNumber,
        "C",
        "100.00",
        "12.0",
        "1.5");
  }

  private PermitCorePackageRow corePackage(String packageNumber, Long applicationNumber) {
    return new PermitCorePackageRow(
        packageNumber,
        applicationNumber,
        10.0d,
        5.0d,
        2.0d,
        "ACT",
        "",
        "N",
        "S",
        "T");
  }

  private ScaleMutationRow scaleMutation(
      String id, Long applicationNumber, Long permitNumber, Timestamp entryTimestamp) {
    return scaleMutation(id, applicationNumber, "PKG-903", permitNumber, entryTimestamp);
  }

  private ScaleMutationRow scaleMutation(
      String id, Long applicationNumber, String packageNumber, Long permitNumber) {
    return scaleMutation(id, applicationNumber, packageNumber, permitNumber, null);
  }

  private ScaleMutationRow scaleMutation(
      String id,
      Long applicationNumber,
      String packageNumber,
      Long permitNumber,
      Timestamp entryTimestamp) {
    return new ScaleMutationRow(
        id,
        "TM1",
        12L,
        34.5d,
        packageNumber,
        "HEM",
        "J",
        applicationNumber,
        permitNumber,
        "entry-user",
        entryTimestamp);
  }

  private PermitMutationRow permitMutationRow() {
    return permitMutationRow("ACT");
  }

  private PermitMutationRow permitMutationRow(String permitStatusCode) {
    return permitMutationRow(7000123L, permitStatusCode);
  }

  private PermitMutationRow permitMutationRow(
      Long permitNumber, String permitStatusCode) {
    return permitMutationRow(permitNumber, permitStatusCode, 1835L);
  }

  private PermitMutationRow permitMutationRow(
      Long permitNumber, String permitStatusCode, Long orgUnitNumber) {
    return new PermitMutationRow(
        permitNumber,
        "Destination Co",
        "MV North",
        LocalDate.of(2026, 4, 1),
        null,
        LocalDate.of(2026, 3, 15),
        LocalDate.of(2026, 3, 15),
        LocalDate.of(2026, 3, 16),
        "RCPT-100",
        LocalDate.of(2026, 12, 31),
        100.0d,
        42L,
        0L,
        null,
        "Legacy notes",
        "idir\\jsmith",
        null,
        "S",
        "W",
        "00077881",
        "01",
        "00077880",
        "01",
        "EX-700",
        orgUnitNumber,
        "VA",
        permitStatusCode,
        "S",
        "US",
        null,
        null,
        null,
        null,
        null,
        "T");
  }

  private PermitMutationRow withInvoiceContext(
      PermitMutationRow current,
      LocalDate applicationDate,
      String countryCode,
      String agentNumber,
      String agentLocationCode) {
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        applicationDate,
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        agentNumber,
        agentLocationCode,
        current.exemptionNumber(),
        current.orgUnitNo(),
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        countryCode,
        current.overrideFee(),
        current.overrideComment(),
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow permitMutationRowWithIssueAndReceipt(
      String permitStatusCode, LocalDate issueDate, String receiptNumber) {
    PermitMutationRow current = permitMutationRow(permitStatusCode);
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        current.applicationDate(),
        current.receivedDate(),
        issueDate,
        receiptNumber,
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        current.agentNumber(),
        current.agentLocationCode(),
        current.exemptionNumber(),
        current.orgUnitNo(),
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        current.overrideFee(),
        current.overrideComment(),
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow permitMutationRowWithClients(
      String clientNumber,
      String clientLocationCode,
      String agentNumber,
      String agentLocationCode) {
    return permitMutationRowWithClients(
        clientNumber, clientLocationCode, agentNumber, agentLocationCode, "ACT");
  }

  private PermitMutationRow withAggregateRelationships(
      PermitMutationRow current, String exemptionNumber, Long oicApplicationNumber) {
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        current.applicationDate(),
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        current.agentNumber(),
        current.agentLocationCode(),
        exemptionNumber,
        current.orgUnitNo(),
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        current.overrideFee(),
        current.overrideComment(),
        oicApplicationNumber,
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow permitMutationRowWithClients(
      String clientNumber,
      String clientLocationCode,
      String agentNumber,
      String agentLocationCode,
      String permitStatusCode) {
    PermitMutationRow current = permitMutationRow(permitStatusCode);
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        current.applicationDate(),
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        clientNumber,
        clientLocationCode,
        agentNumber,
        agentLocationCode,
        current.exemptionNumber(),
        current.orgUnitNo(),
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        current.overrideFee(),
        current.overrideComment(),
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow interiorPermitMutationRowWithReceipt() {
    PermitMutationRow current = permitMutationRow("ACT");
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        current.applicationDate(),
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        current.agentNumber(),
        current.agentLocationCode(),
        current.exemptionNumber(),
        1903L,
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        current.overrideFee(),
        current.overrideComment(),
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow permitMutationRowWithOverride(
      Double overrideFee, String overrideComment) {
    return permitMutationRowWithOverride("ACT", overrideFee, overrideComment);
  }

  private PermitMutationRow permitMutationRowWithOverride(
      String permitStatus, Double overrideFee, String overrideComment) {
    PermitMutationRow current = permitMutationRow(permitStatus);
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        current.otherPortOfExport(),
        current.applicationDate(),
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        current.agentNumber(),
        current.agentLocationCode(),
        current.exemptionNumber(),
        current.orgUnitNo(),
        current.portOfExportCode(),
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        overrideFee,
        overrideComment,
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRequestDto feeOverrideRequest(
      String permitStatus,
      String overrideIndicator,
      String overrideFee,
      String overrideComment) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
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
        null,
        null,
        null,
        null,
        null,
        overrideIndicator,
        overrideFee,
        overrideComment);
  }

  private PermitMutationRow permitMutationRowWithClearableFields() {
    PermitMutationRow current = permitMutationRowWithOverride(1.5d, "Override reason");
    return new PermitMutationRow(
        current.permitNumber(),
        current.destinationCompanyName(),
        current.transportName(),
        current.estimatedShippingDate(),
        "Blaine",
        current.applicationDate(),
        current.receivedDate(),
        current.permitIssueDate(),
        current.receiptNumber(),
        current.expiryDate(),
        current.permitVolume(),
        current.numberOfPieces(),
        current.feeInLieuVolume(),
        current.federalPermitNumber(),
        current.remarks(),
        current.entryUserId(),
        current.entryTimestamp(),
        current.transportTypeCode(),
        current.scaleMethodCode(),
        current.clientNumber(),
        current.clientLocationCode(),
        current.agentNumber(),
        current.agentLocationCode(),
        current.exemptionNumber(),
        current.orgUnitNo(),
        "OT",
        current.permitStatusCode(),
        current.growthTypeCode(),
        current.countryCode(),
        current.overrideFee(),
        current.overrideComment(),
        current.oicApplicationNumber(),
        current.oicRequestPieces(),
        current.oicRequestVolume(),
        current.productTypeCode());
  }

  private PermitMutationRow blanketOicPermitMutationRow() {
    return blanketOicPermitMutationRow(LocalDate.of(2026, 3, 15));
  }

  private PermitMutationRow blanketOicPermitMutationRow(LocalDate receivedDate) {
    return blanketOicPermitMutationRow(receivedDate, "ACT");
  }

  private PermitMutationRow blanketOicPermitMutationRowWithStatus(String permitStatus) {
    return blanketOicPermitMutationRow(LocalDate.of(2026, 3, 15), permitStatus);
  }

  private PermitMutationRow blanketOicPermitMutationRow(
      LocalDate receivedDate, String permitStatus) {
    return new PermitMutationRow(
        7000123L,
        "Destination Co",
        "MV North",
        LocalDate.of(2026, 4, 1),
        null,
        LocalDate.of(2026, 3, 15),
        receivedDate,
        LocalDate.of(2026, 3, 16),
        "RCPT-100",
        LocalDate.of(2026, 12, 31),
        100.0d,
        42L,
        0L,
        null,
        "Legacy notes",
        "idir\\jsmith",
        null,
        "S",
        "W",
        "00077881",
        "01",
        "00077880",
        "01",
        "EX-700",
        1835L,
        "VA",
        permitStatus,
        "S",
        "US",
        null,
        null,
        1000999L,
        100L,
        100.0d,
        "T");
  }

  private PermitMutationRequestDto formCheckRequest(
      String permitStatus, String permitNumberOfPieces, String permitRemarks) {
    return formCheckRequest(
        permitStatus, permitNumberOfPieces, permitRemarks, "RCPT-100");
  }

  private PermitMutationRequestDto formCheckRequest(
      String permitStatus,
      String permitNumberOfPieces,
      String permitRemarks,
      String receiptNumber) {
    return formCheckRequest(
        permitStatus, permitNumberOfPieces, permitRemarks, receiptNumber, "1835");
  }

  private PermitMutationRequestDto formCheckRequest(
      String permitStatus,
      String permitNumberOfPieces,
      String permitRemarks,
      String receiptNumber,
      String orgUnitNumber) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
        "03/15/2026",
        "03/16/2026",
        "12/31/2026",
        null,
        null,
        "Destination Co",
        "US",
        "S",
        "MV North",
        "04/01/2026",
        "VA",
        null,
        receiptNumber,
        permitRemarks,
        null,
        null,
        permitNumberOfPieces,
        orgUnitNumber,
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

  private PermitMutationRequestDto updateShippingRequest(String estimatedShippingDate) {
    return updateShippingRequest(estimatedShippingDate, null);
  }

  private PermitMutationRequestDto updateShippingRequest(
      String estimatedShippingDate, String destinationCompanyName) {
    return updateShippingRequest(estimatedShippingDate, destinationCompanyName, null);
  }

  private PermitMutationRequestDto updateShippingRequest(
      String estimatedShippingDate,
      String destinationCompanyName,
      String destinationCountry) {
    return new PermitMutationRequestDto(
        "7000123",
        null,
        null,
        null,
        null,
        null,
        null,
        destinationCompanyName,
        destinationCountry,
        null,
        null,
        estimatedShippingDate,
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
        null);
  }

  private ExemptionDetailDto exemptionDetail(String exemptionNumber, double remainingVolume) {
    return exemptionDetail(exemptionNumber, remainingVolume, false);
  }

  private void stubValidMinisterialPermitCreationContext() {
    stubMinisterialPermitCreationContext(
        "00077881", "00077880", permitCreationApplication());
  }

  private void stubMinisterialPermitCreationContext(
      String exemptionOwnerClientNumber,
      String exemptionAgentClientNumber,
      ApplicationInfoRow application) {
    stubPermitCreationExemption(
        "EX-700",
        "M",
        "ACT",
        exemptionOwnerClientNumber,
        exemptionAgentClientNumber);
    when(repository.findApplicationNumbersByExemptionNumberRequired("EX-700"))
        .thenReturn(List.of(1000456L));
    when(repository.findApplicationStatusCodeByNumber(1000456L))
        .thenReturn(Optional.of("EXE"));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(Optional.of(application));
    lenient().when(repository.findGrowthTypeDescription("S"))
        .thenReturn(Optional.of("Standing"));
    lenient().when(repository.findProductTypeDescription("T"))
        .thenReturn(Optional.of("Unmanufactured Timber"));
  }

  private void stubPermitCreationExemption(
      String exemptionNumber,
      String exemptionType,
      String exemptionStatus,
      String ownerClientNumber,
      String agentClientNumber) {
    when(repository.findExemptionTypeCode(exemptionNumber))
        .thenReturn(Optional.of(exemptionType));
    when(exemptionService.findByExemptionNumber(exemptionNumber))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClientsAndStatus(
                    exemptionNumber,
                    exemptionType,
                    exemptionStatus,
                    ownerClientNumber,
                    agentClientNumber)));
  }

  private ApplicationInfoRow permitCreationApplication() {
    return permitCreationApplication(
        1000456L,
        "EX-700",
        1835L,
        "00077881",
        "01",
        "00077880",
        "02",
        "T",
        "S");
  }

  private ApplicationInfoRow permitCreationApplication(
      Long applicationNumber,
      String exemptionNumber,
      Long orgUnitNo,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      String productTypeCode,
      String growthTypeCode) {
    return new ApplicationInfoRow(
        applicationNumber,
        exemptionNumber,
        orgUnitNo,
        "Coast",
        productTypeCode,
        growthTypeCode,
        "HE/OT",
        ownerClientNumber,
        ownerClientLocationCode,
        agentClientNumber,
        agentClientLocationCode);
  }

  private PermitMutationRow withPermitNumber(PermitMutationRow row, Long permitNumber) {
    return new PermitMutationRow(
        permitNumber,
        row.destinationCompanyName(),
        row.transportName(),
        row.estimatedShippingDate(),
        row.otherPortOfExport(),
        row.applicationDate(),
        row.receivedDate(),
        row.permitIssueDate(),
        row.receiptNumber(),
        row.expiryDate(),
        row.permitVolume(),
        row.numberOfPieces(),
        row.feeInLieuVolume(),
        row.federalPermitNumber(),
        row.remarks(),
        row.entryUserId(),
        row.entryTimestamp(),
        row.transportTypeCode(),
        row.scaleMethodCode(),
        row.clientNumber(),
        row.clientLocationCode(),
        row.agentNumber(),
        row.agentLocationCode(),
        row.exemptionNumber(),
        row.orgUnitNo(),
        row.portOfExportCode(),
        row.permitStatusCode(),
        row.growthTypeCode(),
        row.countryCode(),
        row.overrideFee(),
        row.overrideComment(),
        row.oicApplicationNumber(),
        row.oicRequestPieces(),
        row.oicRequestVolume(),
        row.productTypeCode());
  }

  private PermitMutationRow withOrgUnit(PermitMutationRow row, Long orgUnitNo) {
    return new PermitMutationRow(
        row.permitNumber(),
        row.destinationCompanyName(),
        row.transportName(),
        row.estimatedShippingDate(),
        row.otherPortOfExport(),
        row.applicationDate(),
        row.receivedDate(),
        row.permitIssueDate(),
        row.receiptNumber(),
        row.expiryDate(),
        row.permitVolume(),
        row.numberOfPieces(),
        row.feeInLieuVolume(),
        row.federalPermitNumber(),
        row.remarks(),
        row.entryUserId(),
        row.entryTimestamp(),
        row.transportTypeCode(),
        row.scaleMethodCode(),
        row.clientNumber(),
        row.clientLocationCode(),
        row.agentNumber(),
        row.agentLocationCode(),
        row.exemptionNumber(),
        orgUnitNo,
        row.portOfExportCode(),
        row.permitStatusCode(),
        row.growthTypeCode(),
        row.countryCode(),
        row.overrideFee(),
        row.overrideComment(),
        row.oicApplicationNumber(),
        row.oicRequestPieces(),
        row.oicRequestVolume(),
        row.productTypeCode());
  }

  private ExemptionDetailDto exemptionDetail(
      String exemptionNumber, double remainingVolume, boolean blanketOic) {
    return new ExemptionDetailDto(
        exemptionNumber,
        blanketOic ? "B" : "M",
        blanketOic ? "Blanket OIC" : "Ministerial",
        "ACT",
        "Active",
        "00077881",
        "00055667",
        1000456L,
        "APP",
        LocalDate.of(2026, 1, 1),
        LocalDate.of(2026, 12, 31),
        100.0d,
        44.5d,
        remainingVolume,
        "",
        blanketOic,
        List.of(),
        List.of());
  }

  private ExemptionDetailDto exemptionDetailWithClients(
      String exemptionNumber,
      String exemptionType,
      String ownerClientNumber,
      String agentClientNumber) {
    return exemptionDetailWithClientsAndStatus(
        exemptionNumber, exemptionType, "ACT", ownerClientNumber, agentClientNumber);
  }

  private ExemptionDetailDto exemptionDetailWithClientsAndStatus(
      String exemptionNumber,
      String exemptionType,
      String exemptionStatus,
      String ownerClientNumber,
      String agentClientNumber) {
    boolean blanketOic = "B".equalsIgnoreCase(exemptionType);
    return new ExemptionDetailDto(
        exemptionNumber,
        exemptionType,
        blanketOic ? "Blanket OIC" : "Ministerial",
        exemptionStatus,
        "ACT".equalsIgnoreCase(exemptionStatus) ? "Active" : exemptionStatus,
        ownerClientNumber,
        agentClientNumber,
        1000456L,
        "APP",
        LocalDate.of(2026, 1, 1),
        LocalDate.of(2026, 12, 31),
        100.0d,
        0.0d,
        100.0d,
        "",
        blanketOic,
        List.of(),
        List.of());
  }

  private PermitMutationRequestDto permitMutationRequest(
      String exemptionNumber,
      String ownerClientNumber,
      String agentClientNumber,
      String oicApplicationNumber) {
    return permitMutationRequest(
        exemptionNumber, ownerClientNumber, agentClientNumber, oicApplicationNumber, "ACT");
  }

  private PermitMutationRequestDto permitMutationRequest(
      String exemptionNumber,
      String ownerClientNumber,
      String agentClientNumber,
      String oicApplicationNumber,
      String permitStatus) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
        "2026-05-27",
        "2026-05-27",
        "2026-06-27",
        null,
        exemptionNumber,
        "Acme Lumber",
        "US",
        "S",
        "Hauler 1",
        "2026-06-01",
        "VA",
        null,
        null,
        null,
        "S",
        "100.0",
        "25",
        "1835",
        ownerClientNumber,
        "01",
        agentClientNumber,
        "02",
        oicApplicationNumber,
        null,
        null,
        null,
        "S",
        "T",
        null,
        null,
        null);
  }

  private void stubTargetMinisterialExemption(String exemptionNumber) {
    when(repository.findExemptionTypeCode(exemptionNumber)).thenReturn(Optional.of("M"));
    when(exemptionService.findByExemptionNumber(exemptionNumber))
        .thenReturn(
            Optional.of(
                exemptionDetailWithClients(
                    exemptionNumber, "M", "00077881", "00077880")));
  }

  private PermitDetailsRpcService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    return (PermitDetailsRpcService) proxyFactory.getProxy();
  }

  private void stubOicApplicationBinding(String exemptionNumber) {
    stubOicApplicationBinding(exemptionNumber, "Y");
  }

  private void stubOicApplicationBinding(String exemptionNumber, String oicIndicator) {
    stubOicApplicationBinding(exemptionNumber, oicIndicator, 1835L);
  }

  private void stubOicApplicationBinding(
      String exemptionNumber, String oicIndicator, Long orgUnitNo) {
    when(repository.findApplicationInfoByNumber(1000999L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000999L,
                    exemptionNumber,
                    orgUnitNo,
                    "RCO",
                    "T",
                    "S",
                    "HE/OT",
                    null,
                    null,
                    null,
                    null,
                    oicIndicator)));
  }

  private void stubCanadianInvoiceApplication(Long orgUnitNo, String exemptionNumber) {
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L,
                    exemptionNumber,
                    orgUnitNo,
                    "RCO",
                    "T",
                    "S",
                    "HE/UT")));
  }

  private void stubNonCanadianInvoiceSnapshot(Long orgUnitNo) {
    when(repository.findScaleDetailsByPermitNumber(7000123L))
        .thenReturn(
            List.of(
                scale(
                    "INV-101",
                    "TM-INV",
                    "FI",
                    "A",
                    10.0d,
                    20L,
                    "7000123",
                    "PKG-INV")));
    when(repository.findApplicationInfoByNumber(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationInfoRow(
                    1000456L, "EX-700", orgUnitNo, "Region", "T", "S", "FI/UT")));
    when(repository.findFeePolicyPercentIncrease(any(LocalDate.class), eq(orgUnitNo)))
        .thenReturn(BigDecimal.ZERO);
    when(repository.findAverageMarketValueByScaleId("INV-101"))
        .thenReturn(Optional.of(BigDecimal.ONE));
  }

  private void stubInvoiceOrchestration() {
    stubInvoiceOrchestrationAvailability();
    when(permitInvoiceOrchestrationService.orchestrate(any(), eq("idir\\jsmith")))
        .thenReturn(PermitInvoiceOrchestrationService.TransitionResult.succeeded());
  }

  private void stubInvoiceOrchestrationAvailability() {
    when(permitInvoiceOrchestrationServiceProvider.getIfAvailable())
        .thenReturn(permitInvoiceOrchestrationService);
    when(permitInvoiceOrchestrationService.supportsCountry(any())).thenReturn(true);
  }

  private PermitMutationRequestDto updatePermitRequest(
      String exemptionNumber,
      String ownerClientNumber,
      String agentClientNumber,
      String oicApplicationNumber) {
    return new PermitMutationRequestDto(
        "7000123",
        null,
        null,
        null,
        null,
        null,
        exemptionNumber,
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
        ownerClientNumber,
        null,
        agentClientNumber,
        null,
        oicApplicationNumber,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private PermitMutationRequestDto invoiceMaterialChangeRequest(
      String permitStatus, String destinationCountry) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
        null,
        null,
        null,
        null,
        null,
        null,
        destinationCountry,
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
        null);
  }

  private PermitMutationRequestDto clearOptionalPermitStringsRequest() {
    return new PermitMutationRequestDto(
        "7000123",
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
        "VA",
        "",
        null,
        "",
        null,
        null,
        null,
        null,
        null,
        null,
        "",
        "",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "");
  }

  private PermitMutationRequestDto invalidPermitVolumesRequest() {
    return numericPermitMutationRequest("NaN", "Infinity", null, null);
  }

  private PermitMutationRequestDto invalidOverrideFeeRequest() {
    return numericPermitMutationRequest(null, null, "true", "NaN");
  }

  private PermitMutationRequestDto oicRequestLimitsRequest(
      String permitStatus, String oicRequestPieces, String oicRequestVolume) {
    return new PermitMutationRequestDto(
        "7000123",
        permitStatus,
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
        null,
        oicRequestPieces,
        oicRequestVolume,
        null,
        null,
        null,
        null,
        null);
  }

  private PermitMutationRequestDto numericPermitMutationRequest(
      String permitVolume,
      String oicPermitVolume,
      String overrideIndicator,
      String overrideFee) {
    return new PermitMutationRequestDto(
        "7000123",
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
        permitVolume,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        oicPermitVolume,
        null,
        null,
        overrideIndicator,
        overrideFee,
        null);
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

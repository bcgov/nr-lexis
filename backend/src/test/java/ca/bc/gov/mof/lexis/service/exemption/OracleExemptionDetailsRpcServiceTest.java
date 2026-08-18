package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.CALLS_REAL_METHODS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationNotificationRecipientResolver;
import ca.bc.gov.mof.lexis.service.mail.EmailNotificationService;
import ca.bc.gov.mof.lexis.service.mail.RegionalMailRoute;
import ca.bc.gov.mof.lexis.service.mail.WorkflowEmailEvent;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleExemptionDetailsRpcService")
class OracleExemptionDetailsRpcServiceTest {

  @Mock private ExemptionDetailsRpcRepository repository;
  @Mock private ApplicationNotificationRecipientResolver notificationRecipientResolver;
  @Mock private EmailNotificationService notificationService;
  @Mock private ExemptionActivationEligibilityValidator activationEligibilityValidator;

  @InjectMocks private OracleExemptionDetailsRpcService service;

  @Test
  void addExemptionShouldRejectActiveInitialStatusForMinisterialExemption() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "ACT",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Ministerial exemptions must be created with a status of NEW.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectCraftedExpiredInitialStatus() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "EXP",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Ministerial exemptions must be created with a status of NEW.");
    verify(repository, never()).insertExemption(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"O", "B"})
  void addExemptionShouldRequireActiveInitialStatusForOicTypes(String exemptionType) {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                exemptionType,
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of(11L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("OIC and Blanket OIC exemptions must be created with a status of ACT.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectNumbersBeyondEightDatabaseBytes() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "123456789",
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "O",
                "ACT",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Exemption number must not exceed 8 bytes.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectTextOracleCannotStore() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-é",
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "c".repeat(255),
                "O",
                "ACT",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Exemption number contains characters the current LEXIS database cannot store.",
            "Other conditions must not exceed 254 bytes.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectForgedMinisterialNumberWithinDatabaseLimit() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "M-123456",
                250.5d,
                null,
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Ministerial exemption numbers must be generated by LEXIS.");
    verify(repository, never()).insertExemption(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"O", "B"})
  void addExemptionShouldRequireCallerEnteredNumberForOicTypes(String exemptionType) {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                exemptionType,
                "ACT",
                null,
                null,
                List.of(),
                false,
                "B".equals(exemptionType) ? List.of(1903L) : List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("A valid exemption number is required for an active OIC exemption.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectRegularApplicationsForBlanketOic() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(applicationForPreview(1000456L, 30L, 100.0d, "APP", null)));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "BOIC-1",
                9_999_999.9d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "B",
                "ACT",
                null,
                null,
                List.of(1000456L),
                false,
                List.of(1903L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Blanket OIC exemptions cannot be linked to regular applications.");
    verify(repository, never()).insertExemption(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @ParameterizedTest
  @ValueSource(doubles = {0.0d, 1_000.0d, 18.123d})
  void addExemptionShouldRejectInvalidCreateTimeFeeOverride(double feeRate) {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "OIC-1",
                250.5d,
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "O",
                "ACT",
                feeRate,
                true,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "The fee rate must be greater than 0, at most 999.99, and have no more than two decimal places.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectCreateTimeFeeOverrideForMinisterialType() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                null,
                null,
                "Conditions",
                "M",
                "NEW",
                18.25d,
                true,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Fee rate override is only available when creating an OIC exemption.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void updateExemptionShouldRejectADirectTransitionToActiveWhenEligibilityFails() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("NEW");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(activationEligibilityValidator.validate(any()))
        .thenReturn(List.of("Application 1000456 must have a status of EXE before the exemption can be active."));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Changed",
                "M",
                "ACT",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsOnlyOnce(
        "Application 1000456 must have a status of EXE before the exemption can be active.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void addExemptionShouldRejectUnknownReferencesForNonActiveCreate() {
    when(activationEligibilityValidator.validatePersistenceReferences(any()))
        .thenReturn(List.of("A valid exemption type code is required."));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                null,
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid exemption type code is required.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void updateExemptionShouldRejectUnknownReferencesForNonActiveUpdate() {
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(exemption("ACT")));
    when(activationEligibilityValidator.validatePersistenceReferences(any()))
        .thenReturn(List.of("A valid exemption status code is required."));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Changed",
                "M",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid exemption status code is required.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateBlanketOicShouldRetainPersistedRegionsWhenRequestOmitsThem() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "B")));
    when(repository.updateExemption(any())).thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of());

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Changed",
                "B",
                "CAN",
                null,
                null,
                null),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    ArgumentCaptor<ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate>
        referenceCaptor =
            ArgumentCaptor.forClass(
                ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate.class);
    verify(activationEligibilityValidator)
        .validatePersistenceReferences(referenceCaptor.capture());
    assertThat(referenceCaptor.getValue().regionNumbers()).isNull();
    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    assertThat(updateCaptor.getValue().regionNumbers()).isNull();
  }

  @Test
  void updateActiveBlanketOicShouldRetainPersistedRegionsWhenRequestOmitsThem() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "B")));
    when(repository.updateExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Changed",
                "B",
                "ACT",
                null,
                null,
                null),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    ArgumentCaptor<ExemptionActivationEligibilityValidator.ActivationCandidate>
        activationCaptor =
            ArgumentCaptor.forClass(
                ExemptionActivationEligibilityValidator.ActivationCandidate.class);
    verify(activationEligibilityValidator).validate(activationCaptor.capture());
    assertThat(activationCaptor.getValue().regionNumbers()).isNull();
    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    assertThat(updateCaptor.getValue().regionNumbers()).isNull();
  }

  @Test
  void updateBlanketOicShouldRejectAnExplicitEmptyRegionReplacement() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "B")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Changed",
                "B",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid region is required.");
    verify(activationEligibilityValidator, never()).validatePersistenceReferences(any());
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateBlanketOicShouldPropagatePersistedRegionLookupFailure() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "B")));
    when(activationEligibilityValidator.validatePersistenceReferences(any()))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    ExemptionDetailsRpcService.UpdateExemptionRequest request =
        new ExemptionDetailsRpcService.UpdateExemptionRequest(
            "EX-205",
            "EX-205",
            250.5d,
            LocalDate.of(2026, 3, 1),
            LocalDate.of(2026, 12, 31),
            "Changed",
            "B",
            "CAN",
            null,
            null,
            null);

    assertThatThrownBy(() -> service.updateExemption(request, "idir\\jsmith", true))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void addExemptionShouldPropagateReferenceLookupFailureBeforeNonActiveInsert() {
    when(activationEligibilityValidator.validatePersistenceReferences(any()))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    ExemptionDetailsRpcService.CreateExemptionRequest request =
        new ExemptionDetailsRpcService.CreateExemptionRequest(
            null,
            250.5d,
            null,
            null,
            "Conditions",
            "M",
            "NEW",
            null,
            null,
            List.of(),
            false,
            List.of());

    assertThatThrownBy(() -> service.addExemption(request, "idir\\jsmith", true))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void approveExemptionsShouldUseTheSharedActivationEligibilityValidator() {
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(exemption("NEW")));
    when(activationEligibilityValidator.validate(any()))
        .thenReturn(List.of("The expiry date must be after the approval date."));

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", "idir\\jsmith", true);

    assertThat(response.valid()).isFalse();
    assertThat(response.errorMessage()).contains("The expiry date must be after the approval date.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void getApplicationsShouldBuildOwnerAndUnmanuFlags() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L,
                    95.04d,
                    94.96d,
                    "00077881",
                    "00002176",
                    "03",
                    "12",
                    "A",
                    "BOB TURMEL",
                    "EXPORT PERSON",
                    "NORSKE SKOG CANADA LIMITED",
                    "INTERNATIONAL FOREST PRODUCTS",
                    "P",
                    "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "P", "S")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications("EX-205", true, ignored -> true);

    assertThat(response.applications()).hasSize(2);
    assertThat(response.applications().get(0).requestedVolume()).isEqualTo("95.0");
    assertThat(response.applications().get(0))
        .satisfies(
            application -> {
              assertThat(application.ownerClientNumber()).isEqualTo("00077881");
              assertThat(application.agentClientNumber()).isEqualTo("00002176");
              assertThat(application.ownerClientLocationCode()).isEqualTo("03");
              assertThat(application.agentClientLocationCode()).isEqualTo("12");
              assertThat(application.applicantTypeCode()).isEqualTo("A");
              assertThat(application.ownerContactName()).isEqualTo("BOB TURMEL");
              assertThat(application.agentContactName()).isEqualTo("EXPORT PERSON");
              assertThat(application.ownerCompanyName())
                  .isEqualTo("NORSKE SKOG CANADA LIMITED");
              assertThat(application.agentCompanyName())
                  .isEqualTo("INTERNATIONAL FOREST PRODUCTS");
            });
    assertThat(response.containsUnmanu()).isTrue();
    assertThat(response.ownerNumber()).isEqualTo("00077881");
  }

  @Test
  void getApplicationsShouldLeaveScaleVolumeBlankWhenTheLegacyCursorDoesNotProvideIt() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, Double.NaN, "00077881", "P", "T")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications("EX-205", true, ignored -> true);

    assertThat(response.applications()).singleElement().extracting("scaleVolume").isEqualTo("");
  }

  @Test
  void getApplicationsShouldExcludeRetiredIndianReserveJurisdiction() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, 94.96d, "00077881", "P", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "I", "T")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications("EX-205", true, ignored -> true);

    assertThat(response.applications()).extracting("applicationNumber").containsExactly(1000456L);
  }

  @Test
  void getApplicationsShouldFilterObjectScopeBeforeOwnerAndProductFlags() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 94.0d, "00099999", "P", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "P", "S")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications(
            "EX-205", true, applicationNumber -> applicationNumber == 1000457L);

    assertThat(response.applications())
        .extracting(ExemptionDetailsRpcService.ApplicationItem::applicationNumber)
        .containsExactly(1000457L);
    assertThat(response.containsUnmanu()).isFalse();
    assertThat(response.ownerNumber()).isEqualTo("00077881");
  }

  @Test
  void mutationApplicationDiscoveryShouldIncludeEveryJurisdictionAndDeduplicate() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "I", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, 94.96d, "00077881", "P", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "I", "T")));

    assertThat(service.getApplicationNumbersForMutation(" EX-205 "))
        .containsExactly(1000456L, 1000457L);
    verify(repository).findApplicationSummariesByExemptionNumber("EX-205");
  }

  @Test
  void mutationApplicationDiscoveryShouldFailClosedForMalformedRows() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            java.util.Arrays.asList(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, 94.96d, "00077881", "P", "T"),
                null));

    assertThatThrownBy(() -> service.getApplicationNumbersForMutation("EX-205"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid application number");
  }

  @Test
  void mutationPermitDiscoveryShouldReturnEveryDirectPermitInOrder() {
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000124L, 10.0d, 0.0d, "Active", "ACT", null, null, null),
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000123L, 20.0d, 0.0d, "Active", "ACT", null, null, null),
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000124L, 10.0d, 0.0d, "Active", "ACT", null, null, null)));

    assertThat(service.getPermitNumbersForMutation(" EX-205 "))
        .containsExactly(7000123L, 7000124L);
    verify(repository).findPermitsByExemptionNumber("EX-205");
  }

  @Test
  void mutationPermitDiscoveryShouldFailClosedForMalformedRows() {
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            java.util.Arrays.asList(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000123L, 20.0d, 0.0d, "Active", "ACT", null, null, null),
                null));

    assertThatThrownBy(() -> service.getPermitNumbersForMutation("EX-205"))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessageContaining("invalid permit number");
  }

  @Test
  void getPermitsShouldUseCurrentPermitVolumeForBlanketOicExemptions() {
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205")).thenReturn(Optional.of("B"));
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000123L,
                    95.0d,
                    12.4d,
                    "Active",
                    "ACT",
                    LocalDate.of(2026, 3, 10),
                    "00077881",
                    "00055667")));

    List<ExemptionDetailsRpcService.PermitItem> response =
        service.getPermits(
            "EX-205", permit -> permit.permitNumber() == 7000123L);

    assertThat(response).hasSize(1);
    assertThat(response.get(0).permitVolume()).isEqualTo("95.0");
    assertThat(response.get(0).permitIssueDate()).isEqualTo("03/10/2026");
    assertThat(response.get(0).canViewPermit()).isTrue();
  }

  @Test
  void getPermitsShouldUseObjectAuthorizationPredicateForEveryPermit() {
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205"))
        .thenReturn(Optional.of("M"));
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000123L, 95.0d, 0.0d, "Active", "ACT", null, null, null),
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    7000124L, 12.0d, 0.0d, "Complete", "COM", null, null, null)));

    List<ExemptionDetailsRpcService.PermitItem> response =
        service.getPermits(
            "EX-205", permit -> permit.permitNumber() == 7000123L);

    assertThat(response)
        .extracting(
            ExemptionDetailsRpcService.PermitItem::permitNumber,
            ExemptionDetailsRpcService.PermitItem::canViewPermit)
        .containsExactly(
            org.assertj.core.groups.Tuple.tuple(7000123L, true),
            org.assertj.core.groups.Tuple.tuple(7000124L, false));
  }

  @Test
  void largeBlanketOicPermitListShouldUseCursorOwnershipWithoutPerPermitReloads() {
    List<ExemptionDetailsRpcRepository.PermitSummaryRow> permitRows =
        java.util.stream.LongStream.range(7_000_000L, 7_001_000L)
            .mapToObj(
                permitNumber ->
                    new ExemptionDetailsRpcRepository.PermitSummaryRow(
                        permitNumber,
                        10.0d,
                        5.0d,
                        "Active",
                        "ACT",
                        null,
                        permitNumber % 2 == 0 ? "00012345" : "00099999",
                        ""))
            .toList();
    when(repository.findExemptionTypeCodeByExemptionNumber("BO-LARGE"))
        .thenReturn(Optional.of("B"));
    when(repository.findPermitsByExemptionNumber("BO-LARGE"))
        .thenReturn(permitRows);

    List<ExemptionDetailsRpcService.PermitItem> response =
        service.getPermits(
            "BO-LARGE",
            permit ->
                permit.oicLike()
                    && "00012345".equals(permit.ownerClientNumber()));

    assertThat(response).hasSize(1_000);
    assertThat(response.stream().filter(ExemptionDetailsRpcService.PermitItem::canViewPermit))
        .hasSize(500);
    verify(repository).findExemptionTypeCodeByExemptionNumber("BO-LARGE");
    verify(repository).findPermitsByExemptionNumber("BO-LARGE");
  }

  @Test
  void getBlanketTotalsShouldSumRequestedAndCompletedVolume() {
    when(repository.findBlanketOicTotals("EX-205"))
        .thenReturn(new ExemptionDetailsRpcRepository.BlanketOicTotalsRow(55.0d, 20.0d));

    ExemptionDetailsRpcService.BlanketOicTotalsResponse response =
        service.getBlanketOicTotals("EX-205");

    assertThat(response.requestedVolume()).isEqualTo("55.0");
    assertThat(response.completedVolume()).isEqualTo("20.0");
    verify(repository).findBlanketOicTotals("EX-205");
    verify(repository, never()).findPermitsByExemptionNumber("EX-205");
  }

  @Test
  void getDocumentDetailsShouldMergeExemptionAndApplicationDocs() {
    when(repository.findExemptionDocumentContextRows("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ExemptionDocumentContextRow(
                    new ExemptionDetailsRpcRepository.DocumentRow(
                        10L, "exemption.pdf", "", "UPLOAD"),
                    "Uploaded document",
                    "exemption",
                    null,
                    true),
                new ExemptionDetailsRpcRepository.ExemptionDocumentContextRow(
                    new ExemptionDetailsRpcRepository.DocumentRow(
                        20L, "application.pdf", "desc", "UPLOAD"),
                    "Uploaded document",
                    "application",
                    1000456L,
                    false)));

    List<ExemptionDetailsRpcService.DocumentItem> response = service.getDocumentDetails("EX-205");

    assertThat(response).hasSize(2);
    assertThat(response.get(0).description()).isEqualTo("Not on file");
    assertThat(response.get(0).type()).isEqualTo("Uploaded document");
    assertThat(response.get(0).source()).isEqualTo("exemption");
    assertThat(response.get(0).sourceExemptionNumber()).isEqualTo("EX-205");
    assertThat(response.get(0).deletable()).isTrue();
    assertThat(response.get(1).source()).isEqualTo("application");
    assertThat(response.get(1).sourceApplicationNumber()).isEqualTo(1000456L);
    assertThat(response.get(1).deletable()).isFalse();
    assertThat(service.documentCanBeRemovedFromExemption(10L, "EX-205")).isTrue();
    assertThat(service.documentCanBeRemovedFromExemption(20L, "EX-205")).isFalse();
    verify(repository, times(3)).findExemptionDocumentContextRows("EX-205");
    verify(repository, never()).findApplicationSummariesByExemptionNumber("EX-205");
    verify(repository, never()).findApplicationDocumentDetailsByApplicationNumber(anyLong());
    verify(repository, never()).findAttachmentTypeDescription(any());
  }

  @Test
  void documentRemovalShouldFailClosedForCrossSourceAndParentMismatches() {
    ExemptionDetailsRpcService malformedService =
        mock(ExemptionDetailsRpcService.class, CALLS_REAL_METHODS);
    when(malformedService.getDocumentDetails("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcService.DocumentItem(
                    10L,
                    "application.pdf",
                    "",
                    "Uploaded document",
                    "application",
                    "EX-205",
                    1000456L,
                    true),
                new ExemptionDetailsRpcService.DocumentItem(
                    20L,
                    "wrong-exemption.pdf",
                    "",
                    "Uploaded document",
                    "exemption",
                    "EX-206",
                    null,
                    true),
                new ExemptionDetailsRpcService.DocumentItem(
                    30L,
                    "mixed-parent.pdf",
                    "",
                    "Uploaded document",
                    "exemption",
                    "EX-205",
                    1000456L,
                    true)));

    assertThat(malformedService.documentCanBeRemovedFromExemption(10L, "EX-205"))
        .isFalse();
    assertThat(malformedService.documentCanBeRemovedFromExemption(20L, "EX-205"))
        .isFalse();
    assertThat(malformedService.documentCanBeRemovedFromExemption(30L, "EX-205"))
        .isFalse();
  }

  @Test
  void addExemptionShouldReturnValidationErrorsBeforeOracleInsertWithoutRequiringNumber() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "", null, null, null, "", "", "", null, null, List.of(), false, List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("The approved volume must be greater than 0");
    assertThat(response.errors()).doesNotContain("A valid exemption number is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addExemptionShouldRejectLegacyApprovedVolumeRangeBeforeOracleInsert() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                12_121_212.0d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The approved volume must be less than or equal to 9999999.99.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRejectLegacyApprovedVolumePrecisionBeforeOracleInsert() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.555d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("The approved volume must have no more than two decimal places.");
    verify(repository, never()).insertExemption(any());
  }

  @ParameterizedTest
  @ValueSource(doubles = {0.01d, 250.99d, 9_999_999.99d})
  void addExemptionShouldAcceptOracleApprovedVolumePrecision(double approvedVolume) {
    when(repository.insertExemption(any()))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                approvedVolume,
                null,
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).insertExemption(any());
  }

  @Test
  void addExemptionShouldRequireExpiryAfterApprovalDate() {
    LocalDate approvalDate = LocalDate.of(2026, 3, 1);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                approvalDate,
                approvalDate,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The approval date must come before the expiry.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldRequireExpiryWhenApprovalDateIsPresent() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 3, 1),
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid expiry date is required.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldAllowExpiryDayAfterApprovalDate() {
    when(repository.insertExemption(any()))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    LocalDate approvalDate = LocalDate.of(2026, 3, 1);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                approvalDate,
                approvalDate.plusDays(1),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).insertExemption(any());
  }

  @ParameterizedTest
  @MethodSource("nonFiniteApprovedVolumes")
  void addExemptionShouldRejectNonFiniteApprovedVolume(double approvedVolume) {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                approvedVolume,
                null,
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("The approved volume must be greater than 0");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldInsertWhenRequestIsValid() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.empty());
    when(repository.insertExemptionRate(any(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class)))
        .thenReturn(Optional.of(exemptionRate(999.99d)));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Conditions ",
                "B",
                "ACT",
                999.99d,
                true,
                List.of(),
                false,
                List.of(11L, 12L, 11L)),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The exemption was saved successfully.");
    assertThat(response.exemptionNumber()).isEqualTo("EX-205");
    assertThat(response.refreshPage()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class);
    verify(repository).insertExemption(recordCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionInsertRecord record = recordCaptor.getValue();
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.otherConditions()).isEqualTo("Conditions");
    assertThat(record.regionNumbers()).containsExactly(11L, 12L);

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionRateMutationRecord> rateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class);
    verify(repository).insertExemptionRate(rateCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionRateMutationRecord rateRecord = rateCaptor.getValue();
    assertThat(rateRecord.exemptionNumber()).isEqualTo("EX-205");
    assertThat(rateRecord.fixedExemptionRate()).isEqualTo(999.99d);
    assertThat(rateRecord.userId()).isEqualTo("idir\\jsmith");
  }

  @Test
  void addExemptionShouldFailWhenRequiredRateWriteDoesNotReturnARecord() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.empty());
    when(repository.insertExemptionRate(
            any(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class)))
        .thenReturn(Optional.empty());

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "B",
                "ACT",
                18.25d,
                true,
                List.of(),
                false,
                List.of(11L)),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("unable to save this exemption");
  }

  @Test
  void addExemptionShouldRollBackWhenRateInsertReturnsMismatchedValues() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.empty());
    when(repository.insertExemptionRate(
            any(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class)))
        .thenReturn(
            Optional.of(
                new ExemptionDetailsRpcRepository.ExemptionRateRecord(
                    "EX-OTHER",
                    18.50d,
                    "idir\\jsmith",
                    Timestamp.from(Instant.now()),
                    null,
                    null)));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ExemptionDetailsRpcService.CreateExemptionResult response =
        transactionalService(transactionManager)
            .addExemption(
                new ExemptionDetailsRpcService.CreateExemptionRequest(
                    "EX-205",
                    250.5d,
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 12, 31),
                    "Conditions",
                    "B",
                    "ACT",
                    18.25d,
                    true,
                    List.of(),
                    false,
                    List.of(11L)),
                "idir\\jsmith",
                true);

    assertThat(response.success()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addExemptionShouldRollBackWhenInsertReturnsWrongRequestedNumber() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-OTHER")));
    RecordingTransactionManager transactionManager = new RecordingTransactionManager();

    ExemptionDetailsRpcService.CreateExemptionResult response =
        transactionalService(transactionManager)
            .addExemption(
                new ExemptionDetailsRpcService.CreateExemptionRequest(
                    "EX-205",
                    250.5d,
                    LocalDate.of(2026, 3, 1),
                    LocalDate.of(2026, 12, 31),
                    "Conditions",
                    "B",
                    "ACT",
                    null,
                    null,
                    List.of(),
                    false,
                    List.of(11L)),
                "idir\\jsmith",
                true);

    assertThat(response.success()).isFalse();
    assertThat(transactionManager.commits).isZero();
    assertThat(transactionManager.rollbacks).isEqualTo(1);
  }

  @Test
  void addExemptionShouldAllowOracleGeneratedExemptionNumber() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-900")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Generated number",
                "M",
                "NEW",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.exemptionNumber()).isEqualTo("EX-900");

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class);
    verify(repository).insertExemption(recordCaptor.capture());
    assertThat(recordCaptor.getValue().exemptionNumber()).isNull();
  }

  @Test
  void addExemptionShouldReturnDuplicateExemptionNumberBeforeOracleInsert() {
    when(repository.existsByExemptionNumber("EX-205")).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "O",
                "ACT",
                null,
                null,
                List.of(),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("* - this exemption number has already been assigned");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldLinkApplicationWhenRequestIncludesApplicationNumber() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("APP", null, "P");
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(1000456L),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.exemptionNumber()).isEqualTo("EX-205");

    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> linkCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(linkCaptor.capture());
    ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord linkRecord = linkCaptor.getValue();
    assertThat(linkRecord.application()).isEqualTo(application);
    assertThat(linkRecord.exemptionNumber()).isEqualTo("EX-205");
    assertThat(linkRecord.applicationStatusCode()).isEqualTo("EXE");
    assertThat(linkRecord.updateUserId()).isEqualTo("idir\\jsmith");
  }

  @Test
  void previewCreateExemptionShouldDeriveMultipleApplicationDefaults() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(applicationForPreview(1000456L, 30L, 100.04d, "APP", null)));
    when(repository.findApplicationLinkRecord(1000457L))
        .thenReturn(Optional.of(applicationForPreview(1000457L, 90L, 200.05d, "APP", null)));

    ExemptionDetailsRpcService.CreateExemptionPreview preview =
        service.previewCreateExemption(List.of(1000456L, 1000457L), true);

    assertThat(preview.valid()).isTrue();
    assertThat(preview.exemptionTypeCode()).isEqualTo("M");
    assertThat(preview.exemptionStatusCode()).isEqualTo("NEW");
    assertThat(preview.approvedVolume()).isEqualTo("300.1");
    assertThat(preview.expiryDate()).isEqualTo(LexisBusinessTime.today().plusDays(90));
    assertThat(preview.applicationNumbers()).containsExactly(1000456L, 1000457L);
    assertThat(preview.errors()).isEmpty();
  }

  @Test
  void previewCreateExemptionShouldPreserveLegacyThirtyDayMinimumTerm() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(applicationForPreview(1000456L, 10L, 100.0d, "APP", null)));
    when(repository.findApplicationLinkRecord(1000457L))
        .thenReturn(Optional.of(applicationForPreview(1000457L, 20L, 200.0d, "APP", null)));

    ExemptionDetailsRpcService.CreateExemptionPreview preview =
        service.previewCreateExemption(List.of(1000456L, 1000457L), true);

    assertThat(preview.valid()).isTrue();
    assertThat(preview.expiryDate()).isEqualTo(LexisBusinessTime.today().plusDays(30));
  }

  @Test
  void previewCreateExemptionShouldFailClosedForMissingOrIneligibleApplication() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(applicationForPreview(1000456L, 30L, 100.0d, "PND", null)));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.empty());

    ExemptionDetailsRpcService.CreateExemptionPreview preview =
        service.previewCreateExemption(List.of(1000456L, 1000457L), true);

    assertThat(preview.valid()).isFalse();
    assertThat(preview.approvedVolume()).isNull();
    assertThat(preview.expiryDate()).isNull();
    assertThat(preview.errors())
        .contains(
            "Application 1000456 must have a status of approved.",
            "Application 1000457 does not exist");
  }

  @Test
  void previewCreateExemptionShouldFailClosedForMalformedAuthoritativeValues() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(applicationForPreview(1000456L, null, Double.NaN, "APP", null)));

    ExemptionDetailsRpcService.CreateExemptionPreview preview =
        service.previewCreateExemption(List.of(1000456L), true);

    assertThat(preview.valid()).isFalse();
    assertThat(preview.errors())
        .containsExactly(
            "Application 1000456 returned an invalid exemption term.",
            "Application 1000456 returned an invalid requested volume.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void previewCreateExemptionShouldPropagateOracleLookupFailure() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findApplicationLinkRecord(1000456L)).thenThrow(failure);

    assertThatThrownBy(() -> service.previewCreateExemption(List.of(1000456L), true))
        .isSameAs(failure);
  }

  @Test
  void addExemptionShouldRevalidateApplicationsWhilePreservingManualDefaultsAdjustments() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord first =
        applicationForPreview(1000456L, 30L, 100.04d, "APP", null);
    ExemptionDetailsRpcRepository.ApplicationLinkRecord second =
        applicationForPreview(1000457L, 90L, 200.05d, "APP", null);
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(first));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(second));
    when(repository.insertExemption(any()))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.updateApplicationExemption(any())).thenReturn(true);
    LocalDate adjustedExpiry = LexisBusinessTime.today().plusDays(45);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                null,
                250.5d,
                LexisBusinessTime.today(),
                adjustedExpiry,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(1000456L, 1000457L),
                true,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionInsertRecord> insertCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class);
    verify(repository).insertExemption(insertCaptor.capture());
    assertThat(insertCaptor.getValue().approvedVolume()).isEqualTo(250.5d);
    assertThat(insertCaptor.getValue().expiryDate()).isEqualTo(adjustedExpiry);
    verify(repository, times(2)).findApplicationLinkRecord(1000456L);
    verify(repository, times(2)).findApplicationLinkRecord(1000457L);
    verify(repository, times(2)).updateApplicationExemption(any());
  }

  @Test
  void addExemptionShouldRollbackWhenEligibilityChangesBeforeLinking() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord eligible =
        applicationForPreview(1000456L, 30L, 100.0d, "APP", null);
    ExemptionDetailsRpcRepository.ApplicationLinkRecord assigned =
        applicationForPreview(1000456L, 30L, 100.0d, "APP", "EX-999");
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(eligible), Optional.of(assigned));
    when(repository.insertExemption(any()))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(createExemptionRequest("M", List.of(1000456L)), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application 1000456 is already assigned to exemption EX-999.");
    verify(repository).insertExemption(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @ParameterizedTest
  @MethodSource("mismatchedApplicantIdentities")
  void addExemptionShouldRejectMixedApplicantIdentityBeforeAnyWrite(
      String candidateOwnerNumber,
      String candidateOwnerLocation,
      String candidateAgentNumber,
      String candidateAgentLocation) {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord first =
        applicationWithIdentity(
            1000456L, "00077881", "00", "00055667", "00", "APP", null);
    ExemptionDetailsRpcRepository.ApplicationLinkRecord candidate =
        applicationWithIdentity(
            1000457L,
            candidateOwnerNumber,
            candidateOwnerLocation,
            candidateAgentNumber,
            candidateAgentLocation,
            "APP",
            null);
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(first));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(candidate));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            createExemptionRequest("M", List.of(1000456L, 1000457L)), "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains(
            "Application 1000457 cannot be added to this exemption because its owner or agent client details do not match the other applications.");
    verify(repository, never()).insertExemption(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void addExemptionShouldAcceptNormalizedIdentityWithoutComparingAgentLocation() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord first =
        applicationWithIdentity(1000456L, "77881", " 00 ", "55667", "00", "APP", null);
    ExemptionDetailsRpcRepository.ApplicationLinkRecord second =
        applicationWithIdentity(
            1000457L, "00077881", "00", "00055667", "09", "APP", null);
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(first));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(second));
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.updateApplicationExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            createExemptionRequest("M", List.of(1000456L, 1000457L)), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).insertExemption(any());
    verify(repository, times(2)).updateApplicationExemption(any());
  }

  @Test
  void addExemptionShouldPreserveMixedClientOicException() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord first =
        applicationWithIdentity(
            1000456L, "00077881", "00", "00055667", "00", "APP", null);
    ExemptionDetailsRpcRepository.ApplicationLinkRecord second =
        applicationWithIdentity(
            1000457L, "00099999", "99", null, null, "APP", null);
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(first));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(second));
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.updateApplicationExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            createExemptionRequest("O", List.of(1000456L, 1000457L)), "idir\\jsmith");

    assertThat(response.success()).isTrue();
    verify(repository).insertExemption(any());
    verify(repository, times(2)).updateApplicationExemption(any());
  }

  @Test
  void addExemptionShouldRejectAlreadyAssignedApplicationBeforeOracleInsert() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("APP", "EX-101", "P")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of(1000456L),
                false,
                List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Application 1000456 is already assigned to exemption EX-101.");
    verify(repository, never()).insertExemption(any());
  }

  @Test
  void addExemptionShouldDefaultEntryUserWhenPrincipalIsMissing() {
    when(repository.insertExemption(any(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class)))
        .thenReturn(Optional.of(new ExemptionDetailsRpcRepository.ExemptionInsertRow("EX-205")));
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.empty());
    when(repository.insertExemptionRate(any(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class)))
        .thenReturn(Optional.of(exemptionRate(18.25d)));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Conditions ",
                "B",
                "ACT",
                18.25d,
                true,
                List.of(),
                false,
                List.of(11L, 12L)),
            null);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionInsertRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionInsertRecord.class);
    verify(repository).insertExemption(recordCaptor.capture());
    assertThat(recordCaptor.getValue().entryUserId()).isEqualTo("system");

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionRateMutationRecord> rateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class);
    verify(repository).insertExemptionRate(rateCaptor.capture());
    assertThat(rateCaptor.getValue().userId()).isEqualTo("system");
  }

  @Test
  void checkExemptionNumberShouldReturnValidWhenNumberIsAvailable() {
    when(repository.existsByExemptionNumber("EX-205")).thenReturn(false);

    ExemptionDetailsRpcService.ExemptionNumberValidationResult response =
        service.checkExemptionNumber(" EX-205 ");

    assertThat(response.valid()).isTrue();
    assertThat(response.message()).isNull();
    verify(repository).existsByExemptionNumber("EX-205");
  }

  @Test
  void checkExemptionNumberShouldReturnDuplicateMessageWhenNumberExists() {
    when(repository.existsByExemptionNumber("EX-205")).thenReturn(true);

    ExemptionDetailsRpcService.ExemptionNumberValidationResult response =
        service.checkExemptionNumber("EX-205");

    assertThat(response.valid()).isFalse();
    assertThat(response.message()).isEqualTo("* - this exemption number has already been assigned");
  }

  @Test
  void addApplicationToExemptionShouldRejectApplicationWithActiveValidOffer() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application("APP", null, "P")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    when(repository.hasActiveValidOffers(1000456L)).thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Application has valid offers and cannot be added to an exemption.");
  }

  @Test
  void addApplicationToExemptionShouldRejectRetiredIndianReserveJurisdiction() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application("APP", null, "I")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    when(repository.hasActiveValidOffers(1000456L)).thenReturn(false);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Insufficient privileges to add this application.");
    verify(repository, never())
        .updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class));
  }

  @Test
  void addApplicationToExemptionShouldSetApplicationExemptionAndExemptedStatus() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("APP", null, "P");
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    when(repository.hasActiveValidOffers(1000456L)).thenReturn(false);
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    assertThat(response.errors()).isEmpty();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(recordCaptor.capture());
    ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord record = recordCaptor.getValue();
    assertThat(record.application()).isEqualTo(application);
    assertThat(record.exemptionNumber()).isEqualTo("EX-205");
    assertThat(record.applicationStatusCode()).isEqualTo("EXE");
    assertThat(record.updateUserId()).isEqualTo("idir\\jsmith");
  }

  @ParameterizedTest
  @MethodSource("mismatchedApplicantIdentities")
  void addApplicationToExemptionShouldRejectMixedApplicantIdentityWithoutWriting(
      String candidateOwnerNumber,
      String candidateOwnerLocation,
      String candidateAgentNumber,
      String candidateAgentLocation) {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord assigned =
        applicationWithIdentity(
            1000457L, "00077881", "00", "00055667", "00", "EXE", "EX-205");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord candidate =
        applicationWithIdentity(
            1000456L,
            candidateOwnerNumber,
            candidateOwnerLocation,
            candidateAgentNumber,
            candidateAgentLocation,
            "APP",
            null);
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(candidate));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(applicationSummary(1000457L, assigned.ownerClientNumber())));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(assigned));

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application cannot be added to this exemption because its owner or agent client details do not match the other applications.");
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void addApplicationToExemptionShouldAcceptNormalizedIdentityWithoutComparingAgentLocation() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord assigned =
        applicationWithIdentity(
            1000457L, "77881", " 00 ", "55667", "00", "EXE", "EX-205");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord candidate =
        applicationWithIdentity(
            1000456L, "00077881", "00", "00055667", "09", "APP", null);
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(candidate));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(applicationSummary(1000457L, assigned.ownerClientNumber())));
    when(repository.findApplicationLinkRecord(1000457L)).thenReturn(Optional.of(assigned));
    when(repository.updateApplicationExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    verify(repository).updateApplicationExemption(any());
  }

  @Test
  void addApplicationToExemptionShouldPreserveMixedClientOicException() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord candidate =
        applicationWithIdentity(
            1000456L, "00099999", "99", null, null, "APP", null);
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "O")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(candidate));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(applicationSummary(1000457L, "00077881")));
    when(repository.updateApplicationExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    verify(repository).updateApplicationExemption(any());
    verify(repository, never()).findApplicationLinkRecord(1000457L);
  }

  @Test
  void removeApplicationFromExemptionShouldClearExemptionAndRestoreApprovedStatus() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("EXE", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenReturn(List.of());
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(recordCaptor.capture());
    ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord record = recordCaptor.getValue();
    assertThat(record.exemptionNumber()).isNull();
    assertThat(record.applicationStatusCode()).isEqualTo("APP");
    verify(repository, times(2)).findApplicationLinkRecord(1000456L);
  }

  @Test
  void removeApplicationFromExemptionShouldRejectPermittedApplicationStatus() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("PMT", "EX-205", "P")));

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application status does not allow removal from this exemption.");
    verify(repository, never()).findPermitsByApplicationNumberRequired(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void removeApplicationFromExemptionShouldRejectAuthoritativePermitLink() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationPermitRow(
                    7000123L, "EX-205")));

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "Application cannot be removed from the exemption while it is linked to a permit.");
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void removeApplicationFromExemptionShouldFailClosedForMissingPermitRelationships() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenReturn(null);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application permit relationships could not be verified.");
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void removeApplicationFromExemptionShouldPropagatePermitRelationshipOutage() {
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("Oracle unavailable");
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenThrow(failure);

    assertThatThrownBy(
            () ->
                service.removeApplicationFromExemption(
                    1000456L, "EX-205", "idir\\jsmith"))
        .isSameAs(failure);

    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void removeApplicationFromExemptionShouldFailWhenSourceStatusChangesBeforeWrite() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord exempted =
        application("EXE", "EX-205", "P");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord permitted =
        application("PMT", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(exempted), Optional.of(permitted));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenReturn(List.of());

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Application changed while it was being removed from the exemption.");
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void removeApplicationFromExemptionShouldAllowApprovedSourceAfterCancelledReopen() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord approved =
        application("APP", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("NEW")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(approved));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenReturn(List.of());
    when(repository.updateApplicationExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isTrue();
    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> captor =
        ArgumentCaptor.forClass(
            ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(captor.capture());
    assertThat(captor.getValue().application()).isEqualTo(approved);
    assertThat(captor.getValue().exemptionNumber()).isNull();
    assertThat(captor.getValue().applicationStatusCode()).isEqualTo("APP");
  }

  @ParameterizedTest
  @ValueSource(strings = {"CAN", "EXP"})
  void addApplicationToExemptionShouldRejectReadOnlyExemptionWithoutWriting(String status) {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption(status)));

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "EXP".equals(status)
                ? "Expired exemptions are read-only."
                : "Cancelled exemptions are read-only.");
    verify(repository, never()).findApplicationLinkRecord(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @ParameterizedTest
  @ValueSource(strings = {"CAN", "EXP"})
  void removeApplicationFromExemptionShouldRejectReadOnlyExemptionWithoutWriting(String status) {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption(status)));

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "EX-205", "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly(
            "EXP".equals(status)
                ? "Expired exemptions are read-only."
                : "Cancelled exemptions are read-only.");
    verify(repository, never()).findApplicationLinkRecord(any());
    verify(repository, never()).updateApplicationExemption(any());
  }

  @Test
  void updateExemptionShouldPreserveLegacyCancellationWithLivePermits() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord exemptedApplication =
        application("EXE", "EX-205", "P");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord permittedApplication =
        application("PMT", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 50.0d, 50.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(exemptedApplication));
    when(repository.findApplicationLinkRecord(1000457L))
        .thenReturn(Optional.of(permittedApplication));
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Updated conditions ",
                "M",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("The exemption was updated successfully.");
    assertThat(response.exemptionNumber()).isEqualTo("EX-205");
    assertThat(response.refreshPage()).isFalse();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> exemptionCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(exemptionCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord = exemptionCaptor.getValue();
    assertThat(updateRecord.exemptionNumber()).isEqualTo("EX-205");
    assertThat(updateRecord.previousExemptionNumber()).isEqualTo("EX-205");
    assertThat(updateRecord.exemptionStatusCode()).isEqualTo("CAN");
    assertThat(updateRecord.updateUserId()).isEqualTo("idir\\jsmith");

    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> applicationCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(applicationCaptor.capture());
    assertThat(applicationCaptor.getValue().exemptionNumber()).isEqualTo("EX-205");
    assertThat(applicationCaptor.getValue().applicationStatusCode()).isEqualTo("APP");
    verify(repository, never()).findPermitsByExemptionNumber(any());
    verify(repository, never()).findExemptionRate("EX-205");
  }

  @ParameterizedTest
  @ValueSource(strings = {"NEW", "ACT"})
  void updateExemptionShouldAllowBlanketOicExpiryChangeDuringCancellation(
      String persistedStatus) {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption(persistedStatus, "B")));
    when(repository.updateExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2027, 1, 31),
                "Conditions",
                "B",
                "CAN",
                null,
                null,
                List.of(1903L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    verify(repository).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRejectActiveMinisterialExpiryChange() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "M")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2027, 1, 31),
                "Conditions",
                "M",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Insufficient privileges to change the expiry date of this exemption.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRejectAddingExpiryToActiveMinisterialWithoutOne() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "M", null, null)));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2027, 1, 31),
                "Conditions",
                "M",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Insufficient privileges to change the expiry date of this exemption.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldNotWidenExpiryPermissionFromSubmittedType() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT", "M")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2027, 1, 31),
                "Conditions",
                "B",
                "ACT",
                null,
                null,
                List.of(1903L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Insufficient privileges to change the expiry date of this exemption.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRejectExpiredExemptionWithoutAnyWrite() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("EXP")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-ATTACK",
                "EX-205",
                999d,
                LocalDate.of(2027, 1, 1),
                LocalDate.of(2027, 12, 31),
                "forged",
                "B",
                "NEW",
                25d,
                true,
                List.of(1903L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.exemptionNumber()).isEqualTo("EX-205");
    assertThat(response.errors()).containsExactly("Expired exemptions are read-only.");
    verify(repository, never()).updateExemption(any());
    verify(repository, never()).findExemptionRate(any());
  }

  @Test
  void updateExemptionShouldRejectTextOracleCannotStoreBeforeWriting() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("NEW")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                null,
                LocalDate.of(2026, 12, 31),
                "condition é",
                "M",
                "NEW",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .contains("Other conditions contains characters the current LEXIS database cannot store.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRequireExpiryAfterApprovalDate() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("NEW", "M")));
    LocalDate approvalDate = LocalDate.of(2026, 3, 1);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                approvalDate,
                approvalDate,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("The approval date must come before the expiry.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRequireExpiryWhenApprovalDateIsPresent() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("NEW", "M", null, null)));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                null,
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).containsExactly("A valid expiry date is required.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRejectCraftedExpiredTransition() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "EXP",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Exemption expiry is managed by the expiry process.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldRejectInvalidActiveToNewTransition() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "NEW",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Exemption status cannot change from ACT to NEW.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldReopenCancelledExemptionWhilePreservingEveryOtherField() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("CAN");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any())).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-ATTACK",
                "EX-205",
                999d,
                LocalDate.of(2027, 1, 1),
                LocalDate.of(2027, 12, 31),
                "forged",
                "B",
                "NEW",
                25d,
                true,
                List.of(1903L)),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    assertThat(response.exemptionNumber()).isEqualTo("EX-205");
    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> captor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(captor.capture());
    ExemptionDetailsRpcRepository.ExemptionUpdateRecord update = captor.getValue();
    assertThat(update.exemptionNumber()).isEqualTo(existing.exemptionNumber());
    assertThat(update.previousExemptionNumber()).isEqualTo(existing.exemptionNumber());
    assertThat(update.approvedVolume()).isEqualTo(existing.approvedVolume());
    assertThat(update.approvalDate()).isEqualTo(existing.approvalDate());
    assertThat(update.expiryDate()).isEqualTo(existing.expiryDate());
    assertThat(update.otherConditions()).isEqualTo(existing.otherConditions());
    assertThat(update.exemptionTypeCode()).isEqualTo(existing.exemptionTypeCode());
    assertThat(update.exemptionStatusCode()).isEqualTo("NEW");
    assertThat(update.regionNumbers()).isNull();
    verify(repository, never()).findExemptionRate(any());
    verify(repository, never()).updateExemptionRate(any());
    verify(repository, never()).insertExemptionRate(any());
    verify(repository, never()).deleteExemptionRate(any());
  }

  @Test
  void updateExemptionShouldRejectAnyCancelledTransitionOtherThanNew() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("CAN")));

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205", "EX-205", null, null, null, null, null, "ACT",
                null, null, List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors())
        .containsExactly("Cancelled exemptions can only be reopened with a status of NEW.");
    verify(repository, never()).updateExemption(any());
  }

  @Test
  void updateExemptionShouldResolveAndBindOnlyTheCanonicalPreviousNumber() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(
            any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-206",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "ACT",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    verify(repository).findExemptionRecord("EX-205");
    verify(repository, never()).findExemptionRecord("EX-206");
    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    assertThat(updateCaptor.getValue().exemptionNumber()).isEqualTo("EX-206");
    assertThat(updateCaptor.getValue().previousExemptionNumber()).isEqualTo("EX-205");
  }

  @Test
  void updateExemptionShouldFailWhenCancellationCannotRestoreApplication() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application =
        application("EXE", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.updateApplicationExemption(
            any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(false);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                "Conditions",
                "M",
                "CAN",
                null,
                null,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("unable to save this exemption");
  }

  @Test
  void updateExemptionShouldUpdateExistingFeeRateWhenOverrideEnabled() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.of(exemptionRate(18.25d)));
    when(repository.updateExemptionRate(any(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Updated conditions ",
                "M",
                "ACT",
                22.5d,
                true,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionRateMutationRecord> rateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionRateMutationRecord.class);
    verify(repository).updateExemptionRate(rateCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionRateMutationRecord rateRecord = rateCaptor.getValue();
    assertThat(rateRecord.exemptionNumber()).isEqualTo("EX-205");
    assertThat(rateRecord.fixedExemptionRate()).isEqualTo(22.5d);
    assertThat(rateRecord.userId()).isEqualTo("idir\\jsmith");
  }

  @Test
  void updateExemptionShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Updated conditions ",
                "M",
                "ACT",
                null,
                null,
                List.of()),
            null,
            true);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    assertThat(updateCaptor.getValue().updateUserId()).isEqualTo("creator");
  }

  @Test
  void updateExemptionShouldDeleteExistingFeeRateWhenOverrideDisabled() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findExemptionRate("EX-205")).thenReturn(Optional.of(exemptionRate(18.25d)));
    when(repository.deleteExemptionRate("EX-205")).thenReturn(true);

    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.updateExemption(
            new ExemptionDetailsRpcService.UpdateExemptionRequest(
                "EX-205",
                "EX-205",
                250.5d,
                LocalDate.of(2026, 3, 1),
                LocalDate.of(2026, 12, 31),
                " Updated conditions ",
                "M",
                "ACT",
                null,
                false,
                List.of()),
            "idir\\jsmith",
            true);

    assertThat(response.success()).isTrue();
    verify(repository).deleteExemptionRate("EX-205");
  }

  @Test
  void approveExemptionsShouldActivateExemptionAndReturnClientEmailSendGrid() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("NEW");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("EXE", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(notificationRecipientResolver.resolve(
            1000456L, "O", "00077881", "00", "00055667", "00"))
        .thenReturn(Optional.of("owner@example.com"));

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    assertThat(response.valid()).isTrue();
    assertThat(response.sendGrid()).containsExactly(List.of("EX-205", "owner@example.com"));
    assertThat(response.errorMessage()).isEmpty();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord = updateCaptor.getValue();
    assertThat(updateRecord.exemptionStatusCode()).isEqualTo("ACT");
    assertThat(updateRecord.approvalDate()).isEqualTo(LexisBusinessTime.today());
    assertThat(updateRecord.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(updateRecord.regionNumbers()).isNull();
  }

  @ParameterizedTest
  @ValueSource(strings = {"ACT", "CAN", "EXP", "BOGUS", " "})
  void approveExemptionsShouldRejectEveryStatusOtherThanNewWithoutEmailData(String status) {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption(status)));

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", "idir\\jsmith", true);

    assertThat(response.valid()).isFalse();
    assertThat(response.sendGrid()).isEmpty();
    assertThat(response.errorMessage())
        .contains("only NEW exemptions can be approved")
        .contains("current status:");
    verify(repository, never()).updateExemption(any());
    verify(repository, never()).findApplicationSummariesByExemptionNumber(any());
    verifyNoInteractions(notificationRecipientResolver, notificationService);
  }

  @Test
  void approveExemptionsShouldDefaultUpdateUserWhenPrincipalIsMissing() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("NEW");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", null, true);

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    assertThat(updateCaptor.getValue().updateUserId()).isEqualTo("creator");
  }

  @Test
  void approveExemptionsShouldReturnInvalidResponseWhenNoExemptionsApproved() {
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.empty());

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    assertThat(response.valid()).isFalse();
    assertThat(response.sendGrid()).isEmpty();
    assertThat(response.errorMessage()).contains("Failed to approve invalid exemption EX-205");
  }

  @Test
  void sendExemptionApprovalEmailShouldHonorAValidRequestedRecipient() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));
    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail(
            "EX-205", " Applicant <edited@example.com> ");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Approval email sent.");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.ExemptionApproval(
                "EX-205",
                "1000456",
                "edited@example.com",
                RegionalMailRoute.RCO));
    verifyNoInteractions(notificationRecipientResolver);
  }

  @Test
  void sendExemptionApprovalEmailShouldUseTheFirstLinkedApplicationsRegionalSender() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 50.0d, 50.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(
            Optional.of(
                applicationWithIdentity(
                    1000456L, "00077881", "00", null, null, "EXE", "EX-205", 1834L)));

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", "edited@example.com");

    assertThat(response.success()).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.ExemptionApproval(
                "EX-205", "1000456\n1000457", "edited@example.com", RegionalMailRoute.RSI));
    verify(repository, never()).findApplicationLinkRecord(1000457L);
  }

  @Test
  void sendExemptionApprovalEmailsShouldReportPartialFailure() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findExemptionRecord("EX-404")).thenReturn(Optional.empty());
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));
    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmails("EX-205:attacker@example.com,EX-404:missing@example.com");

    assertThat(response.success()).isFalse();
    assertThat(response.message()).contains("Approval email could not be sent for exemption(s)");
    assertThat(response.message()).contains("EX-404");
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.ExemptionApproval(
                "EX-205", "1000456", "attacker@example.com", RegionalMailRoute.RCO));
    verifyNoInteractions(notificationRecipientResolver);
  }

  @Test
  void sendExemptionApprovalEmailShouldUseAgentForAgentApplicant() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application =
        application("EXE", "EX-205", "P", "A");
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(notificationRecipientResolver.resolve(
            1000456L, "A", "00077881", "00", "00055667", "00"))
        .thenReturn(Optional.of("agent@example.com"));

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", " ");

    assertThat(response.success()).isTrue();
    verify(notificationService)
        .publish(
            new WorkflowEmailEvent.ExemptionApproval(
                "EX-205", "1000456", "agent@example.com", RegionalMailRoute.RCO));
  }

  @Test
  void sendExemptionApprovalEmailShouldPublishNothingWithoutAValidAuthoritativeEmail() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application =
        application("EXE", "EX-205", "P");
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(notificationRecipientResolver.resolve(
            1000456L, "O", "00077881", "00", "00055667", "00"))
        .thenReturn(Optional.empty());

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", " ");

    assertThat(response.success()).isFalse();
    verifyNoInteractions(notificationService);
  }

  @Test
  void sendExemptionApprovalEmailShouldPublishNothingWithoutAnApplicationClientRecord() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.empty());

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", " ");

    assertThat(response.success()).isFalse();
    verifyNoInteractions(notificationRecipientResolver);
    verifyNoInteractions(notificationService);
  }

  @Test
  void sendExemptionApprovalEmailShouldPropagateLookupOutagesWithoutPublishing() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application =
        application("EXE", "EX-205", "P");
    DataAccessResourceFailureException failure =
        new DataAccessResourceFailureException("client lookup unavailable");
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(notificationRecipientResolver.resolve(
            1000456L, "O", "00077881", "00", "00055667", "00"))
        .thenThrow(failure);

    assertThatThrownBy(
            () -> service.sendExemptionApprovalEmail("EX-205", " "))
        .isSameAs(failure);
    verifyNoInteractions(notificationService);
  }

  @Test
  void sendExemptionApprovalEmailShouldRejectNonActiveCanonicalStateWithoutPublishing() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("NEW")));

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", "attacker@example.com");

    assertThat(response.success()).isFalse();
    verify(repository, never()).findApplicationSummariesByExemptionNumber(any());
    verifyNoInteractions(notificationRecipientResolver, notificationService);
  }

  @Test
  void sendExemptionApprovalEmailShouldRejectAMalformedRequestedRecipient() {
    when(repository.findExemptionRecord("EX-205"))
        .thenReturn(Optional.of(exemption("ACT")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application("EXE", "EX-205", "P")));

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", "not-an-email");

    assertThat(response.success()).isFalse();
    verifyNoInteractions(notificationRecipientResolver, notificationService);
  }

  private static Stream<Arguments> mismatchedApplicantIdentities() {
    return Stream.of(
        Arguments.of("00099999", "00", "00055667", "00"),
        Arguments.of("00077881", "01", "00055667", "00"),
        Arguments.of("00077881", "00", null, null),
        Arguments.of("00077881", "00", "00099999", "00"));
  }

  private static Stream<Arguments> nonFiniteApprovedVolumes() {
    return Stream.of(
        Arguments.of(Double.NaN),
        Arguments.of(Double.POSITIVE_INFINITY),
        Arguments.of(Double.NEGATIVE_INFINITY));
  }

  private ExemptionDetailsRpcService.CreateExemptionRequest createExemptionRequest(
      String exemptionTypeCode, List<Long> applicationNumbers) {
    return new ExemptionDetailsRpcService.CreateExemptionRequest(
        "M".equals(exemptionTypeCode) ? null : "EX-205",
        250.5d,
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 12, 31),
        "Conditions",
        exemptionTypeCode,
        "M".equals(exemptionTypeCode) ? "NEW" : "ACT",
        null,
        null,
        applicationNumbers,
        true,
        List.of());
  }

  private ExemptionDetailsRpcRepository.ApplicationSummaryRow applicationSummary(
      long applicationNumber, String ownerClientNumber) {
    return new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
        applicationNumber, 95.0d, 95.0d, ownerClientNumber, "P", "S");
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord applicationWithIdentity(
      long applicationNumber,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      String statusCode,
      String exemptionNumber) {
    return applicationWithIdentity(
        applicationNumber,
        ownerClientNumber,
        ownerClientLocationCode,
        agentClientNumber,
        agentClientLocationCode,
        statusCode,
        exemptionNumber,
        12L);
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord applicationWithIdentity(
      long applicationNumber,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      String statusCode,
      String exemptionNumber,
      Long orgUnitNumber) {
    return new ExemptionDetailsRpcRepository.ApplicationLinkRecord(
        applicationNumber,
        null,
        LocalDate.of(2026, 2, 20),
        120L,
        LocalDate.of(2026, 2, 21),
        95.0d,
        1.6d,
        "Campbell River",
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        agentClientNumber,
        agentClientLocationCode,
        ownerClientNumber,
        ownerClientLocationCode,
        exemptionNumber,
        "ER02",
        statusCode,
        agentClientNumber == null ? "O" : "A",
        orgUnitNumber,
        "S",
        "P",
        "G",
        "Agent Contact",
        "Owner Contact",
        "N",
        LocalDate.of(2026, 2, 1));
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord applicationForPreview(
      long applicationNumber,
      Long termDays,
      Double requestedVolume,
      String statusCode,
      String exemptionNumber) {
    return new ExemptionDetailsRpcRepository.ApplicationLinkRecord(
        applicationNumber,
        null,
        LocalDate.of(2026, 2, 20),
        termDays,
        LocalDate.of(2026, 2, 21),
        requestedVolume,
        1.6d,
        "Campbell River",
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        "00055667",
        "00",
        "00077881",
        "00",
        exemptionNumber,
        "ER02",
        statusCode,
        "A",
        12L,
        "S",
        "P",
        "G",
        "Agent Contact",
        "Owner Contact",
        "N",
        LocalDate.of(2026, 2, 1));
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord application(
      String statusCode, String exemptionNumber, String jurisdictionCode) {
    return application(statusCode, exemptionNumber, jurisdictionCode, "O");
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord application(
      String statusCode,
      String exemptionNumber,
      String jurisdictionCode,
      String applicantTypeCode) {
    return new ExemptionDetailsRpcRepository.ApplicationLinkRecord(
        1000456L,
        null,
        LocalDate.of(2026, 2, 20),
        120L,
        LocalDate.of(2026, 2, 21),
        95.0d,
        1.6d,
        "Campbell River",
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        "00055667",
        "00",
        "00077881",
        "00",
        exemptionNumber,
        "ER02",
        statusCode,
        applicantTypeCode,
        1835L,
        "S",
        jurisdictionCode,
        "G",
        "Agent Contact",
        "Owner Contact",
        "N",
        LocalDate.of(2026, 2, 1));
  }

  private ExemptionDetailsRpcRepository.ExemptionRecord exemption(String statusCode) {
    return exemption(statusCode, "M");
  }

  private ExemptionDetailsRpcRepository.ExemptionRecord exemption(
      String statusCode, String exemptionTypeCode) {
    return exemption(
        statusCode,
        exemptionTypeCode,
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 12, 31));
  }

  private ExemptionDetailsRpcRepository.ExemptionRecord exemption(
      String statusCode,
      String exemptionTypeCode,
      LocalDate approvalDate,
      LocalDate expiryDate) {
    return new ExemptionDetailsRpcRepository.ExemptionRecord(
        "EX-205",
        250.5d,
        approvalDate,
        expiryDate,
        "Conditions",
        exemptionTypeCode,
        statusCode,
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        null);
  }

  private ExemptionDetailsRpcRepository.ExemptionRateRecord exemptionRate(Double fixedRate) {
    return new ExemptionDetailsRpcRepository.ExemptionRateRecord(
        "EX-205",
        fixedRate,
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        null);
  }

  private ExemptionDetailsRpcService transactionalService(
      RecordingTransactionManager transactionManager) {
    TransactionInterceptor transactionInterceptor =
        new TransactionInterceptor(
            transactionManager, new AnnotationTransactionAttributeSource());
    ProxyFactory proxyFactory = new ProxyFactory(service);
    proxyFactory.addAdvice(transactionInterceptor);
    return (ExemptionDetailsRpcService) proxyFactory.getProxy();
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
      // Nothing to enlist for this boundary test.
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

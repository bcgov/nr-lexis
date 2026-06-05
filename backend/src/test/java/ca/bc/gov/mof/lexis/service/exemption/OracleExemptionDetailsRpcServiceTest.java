package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleExemptionDetailsRpcService")
class OracleExemptionDetailsRpcServiceTest {

  @Mock private ExemptionDetailsRpcRepository repository;
  @Mock private ClientLookupService clientLookupService;

  @InjectMocks private OracleExemptionDetailsRpcService service;

  @Test
  void getApplicationsShouldBuildOwnerAndUnmanuFlags() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.04d, 94.96d, "00077881", "P", "T"),
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000457L, 11.0d, 11.0d, "00077881", "P", "S")));

    ExemptionDetailsRpcService.ExemptionApplicationsResponse response =
        service.getApplications("EX-205", true, true);

    assertThat(response.applications()).hasSize(2);
    assertThat(response.applications().get(0).requestedVolume()).isEqualTo("95.0");
    assertThat(response.containsUnmanu()).isTrue();
    assertThat(response.ownerNumber()).isEqualTo("00077881");
  }

  @Test
  void getPermitsShouldUseOicVolumeForOicExemptions() {
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205")).thenReturn(Optional.of("O"));
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
        service.getPermits("EX-205", false, false, "00077881");

    assertThat(response).hasSize(1);
    assertThat(response.get(0).permitVolume()).isEqualTo("12.4");
    assertThat(response.get(0).permitIssueDate()).isEqualTo("03/10/2026");
    assertThat(response.get(0).canViewPermit()).isTrue();
  }

  @Test
  void getBlanketTotalsShouldSumRequestedAndCompletedVolume() {
    when(repository.findPermitsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    1L, 20.0d, 0.0d, "Complete", "COM", null, "", ""),
                new ExemptionDetailsRpcRepository.PermitSummaryRow(
                    2L, 35.0d, 0.0d, "Active", "ACT", null, "", "")));

    ExemptionDetailsRpcService.BlanketOicTotalsResponse response =
        service.getBlanketOicTotals("EX-205");

    assertThat(response.requestedVolume()).isEqualTo("55.0");
    assertThat(response.completedVolume()).isEqualTo("20.0");
  }

  @Test
  void getDocumentDetailsShouldMergeExemptionAndApplicationDocs() {
    when(repository.findExemptionDocumentDetailsByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.DocumentRow(
                    10L, "exemption.pdf", "", "UPLOAD")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 0.0d, 0.0d, "00077881", "P", "S")));
    when(repository.findApplicationDocumentDetailsByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.DocumentRow(20L, "application.pdf", "desc", "UPLOAD")));
    when(repository.findAttachmentTypeDescription("UPLOAD")).thenReturn(Optional.of("Uploaded document"));

    List<ExemptionDetailsRpcService.DocumentItem> response = service.getDocumentDetails("EX-205");

    assertThat(response).hasSize(2);
    assertThat(response.get(0).description()).isEqualTo("Not on file");
    assertThat(response.get(0).type()).isEqualTo("Uploaded document");
    verify(repository).findApplicationDocumentDetailsByApplicationNumber(1000456L);
  }

  @Test
  void addExemptionShouldReturnValidationErrorsBeforeOracleInsert() {
    ExemptionDetailsRpcService.CreateExemptionResult response =
        service.addExemption(
            new ExemptionDetailsRpcService.CreateExemptionRequest(
                "", null, null, null, "", "", "", null, null, List.of()),
            "idir\\jsmith");

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("A valid exemption number is required.");
    verifyNoInteractions(repository);
  }

  @Test
  void addExemptionShouldInsertWhenRequestIsValid() {
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
    assertThat(rateRecord.fixedExemptionRate()).isEqualTo(18.25d);
    assertThat(rateRecord.userId()).isEqualTo("idir\\jsmith");
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
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application("APP", null, "P")));
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205")).thenReturn(Optional.of("O"));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    when(repository.hasActiveValidOffers(1000456L)).thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true, true);

    assertThat(response.success()).isFalse();
    assertThat(response.errors()).contains("Application has valid offers and cannot be added to an exemption.");
  }

  @Test
  void addApplicationToExemptionShouldSetApplicationExemptionAndExemptedStatus() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("APP", null, "P");
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.findExemptionTypeCodeByExemptionNumber("EX-205")).thenReturn(Optional.of("O"));
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    when(repository.hasActiveValidOffers(1000456L)).thenReturn(false);
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.addApplicationToExemption(1000456L, "EX-205", "idir\\jsmith", true, true);

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

  @Test
  void removeApplicationFromExemptionShouldClearExemptionAndRestoreApprovedStatus() {
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("EXE", "EX-205", "P");
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
    when(repository.updateApplicationExemption(any(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class)))
        .thenReturn(true);

    ExemptionDetailsRpcService.ApplicationExemptionLinkResult response =
        service.removeApplicationFromExemption(1000456L, "idir\\jsmith");

    assertThat(response.success()).isTrue();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord> recordCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord.class);
    verify(repository).updateApplicationExemption(recordCaptor.capture());
    ExemptionDetailsRpcRepository.ApplicationLinkUpdateRecord record = recordCaptor.getValue();
    assertThat(record.exemptionNumber()).isNull();
    assertThat(record.applicationStatusCode()).isEqualTo("APP");
  }

  @Test
  void updateExemptionShouldSaveUpdateAndRevertApplicationsWhenCancelled() {
    ExemptionDetailsRpcRepository.ExemptionRecord existing = exemption("ACT");
    ExemptionDetailsRpcRepository.ApplicationLinkRecord application = application("EXE", "EX-205", "P");
    when(repository.findExemptionRecord("EX-205")).thenReturn(Optional.of(existing));
    when(repository.updateExemption(any(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class)))
        .thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationLinkRecord(1000456L)).thenReturn(Optional.of(application));
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
    verify(repository, never()).findExemptionRate("EX-205");
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
    when(clientLookupService.getClientData("00055667", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00055667",
                    "Agent Co",
                    "123 Main St",
                    "Victoria",
                    "BC",
                    "V8W 1A1",
                    "CA",
                    "250-555-0100",
                    "250-555-0199",
                    "agent@example.com")));

    ExemptionDetailsRpcService.ExemptionApprovalResult response =
        service.approveExemptions("EX-205", "idir\\jsmith", true);

    assertThat(response.success()).isTrue();
    assertThat(response.valid()).isTrue();
    assertThat(response.sendGrid()).containsExactly(List.of("EX-205", "agent@example.com"));
    assertThat(response.errorMessage()).isEmpty();

    ArgumentCaptor<ExemptionDetailsRpcRepository.ExemptionUpdateRecord> updateCaptor =
        ArgumentCaptor.forClass(ExemptionDetailsRpcRepository.ExemptionUpdateRecord.class);
    verify(repository).updateExemption(updateCaptor.capture());
    ExemptionDetailsRpcRepository.ExemptionUpdateRecord updateRecord = updateCaptor.getValue();
    assertThat(updateRecord.exemptionStatusCode()).isEqualTo("ACT");
    assertThat(updateRecord.approvalDate()).isEqualTo(LocalDate.now());
    assertThat(updateRecord.updateUserId()).isEqualTo("idir\\jsmith");
    assertThat(updateRecord.regionNumbers()).isNull();
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
  void sendExemptionApprovalEmailShouldStageExplicitEmailWhenApplicationExists() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmail("EX-205", "client@example.com");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).isEqualTo("Email sent successfully.");
  }

  @Test
  void sendExemptionApprovalEmailsShouldReportPartialFailure() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(
            List.of(
                new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
                    1000456L, 95.0d, 95.0d, "00077881", "P", "S")));
    when(repository.findApplicationSummariesByExemptionNumber("EX-404")).thenReturn(List.of());

    ExemptionDetailsRpcService.ExemptionApprovalEmailResult response =
        service.sendExemptionApprovalEmails("EX-205:client@example.com,EX-404:missing@example.com");

    assertThat(response.success()).isTrue();
    assertThat(response.message()).contains("Sending one or more emails failed.");
    assertThat(response.message()).contains("EX-205");
    assertThat(response.message()).contains("EX-404");
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord application(
      String statusCode, String exemptionNumber, String jurisdictionCode) {
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
        "O",
        12L,
        "S",
        jurisdictionCode,
        "G",
        "Agent Contact",
        "Owner Contact",
        "N",
        LocalDate.of(2026, 2, 1));
  }

  private ExemptionDetailsRpcRepository.ExemptionRecord exemption(String statusCode) {
    return new ExemptionDetailsRpcRepository.ExemptionRecord(
        "EX-205",
        250.5d,
        LocalDate.of(2026, 3, 1),
        LocalDate.of(2026, 12, 31),
        "Conditions",
        "M",
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
}

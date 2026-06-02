package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleApplicationDetailsRpcService")
class OracleApplicationDetailsRpcServiceTest {

  @Mock private ApplicationDetailsRpcRepository repository;
  @InjectMocks private OracleApplicationDetailsRpcService service;

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
    assertThat(response.get(1).name()).isEqualTo("permit-a.pdf");
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
                    12L, "hello", "idir\\jsmith", now)));

    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        service.persistRemark("new", 1000456L, "hello", "idir\\jsmith");

    assertThat(response).isPresent();
    assertThat(response.get().remarkId()).isEqualTo(12L);
    assertThat(response.get().displayRemark()).isEqualTo("hello");
  }

  @Test
  void persistRemarkShouldUpdateWhenRemarkIdExists() {
    Instant now = Instant.parse("2026-05-27T17:45:00Z");
    when(repository.updateRemark(org.mockito.ArgumentMatchers.eq(44L), org.mockito.ArgumentMatchers.eq(1000456L), org.mockito.ArgumentMatchers.eq("updated"), org.mockito.ArgumentMatchers.eq("idir\\jsmith"), any(Instant.class))).thenReturn(true);
    when(repository.findRemarkByNumber(44L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.RemarkRow(
                    44L, "updated", "idir\\jsmith", now)));

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
    verify(repository).findRemarkByNumber(44L);
  }

  @Test
  void persistRemarkShouldReturnEmptyWhenApplicationInvalid() {
    Optional<ApplicationDetailsRpcService.PersistedRemark> response =
        service.persistRemark("new", null, "hello", "idir\\jsmith");

    assertThat(response).isEmpty();
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
  void addApplicationShouldInsertWhenRequestIsValid() {
    when(repository.insertApplication(any(ApplicationDetailsRpcRepository.ApplicationInsertRecord.class)))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.ApplicationInsertRow(1000456L)));

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
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
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
    when(repository.findAllSpeciesCodes())
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
    verify(repository).findAllSpeciesCodes();
  }

  @Test
  void getGradeCodesShouldDeduplicateSortAndResolveDescriptions() {
    when(repository.findSpeciesEndUsesByRegionSpecies("11", "FIR"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "U", "LUM", "FIR/U", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "J", "PUL", "FIR/J", 11L),
                new ApplicationDetailsRpcRepository.SpeciesGradeEndUseRow("FIR", "J", "LUM", "FIR/J", 11L)));
    when(repository.findGradeCode("J"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("J", "Grade J", 1L, 1L)));
    when(repository.findGradeCode("U"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("U", "Grade U", 1L, 2L)));

    List<ApplicationDetailsRpcService.CodeItem> response = service.getGradeCodes("11", "FIR");

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("J", "Grade J"), tuple("U", "Grade U"));
    verify(repository).findSpeciesEndUsesByRegionSpecies("11", "FIR");
    verify(repository).findGradeCode("J");
    verify(repository).findGradeCode("U");
  }
}

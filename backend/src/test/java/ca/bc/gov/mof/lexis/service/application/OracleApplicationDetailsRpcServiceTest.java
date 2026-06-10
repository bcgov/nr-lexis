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
  void addApplicationShouldDefaultEntryUserWhenPrincipalIsMissing() {
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

  @Test
  void getEndUsesForSpeciesRegionShouldUseCandidateEndUsesAndResolveDescriptions() {
    when(repository.findCandidateEndUseCodes(2, "FI", 11L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.ExcolValidationRow("UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("LU"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("UT"),
                new ApplicationDetailsRpcRepository.ExcolValidationRow("ZZ")));
    when(repository.findEndUseCode("LU"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("LU", "Lumber", 1L, 1L)));
    when(repository.findEndUseCode("UT"))
        .thenReturn(Optional.of(new ApplicationDetailsRpcRepository.CodeRow("UT", "Utility", 1L, 2L)));
    when(repository.findEndUseCode("ZZ")).thenReturn(Optional.empty());

    List<ApplicationDetailsRpcService.CodeItem> response =
        service.getEndUsesForSpeciesRegion("11", List.of(" FI ", "HE"));

    assertThat(response)
        .extracting(
            ApplicationDetailsRpcService.CodeItem::code,
            ApplicationDetailsRpcService.CodeItem::description)
        .containsExactly(tuple("LU", "Lumber"), tuple("UT", "Utility"));
    verify(repository).findCandidateEndUseCodes(2, "FI", 11L);
    verify(repository).findEndUseCode("LU");
    verify(repository).findEndUseCode("UT");
    verify(repository).findEndUseCode("ZZ");
  }

  @Test
  void getRemainingSpeciesShouldReturnRegionSpeciesWhenNoneSelected() {
    when(repository.findSpeciesEndUsesByRegion("11"))
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
    verify(repository).findSpeciesEndUsesByRegion("11");
  }

  @Test
  void getRemainingSpeciesShouldFilterCandidateExcolCombinations() {
    when(repository.findCandidateExcolCombinations(2, "FI", 11L))
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
    verify(repository).findCandidateExcolCombinations(2, "FI", 11L);
  }

  @Test
  void getSelectedEndUseShouldReturnFirstApplicationEndUse() {
    when(repository.findEndUsesByApplicationNumber(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcRepository.EndUseRow("FIR", " LUM "),
                new ApplicationDetailsRpcRepository.EndUseRow("HEM", "PUL")));

    Optional<String> response = service.getSelectedEndUse(1000456L);

    assertThat(response).contains("LUM");
    verify(repository).findEndUsesByApplicationNumber(1000456L);
  }

  @Test
  void getPackageSelectedEndUseShouldReturnFirstPackageEndUse() {
    when(repository.findEndUsesByPackageNumber("PKG-903"))
        .thenReturn(List.of(new ApplicationDetailsRpcRepository.EndUseRow("FIR", "LUM")));

    Optional<String> response = service.getPackageSelectedEndUse(" PKG-903 ");

    assertThat(response).contains("LUM");
    verify(repository).findEndUsesByPackageNumber("PKG-903");
  }

  @Test
  void getSpeciesForApplicationShouldResolveEndUseDescriptions() {
    when(repository.findEndUsesByApplicationNumber(1000456L))
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
    verify(repository).findEndUsesByApplicationNumber(1000456L);
    verify(repository).findEndUseCode("LUM");
  }

  @Test
  void getSpeciesForPackageShouldResolveEndUseDescriptions() {
    when(repository.findEndUsesByPackageNumber("PKG-903"))
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
    verify(repository).findEndUsesByPackageNumber("PKG-903");
    verify(repository).findEndUseCode("PUL");
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
  void getScalesForPackageShouldReturnLegacySortedScaleRows() {
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
    when(repository.findPermitStatusCodeByPermitNumber(7000123L)).thenReturn(Optional.of("COM"));

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
    when(repository.insertPackage(any()))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcRepository.PackageMutationRow(
                    "PKG-903", 1000456L, "N", 125.5d, 12.0d, 24.0d, "Test", null,
                    null, null, "A", null, null, "idir\\jsmith", Instant.now())));

    ApplicationDetailsRpcService.PackagePersistenceResult response =
        service.addPackage(
            new ApplicationDetailsRpcService.PackageMutationRequest(
                " PKG-903 ",
                null,
                1000456L,
                125.5d,
                12.0d,
                24.0d,
                "A",
                "Test",
                "N",
                null,
                null,
                "LU",
                List.of("FI", "HE")),
            " idir\\jsmith ");

    assertThat(response.valid()).isTrue();
    assertThat(response.packageNumber()).isEqualTo("PKG-903");
    assertThat(response.volume()).isEqualTo("125.5");

    ArgumentCaptor<ApplicationDetailsRpcRepository.PackageMutationRecord> recordCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcRepository.PackageMutationRecord.class);
    verify(repository).insertPackage(recordCaptor.capture());
    ApplicationDetailsRpcRepository.PackageMutationRecord record = recordCaptor.getValue();
    assertThat(record.packageNumber()).isEqualTo("PKG-903");
    assertThat(record.applicationNumber()).isEqualTo(1000456L);
    assertThat(record.entryUserId()).isEqualTo("idir\\jsmith");
    assertThat(record.endUses())
        .extracting(
            ApplicationDetailsRpcRepository.PackageEndUseRecord::speciesCode,
            ApplicationDetailsRpcRepository.PackageEndUseRecord::endUseCode)
        .containsExactly(tuple("FI", "LU"), tuple("HE", "LU"));
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
  void addScaleToPackageShouldInsertScaleAndReturnLegacyResult() {
    when(repository.packageExists("PKG-903")).thenReturn(true);
    when(repository.findScaleDetailsByPackageNumber("PKG-903")).thenReturn(List.of());
    when(repository.findPackageDetailsByPackageNumber("PKG-903"))
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
  void getPackageDetailsShouldReturnLegacyPackagePayload() {
    when(repository.findPackageDetailsByPackageNumber("PKG-903"))
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
    verify(repository).findPackageDetailsByPackageNumber("PKG-903");
    verify(repository).findScaleDetailsByPackageNumber("PKG-903");
  }

  @Test
  void deleteScaleByIdShouldDelegateToOracleRepository() {
    when(repository.deleteScaleById("55", "idir\\jsmith")).thenReturn(true);

    boolean response = service.deleteScaleById(" 55 ", " idir\\jsmith ");

    assertThat(response).isTrue();
    verify(repository).deleteScaleById("55", "idir\\jsmith");
  }

  @Test
  void deletePackageByIdShouldDelegateToOracleRepository() {
    when(repository.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    boolean response = service.deletePackageById(" PKG-903 ", " idir\\jsmith ");

    assertThat(response).isTrue();
    verify(repository).deletePackageById("PKG-903", "idir\\jsmith");
  }
}

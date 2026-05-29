package ca.bc.gov.mof.lexis.service.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadPreviewResponseDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitRequestDto;
import ca.bc.gov.mof.lexis.dto.application.rpc.ApplicationScaleUploadSubmitResponseDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationScaleDetailRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ScaleUploadInsertRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.TimberMarkRow;
import java.math.BigDecimal;
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
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleApplicationDetailsRpcService")
class OracleApplicationDetailsRpcServiceTest {

  @Mock private ApplicationDetailsRpcRepository repository;
  @Mock private LexisApplicationService applicationService;
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
  void previewScaleXmlUploadShouldParseApplicationPackageScaleRows() {
    arrangeScaleUploadLookups();
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "scales.xml",
            "application/xml",
            """
            <scales>
              <scale>
                <timberMark>TM1</timberMark>
                <speciesCode>HEM</speciesCode>
                <gradeCode>J</gradeCode>
                <pieces>12</pieces>
                <scaleVolume>10.45</scaleVolume>
                <packageNumber>PKG-1</packageNumber>
              </scale>
            </scales>
            """
                .getBytes());

    ApplicationScaleUploadPreviewResponseDto response =
        service.previewScaleXmlUpload(file, 1000456L, null);

    assertThat(response.errors()).isEmpty();
    assertThat(response.totalRows()).isEqualTo(1);
    assertThat(response.validRows()).isEqualTo(1);
    assertThat(response.totalPieces()).isEqualTo(12L);
    assertThat(response.totalVolume()).isEqualByComparingTo("10.5");
    assertThat(response.rows().get(0).applicationNumber()).isEqualTo(1000456L);
    assertThat(response.rows().get(0).speciesDescription()).isEqualTo("Hemlock");
  }

  @Test
  void submitScaleXmlUploadShouldInsertApplicationScaleRowsWithoutPermitNumber() {
    arrangeScaleUploadLookups();
    when(repository.insertScaleDetail(any(ScaleUploadInsertRow.class), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            Optional.of(
                new ApplicationScaleDetailRow(
                    "99", "TM1", "HEM", "J", 10.5d, 12L, 1000456L, "PKG-1")));

    ApplicationScaleUploadSubmitResponseDto response =
        service.submitScaleXmlUpload(
            new ApplicationScaleUploadSubmitRequestDto(
                1000456L,
                List.of(
                    new ApplicationScaleUploadSubmitRequestDto.ScaleRow(
                        1, "TM1", "HEM", "J", 12L, BigDecimal.valueOf(10.5d), "PKG-1", 1000456L))),
            "idir\\jsmith");

    assertThat(response.success()).isTrue();
    assertThat(response.submittedRows()).isEqualTo(1);
    ArgumentCaptor<ScaleUploadInsertRow> rowCaptor = ArgumentCaptor.forClass(ScaleUploadInsertRow.class);
    verify(repository).insertScaleDetail(rowCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    assertThat(rowCaptor.getValue().packageNumber()).isEqualTo("PKG-1");
    assertThat(rowCaptor.getValue().speciesGradeVolume()).isEqualByComparingTo("10.5");
    assertThat(rowCaptor.getValue().exemptionOverrideRate()).isEqualByComparingTo(BigDecimal.ZERO);
  }

  private void arrangeScaleUploadLookups() {
    when(applicationService.findPackageByPackageNumber("PKG-1"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-1", 1000456L, 20.0d, "O")));
    when(applicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.of(applicationDetail()));
    when(repository.findTimberMark("TM1")).thenReturn(Optional.of(new TimberMarkRow("TM1", "ACT", "B01")));
    when(repository.findSpeciesDescription("HEM")).thenReturn(Optional.of("Hemlock"));
    when(repository.findGradeDescription("J")).thenReturn(Optional.of("Grade J"));
    when(repository.findScaleDetailsByPackageNumber(anyString())).thenReturn(List.of());
  }

  private LexisApplicationDetailDto applicationDetail() {
    return new LexisApplicationDetailDto(
        1000456L,
        "EX-123",
        "ACTIVE",
        "Active",
        "00011122",
        "00033344",
        12L,
        "Coast",
        "LOG",
        "R1",
        LocalDate.parse("2026-01-01"),
        LocalDate.parse("2026-01-02"),
        LocalDate.parse("2026-01-03"),
        30L,
        20.0d,
        2.0d,
        true,
        false,
        false,
        false,
        false,
        List.of(),
        List.of(),
        List.of());
  }
}

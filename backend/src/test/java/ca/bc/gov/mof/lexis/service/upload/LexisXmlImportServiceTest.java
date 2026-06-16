package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.LexisXmlImportResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | LexisXmlImportService")
class LexisXmlImportServiceTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;

  @Test
  void shouldImportLexisXmlAsApplicationPackageAndScales() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    LexisXmlImportService service = service();

    LexisXmlImportResultDto result = service.importLexisXml(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).addApplication(applicationCaptor.capture(), eq("jsmith"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.applicationDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.receivedDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.termDays()).isEqualTo(180L);
    assertThat(application.applicationVolume()).isEqualTo(525.0d);
    assertThat(application.averageLogVolume()).isEqualTo(0.3d);
    assertThat(application.ownerClientNumber()).isEqualTo("1074");
    assertThat(application.ownerClientLocationCode()).isEqualTo("03");
    assertThat(application.ownerContactName()).isEqualTo("CUSTOMER SERVICE");
    assertThat(application.orgUnitNumber()).isEqualTo(1909L);
    assertThat(application.exemptionReasonCode()).isEqualTo("S");
    assertThat(application.applicantTypeCode()).isEqualTo("O");
    assertThat(application.productTypeCode()).isEqualTo("H");
    assertThat(application.growthTypeCode()).isEqualTo("S");
    assertThat(application.endUseCode()).isEqualTo("PL");
    assertThat(application.speciesCodes()).containsExactly("HE", "FI");

    ArgumentCaptor<PackageMutationRequest> packageCaptor =
        ArgumentCaptor.forClass(PackageMutationRequest.class);
    verify(applicationDetailsService).addPackage(packageCaptor.capture(), eq("jsmith"));
    PackageMutationRequest packageRequest = packageCaptor.getValue();
    assertThat(packageRequest.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(packageRequest.applicationNumber()).isEqualTo(9001L);
    assertThat(packageRequest.volume()).isEqualTo(525.0d);
    assertThat(packageRequest.averageLength()).isEqualTo(6.7d);
    assertThat(packageRequest.averageDiameter()).isEqualTo(12.8d);
    assertThat(packageRequest.status()).isEqualTo("ACT");
    assertThat(packageRequest.endUseCode()).isEqualTo("PL");
    assertThat(packageRequest.speciesCodes()).containsExactly("HE", "FI");

    ArgumentCaptor<ScaleMutationRequest> scaleCaptor =
        ArgumentCaptor.forClass(ScaleMutationRequest.class);
    verify(applicationDetailsService, times(3)).addScaleToPackage(scaleCaptor.capture(), eq("jsmith"));
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::timberMark)
        .containsExactly("NCHWP", "NCHWP", "NCHWP");
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::speciesCode)
        .containsExactly("HE", "HE", "FI");
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::gradeCode)
        .containsExactly("H", "J", "J");
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::volume)
        .containsExactly(500.0d, 24.5d, 0.5d);
  }

  @Test
  void shouldImportZippedLexisXmlAsApplicationPackageAndScales() throws Exception {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    LexisXmlImportService service = service();

    LexisXmlImportResultDto result =
        service.importLexisXml(zippedFile("payload/6-652-7.xml", SAMPLE_XML), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.warnings()).contains("Imported payload/6-652-7.xml from ZIP archive submission.zip.");
    verify(applicationDetailsService, times(3)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldRejectImportAndSkipScalesWhenPackagePersistenceFails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                false, null, null, null, null, null, List.of("Package could not be saved."), List.of()));

    LexisXmlImportResultDto result = service().importLexisXml(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.errors()).containsExactly("Package could not be saved.");
    verify(applicationDetailsService, never()).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldRejectImportAndStopRemainingScalesWhenScalePersistenceFails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new ScalePersistenceResult(true, null, List.of(), List.of()),
            new ScalePersistenceResult(false, null, List.of("Scale could not be saved."), List.of()));

    LexisXmlImportResultDto result = service().importLexisXml(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.errors()).containsExactly("Scale could not be saved.");
    verify(applicationDetailsService, times(2)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldRejectUnsupportedFileExtensionsBeforePersistence() {
    LexisXmlImportService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "submission.txt", "text/plain", "not xml".getBytes(StandardCharsets.UTF_8));

    LexisXmlImportResultDto result = service.importLexisXml(file, "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("The LEXIS import file must be an XML file or a ZIP file containing one XML file.");
    assertThat(result.message())
        .contains("The LEXIS import file must be an XML file or a ZIP file containing one XML file.");
  }

  @Test
  void shouldRejectZipFilesWithMultipleXmlFiles() throws Exception {
    LexisXmlImportService service = service();

    LexisXmlImportResultDto result =
        service.importLexisXml(zippedFile(List.of("first.xml", "second.xml")), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The ZIP file must contain exactly one LEXIS XML file.");
  }

  @Test
  void shouldRejectZipFilesWithoutXmlFiles() throws Exception {
    LexisXmlImportService service = service();

    LexisXmlImportResultDto result = service.importLexisXml(emptyZipFile(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The ZIP file must contain one LEXIS XML file.");
  }

  @Test
  void shouldRejectCorruptZipFiles() {
    LexisXmlImportService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "submission.zip", "application/zip", "not a zip".getBytes(StandardCharsets.UTF_8));

    LexisXmlImportResultDto result = service.importLexisXml(file, "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The uploaded Zip file is corrupt, and cannot be read.");
  }

  @Test
  void shouldRejectUnmappedForestRegion() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>",
            "<lexis:bcForestRegionCode>BAD</lexis:bcForestRegionCode>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Forest region code BAD is not mapped to a LEXIS region.");
  }

  @Test
  void shouldRejectXmlWithoutSchemaLocation() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\""
                + " xsi:schemaLocation=\""
                + SAMPLE_SCHEMA_LOCATION
                + "\"",
            "");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The XML file must include an xsi:schemaLocation attribute.");
  }

  @Test
  void shouldRejectMalformedXmlWithLineAndColumnDetails() {
    LexisXmlImportService service = service();
    String xml = SAMPLE_XML.replace("</lexis:productDetail>", "");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .anySatisfy(
            error -> {
              assertThat(error).contains("Line:");
              assertThat(error)
                  .contains(
                      "The tag '<lexis:productDetail>' must be terminated with a matching "
                          + "'</lexis:productDetail>' tag.");
            });
  }

  @Test
  void shouldRejectLexisPayloadOutsideSubmissionContent() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
                "<esf:submissionContent>",
                "<esf:submissionContent />")
            .replace("</esf:submissionContent>", "");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The XML file must include a LEXIS submission payload.");
  }

  @Test
  void shouldRejectDuplicateSingletonSections() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "</lexis:applicationDetail>",
            "</lexis:applicationDetail>\n"
                + "<lexis:applicationDetail>\n"
                + "  <lexis:jurisdictionCode>P</lexis:jurisdictionCode>\n"
                + "</lexis:applicationDetail>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Application details must appear only once.");
  }

  @Test
  void shouldRejectDuplicateSingletonFields() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:clientNumber>1074</lexis:clientNumber>",
            "<lexis:clientNumber>1074</lexis:clientNumber>\n"
                + "<lexis:clientNumber>9999</lexis:clientNumber>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Applicant client number must appear only once.");
  }

  @Test
  void shouldRejectUnsupportedLexisSchemaVersion() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd",
            "http://www.for.gov.bc.ca/schema/lexis/1/xsd/MOF/mof-lexis.xsd");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "The XML schema location must use supported LEXIS schema version "
                + "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd.");
  }

  @Test
  void shouldRejectUnsupportedEsfSchemaVersion() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd",
            "http://www.for.gov.bc.ca/schema/esf/0/xsd/MOF/esf-submission.xsd");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "The XML schema location must use supported ESF schema version "
                + "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd.");
  }

  @Test
  void shouldRejectDuplicateSchemaLocationNamespaces() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            SAMPLE_SCHEMA_LOCATION,
            SAMPLE_SCHEMA_LOCATION
                + " http://www.for.gov.bc.ca/schema/lexis "
                + "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("The XML schema location must include each schema namespace only once.");
  }

  @Test
  void shouldRejectNonProvincialLexisSubmissions() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:jurisdictionCode>P</lexis:jurisdictionCode>",
            "<lexis:jurisdictionCode>F</lexis:jurisdictionCode>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Only provincial LEXIS XML submissions are supported.");
  }

  @Test
  void shouldRejectPackageNumbersLongerThanTwentyCharacters() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>",
            "<lexis:boomNumber>123456789012345678901</lexis:boomNumber>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Boom/package number must be 20 characters or fewer.");
  }

  @Test
  void shouldRejectMissingSpeciesEndUseSort() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace("<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>", "");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Species/end-use sort is required.");
  }

  @Test
  void shouldRejectMalformedSpeciesEndUseSort() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>",
            "<lexis:speciesEndUseSort>HE</lexis:speciesEndUseSort>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Species/end-use sort must be formatted as species/end use.");
  }

  @Test
  void shouldRejectDuplicateScaleCombinationsBeforePersistence() {
    LexisXmlImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:species>FI</lexis:species>", "<lexis:species>HE</lexis:species>");

    LexisXmlImportResultDto result =
        service.importLexisXml(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("A scale with the same Timber Mark/Species/Grade combination already exists.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  private LexisXmlImportService service() {
    return new LexisXmlImportService(
        applicationDetailsServiceProvider,
        Clock.fixed(Instant.parse("2026-06-12T12:00:00Z"), ZoneOffset.UTC));
  }

  private MockMultipartFile sampleXml() {
    return new MockMultipartFile(
        "formFile", "6-652-7.xml", "application/xml", SAMPLE_XML.getBytes(StandardCharsets.UTF_8));
  }

  private MockMultipartFile zippedFile(String entryName, String xml) throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
      zip.putNextEntry(new ZipEntry(entryName));
      zip.write(xml.getBytes(StandardCharsets.UTF_8));
      zip.closeEntry();
    }
    return new MockMultipartFile(
        "formFile", "submission.zip", "application/zip", bytes.toByteArray());
  }

  private MockMultipartFile zippedFile(List<String> entryNames) throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
      for (String entryName : entryNames) {
        zip.putNextEntry(new ZipEntry(entryName));
        zip.write(SAMPLE_XML.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
      }
    }
    return new MockMultipartFile(
        "formFile", "submission.zip", "application/zip", bytes.toByteArray());
  }

  private MockMultipartFile emptyZipFile() throws Exception {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (ZipOutputStream ignored = new ZipOutputStream(bytes)) {
      // Intentionally empty.
    }
    return new MockMultipartFile(
        "formFile", "submission.zip", "application/zip", bytes.toByteArray());
  }

  private static final String SAMPLE_SCHEMA_LOCATION =
      "http://www.for.gov.bc.ca/schema/esf "
          + "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd "
          + "http://www.for.gov.bc.ca/schema/lexis "
          + "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd";

  private static final String SAMPLE_XML =
      """
      <?xml version="1.0" encoding="UTF-8"?>
      <esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="%s">
        <esf:submissionContent>
          <lexis:LexisSubmission>
            <lexis:applicant>
              <lexis:applicantDetails>
                <lexis:clientNumber>1074</lexis:clientNumber>
                <lexis:clientLocnCode>03</lexis:clientLocnCode>
                <lexis:name>Mosaic Forest Management Corporation</lexis:name>
              </lexis:applicantDetails>
              <lexis:applicantContact>
                <lexis:contactSurname>SERVICE</lexis:contactSurname>
                <lexis:contactFirstname>CUSTOMER</lexis:contactFirstname>
              </lexis:applicantContact>
            </lexis:applicant>
            <lexis:applicationDetail>
              <lexis:jurisdictionCode>P</lexis:jurisdictionCode>
              <lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>
              <lexis:applStatusCode>A</lexis:applStatusCode>
              <lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>
              <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
            </lexis:applicationDetail>
            <lexis:productDetail>
              <lexis:productTypeCode>H</lexis:productTypeCode>
              <lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>
              <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
              <lexis:productLocation>Port Alberni c/o Pacific Towing</lexis:productLocation>
              <lexis:ageClass>S</lexis:ageClass>
              <lexis:avgLength>6.7</lexis:avgLength>
              <lexis:avgDiameter>12.8</lexis:avgDiameter>
              <lexis:harvestedTimber>
                <lexis:timberMark>NCHWP</lexis:timberMark>
                <lexis:numberOfPieces>1500</lexis:numberOfPieces>
                <lexis:species>HE</lexis:species>
                <lexis:grade>H</lexis:grade>
                <lexis:quantityVolume>500</lexis:quantityVolume>
              </lexis:harvestedTimber>
              <lexis:harvestedTimber>
                <lexis:timberMark>NCHWP</lexis:timberMark>
                <lexis:numberOfPieces>50</lexis:numberOfPieces>
                <lexis:species>HE</lexis:species>
                <lexis:grade>J</lexis:grade>
                <lexis:quantityVolume>24.5</lexis:quantityVolume>
              </lexis:harvestedTimber>
              <lexis:harvestedTimber>
                <lexis:timberMark>NCHWP</lexis:timberMark>
                <lexis:numberOfPieces>1</lexis:numberOfPieces>
                <lexis:species>FI</lexis:species>
                <lexis:grade>J</lexis:grade>
                <lexis:quantityVolume>0.5</lexis:quantityVolume>
              </lexis:harvestedTimber>
            </lexis:productDetail>
          </lexis:LexisSubmission>
        </esf:submissionContent>
      </esf:ESFSubmission>
      """
          .formatted(SAMPLE_SCHEMA_LOCATION);
}

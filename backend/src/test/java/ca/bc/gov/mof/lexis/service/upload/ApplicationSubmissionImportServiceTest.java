package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageValidityItem;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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
@DisplayName("Unit Test | ApplicationSubmissionImportService")
class ApplicationSubmissionImportServiceTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private VirusScanService virusScanService;

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

    ApplicationSubmissionImportService service = service();

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(sampleXml(), "jsmith", "CLIENT-REF-1");

    assertThat(result.uploadType()).isEqualTo("applicationSubmission");
    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.userReference()).isEqualTo("CLIENT-REF-1");

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).addApplication(applicationCaptor.capture(), eq("jsmith"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.applicationDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.receivedDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.termDays()).isEqualTo(180L);
    assertThat(application.applicationVolume()).isEqualTo(525.0d);
    assertThat(application.averageLogVolume()).isEqualTo(0.3d);
    assertThat(application.ownerClientNumber()).isEqualTo("00001074");
    assertThat(application.ownerClientLocationCode()).isEqualTo("03");
    assertThat(application.ownerContactName()).isEqualTo("CUSTOMER SERVICE");
    assertThat(application.orgUnitNumber()).isEqualTo(1909L);
    assertThat(application.exemptionReasonCode()).isEqualTo("S");
    assertThat(application.applicantTypeCode()).isEqualTo("O");
    assertThat(application.productTypeCode()).isEqualTo("H");
    assertThat(application.growthTypeCode()).isEqualTo("S");
    assertThat(application.jurisdictionCode()).isEqualTo("P");
    assertThat(application.federalApplicationNumber()).isNull();
    assertThat(application.endUseCode()).isEqualTo("PL");
    assertThat(application.speciesCodes()).containsExactly("HE");
    assertThat(application.remarkBody())
        .isEqualTo("Created from LEXIS application submission.\nUser reference: CLIENT-REF-1");

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
    assertThat(packageRequest.comments())
        .isEqualTo("Created from LEXIS application submission.\nUser reference: CLIENT-REF-1");
    assertThat(packageRequest.endUseCode()).isEqualTo("PL");
    assertThat(packageRequest.speciesCodes()).containsExactly("HE");

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
  void shouldImportFederalLexisXmlWithFederalApplicationNumber() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    String xml =
        SAMPLE_XML
            .replace(
                "<lexis:jurisdictionCode>P</lexis:jurisdictionCode>",
                "<lexis:jurisdictionCode>F</lexis:jurisdictionCode>")
            .replace(
                "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
                "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>\n"
                    + "        <lexis:officeUseOnly>\n"
                    + "          <lexis:internalOfficeUseRefId>700123</lexis:internalOfficeUseRefId>\n"
                    + "        </lexis:officeUseOnly>")
            .replace("<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>", "<lexis:boomNumber>FED26-700123</lexis:boomNumber>");

    ApplicationSubmissionImportResultDto result =
        service()
            .importApplicationSubmission(
                new MockMultipartFile(
                    "formFile", "federal-submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
                "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).addApplication(applicationCaptor.capture(), eq("jsmith"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.jurisdictionCode()).isEqualTo("F");
    assertThat(application.federalApplicationNumber()).isEqualTo(700123L);
  }

  @Test
  void shouldValidateHarvestedTimberWithoutSummaryOfScale() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("NCHWP"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    String xml =
        xmlWithProductDetail(
            """
            <lexis:productDetail>
              <lexis:productTypeCode>H</lexis:productTypeCode>
              <lexis:exemptApplnVol>84.5</lexis:exemptApplnVol>
              <lexis:averageLogVolume>0.7</lexis:averageLogVolume>
              <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
              <lexis:productLocation>Port Alberni c/o Pacific Towing</lexis:productLocation>
              <lexis:ageClass>S</lexis:ageClass>
              <lexis:avgLength>6.7</lexis:avgLength>
              <lexis:avgDiameter>12.8</lexis:avgDiameter>
              <lexis:harvestedTimberWithoutSummaryOfScale>
                <lexis:timberMark>NCHWP</lexis:timberMark>
              </lexis:harvestedTimberWithoutSummaryOfScale>
            </lexis:productDetail>
            """);

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(xmlFile("without-summary.xml", xml));

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.packageNumber()).isEqualTo("NCHWP");
    assertThat(result.scaleRows()).isZero();
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().applicationVolume()).isEqualTo(84.5d);
    assertThat(result.submissionSummary().averageLogVolume()).isEqualTo(0.7d);

    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    assertThat(validationCaptor.getValue().applicationVolume()).isEqualTo(84.5d);
    assertThat(validationCaptor.getValue().averageLogVolume()).isEqualTo(0.7d);
  }

  @Test
  void shouldValidateStandingTimber() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("STAND1"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    String xml =
        xmlWithProductDetail(
            """
            <lexis:productDetail>
              <lexis:productTypeCode>S</lexis:productTypeCode>
              <lexis:exemptApplnVol>42.2</lexis:exemptApplnVol>
              <lexis:avgLogVolume>0.5</lexis:avgLogVolume>
              <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
              <lexis:productLocation>Port Alberni c/o Pacific Towing</lexis:productLocation>
              <lexis:ageClass>O</lexis:ageClass>
              <lexis:avgLength>6.7</lexis:avgLength>
              <lexis:avgDiameter>12.8</lexis:avgDiameter>
              <lexis:standingTimber>
                <lexis:timberMark>STAND1</lexis:timberMark>
              </lexis:standingTimber>
            </lexis:productDetail>
            """);

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(xmlFile("standing.xml", xml));

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.packageNumber()).isEqualTo("STAND1");
    assertThat(result.scaleRows()).isZero();
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().productTypeCode()).isEqualTo("S");
    assertThat(result.submissionSummary().ageClass()).isEqualTo("O");
    assertThat(result.submissionSummary().applicationVolume()).isEqualTo(42.2d);
    assertThat(result.submissionSummary().averageLogVolume()).isEqualTo(0.5d);
  }

  @Test
  void shouldMapAgentApplicantAndOwnerSections() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    String xml =
        SAMPLE_XML
            .replace(
                "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
                "<lexis:applicantTypeCode>A</lexis:applicantTypeCode>")
            .replace(
                "</lexis:applicant>",
                "</lexis:applicant>\n"
                    + "        <lexis:owner>\n"
                    + "          <lexis:ownerDetails>\n"
                    + "            <lexis:clientNumber>2000</lexis:clientNumber>\n"
                    + "            <lexis:clientLocnCode>1</lexis:clientLocnCode>\n"
                    + "            <lexis:name>Owner Company Ltd.</lexis:name>\n"
                    + "          </lexis:ownerDetails>\n"
                    + "          <lexis:ownerContact>\n"
                    + "            <lexis:contactSurname>OWNER</lexis:contactSurname>\n"
                    + "            <lexis:contactFirstname>OLIVIA</lexis:contactFirstname>\n"
                    + "          </lexis:ownerContact>\n"
                    + "        </lexis:owner>\n");

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(xmlFile("agent-submission.xml", xml));

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().ownerClientNumber()).isEqualTo("00002000");
    assertThat(result.submissionSummary().ownerClientLocationCode()).isEqualTo("01");
    assertThat(result.submissionSummary().ownerContactName()).isEqualTo("OLIVIA OWNER");

    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    CreateApplicationRequest request = validationCaptor.getValue();
    assertThat(request.applicantTypeCode()).isEqualTo("A");
    assertThat(request.agentClientNumber()).isEqualTo("00001074");
    assertThat(request.agentClientLocationCode()).isEqualTo("03");
    assertThat(request.agentContactName()).isEqualTo("CUSTOMER SERVICE");
    assertThat(request.ownerClientNumber()).isEqualTo("00002000");
    assertThat(request.ownerClientLocationCode()).isEqualTo("01");
    assertThat(request.ownerContactName()).isEqualTo("OLIVIA OWNER");
  }

  @Test
  void shouldValidateLexisXmlWithoutPersistingApplication() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml(), "CLIENT-REF-1");

    assertThat(result.uploadType()).isEqualTo("applicationSubmission");
    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.userReference()).isEqualTo("CLIENT-REF-1");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().ownerClientNumber()).isEqualTo("00001074");
    assertThat(result.submissionSummary().ownerClientLocationCode()).isEqualTo("03");
    assertThat(result.submissionSummary().ownerContactName()).isEqualTo("CUSTOMER SERVICE");
    assertThat(result.submissionSummary().federalApplicationNumber()).isNull();
    assertThat(result.submissionSummary().orgUnitNumber()).isEqualTo(1909L);
    assertThat(result.submissionSummary().productTypeCode()).isEqualTo("H");
    assertThat(result.submissionSummary().applicationVolume()).isEqualTo(525.0d);
    assertThat(result.submissionSummary().speciesCodes()).containsExactly("HE");
    assertThat(result.message()).contains("validated");
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    CreateApplicationRequest validationRequest = validationCaptor.getValue();
    assertThat(validationRequest.endUseCode()).isEqualTo("PL");
    assertThat(validationRequest.speciesCodes()).containsExactly("HE");
    verify(applicationDetailsService, never()).addApplication(any(CreateApplicationRequest.class), any());
    verify(applicationDetailsService, never()).addPackage(any(PackageMutationRequest.class), any());
    verify(applicationDetailsService, never()).addScaleToPackage(any(ScaleMutationRequest.class), any());
  }

  @Test
  void shouldValidateDeclaredSpeciesEndUseSortInsteadOfScaleSpecies() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml());

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().speciesCodes()).containsExactly("HE");

    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    CreateApplicationRequest validationRequest = validationCaptor.getValue();
    assertThat(validationRequest.endUseCode()).isEqualTo("PL");
    assertThat(validationRequest.speciesCodes()).containsExactly("HE");
  }

  @Test
  void shouldParseMultipleSpeciesFromDeclaredSpeciesEndUseSort() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    String xml =
        SAMPLE_XML.replace(
            "<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>",
            "<lexis:speciesEndUseSort>HE/FI/PL</lexis:speciesEndUseSort>");
    ApplicationSubmissionImportResultDto result =
        service()
            .validateApplicationSubmission(
                new MockMultipartFile(
                    "formFile", "6-652-7.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)));

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().speciesCodes()).containsExactly("HE", "FI");

    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    CreateApplicationRequest validationRequest = validationCaptor.getValue();
    assertThat(validationRequest.endUseCode()).isEqualTo("PL");
    assertThat(validationRequest.speciesCodes()).containsExactly("HE", "FI");
  }

  @Test
  void shouldRejectLexisXmlValidationWhenPackageAlreadyExists() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(false, "Package TEST23-652-7D-2 already exists."));

    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml());

    assertThat(result.uploadType()).isEqualTo("applicationSubmission");
    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("Package TEST23-652-7D-2 already exists.");
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    verify(applicationDetailsService, never()).validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService, never()).addApplication(any(CreateApplicationRequest.class), any());
  }

  @Test
  void shouldRejectLexisXmlValidationWhenApplicationValidationFails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(
            new CreateApplicationResult(
                false,
                null,
                null,
                List.of("The application species/enduse sort is not valid for the selected region."),
                List.of()));

    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml());

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("The application species/enduse sort is not valid for the selected region.");
    assertThat(result.submissionSummary()).isNotNull();
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService, never()).addApplication(any(CreateApplicationRequest.class), any());
  }

  @Test
  void shouldRejectLexisXmlValidationWhenUserReferenceIsTooLong() {
    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml(), "R".repeat(51));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("User reference must be 50 characters or fewer.");
  }

  @Test
  void shouldRejectLexisXmlImportWhenVirusScanFailsBeforeParsing() {
    MockMultipartFile file = sampleXml();
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(file);

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(file, "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("The uploaded file failed virus scanning.");
    verify(virusScanService).assertClean(file);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectGeoJsonValidationWhenVirusScanFailsBeforeParsing() {
    MockMultipartFile file = sampleGeoJson();
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(file);

    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(file);

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("The uploaded file failed virus scanning.");
    verify(virusScanService).assertClean(file);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldValidateManualUploadSampleFiles() throws Exception {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid(anyString()))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    for (String fileName :
        List.of(
            "pass-application-rsc.xml",
            "pass-application-rsi.xml",
            "pass-application-rkb.xml")) {
      ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleResourceXml(fileName));

      assertThat(result.status()).as(fileName).isEqualTo("validated");
      assertThat(result.packageNumber()).as(fileName).startsWith("QA26-");
      assertThat(result.submissionSummary()).as(fileName).isNotNull();
      assertThat(result.scaleRows()).as(fileName).isPositive();
    }

    ApplicationSubmissionImportResultDto missingBoom =
        service().validateApplicationSubmission(sampleResourceXml("fail-missing-boom-number.xml"));
    assertThat(missingBoom.status()).isEqualTo("rejected");
    assertThat(missingBoom.errors()).contains("Boom/package number is required.");

    ApplicationSubmissionImportResultDto federalJurisdiction =
        service().validateApplicationSubmission(sampleResourceXml("fail-federal-jurisdiction.xml"));
    assertThat(federalJurisdiction.status()).isEqualTo("rejected");
    assertThat(federalJurisdiction.errors())
        .contains("A federal application number is required for federal LEXIS submissions.");
  }

  @Test
  void shouldRejectLexisXmlImportWhenPackageExistsBeforeApplicationPersistence() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(new PackageValidityItem(false, "Package TEST23-652-7D-2 already exists."));

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("Package TEST23-652-7D-2 already exists.");
    assertThat(result.submissionSummary()).isNotNull();
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    verify(applicationDetailsService, never()).addApplication(any(CreateApplicationRequest.class), any());
    verify(applicationDetailsService, never()).addPackage(any(PackageMutationRequest.class), any());
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

    ApplicationSubmissionImportService service = service();

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(zippedFile("payload/6-652-7.xml", SAMPLE_XML), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.warnings()).contains("Loaded payload/6-652-7.xml from ZIP archive submission.zip.");
    verify(applicationDetailsService, times(3)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldImportBareLexisXmlAsApplicationPackageAndScales() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(bareSampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    verify(applicationDetailsService, times(3)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldImportLexisGeoJsonAsApplicationPackageAndScales() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(sampleGeoJson(), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).addApplication(applicationCaptor.capture(), eq("jsmith"));
    assertThat(applicationCaptor.getValue().ownerClientNumber()).isEqualTo("00001074");
    assertThat(applicationCaptor.getValue().ownerClientLocationCode()).isEqualTo("03");
    assertThat(applicationCaptor.getValue().orgUnitNumber()).isEqualTo(1909L);
    assertThat(applicationCaptor.getValue().applicationVolume()).isEqualTo(525.0d);

    ArgumentCaptor<ScaleMutationRequest> scaleCaptor =
        ArgumentCaptor.forClass(ScaleMutationRequest.class);
    verify(applicationDetailsService, times(3)).addScaleToPackage(scaleCaptor.capture(), eq("jsmith"));
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::timberMark)
        .containsExactly("NCHWP", "NCHWP", "NCHWP");
  }

  @Test
  void shouldImportLexisXmlWhenFileExtensionDoesNotIdentifyFormat() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "submission.dat", "application/octet-stream", SAMPLE_XML.getBytes(StandardCharsets.UTF_8));

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(file, "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    verify(applicationDetailsService, times(3)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldImportZippedGeoJsonWhenEntryExtensionDoesNotIdentifyFormat() throws Exception {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "TEST23-652-7D-2", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service().importApplicationSubmission(zippedFile("payload/submission.dat", SAMPLE_GEOJSON), "jsmith");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("TEST23-652-7D-2");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.warnings()).contains("Loaded payload/submission.dat from ZIP archive submission.zip.");
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

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.errors()).containsExactly("Package could not be saved.");
    verify(applicationDetailsService, never()).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldRejectDuplicatePackageWhenPackageAppearsDuringImportFinalization() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("TEST23-652-7D-2"))
        .thenReturn(
            new PackageValidityItem(true, null),
            new PackageValidityItem(false, "Package TEST23-652-7D-2 already exists."));
    when(applicationDetailsService.addApplication(any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(new PackagePersistenceResult(false, null, null, null, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.errors()).containsExactly("Package TEST23-652-7D-2 already exists.");
    verify(applicationDetailsService, times(2)).isPackageValid("TEST23-652-7D-2");
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

    ApplicationSubmissionImportResultDto result = service().importApplicationSubmission(sampleXml(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.applicationNumber()).isNull();
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.errors()).containsExactly("Scale could not be saved.");
    verify(applicationDetailsService, times(2)).addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith"));
  }

  @Test
  void shouldRejectUnsupportedFileExtensionsBeforePersistence() {
    ApplicationSubmissionImportService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "submission.txt", "text/plain", "not xml".getBytes(StandardCharsets.UTF_8));

    ApplicationSubmissionImportResultDto result = service.importApplicationSubmission(file, "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "The LEXIS application submission file must be an XML, GeoJSON, JSON, or ZIP file.");
    assertThat(result.message())
        .contains(
            "The LEXIS application submission file must be an XML, GeoJSON, JSON, or ZIP file.");
  }

  @Test
  void shouldRejectZipFilesWithMultipleXmlFiles() throws Exception {
    ApplicationSubmissionImportService service = service();

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(zippedFile(List.of("first.xml", "second.xml")), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "The ZIP file must contain exactly one LEXIS XML or GeoJSON application submission file.");
  }

  @Test
  void shouldRejectZipFilesWithoutXmlFiles() throws Exception {
    ApplicationSubmissionImportService service = service();

    ApplicationSubmissionImportResultDto result = service.importApplicationSubmission(emptyZipFile(), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("The ZIP file must contain one LEXIS XML or GeoJSON application submission file.");
  }

  @Test
  void shouldRejectCorruptZipFiles() {
    ApplicationSubmissionImportService service = service();
    MockMultipartFile file =
        new MockMultipartFile(
            "formFile", "submission.zip", "application/zip", "not a zip".getBytes(StandardCharsets.UTF_8));

    ApplicationSubmissionImportResultDto result = service.importApplicationSubmission(file, "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The uploaded Zip file is corrupt, and cannot be read.");
  }

  @Test
  void shouldRejectUnmappedForestRegion() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:bcForestRegionCode>RSC</lexis:bcForestRegionCode>",
            "<lexis:bcForestRegionCode>BAD</lexis:bcForestRegionCode>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Forest region code BAD is not mapped to a LEXIS region.");
  }

  @Test
  void shouldRejectXmlWithoutSchemaLocation() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            " xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\""
                + " xsi:schemaLocation=\""
                + SAMPLE_SCHEMA_LOCATION
                + "\"",
            "");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The XML file must include an xsi:schemaLocation attribute.");
  }

  @Test
  void shouldRejectMalformedXmlWithLineAndColumnDetails() {
    ApplicationSubmissionImportService service = service();
    String xml = SAMPLE_XML.replace("</lexis:productDetail>", "");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
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
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
                "<esf:submissionContent>",
                "<esf:submissionContent />")
            .replace("</esf:submissionContent>", "");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The XML file must include a LEXIS submission payload.");
  }

  @Test
  void shouldRejectDuplicateSingletonSections() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "</lexis:applicationDetail>",
            "</lexis:applicationDetail>\n"
                + "<lexis:applicationDetail>\n"
                + "  <lexis:jurisdictionCode>P</lexis:jurisdictionCode>\n"
                + "</lexis:applicationDetail>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Application details must appear only once.");
  }

  @Test
  void shouldRejectDuplicateSingletonFields() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:clientNumber>1074</lexis:clientNumber>",
            "<lexis:clientNumber>1074</lexis:clientNumber>\n"
                + "<lexis:clientNumber>9999</lexis:clientNumber>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Applicant client number must appear only once.");
  }

  @Test
  void shouldRejectUnsupportedLexisSchemaVersion() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd",
            "http://www.for.gov.bc.ca/schema/lexis/1/xsd/MOF/mof-lexis.xsd");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
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
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd",
            "http://www.for.gov.bc.ca/schema/esf/0/xsd/MOF/esf-submission.xsd");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
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
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            SAMPLE_SCHEMA_LOCATION,
            SAMPLE_SCHEMA_LOCATION
                + " http://www.for.gov.bc.ca/schema/lexis "
                + "http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("The XML schema location must include each schema namespace only once.");
  }

  @Test
  void shouldRejectFederalLexisSubmissionsWithoutFederalApplicationNumber() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:jurisdictionCode>P</lexis:jurisdictionCode>",
            "<lexis:jurisdictionCode>F</lexis:jurisdictionCode>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("A federal application number is required for federal LEXIS submissions.");
  }

  @Test
  void shouldRejectUnsupportedJurisdictionCodes() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:jurisdictionCode>P</lexis:jurisdictionCode>",
            "<lexis:jurisdictionCode>X</lexis:jurisdictionCode>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Jurisdiction code must be P or F.");
  }

  @Test
  void shouldRejectElectronicReAdvertisements() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
            "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>\n"
                + "        <lexis:re-advertisement>true</lexis:re-advertisement>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(xmlFile("readvertisement.xml", xml), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("Re-advertisements cannot be submitted electronically through LEXIS XML upload.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectUnsupportedSpecCodeValues() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML
            .replace(
                "<lexis:applStatusCode>A</lexis:applStatusCode>",
                "<lexis:applStatusCode>C</lexis:applStatusCode>")
            .replace(
                "<lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>",
                "<lexis:exemptionRsnCde>O</lexis:exemptionRsnCde>")
            .replace(
                "<lexis:productTypeCode>H</lexis:productTypeCode>",
                "<lexis:productTypeCode>X</lexis:productTypeCode>")
            .replace("<lexis:ageClass>S</lexis:ageClass>", "<lexis:ageClass>X</lexis:ageClass>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(xmlFile("bad-codes.xml", xml), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "Application status code must be A for electronic LEXIS submissions.",
            "Exemption reason code must be S for electronic LEXIS submissions.",
            "Product type code must be H or S.",
            "Age class must be O or S.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectPackageNumbersLongerThanTwentyCharacters() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>",
            "<lexis:boomNumber>123456789012345678901</lexis:boomNumber>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Boom/package number must be 20 characters or fewer.");
  }

  @Test
  void shouldRejectMissingSpeciesEndUseSort() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace("<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>", "");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Species/end-use sort is required.");
  }

  @Test
  void shouldRejectMalformedSpeciesEndUseSort() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>",
            "<lexis:speciesEndUseSort>HE</lexis:speciesEndUseSort>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Species/end-use sort must be formatted as species/end use.");
  }

  @Test
  void shouldRejectDuplicateScaleCombinationsBeforePersistence() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<lexis:species>FI</lexis:species>", "<lexis:species>HE</lexis:species>");

    ApplicationSubmissionImportResultDto result =
        service.importApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
            "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("A scale with the same Timber Mark/Species/Grade combination already exists.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  private ApplicationSubmissionImportService service() {
    return new ApplicationSubmissionImportService(
        applicationDetailsServiceProvider,
        Clock.fixed(Instant.parse("2026-06-12T12:00:00Z"), ZoneOffset.UTC),
        new ObjectMapper(),
        virusScanService);
  }

  private MockMultipartFile sampleXml() {
    return new MockMultipartFile(
        "formFile", "6-652-7.xml", "application/xml", SAMPLE_XML.getBytes(StandardCharsets.UTF_8));
  }

  private MockMultipartFile xmlFile(String fileName, String xml) {
    return new MockMultipartFile(
        "formFile", fileName, "application/xml", xml.getBytes(StandardCharsets.UTF_8));
  }

  private MockMultipartFile sampleResourceXml(String fileName) throws Exception {
    String resourceName = "/lexis-upload-samples/" + fileName;
    try (InputStream input = getClass().getResourceAsStream(resourceName)) {
      assertThat(input).as(resourceName).isNotNull();
      return new MockMultipartFile("formFile", fileName, "application/xml", input.readAllBytes());
    }
  }

  private MockMultipartFile bareSampleXml() {
    return new MockMultipartFile(
        "formFile", "6-652-7-bare.xml", "application/xml", bareSampleXmlText().getBytes(StandardCharsets.UTF_8));
  }

  private MockMultipartFile sampleGeoJson() {
    return new MockMultipartFile(
        "formFile", "6-652-7.geojson", "application/geo+json", SAMPLE_GEOJSON.getBytes(StandardCharsets.UTF_8));
  }

  private static String xmlWithProductDetail(String productDetail) {
    String startTag = "<lexis:productDetail>";
    String endTag = "</lexis:productDetail>";
    int productStart = SAMPLE_XML.indexOf(startTag);
    int productEnd = SAMPLE_XML.indexOf(endTag) + endTag.length();
    return SAMPLE_XML.substring(0, productStart)
        + productDetail
        + SAMPLE_XML.substring(productEnd);
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

  private static final String SAMPLE_GEOJSON =
      """
      {
        "type": "FeatureCollection",
        "lexis": {
          "applicant": {
            "applicantDetails": {
              "clientNumber": "1074",
              "clientLocnCode": "03",
              "name": "Mosaic Forest Management Corporation"
            },
            "applicantContact": {
              "contactSurname": "SERVICE",
              "contactFirstname": "CUSTOMER"
            }
          },
          "applicationDetail": {
            "jurisdictionCode": "P",
            "bcForestRegionCode": "RSC",
            "applStatusCode": "A",
            "exemptionRsnCde": "S",
            "applicantTypeCode": "O"
          },
          "productDetail": {
            "productTypeCode": "H",
            "boomNumber": "TEST23-652-7D-2",
            "speciesEndUseSort": "HE/PL",
            "productLocation": "Port Alberni c/o Pacific Towing",
            "ageClass": "S",
            "avgLength": 6.7,
            "avgDiameter": 12.8
          }
        },
        "features": [
          {
            "type": "Feature",
            "geometry": null,
            "properties": {
              "lexisEntityType": "harvestedTimber",
              "timberMark": "nchwp",
              "numberOfPieces": 1500,
              "species": "HE",
              "grade": "H",
              "quantityVolume": 500
            }
          },
          {
            "type": "Feature",
            "geometry": null,
            "properties": {
              "lexisEntityType": "HARVESTED_TIMBER",
              "timberMark": "NCHWP",
              "numberOfPieces": 50,
              "species": "HE",
              "grade": "J",
              "quantityVolume": 24.5
            }
          },
          {
            "type": "Feature",
            "geometry": null,
            "properties": {
              "lexisEntityType": "HARVESTED_TIMBER",
              "timberMark": "NCHWP",
              "numberOfPieces": 1,
              "species": "FI",
              "grade": "J",
              "quantityVolume": 0.5
            }
          }
        ]
      }
      """;

  private static String bareSampleXmlText() {
    String startTag = "<lexis:LexisSubmission>";
    String endTag = "</lexis:LexisSubmission>";
    int contentStart = SAMPLE_XML.indexOf(startTag) + startTag.length();
    int contentEnd = SAMPLE_XML.indexOf(endTag);
    return """
      <?xml version="1.0" encoding="UTF-8"?>
      <lexis:LexisSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
      %s
      </lexis:LexisSubmission>
      """
        .formatted(SAMPLE_XML.substring(contentStart, contentEnd));
  }
}

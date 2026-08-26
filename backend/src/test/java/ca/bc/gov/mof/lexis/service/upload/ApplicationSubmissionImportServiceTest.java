package ca.bc.gov.mof.lexis.service.upload;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.admin.ExportScheduleRowDto;
import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.CreateApplicationResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackagePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.PackageValidityItem;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScaleMutationRequest;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.ScalePersistenceResult;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService.SubmissionImportValidationResult;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService.OrgUnitConstraint;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.yaml.snakeyaml.Yaml;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationSubmissionImportService")
class ApplicationSubmissionImportServiceTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> applicationDetailsServiceProvider;
  @Mock private ObjectProvider<LexisReportScheduleRepository> scheduleRepositoryProvider;
  @Mock private ApplicationDetailsRpcService applicationDetailsService;
  @Mock private VirusScanService virusScanService;
  @Mock private LexisReportScheduleRepository scheduleRepository;
  @Mock private MultipartFile oversizedFile;

  @BeforeEach
  void setUpDefaultPackageValidity() {
    lenient()
        .when(applicationDetailsService.isPackageValid(anyString()))
        .thenReturn(new PackageValidityItem(true, null));
    lenient()
        .when(
            applicationDetailsService.validateApplicationSubmissionImport(
                any(CreateApplicationRequest.class),
                any(PackageMutationRequest.class),
                any()))
        .thenReturn(new SubmissionImportValidationResult(true, List.of(), List.of()));
    lenient().when(scheduleRepositoryProvider.getIfAvailable()).thenReturn(scheduleRepository);
    lenient()
        .when(
            scheduleRepository.findExportScheduleByAdvertisingDate(
                LocalDate.of(2026, 1, 16)))
        .thenReturn(
            Optional.of(
                new ExportScheduleRowDto(
                    1016L, LocalDate.of(2026, 1, 16), null, null, null, null, null)));
  }

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
    assertThat(application.applicationStatusCode()).isNull();
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
  void shouldImportRawEsfXmlSubmissionDataWithOriginalFileName() {
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
        service()
            .importApplicationSubmission(
                SAMPLE_XML.getBytes(StandardCharsets.UTF_8),
                "legacy-esf-submission.xml",
                "jsmith",
                "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.fileName()).isEqualTo("legacy-esf-submission.xml");
    assertThat(result.fileSize()).isEqualTo(SAMPLE_XML.getBytes(StandardCharsets.UTF_8).length);
    assertThat(result.userReference()).isEqualTo("CLIENT-REF-1");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("P");
  }

  @Test
  void shouldImportFederalRawEsfXmlSubmissionDataForLegacyIngress() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addFederalImportedApplication(
            any(CreateApplicationRequest.class), eq("jsmith")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("jsmith")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "FED26-700123", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("jsmith")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    String xml = federalSampleXmlText();
    ApplicationSubmissionImportResultDto result =
        service()
            .importFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "legacy-esf-federal-submission.xml",
                "jsmith",
                "FED-REF-1");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.fileName()).isEqualTo("legacy-esf-federal-submission.xml");
    assertThat(result.userReference()).isEqualTo("FED-REF-1");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService)
        .addFederalImportedApplication(applicationCaptor.capture(), eq("jsmith"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.jurisdictionCode()).isEqualTo("F");
    assertThat(application.federalApplicationNumber()).isEqualTo(700123L);
    assertThat(application.applicationStatusCode()).isEqualTo("APP");
  }

  @Test
  void shouldValidateLegacyFederalCodesReferenceAndCaseInsensitivePackage() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    String xml =
        federalSampleXmlText()
            .replace(
                "<lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>",
                "<lexis:exemptionRsnCde>E</lexis:exemptionRsnCde>")
            .replace(
                "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
                "<lexis:applicantTypeCode>M</lexis:applicantTypeCode>")
            .replace(
                "<lexis:internalOfficeUseRefId>700123</lexis:internalOfficeUseRefId>",
                "<lexis:internalOfficeUseRefId>0</lexis:internalOfficeUseRefId>")
            .replace(
                "<lexis:boomNumber>FED26-700123</lexis:boomNumber>",
                "<lexis:boomNumber>fed26-700123</lexis:boomNumber>");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "legacy-federal-codes.xml",
                "FED-REF-LEGACY-CODES");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.packageNumber()).isEqualTo("FED26-700123");
    ArgumentCaptor<CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(requestCaptor.capture());
    assertThat(requestCaptor.getValue().federalApplicationNumber()).isZero();
    assertThat(requestCaptor.getValue().exemptionReasonCode()).isEqualTo("E");
    assertThat(requestCaptor.getValue().applicantTypeCode()).isEqualTo("M");
  }

  @Test
  void shouldValidateLegacyFederalStandingTimberWithoutPackageDimensions() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    when(
            applicationDetailsService.validateApplicationSubmissionImport(
                any(CreateApplicationRequest.class), isNull(), any()))
        .thenReturn(new SubmissionImportValidationResult(true, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalStandingWithoutPackageXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-standing.xml",
                "FED-REF-STANDING");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.message()).isEqualTo(
        "LEXIS application submission validated without a package with 0 scale rows.");
    assertThat(result.submissionSummary().averageLength()).isNull();
    assertThat(result.submissionSummary().averageDiameter()).isNull();
    assertThat(result.submissionSummary().averageLogVolume()).isZero();
    verify(applicationDetailsService, never()).isPackageValid(anyString());
    verify(applicationDetailsService)
        .validateApplicationSubmissionImport(
            any(CreateApplicationRequest.class), isNull(), any());
  }

  @Test
  void shouldRejectFederalStandingTimberWithPackageLikeLegacy() {
    String xml =
        federalStandingWithoutPackageXmlText()
            .replace(
                "<lexis:exemptApplnVol>42.2</lexis:exemptApplnVol>",
                """
                <lexis:boomNumber>STAND1</lexis:boomNumber>
                <lexis:exemptApplnVol>42.2</lexis:exemptApplnVol>""");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-standing-package.xml",
                "FED-REF-STANDING-PACKAGE");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains("Boom/package number must not be provided for federal standing timber.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldImportLegacyFederalStandingTimberWithoutPackage() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(
            applicationDetailsService.validateApplicationSubmissionImport(
                any(CreateApplicationRequest.class), isNull(), any()))
        .thenReturn(new SubmissionImportValidationResult(true, List.of(), List.of()));
    when(
            applicationDetailsService.addFederalImportedApplication(
                any(CreateApplicationRequest.class), eq("federal-user")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9003L, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalStandingWithoutPackageXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-standing.xml",
                "federal-user",
                "FED-REF-STANDING");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9003L);
    assertThat(result.packageNumber()).isNull();
    assertThat(result.scaleRows()).isZero();
    assertThat(result.message()).isEqualTo(
        "LEXIS application submission created application 9003 without a package and 0 scale rows.");
    verify(applicationDetailsService, never()).isPackageValid(anyString());
    verify(applicationDetailsService, never())
        .addPackage(any(PackageMutationRequest.class), anyString());
    verify(applicationDetailsService, never())
        .addScaleToPackage(any(ScaleMutationRequest.class), anyString());
  }

  @Test
  void shouldRetainLegacyFederalHarvestedWithoutSummaryBoomRules() {
    String withoutBoom =
        federalHarvestedWithoutSummaryXmlText().replace(
            "<lexis:boomNumber>FED26-700123</lexis:boomNumber>\n", "");

    ApplicationSubmissionImportResultDto missingBoomResult =
        service()
            .validateDedicatedFederalApplicationSubmission(
                withoutBoom.getBytes(StandardCharsets.UTF_8),
                "federal-without-summary.xml",
                "FED-REF-NO-BOOM");
    ApplicationSubmissionImportResultDto suppliedBoomResult =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalHarvestedWithoutSummaryXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-without-summary.xml",
                "FED-REF-WITH-BOOM");

    assertThat(missingBoomResult.status()).isEqualTo("rejected");
    assertThat(missingBoomResult.errors()).contains("Boom/package number is required.");
    assertThat(suppliedBoomResult.status()).isEqualTo("rejected");
    assertThat(suppliedBoomResult.errors())
        .contains(
            "Boom/package number must not be provided for federal harvested timber without summary of scale.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectFederalXmlThatViolatesLegacySchema() {
    String xml =
        federalSampleXmlText()
            .replaceFirst(
                "<lexis:contactTelephoneNumber>2505551212</lexis:contactTelephoneNumber>",
                "<lexis:contactTelephoneNumber>250-555-1212</lexis:contactTelephoneNumber>");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "invalid-legacy-schema.xml",
                "FED-REF-INVALID-SCHEMA");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .anyMatch(
            error ->
                error.startsWith("Legacy LEXIS schema validation failed:")
                    && error.contains("contactTelephoneNumber"));
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectProvincialRawEsfXmlSubmissionDataForLegacyFederalIngress() {
    ApplicationSubmissionImportResultDto result =
        service()
            .importFederalApplicationSubmission(
                SAMPLE_XML.getBytes(StandardCharsets.UTF_8),
                "legacy-esf-provincial-submission.xml",
                "jsmith",
                "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "ESF legacy LEXIS submissions must be federal. Provincial applications must be uploaded in modern LEXIS.");
    assertThat(result.userReference()).isEqualTo("CLIENT-REF-1");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("P");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectProvincialRawEsfXmlValidationForLegacyFederalIngress() {
    ApplicationSubmissionImportResultDto result =
        service()
            .validateFederalApplicationSubmission(
                SAMPLE_XML.getBytes(StandardCharsets.UTF_8),
                "legacy-esf-provincial-submission.xml",
                "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "ESF legacy LEXIS submissions must be federal. Provincial applications must be uploaded in modern LEXIS.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("P");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldValidateEscapedLexisPayloadInsideEsfSubmissionContentForDedicatedFederalRoute() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    String xml = esfWrappedSubmissionContentText(xmlTextEscape(federalBareSampleXmlText()));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-esf-escaped-content.xml",
                "FED-REF-ESCAPED-CONTENT");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldValidateCdataLexisPayloadInsideEsfSubmissionContentForDedicatedFederalRoute() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    String xml = esfWrappedSubmissionContentText("<![CDATA[" + federalBareSampleXmlText() + "]]>");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-esf-cdata-content.xml",
                "FED-REF-CDATA-CONTENT");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldRejectFederalSubmissionWithoutOfficeUseMetadata() {
    String xml =
        federalSampleXmlText()
            .replaceFirst("(?s)\\s*<lexis:officeUseOnly>.*?</lexis:officeUseOnly>", "");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-missing-office-use.xml",
                "FED-REF-MISSING-OFFICE-USE");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("Federal office use details are required.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectFederalSubmissionWithoutRequiredExcolMetadata() {
    String xml =
        federalSampleXmlText()
            .replace("<lexis:eicbNumber>123456</lexis:eicbNumber>", "")
            .replace(
                "<lexis:internalOfficeUseApplicantUserid>NEXCOL</lexis:internalOfficeUseApplicantUserid>",
                "")
            .replace(
                "<lexis:internalOfficeUseLanguage>E</lexis:internalOfficeUseLanguage>", "");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-missing-excol-metadata.xml",
                "FED-REF-MISSING-EXCOL-METADATA");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .contains(
            "Federal applicant EICB number is required.",
            "Federal office use applicant user is required.",
            "Federal office use language is required.");
    assertThat(result.errors())
        .anyMatch(error -> error.startsWith("Legacy LEXIS schema validation failed:"));
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldUseNextExportScheduleWhenBiweeklyDateHasNoExactSchedule() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    when(scheduleRepository.findExportScheduleByAdvertisingDate(LocalDate.of(2026, 1, 16)))
        .thenReturn(Optional.empty());
    when(scheduleRepository.findUpcomingExportSchedules())
        .thenReturn(
            List.of(
                new ExportScheduleRowDto(
                    1016L, LocalDate.of(2026, 1, 9), null, null, null, null, null),
                new ExportScheduleRowDto(
                    1018L, LocalDate.of(2026, 1, 30), null, null, null, null, null),
                new ExportScheduleRowDto(
                    1017L, LocalDate.of(2026, 1, 23), null, null, null, null, null)));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-next-schedule.xml",
                "FED-REF-NEXT-SCHEDULE");

    assertThat(result.status()).isEqualTo("validated");
    ArgumentCaptor<CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(requestCaptor.capture());
    assertThat(requestCaptor.getValue().exportScheduleId()).isEqualTo(1017L);
  }

  @Test
  void shouldRejectFederalSubmissionWhenUpcomingSchedulesPrecedeBiweeklyDate() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(scheduleRepository.findExportScheduleByAdvertisingDate(LocalDate.of(2026, 1, 16)))
        .thenReturn(Optional.empty());
    when(scheduleRepository.findUpcomingExportSchedules())
        .thenReturn(
            List.of(
                new ExportScheduleRowDto(
                    1015L, LocalDate.of(2026, 1, 2), null, null, null, null, null),
                new ExportScheduleRowDto(
                    1016L, LocalDate.of(2026, 1, 9), null, null, null, null, null)));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-past-schedules.xml",
                "FED-REF-PAST-SCHEDULES");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("No export schedule is available for federal LEXIS submission.");
    verify(applicationDetailsService, never())
        .validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldRejectFederalSubmissionWhenNoExportScheduleIsAvailable() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(scheduleRepository.findExportScheduleByAdvertisingDate(LocalDate.of(2026, 1, 16)))
        .thenReturn(Optional.empty());
    when(scheduleRepository.findUpcomingExportSchedules()).thenReturn(List.of());

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-no-schedule.xml",
                "FED-REF-NO-SCHEDULE");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("No export schedule is available for federal LEXIS submission.");
    verify(applicationDetailsService, never())
        .validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldAcceptFederalHarvestedReadvertisementWithSummaryOfScale() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    String xml =
        federalSampleXmlText()
            .replace(
                "<lexis:re-advertisement>false</lexis:re-advertisement>",
                "<lexis:re-advertisement>true</lexis:re-advertisement>");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-readvertisement.xml",
                "FED-REF-READVERTISEMENT");

    assertThat(result.status()).isEqualTo("validated");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldValidateDocumentedFederalAgentAndOwnerDetails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    String xml =
        federalSampleXmlText()
            .replace(
                "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
                "<lexis:applicantTypeCode>A</lexis:applicantTypeCode>")
            .replace(
                "</lexis:applicant>",
                """
                </lexis:applicant>
                <lexis:owner>
                  <lexis:ownerDetails>
                    <lexis:clientNumber>2000</lexis:clientNumber>
                    <lexis:clientLocnCode>01</lexis:clientLocnCode>
                    <lexis:name>Federal Owner Ltd.</lexis:name>
                    <lexis:address>555 Government Street</lexis:address>
                    <lexis:city>Vancouver</lexis:city>
                    <lexis:provinceState>BC</lexis:provinceState>
                    <lexis:postalZipCode>V8V8V8</lexis:postalZipCode>
                    <lexis:country>CA</lexis:country>
                    <lexis:telephoneNumber>2505551212</lexis:telephoneNumber>
                  </lexis:ownerDetails>
                  <lexis:ownerContact>
                    <lexis:contactSurname>OWNER</lexis:contactSurname>
                    <lexis:contactFirstname>CONTACT</lexis:contactFirstname>
                    <lexis:contactTelephoneNumber>2505551212</lexis:contactTelephoneNumber>
                  </lexis:ownerContact>
                </lexis:owner>""");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-agent.xml",
                "FED-REF-AGENT");

    assertThat(result.status()).isEqualTo("validated");
    ArgumentCaptor<CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(requestCaptor.capture());
    assertThat(requestCaptor.getValue().agentClientNumber()).isEqualTo("00001074");
    assertThat(requestCaptor.getValue().ownerClientNumber()).isEqualTo("00002000");
  }

  @Test
  void shouldRejectUnknownFederalApplicationStatusBeforeValidationService() {
    String xml =
        federalSampleXmlText().replace(
            "<lexis:applStatusCode>A</lexis:applStatusCode>",
            "<lexis:applStatusCode>X</lexis:applStatusCode>");

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                xml.getBytes(StandardCharsets.UTF_8),
                "federal-unknown-status.xml",
                "FED-REF-UNKNOWN-STATUS");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("Federal application status code must be A.");
    assertThat(result.errors())
        .anyMatch(error -> error.startsWith("Legacy LEXIS schema validation failed:"));
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectProvincialXmlWithTargetFederalEndpointMessage() {
    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                SAMPLE_XML.getBytes(StandardCharsets.UTF_8),
                "provincial-submission.xml",
                "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "Federal submission endpoint only accepts jurisdictionCode=F. Provincial applications must use the modern provincial upload path.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("P");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectProvincialXmlImportWithTargetFederalEndpointMessage() {
    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                SAMPLE_XML.getBytes(StandardCharsets.UTF_8),
                "provincial-submission.xml",
                "federal-user",
                "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "Federal submission endpoint only accepts jurisdictionCode=F. Provincial applications must use the modern provincial upload path.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("P");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectDedicatedFederalValidationWhenPackageValidityIsUnavailable() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123")).thenReturn(null);

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "FED-REF-PACKAGE-VALIDITY");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Package validation is unavailable for LEXIS application submission.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().packageNumber()).isEqualTo("FED26-700123");
    verify(applicationDetailsService).isPackageValid("FED26-700123");
    verify(applicationDetailsService, never()).validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService, never())
        .addFederalImportedApplication(any(CreateApplicationRequest.class), anyString());
  }

  @Test
  void shouldRejectDedicatedFederalCreateWhenPackageValidityIsUnavailable() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123")).thenReturn(null);

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "federal-user",
                "FED-REF-PACKAGE-VALIDITY");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Package validation is unavailable for LEXIS application submission.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().packageNumber()).isEqualTo("FED26-700123");
    verify(applicationDetailsService).isPackageValid("FED26-700123");
    verify(applicationDetailsService, never())
        .addFederalImportedApplication(any(CreateApplicationRequest.class), anyString());
    verify(applicationDetailsService, never()).addPackage(any(PackageMutationRequest.class), anyString());
    verify(applicationDetailsService, never()).addScaleToPackage(any(ScaleMutationRequest.class), anyString());
  }

  @Test
  void shouldImportDedicatedFederalXmlAsApplicationPackageAndScales() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addFederalImportedApplication(
            any(CreateApplicationRequest.class), eq("federal-user")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("federal-user")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "FED26-700123", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("federal-user")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "federal-user",
                "FED-REF-1");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9001L);
    assertThat(result.packageNumber()).isEqualTo("FED26-700123");
    assertThat(result.federalPermitNumber()).isNull();
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.warnings())
        .contains("Source application status A will be applied to the imported federal application.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);
    assertThat(result.submissionSummary().sourceApplicationStatusCode()).isEqualTo("A");

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService)
        .addFederalImportedApplication(applicationCaptor.capture(), eq("federal-user"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.jurisdictionCode()).isEqualTo("F");
    assertThat(application.federalApplicationNumber()).isEqualTo(700123L);
    assertThat(application.applicationStatusCode()).isEqualTo("APP");
    assertThat(application.applicationDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.receivedDate()).isEqualTo(LocalDate.of(2026, 6, 12));
    assertThat(application.exportScheduleId()).isEqualTo(1016L);
    assertThat(application.applicationVolume()).isEqualTo(525.0d);
    assertThat(application.averageLogVolume()).isEqualTo(0.3d);
    assertThat(application.remarkBody())
        .isEqualTo("Created from LEXIS application submission.\nUser reference: FED-REF-1");
    verify(scheduleRepository)
        .findExportScheduleByAdvertisingDate(LocalDate.of(2026, 1, 16));

    ArgumentCaptor<PackageMutationRequest> packageCaptor =
        ArgumentCaptor.forClass(PackageMutationRequest.class);
    verify(applicationDetailsService).addPackage(packageCaptor.capture(), eq("federal-user"));
    PackageMutationRequest packageRequest = packageCaptor.getValue();
    assertThat(packageRequest.packageNumber()).isEqualTo("FED26-700123");
    assertThat(packageRequest.applicationNumber()).isEqualTo(9001L);
    assertThat(packageRequest.volume()).isEqualTo(525.0d);
    assertThat(packageRequest.averageLength()).isEqualTo(6.7d);
    assertThat(packageRequest.averageDiameter()).isEqualTo(12.8d);
    assertThat(packageRequest.status()).isEqualTo("ACT");
    assertThat(packageRequest.endUseCode()).isEqualTo("PL");
    assertThat(packageRequest.speciesCodes()).containsExactly("HE");
    assertThat(packageRequest.comments())
        .isEqualTo("Created from LEXIS application submission.\nUser reference: FED-REF-1");

    ArgumentCaptor<ScaleMutationRequest> scaleCaptor =
        ArgumentCaptor.forClass(ScaleMutationRequest.class);
    verify(applicationDetailsService, times(3)).addScaleToPackage(scaleCaptor.capture(), eq("federal-user"));
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::packageNumber)
        .containsExactly("FED26-700123", "FED26-700123", "FED26-700123");
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
  void shouldValidateAndImportSameSoapEnvelopeSubmissionDataForDedicatedFederalRoute() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    when(applicationDetailsService.addFederalImportedApplication(
            any(CreateApplicationRequest.class), eq("federal-user")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9001L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("federal-user")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "FED26-700123", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("federal-user")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    byte[] soapBytes =
        soapEnvelopeWithSubmissionData(xmlTextEscape(federalSampleXmlText())).getBytes(StandardCharsets.UTF_8);

    ApplicationSubmissionImportResultDto validationResult =
        service()
            .validateDedicatedFederalApplicationSubmission(
                soapBytes, "federal-soap-submission.xml", "FED-REF-SOAP");
    ApplicationSubmissionImportResultDto createResult =
        service()
            .importDedicatedFederalApplicationSubmission(
                soapBytes, "federal-soap-submission.xml", "federal-user", "FED-REF-SOAP");

    assertThat(validationResult.status()).isEqualTo("validated");
    assertThat(validationResult.applicationNumber()).isNull();
    assertThat(validationResult.packageNumber()).isEqualTo("FED26-700123");
    assertThat(validationResult.submissionSummary()).isNotNull();
    assertThat(validationResult.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(validationResult.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);

    assertThat(createResult.status()).isEqualTo("accepted");
    assertThat(createResult.applicationNumber()).isEqualTo(9001L);
    assertThat(createResult.packageNumber()).isEqualTo("FED26-700123");
    assertThat(createResult.submissionSummary()).isNotNull();
    assertThat(createResult.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(createResult.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);

    verify(applicationDetailsService, times(2)).isPackageValid("FED26-700123");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService)
        .addFederalImportedApplication(any(CreateApplicationRequest.class), eq("federal-user"));
    verify(applicationDetailsService).addPackage(any(PackageMutationRequest.class), eq("federal-user"));
    verify(applicationDetailsService, times(3)).addScaleToPackage(any(ScaleMutationRequest.class), eq("federal-user"));
  }


  @Test
  void shouldImportDedicatedBareFederalXmlAsApplicationPackageAndScales() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.addFederalImportedApplication(
            any(CreateApplicationRequest.class), eq("federal-user")))
        .thenReturn(new CreateApplicationResult(true, "saved", 9002L, List.of(), List.of()));
    when(applicationDetailsService.addPackage(any(PackageMutationRequest.class), eq("federal-user")))
        .thenReturn(
            new PackagePersistenceResult(
                true, "FED26-700123", "525.0", "6.7", "12.8", "ACT", List.of(), List.of()));
    when(applicationDetailsService.addScaleToPackage(any(ScaleMutationRequest.class), eq("federal-user")))
        .thenReturn(new ScalePersistenceResult(true, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalBareSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-bare-submission.xml",
                "federal-user",
                "FED-BARE-REF-1");

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.applicationNumber()).isEqualTo(9002L);
    assertThat(result.packageNumber()).isEqualTo("FED26-700123");
    assertThat(result.scaleRows()).isEqualTo(3);
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);

    ArgumentCaptor<CreateApplicationRequest> applicationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService)
        .addFederalImportedApplication(applicationCaptor.capture(), eq("federal-user"));
    CreateApplicationRequest application = applicationCaptor.getValue();
    assertThat(application.jurisdictionCode()).isEqualTo("F");
    assertThat(application.federalApplicationNumber()).isEqualTo(700123L);
    assertThat(application.applicationStatusCode()).isEqualTo("APP");

    ArgumentCaptor<PackageMutationRequest> packageCaptor =
        ArgumentCaptor.forClass(PackageMutationRequest.class);
    verify(applicationDetailsService).addPackage(packageCaptor.capture(), eq("federal-user"));
    PackageMutationRequest packageRequest = packageCaptor.getValue();
    assertThat(packageRequest.packageNumber()).isEqualTo("FED26-700123");
    assertThat(packageRequest.applicationNumber()).isEqualTo(9002L);
    assertThat(packageRequest.endUseCode()).isEqualTo("PL");
    assertThat(packageRequest.speciesCodes()).containsExactly("HE");

    ArgumentCaptor<ScaleMutationRequest> scaleCaptor =
        ArgumentCaptor.forClass(ScaleMutationRequest.class);
    verify(applicationDetailsService, times(3)).addScaleToPackage(scaleCaptor.capture(), eq("federal-user"));
    assertThat(scaleCaptor.getAllValues())
        .extracting(ScaleMutationRequest::packageNumber)
        .containsExactly("FED26-700123", "FED26-700123", "FED26-700123");
  }

  @Test
  void shouldRejectFederalApplicationAtProvincialImportIngress() {
    String xml = federalSampleXmlText();

    ApplicationSubmissionImportResultDto result =
        service()
            .importApplicationSubmission(
                new MockMultipartFile(
                    "formFile", "federal-submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)),
                "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Federal applications must use the dedicated federal submission endpoint.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    assertThat(result.submissionSummary().federalApplicationNumber()).isEqualTo(700123L);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectFederalApplicationAtProvincialValidationIngress() {
    ApplicationSubmissionImportResultDto result =
        service()
            .validateApplicationSubmission(
                new MockMultipartFile(
                    "formFile",
                    "federal-submission.xml",
                    "application/xml",
                    federalSampleXmlText().getBytes(StandardCharsets.UTF_8)),
                "FED-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Federal applications must use the dedicated federal submission endpoint.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
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
              <lexis:averageLogVolume>0.5</lexis:averageLogVolume>
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
  void shouldValidateSubmissionWhenAuthenticatedScopeMatchesOwner() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(sampleXml(), "CLIENT-REF-1", "1074");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().ownerClientNumber()).isEqualTo("00001074");
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldValidateSubmissionWhenAuthenticatedScopeMatchesAgent() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
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
        service()
            .validateApplicationSubmission(
                xmlFile("agent-submission.xml", xml), "CLIENT-REF-1", "1074");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().ownerClientNumber()).isEqualTo("00002000");
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    ArgumentCaptor<CreateApplicationRequest> validationCaptor =
        ArgumentCaptor.forClass(CreateApplicationRequest.class);
    verify(applicationDetailsService).validateApplication(validationCaptor.capture());
    assertThat(validationCaptor.getValue().agentClientNumber()).isEqualTo("00001074");
  }

  @Test
  void shouldValidateSubmissionWhenOrganizationUnitScopeMatches() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateApplicationSubmission(
                sampleXml(),
                "CLIENT-REF-1",
                null,
                new OrgUnitConstraint(true, List.of(1909L)));

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().orgUnitNumber()).isEqualTo(1909L);
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
  }

  @Test
  void shouldRejectValidationOutsideOrganizationUnitScopeBeforeDownstreamLookups() {
    ApplicationSubmissionImportResultDto result =
        service()
            .validateApplicationSubmission(
                sampleXml(),
                "CLIENT-REF-1",
                null,
                new OrgUnitConstraint(true, List.of(1908L)));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "Submission forest region is outside the authenticated organization-unit scope.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().orgUnitNumber()).isEqualTo(1909L);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
    verify(scheduleRepositoryProvider, never()).getIfAvailable();
    verify(applicationDetailsService, never()).isPackageValid(anyString());
  }

  @Test
  void shouldRejectImportOutsideOrganizationUnitScopeBeforePersistence() {
    ApplicationSubmissionImportResultDto result =
        service()
            .importApplicationSubmission(
                sampleXml(),
                "jsmith",
                "CLIENT-REF-1",
                null,
                new OrgUnitConstraint(true, List.of(1908L)));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "Submission forest region is outside the authenticated organization-unit scope.");
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
    verify(scheduleRepositoryProvider, never()).getIfAvailable();
    verify(applicationDetailsService, never())
        .addApplication(any(CreateApplicationRequest.class), any());
    verify(applicationDetailsService, never()).addPackage(any(PackageMutationRequest.class), any());
    verify(applicationDetailsService, never())
        .addScaleToPackage(any(ScaleMutationRequest.class), any());
  }

  @Test
  void shouldRejectSubmissionOutsideAuthenticatedScopeBeforeDownstreamLookups() {
    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(sampleXml(), "CLIENT-REF-1", "99999999");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly(
            "Submission owner or agent must match the authenticated forest-client scope.");
    assertThat(result.submissionSummary()).isNotNull();
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
    verify(scheduleRepositoryProvider, never()).getIfAvailable();
    verify(applicationDetailsService, never()).isPackageValid(anyString());
    verify(applicationDetailsService, never())
        .validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService, never())
        .validateApplicationSubmissionImport(
            any(CreateApplicationRequest.class),
            any(PackageMutationRequest.class),
            any());
  }

  @Test
  void shouldPreservePrivilegedValidationWhenForestClientScopeIsAbsent() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(sampleXml(), "CLIENT-REF-1", null);

    assertThat(result.status()).isEqualTo("validated");
    verify(applicationDetailsService).isPackageValid("TEST23-652-7D-2");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
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
  void shouldRejectFederalValidationWhenImportPreflightFails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.isPackageValid("FED26-700123"))
        .thenReturn(new PackageValidityItem(true, null));
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));
    when(
            applicationDetailsService.validateApplicationSubmissionImport(
                any(CreateApplicationRequest.class),
                any(PackageMutationRequest.class),
                any()))
        .thenReturn(
            new SubmissionImportValidationResult(
                false,
                List.of("Timber mark NCHWP is not valid for federal applications."),
                List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "FED-REF-PREFLIGHT");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Timber mark NCHWP is not valid for federal applications.");
    assertThat(result.submissionSummary()).isNotNull();
    assertThat(result.submissionSummary().jurisdictionCode()).isEqualTo("F");
    verify(applicationDetailsService).validateApplication(any(CreateApplicationRequest.class));
    verify(applicationDetailsService)
        .validateApplicationSubmissionImport(
            any(CreateApplicationRequest.class),
            any(PackageMutationRequest.class),
            any());
    verify(applicationDetailsService, never())
        .addFederalImportedApplication(any(CreateApplicationRequest.class), anyString());
    verify(applicationDetailsService, never()).addPackage(any(PackageMutationRequest.class), anyString());
    verify(applicationDetailsService, never()).addScaleToPackage(any(ScaleMutationRequest.class), anyString());
  }

  @Test
  void shouldRejectDedicatedFederalCreateWhenImportPreflightFails() {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(
            applicationDetailsService.validateApplicationSubmissionImport(
                any(CreateApplicationRequest.class),
                any(PackageMutationRequest.class),
                any()))
        .thenReturn(
            new SubmissionImportValidationResult(
                false,
                List.of("Scale pieces must be 999,999,999 or fewer."),
                List.of()));

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "federal-user",
                "FED-REF-PREFLIGHT");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("Scale pieces must be 999,999,999 or fewer.");
    verify(applicationDetailsService)
        .validateApplicationSubmissionImport(
            any(CreateApplicationRequest.class),
            any(PackageMutationRequest.class),
            any());
    verify(applicationDetailsService, never())
        .addFederalImportedApplication(any(CreateApplicationRequest.class), anyString());
    verify(applicationDetailsService, never())
        .addPackage(any(PackageMutationRequest.class), anyString());
    verify(applicationDetailsService, never())
        .addScaleToPackage(any(ScaleMutationRequest.class), anyString());
  }

  @Test
  void shouldRejectLexisXmlValidationWhenUserReferenceIsTooLong() {
    ApplicationSubmissionImportResultDto result = service().validateApplicationSubmission(sampleXml(), "R".repeat(51));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("User reference must be 50 characters or fewer.");
  }

  @Test
  void shouldRejectOversizedSubmissionBeforeVirusScan() {
    when(oversizedFile.getOriginalFilename()).thenReturn("oversized.xml");
    when(oversizedFile.getSize())
        .thenReturn(ApplicationSubmissionImportService.MAX_IMPORT_BYTES + 1L);

    ApplicationSubmissionImportResultDto result =
        service().validateApplicationSubmission(oversizedFile);

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors())
        .containsExactly("The LEXIS application submission file must be 20 MiB or smaller.");
    verify(virusScanService, never()).assertClean(oversizedFile);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
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
  void shouldRejectDedicatedFederalValidationWhenVirusScanFailsBeforeParsing() {
    String fileName = "federal-validation-eicar.xml";
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(any(MultipartFile.class));

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                fileName,
                "FED-REF-EICAR");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("The uploaded file failed virus scanning.");
    assertThat(result.fileName()).isEqualTo(fileName);
    assertThat(result.userReference()).isEqualTo("FED-REF-EICAR");
    ArgumentCaptor<MultipartFile> scannedFile = ArgumentCaptor.forClass(MultipartFile.class);
    verify(virusScanService).assertClean(scannedFile.capture());
    assertThat(scannedFile.getValue().getOriginalFilename()).isEqualTo(fileName);
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectDedicatedFederalCreateWhenVirusScanFailsBeforeParsing() {
    String fileName = "federal-create-eicar.xml";
    doThrow(VirusScanException.infected("stream: Eicar-Test-Signature FOUND"))
        .when(virusScanService)
        .assertClean(any(MultipartFile.class));

    ApplicationSubmissionImportResultDto result =
        service()
            .importDedicatedFederalApplicationSubmission(
                federalSampleXmlText().getBytes(StandardCharsets.UTF_8),
                fileName,
                "federal-user",
                "FED-REF-EICAR");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).containsExactly("The uploaded file failed virus scanning.");
    assertThat(result.fileName()).isEqualTo(fileName);
    assertThat(result.userReference()).isEqualTo("FED-REF-EICAR");
    ArgumentCaptor<MultipartFile> scannedFile = ArgumentCaptor.forClass(MultipartFile.class);
    verify(virusScanService).assertClean(scannedFile.capture());
    assertThat(scannedFile.getValue().getOriginalFilename()).isEqualTo(fileName);
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

    ApplicationSubmissionImportResultDto federal =
        service()
            .validateDedicatedFederalApplicationSubmission(
                sampleResourceXml("pass-federal-application.xml"), "FED-MANUAL-VALIDATION");
    assertThat(federal.status()).isEqualTo("validated");
    assertThat(federal.packageNumber()).isEqualTo("FED26-700123");
    assertThat(federal.submissionSummary()).isNotNull();
    assertThat(federal.scaleRows()).isPositive();

    ApplicationSubmissionImportResultDto missingBoom =
        service().validateApplicationSubmission(sampleResourceXml("fail-missing-boom-number.xml"));
    assertThat(missingBoom.status()).isEqualTo("rejected");
    assertThat(missingBoom.errors()).contains("Boom/package number is required.");

    ApplicationSubmissionImportResultDto federalJurisdiction =
        service().validateApplicationSubmission(sampleResourceXml("fail-federal-jurisdiction.xml"));
    assertThat(federalJurisdiction.status()).isEqualTo("rejected");
    assertThat(federalJurisdiction.errors())
        .contains("Federal office use details are required.");
  }

  @Test
  void shouldKeepPublishedOpenApiExampleAlignedWithValidatedFederalFixture() throws Exception {
    when(applicationDetailsServiceProvider.getIfAvailable()).thenReturn(applicationDetailsService);
    when(applicationDetailsService.validateApplication(any(CreateApplicationRequest.class)))
        .thenReturn(new CreateApplicationResult(true, null, null, List.of(), List.of()));

    String publishedExample = openApiFederalSubmissionExample();
    String validatedFixture = sampleResourceText("pass-federal-application.xml");

    assertThat(publishedExample).isEqualTo(validatedFixture);

    ApplicationSubmissionImportResultDto result =
        service()
            .validateDedicatedFederalApplicationSubmission(
                publishedExample.getBytes(StandardCharsets.UTF_8),
                "federal-submission.xml",
                "NEXCOL-OPENAPI-EXAMPLE");

    assertThat(result.status()).isEqualTo("validated");
    assertThat(result.packageNumber()).isEqualTo("FED26-700123");
    assertThat(result.scaleRows()).isOne();
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
  void shouldRejectZipFilesWithTooManyEntries() throws Exception {
    List<String> entryNames =
        java.util.stream.IntStream.range(0, 65)
            .mapToObj(index -> "entry-" + index + ".xml")
            .toList();

    ApplicationSubmissionImportResultDto result =
        service().importApplicationSubmission(zippedFile(entryNames), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The ZIP file contains too many entries.");
  }

  @Test
  void shouldRejectUnsafeZipEntryPaths() throws Exception {
    ApplicationSubmissionImportResultDto result =
        service()
            .importApplicationSubmission(zippedFile("../outside.xml", SAMPLE_XML), "jsmith");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).contains("The ZIP file contains an unsafe entry path.");
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
  void shouldRejectXmlDoctypeDeclarationsBeforeBusinessParsing() {
    ApplicationSubmissionImportService service = service();
    String xml =
        SAMPLE_XML.replace(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
            """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE esf:ESFSubmission [
              <!ENTITY xxe SYSTEM "file:///etc/passwd">
            ]>
            """);

    ApplicationSubmissionImportResultDto result =
        service.validateApplicationSubmission(
            new MockMultipartFile(
                "formFile", "submission.xml", "application/xml", xml.getBytes(StandardCharsets.UTF_8)));

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).anyMatch(error -> error.contains("DOCTYPE is disallowed"));
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
  }

  @Test
  void shouldRejectFederalRawXmlDoctypeDeclarationsBeforeBusinessParsing() {
    ApplicationSubmissionImportService service = service();
    String xml =
        bareSampleXmlText()
            .replace(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
                """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE lexis:LexisSubmission [
                  <!ENTITY xxe SYSTEM "file:///etc/passwd">
                ]>
                """);

    ApplicationSubmissionImportResultDto result =
        service.validateDedicatedFederalApplicationSubmission(
            xml.getBytes(StandardCharsets.UTF_8), "federal-submission.xml", "CLIENT-REF-1");

    assertThat(result.status()).isEqualTo("rejected");
    assertThat(result.errors()).anyMatch(error -> error.contains("DOCTYPE is disallowed"));
    verify(applicationDetailsServiceProvider, never()).getIfAvailable();
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
  void shouldRejectFederalLexisSubmissionsWithoutOfficeUseDetails() {
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
    assertThat(result.errors()).contains("Federal office use details are required.");
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
            "Exemption reason code must be E, S, or U.",
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
        virusScanService,
        scheduleRepositoryProvider);
  }

  private MockMultipartFile sampleXml() {
    return new MockMultipartFile(
        "formFile", "6-652-7.xml", "application/xml", SAMPLE_XML.getBytes(StandardCharsets.UTF_8));
  }

  private MockMultipartFile xmlFile(String fileName, String xml) {
    return new MockMultipartFile(
        "formFile", fileName, "application/xml", xml.getBytes(StandardCharsets.UTF_8));
  }

  private static String federalSampleXmlText() {
    return SAMPLE_XML
        .replace(
            "<lexis:applicantDetails>",
            "<lexis:applicantDetails>\n"
                + "            <lexis:eicbNumber>123456</lexis:eicbNumber>")
        .replace(
            "<lexis:name>Mosaic Forest Management Corporation</lexis:name>",
            """
            <lexis:name>Mosaic Forest Management Corporation</lexis:name>
            <lexis:address>555 Government Street</lexis:address>
            <lexis:city>Vancouver</lexis:city>
            <lexis:provinceState>BC</lexis:provinceState>
            <lexis:postalZipCode>V8V8V8</lexis:postalZipCode>
            <lexis:country>CA</lexis:country>
            <lexis:telephoneNumber>2505551212</lexis:telephoneNumber>""")
        .replace(
            "<lexis:contactFirstname>CUSTOMER</lexis:contactFirstname>",
            """
            <lexis:contactFirstname>CUSTOMER</lexis:contactFirstname>
            <lexis:contactTelephoneNumber>2505551212</lexis:contactTelephoneNumber>""")
        .replace(
            "</lexis:applicant>",
            """
            <lexis:declarationCanadianResident>true</lexis:declarationCanadianResident>
            <lexis:declarationSubmittedOffersPast90Days>false</lexis:declarationSubmittedOffersPast90Days>
          </lexis:applicant>""")
        .replace(
            "<lexis:jurisdictionCode>P</lexis:jurisdictionCode>",
            "<lexis:jurisdictionCode>F</lexis:jurisdictionCode>")
        .replace(
            "<lexis:applicantTypeCode>O</lexis:applicantTypeCode>",
            """
            <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
            <lexis:re-advertisement>false</lexis:re-advertisement>
            <lexis:officeUseOnly>
              <lexis:internalOfficeUseRefId>700123</lexis:internalOfficeUseRefId>
              <lexis:internalOfficeUseApplicationDate>2026-01-10</lexis:internalOfficeUseApplicationDate>
              <lexis:internalOfficeUseBiWeeklyListDate>2026-01-16</lexis:internalOfficeUseBiWeeklyListDate>
              <lexis:internalOfficeUseApplicantUserid>NEXCOL</lexis:internalOfficeUseApplicantUserid>
              <lexis:internalOfficeUseLanguage>E</lexis:internalOfficeUseLanguage>
            </lexis:officeUseOnly>""")
        .replace(
            "<lexis:boomNumber>TEST23-652-7D-2</lexis:boomNumber>",
            "<lexis:boomNumber>FED26-700123</lexis:boomNumber>");
  }

  private static String federalStandingWithoutPackageXmlText() {
    return replaceProductDetail(
        federalSampleXmlText(),
        """
        <lexis:productDetail>
          <lexis:productTypeCode>S</lexis:productTypeCode>
          <lexis:exemptApplnVol>42.2</lexis:exemptApplnVol>
          <lexis:averageLogVolume>0</lexis:averageLogVolume>
          <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
          <lexis:productLocation>Generic Federal Standing Location</lexis:productLocation>
          <lexis:ageClass>O</lexis:ageClass>
          <lexis:standingTimber>
            <lexis:timberMark>ZZ999</lexis:timberMark>
          </lexis:standingTimber>
        </lexis:productDetail>
        """);
  }

  private static String federalHarvestedWithoutSummaryXmlText() {
    return replaceProductDetail(
        federalSampleXmlText(),
        """
        <lexis:productDetail>
          <lexis:productTypeCode>H</lexis:productTypeCode>
          <lexis:boomNumber>FED26-700123</lexis:boomNumber>
          <lexis:exemptApplnVol>42.2</lexis:exemptApplnVol>
          <lexis:averageLogVolume>0</lexis:averageLogVolume>
          <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
          <lexis:productLocation>Generic Federal Harvest Location</lexis:productLocation>
          <lexis:ageClass>O</lexis:ageClass>
          <lexis:avgLength>6.7</lexis:avgLength>
          <lexis:avgDiameter>12.8</lexis:avgDiameter>
          <lexis:harvestedTimberWithoutSummaryOfScale>
            <lexis:timberMark>ZZ999</lexis:timberMark>
          </lexis:harvestedTimberWithoutSummaryOfScale>
        </lexis:productDetail>
        """);
  }

  private static String federalBareSampleXmlText() {
    String federalSubmission = federalSampleXmlText();
    String startTag = "<lexis:LexisSubmission>";
    String endTag = "</lexis:LexisSubmission>";
    int contentStart = federalSubmission.indexOf(startTag) + startTag.length();
    int contentEnd = federalSubmission.indexOf(endTag);
    return """
      <?xml version="1.0" encoding="UTF-8"?>
      <lexis:LexisSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
      %s
      </lexis:LexisSubmission>
      """
        .formatted(federalSubmission.substring(contentStart, contentEnd));
  }

  private static String esfWrappedSubmissionContentText(String submissionContentText) {
    return """
      <?xml version="1.0" encoding="UTF-8"?>
      <esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="%s">
        <esf:submissionContent>%s</esf:submissionContent>
      </esf:ESFSubmission>
      """
        .formatted(SAMPLE_SCHEMA_LOCATION, submissionContentText);
  }

  private static String xmlTextEscape(String value) {
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  private static String soapEnvelopeWithSubmissionData(String submissionData) {
    return """
      <?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
        <soapenv:Body>
          <sub:makeSubmission xmlns:sub="http://submissions.ws.esf.mof.gov.bc.ca">
            <submissionType>LEXIS</submissionType>
            <userReference>FED-REF-SOAP</userReference>
            <submissionData>%s</submissionData>
          </sub:makeSubmission>
        </soapenv:Body>
      </soapenv:Envelope>
      """
        .formatted(submissionData);
  }

  private MockMultipartFile sampleResourceXml(String fileName) throws Exception {
    String resourceName = "/lexis-upload-samples/" + fileName;
    try (InputStream input = getClass().getResourceAsStream(resourceName)) {
      assertThat(input).as(resourceName).isNotNull();
      return new MockMultipartFile("formFile", fileName, "application/xml", input.readAllBytes());
    }
  }

  private String sampleResourceText(String fileName) throws Exception {
    String resourceName = "/lexis-upload-samples/" + fileName;
    try (InputStream input = getClass().getResourceAsStream(resourceName)) {
      assertThat(input).as(resourceName).isNotNull();
      return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  private static String openApiFederalSubmissionExample() throws Exception {
    Object value;
    try (InputStream input =
        Files.newInputStream(repositoryFile("gateway/openapi.yaml"))) {
      value = new Yaml().load(input);
    }
    for (String key :
        List.of(
            "components",
            "requestBodies",
            "FederalSubmissionXml",
            "content",
            "application/xml",
            "example")) {
      assertThat(value).as(key).isInstanceOf(Map.class);
      value = ((Map<?, ?>) value).get(key);
    }
    assertThat(value).isInstanceOf(String.class);
    return (String) value;
  }

  private static Path repositoryFile(String relativePath) {
    Path fromRepositoryRoot = Path.of(relativePath);
    if (Files.isRegularFile(fromRepositoryRoot)) {
      return fromRepositoryRoot;
    }
    return Path.of("..", relativePath);
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
    return replaceProductDetail(SAMPLE_XML, productDetail);
  }

  private static String replaceProductDetail(String xml, String productDetail) {
    String startTag = "<lexis:productDetail>";
    String endTag = "</lexis:productDetail>";
    int productStart = xml.indexOf(startTag);
    int productEnd = xml.indexOf(endTag) + endTag.length();
    return xml.substring(0, productStart)
        + productDetail
        + xml.substring(productEnd);
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

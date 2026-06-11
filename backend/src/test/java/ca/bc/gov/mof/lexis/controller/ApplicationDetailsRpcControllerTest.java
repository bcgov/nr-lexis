package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailRequestDto;
import ca.bc.gov.mof.lexis.dto.review.ApplicationReviewStatusEmailResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.review.ApplicationReviewService;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationDetailsRpcController")
class ApplicationDetailsRpcControllerTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  @Mock private ObjectProvider<ClientLookupService> clientLookupServiceProvider;
  @Mock private ObjectProvider<ApplicationReviewService> applicationReviewServiceProvider;
  @Mock private ApplicationDetailsRpcService service;
  @Mock private ClientLookupService clientLookupService;
  @Mock private ApplicationReviewService applicationReviewService;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;
  @Mock private HttpServletRequest servletRequest;
  @Mock private HttpSession session;

  private ApplicationDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller =
        new ApplicationDetailsRpcController(
            serviceProvider,
            clientLookupServiceProvider,
            applicationReviewServiceProvider,
            sessionService,
            authorizationService);
  }

  @Test
  void documentDetailsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void documentDetailsShouldMapServiceResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(
            List.of(new ApplicationDetailsRpcService.DocumentItem(7L, "test.pdf", "Not on file", "Uploaded")));

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).id()).isEqualTo(7L);
    assertThat(response.getBody().get(0).name()).isEqualTo("test.pdf");
    verify(service).getDocumentDetails(1000456L);
  }

  @Test
  void getDocumentShouldReturnAttachmentPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocument(55L))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.DocumentContent("test-content".getBytes())));

    ResponseEntity<byte[]> response = controller.getDocument("55", "../unsafe/path/test.pdf");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentDisposition().isAttachment()).isTrue();
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("test.pdf");
    assertThat(response.getBody()).isNotNull();
    assertThat(new String(response.getBody())).isEqualTo("test-content");
    verify(service).getDocument(55L);
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    TestingAuthenticationToken authentication = authorized("/fileApplicationUpload");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeDocument(55L);
  }

  @Test
  void removeDocumentShouldRejectWithoutFileUploadAction() {
    TestingAuthenticationToken authentication = unauthorized("/fileApplicationUpload");

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void getRemarkShouldReturnNotFoundWhenRemarkMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemark(999L)).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.GetRemarkResponseDto> response =
        controller.getRemark("999");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isTrue();
    verify(service).getRemark(999L);
  }

  @Test
  void persistRemarkShouldReturnOkStatus() {
    TestingAuthenticationToken authentication = authorized("/applicationRemarks");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    Instant now = Instant.parse("2026-05-27T17:00:00Z");
    when(service.persistRemark("new", 1000456L, "Long remark", "idir\\jsmith"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.PersistedRemark(
                    44L, "Long remark", "Long remark", "idir\\jsmith", now)));

    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("ok");
    assertThat(response.getBody().remarkId()).isEqualTo(44L);
    assertThat(response.getBody().user()).isEqualTo("idir\\jsmith");
    verify(service).persistRemark("new", 1000456L, "Long remark", "idir\\jsmith");
  }

  @Test
  void persistRemarkShouldRejectWithoutApplicationRemarksAction() {
    TestingAuthenticationToken authentication = unauthorized("/applicationRemarks");

    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void checkFormChangesShouldReturnDefaultUnchangedWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(new LinkedMultiValueMap<>());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isFalse();
  }

  @Test
  void checkFormChangesShouldCompareLegacyApplicationSummaryFields() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));

    MultiValueMap<String, String> params = matchingSummaryParameters();

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isFalse();
    verify(service).getApplicationSummarySnapshot(1000456L);
  }

  @Test
  void checkFormChangesShouldReportChangedWhenLegacyAdditionalRemarksArePresent() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L)).thenReturn(Optional.of(summarySnapshot()));

    MultiValueMap<String, String> params = matchingSummaryParameters();
    params.add("additionalRemarks", "Needs review");

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChangesLegacy(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isTrue();
  }

  @Test
  void checkFormChangesShouldForceChangedWhenStoredOwnerContactIsBlankLikeLegacy() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationSummarySnapshot(1000456L))
        .thenReturn(Optional.of(summarySnapshotWithBlankOwnerContact()));

    ResponseEntity<ApplicationDetailsRpcController.CheckFormChangesResponseDto> response =
        controller.checkFormChanges(matchingSummaryParameters());

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().applicationChanged()).isTrue();
  }

  @Test
  void checkUnusedVolumeShouldReturnDefaultUsedWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ApplicationDetailsRpcController.CheckUnusedVolumeResponseDto> response =
        controller.checkUnusedVolume("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volumeUsedInd()).isTrue();
  }

  @Test
  void checkUnusedVolumeShouldMapLegacyPayloadFromService() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.isApplicationVolumeUsed(1000456L)).thenReturn(false);

    ResponseEntity<ApplicationDetailsRpcController.CheckUnusedVolumeResponseDto> response =
        controller.checkUnusedVolumeLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volumeUsedInd()).isFalse();
    verify(service).isApplicationVolumeUsed(1000456L);
  }

  @Test
  void releaseLockShouldReturnLegacyOkPayloadAndClearApplicationSessionState() {
    when(servletRequest.getSession(false)).thenReturn(session);

    ResponseEntity<ApplicationDetailsRpcController.ReleaseLockResponseDto> response =
        controller.releaseLockLegacy(servletRequest);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().release()).isEqualTo("ok");
    verify(session).removeAttribute("exemptionApplication");
    verify(session).removeAttribute("applicationNumber");
  }

  @Test
  void sendApplicationRejectEmailLegacyShouldDelegateToReviewEmailService() {
    when(applicationReviewServiceProvider.getIfAvailable()).thenReturn(applicationReviewService);
    when(applicationReviewService.sendStatusEmail(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.any(ApplicationReviewStatusEmailRequestDto.class)))
        .thenReturn(new ApplicationReviewStatusEmailResultDto(true, "Status email sent."));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("toEmailAddress", "client@example.test");
    params.add("additionalRemarks", "Rejected during review");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationStatusEmailResponseDto> response =
        controller.sendApplicationRejectEmailLegacy(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().message()).isEqualTo("Status email sent.");

    ArgumentCaptor<ApplicationReviewStatusEmailRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusEmailRequestDto.class);
    verify(applicationReviewService).sendStatusEmail(org.mockito.ArgumentMatchers.eq(1000456L), requestCaptor.capture());
    assertThat(requestCaptor.getValue().statusCode()).isEqualTo("REJ");
    assertThat(requestCaptor.getValue().clientEmailAddress()).isEqualTo("client@example.test");
    assertThat(requestCaptor.getValue().remark()).isEqualTo("Rejected during review");
  }

  @Test
  void sendApplicationWithdrawnEmailLegacyShouldUseWithdrawnStatus() {
    when(applicationReviewServiceProvider.getIfAvailable()).thenReturn(applicationReviewService);
    when(applicationReviewService.sendStatusEmail(
            org.mockito.ArgumentMatchers.eq(1000456L),
            org.mockito.ArgumentMatchers.any(ApplicationReviewStatusEmailRequestDto.class)))
        .thenReturn(new ApplicationReviewStatusEmailResultDto(false, "Status email could not be sent."));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("toEmailAddress", "client@example.test");
    params.add("additionalRemarks", "Withdrawn");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationStatusEmailResponseDto> response =
        controller.sendApplicationWithdrawnEmailLegacy(params);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();

    ArgumentCaptor<ApplicationReviewStatusEmailRequestDto> requestCaptor =
        ArgumentCaptor.forClass(ApplicationReviewStatusEmailRequestDto.class);
    verify(applicationReviewService).sendStatusEmail(org.mockito.ArgumentMatchers.eq(1000456L), requestCaptor.capture());
    assertThat(requestCaptor.getValue().statusCode()).isEqualTo("WDN");
  }

  @Test
  void addApplicationLegacyShouldMapAliasesAndReturnLegacyPersistencePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addApplication(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.CreateApplicationResult(
                true, "The application was saved successfully.", 1000456L, List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationDate", "2026-03-01");
    params.add("exemptionTerm", "30");
    params.add("receivedDate", "2026-03-02");
    params.add("applicationVolume", "125.5");
    params.add("averageLogVolume", "2.4");
    params.add("productLocation", "Camp 1");
    params.add("applicantClientNumber", "00022222");
    params.add("agentClientLocationCode", "01");
    params.add("ownerClientNumber", "00011111");
    params.add("ownerClientLocationCode", "02");
    params.add("exemptionTypeCode", "U");
    params.add("applicantType", "A");
    params.add("region", "11");
    params.add("productTypeCode", "H");
    params.add("growthTypeCode", "O");
    params.add("ownerContactName", "Owner Contact");
    params.add("comments", "Ready for review");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().applicationNumber()).isEqualTo(1000456L);

    ArgumentCaptor<ApplicationDetailsRpcService.CreateApplicationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.CreateApplicationRequest.class);
    verify(service).addApplication(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.CreateApplicationRequest request = requestCaptor.getValue();
    assertThat(request.applicationDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(request.receivedDate()).isEqualTo(LocalDate.of(2026, 3, 2));
    assertThat(request.agentClientNumber()).isEqualTo("00022222");
    assertThat(request.exemptionReasonCode()).isEqualTo("U");
    assertThat(request.productTypeCode()).isEqualTo("H");
    assertThat(request.remarkBody()).isEqualTo("Ready for review");
  }

  @Test
  void addApplicationLegacyShouldRejectWithoutCreateApplicationAction() {
    TestingAuthenticationToken authentication = unauthorized("createApplication");

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPersistenceResponseDto> response =
        controller.addApplicationLegacy(new LinkedMultiValueMap<>(), authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void getClientDataLegacyShouldReturnLegacyClientPayload() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00077881",
                    "Acme Forestry",
                    "123 Main St",
                    "Victoria",
                    "BC",
                    "V8W 1A1",
                    "CA",
                    "250-555-0100",
                    "250-555-0199",
                    "contact@example.com")));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().clientNumber()).isEqualTo("00077881");
    assertThat(response.getBody().companyName()).isEqualTo("Acme Forestry");
    assertThat(response.getBody().notfound()).isNull();
    verify(clientLookupService).getClientData("77881", "00");
  }

  @Test
  void getClientDataLegacyShouldReturnNotFoundFlagWhenClientMissing() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(clientLookupService.getClientData("77881", "00")).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.ApplicationClientDataResponseDto> response =
        controller.getClientDataLegacy("77881", "00");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isEqualTo("true");
  }

  @Test
  void getClientLocationsLegacyShouldMarkSavedLocationSelected() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientLocations("22222"))
        .thenReturn(
            List.of(
                new ClientLookupService.ClientLocation("Main Office", "01", false),
                new ClientLookupService.ClientLocation("Reload Yard", "02", false)));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientLocationResponseDto>>
        response = controller.getClientLocationsLegacy("22222", "1000456", "agent");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::locationCode,
            ApplicationDetailsRpcController.ApplicationClientLocationResponseDto::selected)
        .containsExactly(tuple("01", true), tuple("02", false));
  }

  @Test
  void getContactsForLocationLegacyShouldPreferSavedApplicationContactAndIncludeClientData() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.ApplicationClientSnapshot(
                    "00022222", "01", "Agent Contact", "00011111", "02", "Owner Contact")));
    when(clientLookupService.getClientData("11111", "02"))
        .thenReturn(
            Optional.of(
                new ClientLookupService.ClientData(
                    "00011111",
                    "Owner Forestry",
                    "456 Forest Rd",
                    "Nanaimo",
                    "BC",
                    "V9R 1A1",
                    "CA",
                    "250-555-0200",
                    null,
                    "owner@example.com")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    ApplicationDetailsRpcController.ApplicationClientContactResponseDto contact =
        response.getBody().get(0);
    assertThat(contact.contactName()).isEqualTo("Owner Contact");
    assertThat(contact.contactId()).isEqualTo("-1");
    assertThat(contact.clientNumber()).isEqualTo("00011111");
    assertThat(contact.companyName()).isEqualTo("Owner Forestry");
    verify(clientLookupService).getClientData("11111", "02");
  }

  @Test
  void getContactsForLocationLegacyShouldFallbackToClientContacts() {
    when(clientLookupServiceProvider.getIfAvailable()).thenReturn(clientLookupService);
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getApplicationClientSnapshot(1000456L)).thenReturn(Optional.empty());
    when(clientLookupService.getContactsForLocation("11111", "02"))
        .thenReturn(List.of(new ClientLookupService.ClientContact("Fallback Contact", "22")));
    when(clientLookupService.getClientData("11111", "02")).thenReturn(Optional.empty());

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationClientContactResponseDto>>
        response = controller.getContactsForLocationLegacy("11111", "02", "1000456", "owner");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).contactName()).isEqualTo("Fallback Contact");
    assertThat(response.getBody().get(0).contactId()).isEqualTo("22");
    verify(clientLookupService).getContactsForLocation("11111", "02");
  }

  @Test
  void getSpeciesCodesLegacyShouldReturnLegacyCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesCodes())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("FIR", "Douglas-fir"),
                new ApplicationDetailsRpcService.CodeItem("HEM", "Hemlock")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getSpeciesCodesLegacy();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("FIR", "Douglas-fir"), tuple("HEM", "Hemlock"));
    verify(service).getSpeciesCodes();
  }

  @Test
  void getPackageStatusCodesLegacyShouldReturnLegacyCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageStatusCodes())
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("ACT", "Active"),
                new ApplicationDetailsRpcService.CodeItem("SHT", "Shutout")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getPackageStatusCodesLegacy();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("ACT", "Active"), tuple("SHT", "Shutout"));
    verify(service).getPackageStatusCodes();
  }

  @Test
  void getGradeCodesLegacyShouldUseLegacyAndModernParameterAliases() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getGradeCodes("11", "FIR"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("J", "Grade J"),
                new ApplicationDetailsRpcService.CodeItem("U", "Grade U")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getGradeCodesLegacy("FIR", "11", null, null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("J", "Grade J"), tuple("U", "Grade U"));
    verify(service).getGradeCodes("11", "FIR");
  }

  @Test
  void getGradeCodesShouldFallbackToShortParameterAliases() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getGradeCodes("22", "HEM"))
        .thenReturn(List.of(new ApplicationDetailsRpcService.CodeItem("K", "Grade K")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getGradeCodes(null, null, "HEM", "22");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).code()).isEqualTo("K");
    verify(service).getGradeCodes("22", "HEM");
  }

  @Test
  void getEndUseForSpeciesRegionLegacyShouldParseSpeciesJsonAndReturnCodes() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getEndUsesForSpeciesRegion("11", List.of("FI", "HE")))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.CodeItem("LU", "Lumber"),
                new ApplicationDetailsRpcService.CodeItem("UT", "Utility")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationCodeResponseDto>> response =
        controller.getEndUseForSpeciesRegionLegacy("[\"FI\",\"HE\"]", "11", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::code,
            ApplicationDetailsRpcController.ApplicationCodeResponseDto::description)
        .containsExactly(tuple("LU", "Lumber"), tuple("UT", "Utility"));
    verify(service).getEndUsesForSpeciesRegion("11", List.of("FI", "HE"));
  }

  @Test
  void getRemainingSpeciesLegacyShouldReturnCodePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemainingSpecies("11", "S", List.of("FI")))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.SpeciesCodeItem("HE"),
                new ApplicationDetailsRpcService.SpeciesCodeItem("SP")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationRemainingSpeciesResponseDto>>
        response = controller.getRemainingSpeciesLegacy("[\"FI\"]", "11", null, "S", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(ApplicationDetailsRpcController.ApplicationRemainingSpeciesResponseDto::code)
        .containsExactly("HE", "SP");
    verify(service).getRemainingSpecies("11", "S", List.of("FI"));
  }

  @Test
  void getSelectedEndUseLegacyShouldReturnLegacySuccessPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSelectedEndUse(1000456L)).thenReturn(Optional.of("LUM"));

    ResponseEntity<ApplicationDetailsRpcController.SelectedEndUseResponseDto> response =
        controller.getSelectedEndUseLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().selectedEndUse()).isEqualTo("LUM");
    verify(service).getSelectedEndUse(1000456L);
  }

  @Test
  void getPackageSelectedEndUseLegacyShouldReturnFalseWhenMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageSelectedEndUse("PKG-903")).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.SelectedEndUseResponseDto> response =
        controller.getPackageSelectedEndUseLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isFalse();
    assertThat(response.getBody().selectedEndUse()).isNull();
    verify(service).getPackageSelectedEndUse("PKG-903");
  }

  @Test
  void getSpeciesForApplicationLegacyShouldReturnApplicationFieldNames() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesForApplication(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.SpeciesEndUseItem("FIR", "LUM", "Lumber"),
                new ApplicationDetailsRpcService.SpeciesEndUseItem("HEM", "PUL", "Pulp")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto>>
        response = controller.getSpeciesForApplicationLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::species,
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::enduse,
            ApplicationDetailsRpcController.ApplicationSpeciesEndUseResponseDto::endUseDescription)
        .containsExactly(tuple("FIR", "LUM", "Lumber"), tuple("HEM", "PUL", "Pulp"));
    verify(service).getSpeciesForApplication(1000456L);
  }

  @Test
  void getSpeciesForPackageLegacyShouldReturnPackageFieldNames() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getSpeciesForPackage("PKG-903"))
        .thenReturn(List.of(new ApplicationDetailsRpcService.SpeciesEndUseItem("CED", "LUM", "Lumber")));

    ResponseEntity<List<ApplicationDetailsRpcController.PackageSpeciesEndUseResponseDto>> response =
        controller.getSpeciesForPackageLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).species()).isEqualTo("CED");
    assertThat(response.getBody().get(0).enduse()).isEqualTo("LUM");
    assertThat(response.getBody().get(0).packageEndUseDescription()).isEqualTo("Lumber");
    assertThat(response.getBody().get(0).packageEndUse()).isEqualTo("LUM");
    verify(service).getSpeciesForPackage("PKG-903");
  }

  @Test
  void getUniqueScalesForApplicationLegacyShouldReturnTimberMarks() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getUniqueScalesForApplication(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationScaleItem("TM001"),
                new ApplicationDetailsRpcService.ApplicationScaleItem("TM002")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationScaleResponseDto>> response =
        controller.getUniqueScalesForApplicationLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(ApplicationDetailsRpcController.ApplicationScaleResponseDto::timberMark)
        .containsExactly("TM001", "TM002");
    verify(service).getUniqueScalesForApplication(1000456L);
  }

  @Test
  void findPermitLegacyShouldReturnPermitPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findPermits(1000456L))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPermitItem(7000123L, "Complete"),
                new ApplicationDetailsRpcService.ApplicationPermitItem(7000456L, "Active")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationPermitResponseDto>> response =
        controller.findPermitLegacy("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationPermitResponseDto::permitNumber,
            ApplicationDetailsRpcController.ApplicationPermitResponseDto::permitStatusDescription)
        .containsExactly(tuple(7000123L, "Complete"), tuple(7000456L, "Active"));
    verify(service).findPermits(1000456L);
  }

  @Test
  void getScalesForPackageLegacyShouldReturnLegacyScaleRows() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScalesForPackage("PKG-903"))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    true, "TM001", "Douglas-fir", 12L, "Grade J", "10.5", "55", "C"),
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    false, "Unmanufactured", "Hemlock", 8L, "Grade U", "6.0", "56", "")));

    ResponseEntity<List<ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto>> response =
        controller.getScalesForPackageLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody())
        .extracting(
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::permitted,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::timberMark,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::species,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::pieces,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::grade,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::volume,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::id,
            ApplicationDetailsRpcController.ApplicationPackageScaleResponseDto::cascadeSplitCode)
        .containsExactly(
            tuple(true, "TM001", "Douglas-fir", 12L, "Grade J", "10.5", "55", "C"),
            tuple(false, "Unmanufactured", "Hemlock", 8L, "Grade U", "6.0", "56", ""));
    verify(service).getScalesForPackage("PKG-903");
  }

  @Test
  void getPackageDetailsLegacyShouldReturnLegacyPackagePayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getPackageDetails("PKG-903"))
        .thenReturn(
            new ApplicationDetailsRpcService.PackageDetailsItem(
                true,
                "PKG-903",
                "10.3",
                3.6d,
                "6.0",
                "24.0",
                "ACT",
                "Reviewed",
                "Active",
                "N",
                "S",
                "Standing",
                "H",
                "Harvested"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationPackageDetailsResponseDto> response =
        controller.getPackageDetailsLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-903");
    assertThat(response.getBody().volume()).isEqualTo("10.3");
    assertThat(response.getBody().scaledVolume()).isEqualTo(3.6d);
    assertThat(response.getBody().length()).isEqualTo("6.0");
    assertThat(response.getBody().diameter()).isEqualTo("24.0");
    assertThat(response.getBody().status()).isEqualTo("ACT");
    assertThat(response.getBody().comments()).isEqualTo("Reviewed");
    assertThat(response.getBody().statusDesc()).isEqualTo("Active");
    assertThat(response.getBody().reprocessed()).isEqualTo("N");
    assertThat(response.getBody().ageClass()).isEqualTo("S");
    assertThat(response.getBody().ageClassDescription()).isEqualTo("Standing");
    assertThat(response.getBody().productType()).isEqualTo("H");
    assertThat(response.getBody().productTypeDescription()).isEqualTo("Harvested");
    verify(service).getPackageDetails("PKG-903");
  }

  @Test
  void getScaleByIdLegacyShouldReturnLegacyScaleDetailPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScaleById("55"))
        .thenReturn(
            new ApplicationDetailsRpcService.ApplicationScaleDetailItem(
                true, "TM001", "FIR", "12", "J", "10.5", "55"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationScaleDetailResponseDto> response =
        controller.getScaleByIdLegacy("55", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().timberMark()).isEqualTo("TM001");
    assertThat(response.getBody().species()).isEqualTo("FIR");
    assertThat(response.getBody().pieces()).isEqualTo("12");
    assertThat(response.getBody().grade()).isEqualTo("J");
    assertThat(response.getBody().volume()).isEqualTo("10.5");
    assertThat(response.getBody().id()).isEqualTo("55");
    verify(service).getScaleById("55");
  }

  @Test
  void getScaleByIdLegacyShouldAcceptScaleIdAliasFromLegacyJavascript() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getScaleById("55"))
        .thenReturn(
            new ApplicationDetailsRpcService.ApplicationScaleDetailItem(
                true, "TM001", "FIR", "12", "J", "10.5", "55"));

    ResponseEntity<ApplicationDetailsRpcController.ApplicationScaleDetailResponseDto> response =
        controller.getScaleByIdLegacy(null, "55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().id()).isEqualTo("55");
    verify(service).getScaleById("55");
  }

  @Test
  void isPackageValidLegacyShouldReturnFalseWithMessageWhenPackageExists() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.isPackageValid("PKG-903"))
        .thenReturn(new ApplicationDetailsRpcService.PackageValidityItem(false, "Package PKG-903 already exists."));

    ResponseEntity<ApplicationDetailsRpcController.PackageValidityResponseDto> response =
        controller.isPackageValidLegacy("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isFalse();
    assertThat(response.getBody().message()).isEqualTo("Package PKG-903 already exists.");
    verify(service).isPackageValid("PKG-903");
  }

  @Test
  void addPackageToApplicationLegacyShouldMapLegacyParamsAndReturnPackagePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addPackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.PackagePersistenceResult(
                true, "PKG-903", "125.5", "12.0", "24.0", "A", List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("packageNumber", "PKG-903");
    params.add("applicationNumber", "1000456");
    params.add("packageDialogPackageVolume", "125.5");
    params.add("packageDialogAverageLength", "12.0");
    params.add("packageDialogAverageDiameter", "24.0");
    params.add("packageDialogPackageStatus", "A");
    params.add("packageDialogPackageComment", "Test package");
    params.add("packageDialogReprocessedIndicator", "N");
    params.add("createPackageEndUse", "LU");
    params.add("createPackageSpeciesTableValues", "FI,HE");

    ResponseEntity<ApplicationDetailsRpcController.PackagePersistenceResponseDto> response =
        controller.addPackageToApplicationLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-903");
    assertThat(response.getBody().packageName()).isEqualTo("PKG-903");

    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(service).addPackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.PackageMutationRequest request = requestCaptor.getValue();
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.volume()).isEqualTo(125.5d);
    assertThat(request.status()).isEqualTo("A");
    assertThat(request.endUseCode()).isEqualTo("LU");
    assertThat(request.speciesCodes()).containsExactly("FI", "HE");
  }

  @Test
  void updatePackageLegacyShouldMapLegacyParamsAndReturnPackagePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.updatePackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.PackagePersistenceResult(
                true, "PKG-904", "100.0", "10.0", "20.0", "A", List.of(), List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("packageNumber", "PKG-903");
    params.add("newPackageNumber", "PKG-904");
    params.add("applicationNumber", "1000456");
    params.add("packageDialogPackageVolume", "100.0");
    params.add("packageDialogAverageLength", "10.0");
    params.add("packageDialogAverageDiameter", "20.0");
    params.add("packageDialogPackageStatus", "A");
    params.add("updatePackageEndUse", "LU");
    params.add("updatePackageSpeciesTableValues", "CE");

    ResponseEntity<ApplicationDetailsRpcController.PackagePersistenceResponseDto> response =
        controller.updatePackageLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().packageNumber()).isEqualTo("PKG-904");

    ArgumentCaptor<ApplicationDetailsRpcService.PackageMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.PackageMutationRequest.class);
    verify(service).updatePackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.PackageMutationRequest request = requestCaptor.getValue();
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.newPackageNumber()).isEqualTo("PKG-904");
    assertThat(request.speciesCodes()).containsExactly("CE");
  }

  @Test
  void addScaleToPackageLegacyShouldMapLegacyParamsAndReturnScalePayload() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.addScaleToPackage(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.eq("idir\\jsmith")))
        .thenReturn(
            new ApplicationDetailsRpcService.ScalePersistenceResult(
                true,
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    false, "A12345", "Douglas-fir", 10L, "Sawlog", "12.5", "55", ""),
                List.of(),
                List.of()));

    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("timberMark", "A12345");
    params.add("scaleVolume", "12.5");
    params.add("scalePieces", "10");
    params.add("gradeCode", "1");
    params.add("speciesCode", "FI");
    params.add("applicationNumber", "1000456");
    params.add("packageNumber", "PKG-903");

    ResponseEntity<ApplicationDetailsRpcController.ScalePersistenceResponseDto> response =
        controller.addScaleToPackageLegacy(params, authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().valid()).isTrue();
    assertThat(response.getBody().result()).isNotNull();
    assertThat(response.getBody().result().id()).isEqualTo("55");
    assertThat(response.getBody().result().pieces()).isEqualTo(10L);

    ArgumentCaptor<ApplicationDetailsRpcService.ScaleMutationRequest> requestCaptor =
        ArgumentCaptor.forClass(ApplicationDetailsRpcService.ScaleMutationRequest.class);
    verify(service).addScaleToPackage(requestCaptor.capture(), org.mockito.ArgumentMatchers.eq("idir\\jsmith"));
    ApplicationDetailsRpcService.ScaleMutationRequest request = requestCaptor.getValue();
    assertThat(request.packageNumber()).isEqualTo("PKG-903");
    assertThat(request.applicationNumber()).isEqualTo(1000456L);
    assertThat(request.pieces()).isEqualTo(10L);
    assertThat(request.volume()).isEqualTo(12.5d);
  }

  @Test
  void deleteScaleByIdLegacyShouldPassAuthenticatedUserAndReturnSuccess() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.deleteScaleById("55", "idir\\jsmith")).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deleteScaleByIdLegacy("55", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    verify(service).deleteScaleById("55", "idir\\jsmith");
  }

  @Test
  void deleteScaleByIdLegacyShouldRejectWithoutCreateApplicationAction() {
    TestingAuthenticationToken authentication = unauthorized("createApplication");

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deleteScaleByIdLegacy("55", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    verifyNoInteractions(service);
  }

  @Test
  void deletePackageByIdLegacyShouldPassAuthenticatedUserAndReturnSuccess() {
    TestingAuthenticationToken authentication = authorized("createApplication");
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.deletePackageById("PKG-903", "idir\\jsmith")).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.DeleteResponseDto> response =
        controller.deletePackageByIdLegacy("PKG-903", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    verify(service).deletePackageById("PKG-903", "idir\\jsmith");
  }

  private TestingAuthenticationToken authorized(String action) {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    List<String> roles = List.of("LEXIS_APPLICATION_APPROVER");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, action)).thenReturn(true);
    return authentication;
  }

  private TestingAuthenticationToken unauthorized(String action) {
    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\readonly", "n/a");
    List<String> roles = List.of("LEXIS_READ_ONLY");
    when(sessionService.parseRolesFromPrincipal(authentication)).thenReturn(roles);
    when(authorizationService.canPerformAction(roles, action)).thenReturn(false);
    return authentication;
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot summarySnapshot() {
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        1000456L,
        null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        125.5d,
        2.4d,
        "Camp 1",
        1234L,
        "00022222",
        "01",
        "00011111",
        "02",
        null,
        "U",
        "NEW",
        "A",
        11L,
        "H",
        "P",
        "O",
        "Agent Contact",
        "Owner Contact",
        "N");
  }

  private ApplicationDetailsRpcService.ApplicationSummarySnapshot summarySnapshotWithBlankOwnerContact() {
    return new ApplicationDetailsRpcService.ApplicationSummarySnapshot(
        1000456L,
        null,
        LocalDate.of(2026, 3, 1),
        30L,
        LocalDate.of(2026, 3, 2),
        125.5d,
        2.4d,
        "Camp 1",
        1234L,
        "00022222",
        "01",
        "00011111",
        "02",
        null,
        "U",
        "NEW",
        "A",
        11L,
        "H",
        "P",
        "O",
        "Agent Contact",
        null,
        "N");
  }

  private MultiValueMap<String, String> matchingSummaryParameters() {
    MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
    params.add("applicationNumber", "1000456");
    params.add("applicationDate", "2026-03-01");
    params.add("exemptionTerm", "30");
    params.add("dateReceived", "2026-03-02");
    params.add("averageLogVolume", "2.4");
    params.add("logLocation", "Camp 1");
    params.add("exportScheduleId", "1234");
    params.add("agentClientNumber", "00022222");
    params.add("agentClientLocationCode", "01");
    params.add("agentContactName", "Agent Contact");
    params.add("ownerClientNumber", "00011111");
    params.add("ownerClientLocationCode", "02");
    params.add("ownerContactName", "Owner Contact");
    params.add("exemptionReason", "U");
    params.add("region", "11");
    params.add("productType", "H");
    return params;
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
    })
@AutoConfigureMockMvc
class LexisDocumentUploadMutationIntegrationTest {

  private static final long APPLICATION_NUMBER = 1000123L;
  private static final long PERMIT_NUMBER = 7000123L;
  private static final String EXEMPTION_NUMBER = "EX-205";

  @Autowired private MockMvc mockMvc;

  @MockitoBean private LexisApplicationService applicationService;
  @MockitoBean private ApplicationDetailsRpcService applicationDetailsService;
  @MockitoBean private ApplicationEditLockService applicationEditLockService;
  @MockitoBean private ExemptionService exemptionService;
  @MockitoBean private PermitService permitService;
  @MockitoBean private LexisUploadService uploadService;

  @BeforeEach
  void allowEditLocks() {
    ApplicationEditLockDto acquired =
        new ApplicationEditLockDto(false, true, null, null, null);
    when(applicationEditLockService.acquire(any(), any(), any(), anyBoolean()))
        .thenReturn(acquired);
    when(applicationEditLockService.acquireExemption(any(), any(), any(), anyBoolean()))
        .thenReturn(acquired);
    when(applicationEditLockService.acquirePermit(any(), any(), any(), anyBoolean()))
        .thenReturn(acquired);
  }

  @Test
  void directPersistedUploadsShouldRejectExpiredCanonicalTargets() throws Exception {
    canonicalStatuses("EXP", "EXP", "EXP");

    performApplicationUpload().andExpect(status().isForbidden());
    performExemptionUpload().andExpect(status().isForbidden());
    performPermitUpload().andExpect(status().isForbidden());
    performInvoiceUpload().andExpect(status().isForbidden());

    verify(uploadService, never()).uploadApplication(any(), any(), any(), any());
    verify(uploadService, never()).uploadExemption(any(), any(), any(), any());
    verify(uploadService, never()).uploadPermit(any(), any(), any(), any());
    verify(uploadService, never())
        .uploadInvoice(any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void directPersistedUploadsShouldRejectMissingCanonicalStatuses() throws Exception {
    canonicalStatuses(null, null, null);

    performApplicationUpload().andExpect(status().isForbidden());
    performExemptionUpload().andExpect(status().isForbidden());
    performPermitUpload().andExpect(status().isForbidden());
    performInvoiceUpload().andExpect(status().isForbidden());
  }

  @Test
  void directPersistedUploadsShouldRejectMissingCanonicalRecords() throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.empty());
    when(exemptionService.findByExemptionNumber(EXEMPTION_NUMBER))
        .thenReturn(Optional.empty());
    when(permitService.findByPermitNumber(PERMIT_NUMBER)).thenReturn(Optional.empty());

    performApplicationUpload().andExpect(status().isForbidden());
    performExemptionUpload().andExpect(status().isForbidden());
    performPermitUpload().andExpect(status().isForbidden());
    performInvoiceUpload().andExpect(status().isForbidden());
  }

  @Test
  void directPersistedUploadsShouldAllowNonExpiredTargetsIncludingCancelledExemptions()
      throws Exception {
    canonicalStatuses("NEW", "CAN", "ACT");
    when(uploadService.uploadApplication(any(), eq(APPLICATION_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("application")));
    when(uploadService.uploadExemption(any(), eq(EXEMPTION_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("exemption")));
    when(uploadService.uploadPermit(any(), eq(PERMIT_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("permit")));
    when(
            uploadService.uploadInvoice(
                any(), eq(PERMIT_NUMBER), eq("INV-1001"), any(), any(), any(), any(), any()))
        .thenReturn(Optional.of(accepted("invoice")));

    performApplicationUpload().andExpect(status().isOk());
    performExemptionUpload().andExpect(status().isOk());
    performPermitUpload().andExpect(status().isOk());
    performInvoiceUpload().andExpect(status().isOk());
  }

  @Test
  void scopedSubmitterApplicationUploadShouldAllowOwnedApplicationWithoutCompletePermit()
      throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("NEW")));
    when(applicationDetailsService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(Optional.of(applicationEditContext(false)));
    when(uploadService.uploadApplication(any(), eq(APPLICATION_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("application")));

    performApplicationUpload(submitterJwt()).andExpect(status().isOk());
  }

  @Test
  void scopedSubmitterApplicationUploadShouldRejectApplicationWithCompletePermit()
      throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("NEW")));
    when(applicationDetailsService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(Optional.of(applicationEditContext(true)));

    performApplicationUpload(submitterJwt()).andExpect(status().isForbidden());

    verify(uploadService, never()).uploadApplication(any(), any(), any(), any());
  }

  @Test
  void scopedSubmitterCanValidateAndUploadOwnedDocumentsAcrossProvincialRecords()
      throws Exception {
    canonicalStatuses("NEW", "ACT", "ACT");
    when(applicationDetailsService.getApplicationEditContext(APPLICATION_NUMBER))
        .thenReturn(Optional.of(applicationEditContext(false)));
    allowSuccessfulDocumentOperations();

    JwtRequestPostProcessor submitter = submitterJwt();
    performApplicationValidation(submitter).andExpect(status().isOk());
    performExemptionValidation(submitter).andExpect(status().isOk());
    performPermitValidation(submitter).andExpect(status().isOk());
    performInvoiceValidation(submitter).andExpect(status().isOk());
    performApplicationUpload(submitter).andExpect(status().isOk());
    performExemptionUpload(submitter).andExpect(status().isOk());
    performPermitUpload(submitter).andExpect(status().isOk());
    performInvoiceUpload(submitter).andExpect(status().isOk());
  }

  @Test
  void applicationApproverCanValidateAndUploadAllProvincialDocumentTypes()
      throws Exception {
    canonicalStatuses("NEW", "ACT", "ACT");
    allowSuccessfulDocumentOperations();

    JwtRequestPostProcessor approver = applicationApproverJwt();
    performApplicationValidation(approver).andExpect(status().isOk());
    performExemptionValidation(approver).andExpect(status().isOk());
    performPermitValidation(approver).andExpect(status().isOk());
    performInvoiceValidation(approver).andExpect(status().isOk());
    performApplicationUpload(approver).andExpect(status().isOk());
    performExemptionUpload(approver).andExpect(status().isOk());
    performPermitUpload(approver).andExpect(status().isOk());
    performInvoiceUpload(approver).andExpect(status().isOk());
  }

  @Test
  void wrongClientScopedSubmitterCannotValidateOrUploadProvincialDocuments()
      throws Exception {
    canonicalStatuses("NEW", "ACT", "ACT");

    assertAllDocumentOperationsForbidden(submitterJwt("99999999"));
    verifyNoDocumentOperations();
  }

  @Test
  void exemptionApproverCannotValidateOrUploadProvincialDocuments() throws Exception {
    canonicalStatuses("NEW", "ACT", "ACT");

    assertAllDocumentOperationsForbidden(exemptionApproverJwt());
    verifyNoDocumentOperations();
  }

  @Test
  void persistedInvoiceUploadsShouldRejectEveryNonActivePermitStatus() throws Exception {
    for (String status : List.of("COM", "PPD", "CAN")) {
      when(permitService.findByPermitNumber(PERMIT_NUMBER))
          .thenReturn(Optional.of(permit(status)));

      performInvoiceUpload().andExpect(status().isForbidden());
    }

    verify(uploadService, never())
        .uploadInvoice(any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void validationOnlyUploadsShouldRemainAvailableForExpiredTargets() throws Exception {
    canonicalStatuses("EXP", "EXP", "EXP");
    when(uploadService.validateDocument(any(), any()))
        .thenReturn(
            Optional.of(
                new LexisUploadResultDto(
                    "document", "file.pdf", 7L, "validated", "valid")));

    mockMvc
        .perform(
            multipart("/api/lexis/admin/uploads/applications/validation")
                .file(file("application.pdf"))
                .param("applicationNumber", Long.toString(APPLICATION_NUMBER))
                .with(adminJwt()))
        .andExpect(status().isOk());
    mockMvc
        .perform(
            multipart("/api/lexis/admin/uploads/exemptions/validation")
                .file(file("exemption.pdf"))
                .param("exemptionNumber", EXEMPTION_NUMBER)
                .with(adminJwt()))
        .andExpect(status().isOk());
    mockMvc
        .perform(
            multipart("/api/lexis/admin/uploads/permits/validation")
                .file(file("permit.pdf"))
                .param("permitNumber", Long.toString(PERMIT_NUMBER))
                .with(adminJwt()))
        .andExpect(status().isOk());
    mockMvc
        .perform(
            multipart("/api/lexis/admin/uploads/invoices/validation")
                .file(file("invoice.pdf"))
                .param("permitNumber", Long.toString(PERMIT_NUMBER))
                .param("salesInvoiceNumber", "INV-1001")
                .with(adminJwt()))
        .andExpect(status().isOk());
  }

  private void canonicalStatuses(
      String applicationStatus, String exemptionStatus, String permitStatus) {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application(applicationStatus)));
    when(exemptionService.findByExemptionNumber(EXEMPTION_NUMBER))
        .thenReturn(Optional.of(exemption(exemptionStatus)));
    when(permitService.findByPermitNumber(PERMIT_NUMBER))
        .thenReturn(Optional.of(permit(permitStatus)));
  }

  private LexisApplicationDetailDto application(String status) {
    return new LexisApplicationDetailDto(
        APPLICATION_NUMBER,
        null,
        status,
        status,
        "00012345",
        null,
        11L,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0d,
        0d,
        false,
        false,
        false,
        false,
        false,
        null,
        null,
        List.of(),
        List.of(),
        List.of());
  }

  private ApplicationDetailsRpcService.ApplicationEditContext applicationEditContext(
      boolean hasCompletePermit) {
    return new ApplicationDetailsRpcService.ApplicationEditContext(
        APPLICATION_NUMBER, "NEW", "P", 1L, null, false, false, hasCompletePermit, null, false);
  }

  private ExemptionDetailDto exemption(String status) {
    return new ExemptionDetailDto(
        EXEMPTION_NUMBER,
        "A",
        null,
        status,
        status,
        "00012345",
        null,
        APPLICATION_NUMBER,
        null,
        null,
        null,
        0d,
        0d,
        0d,
        null,
        false,
        List.of(),
        List.of());
  }

  private PermitDetailDto permit(String status) {
    return new PermitDetailDto(
        PERMIT_NUMBER,
        APPLICATION_NUMBER,
        "PKG-1",
        EXEMPTION_NUMBER,
        status,
        status,
        "00012345",
        "01",
        "00012345",
        "01",
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
        0d,
        0L,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private LexisUploadResultDto accepted(String uploadType) {
    return new LexisUploadResultDto(uploadType, uploadType + ".pdf", 7L, "accepted", "queued");
  }

  private void allowSuccessfulDocumentOperations() {
    when(uploadService.validateDocument(any(), any()))
        .thenReturn(Optional.of(accepted("document")));
    when(uploadService.uploadApplication(any(), eq(APPLICATION_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("application")));
    when(uploadService.uploadExemption(any(), eq(EXEMPTION_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("exemption")));
    when(uploadService.uploadPermit(any(), eq(PERMIT_NUMBER), any(), any()))
        .thenReturn(Optional.of(accepted("permit")));
    when(
            uploadService.uploadInvoice(
                any(), eq(PERMIT_NUMBER), eq("INV-1001"), any(), any(), any(), any(), any()))
        .thenReturn(Optional.of(accepted("invoice")));
  }

  private void assertAllDocumentOperationsForbidden(JwtRequestPostProcessor authentication)
      throws Exception {
    performApplicationValidation(authentication).andExpect(status().isForbidden());
    performExemptionValidation(authentication).andExpect(status().isForbidden());
    performPermitValidation(authentication).andExpect(status().isForbidden());
    performInvoiceValidation(authentication).andExpect(status().isForbidden());
    performApplicationUpload(authentication).andExpect(status().isForbidden());
    performExemptionUpload(authentication).andExpect(status().isForbidden());
    performPermitUpload(authentication).andExpect(status().isForbidden());
    performInvoiceUpload(authentication).andExpect(status().isForbidden());
  }

  private void verifyNoDocumentOperations() {
    verify(uploadService, never()).validateDocument(any(), any());
    verify(uploadService, never()).uploadApplication(any(), any(), any(), any());
    verify(uploadService, never()).uploadExemption(any(), any(), any(), any());
    verify(uploadService, never()).uploadPermit(any(), any(), any(), any());
    verify(uploadService, never())
        .uploadInvoice(any(), any(), any(), any(), any(), any(), any(), any());
  }

  private ResultActions performApplicationUpload() throws Exception {
    return performApplicationUpload(adminJwt());
  }

  private ResultActions performApplicationUpload(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/applications")
            .file(file("application.pdf"))
            .param("applicationNumber", Long.toString(APPLICATION_NUMBER))
            .param("fileDescription", "Application document")
            .with(authentication));
  }

  private ResultActions performExemptionUpload() throws Exception {
    return performExemptionUpload(adminJwt());
  }

  private ResultActions performExemptionUpload(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/exemptions")
            .file(file("exemption.pdf"))
            .param("exemptionNumber", EXEMPTION_NUMBER)
            .param("fileDescription", "Exemption document")
            .with(authentication));
  }

  private ResultActions performPermitUpload() throws Exception {
    return performPermitUpload(adminJwt());
  }

  private ResultActions performPermitUpload(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/permits")
            .file(file("permit.pdf"))
            .param("permitNumber", Long.toString(PERMIT_NUMBER))
            .param("fileDescription", "Permit document")
            .with(authentication));
  }

  private ResultActions performInvoiceUpload() throws Exception {
    return performInvoiceUpload(adminJwt());
  }

  private ResultActions performInvoiceUpload(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/invoices")
            .file(file("invoice.pdf"))
            .param("permitNumber", Long.toString(PERMIT_NUMBER))
            .param("salesInvoiceNumber", "INV-1001")
            .param("fileDescription", "Invoice document")
            .with(authentication));
  }

  private ResultActions performApplicationValidation(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/applications/validation")
            .file(file("application.pdf"))
            .param("applicationNumber", Long.toString(APPLICATION_NUMBER))
            .with(authentication));
  }

  private ResultActions performExemptionValidation(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/exemptions/validation")
            .file(file("exemption.pdf"))
            .param("exemptionNumber", EXEMPTION_NUMBER)
            .with(authentication));
  }

  private ResultActions performPermitValidation(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/permits/validation")
            .file(file("permit.pdf"))
            .param("permitNumber", Long.toString(PERMIT_NUMBER))
            .with(authentication));
  }

  private ResultActions performInvoiceValidation(JwtRequestPostProcessor authentication)
      throws Exception {
    return mockMvc.perform(
        multipart("/api/lexis/admin/uploads/invoices/validation")
            .file(file("invoice.pdf"))
            .param("permitNumber", Long.toString(PERMIT_NUMBER))
            .param("salesInvoiceNumber", "INV-1001")
            .with(authentication));
  }

  private MockMultipartFile file(String fileName) {
    return new MockMultipartFile("formFile", fileName, "application/pdf", "content".getBytes());
  }

  private JwtRequestPostProcessor adminJwt() {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "idir")
                    .claim("custom:idp_username", "lexis-upload-test-user"))
        .authorities(new SimpleGrantedAuthority("LEXIS_ADMIN"));
  }

  private JwtRequestPostProcessor submitterJwt() {
    return submitterJwt("00012345");
  }

  private JwtRequestPostProcessor submitterJwt(String clientNumber) {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "bceidbusiness")
                    .claim("custom:idp_username", "lexis-submit-test-user"))
        .authorities(
            new SimpleGrantedAuthority("LEXIS_PROVINCIAL_SUBMITTER_" + clientNumber));
  }

  private JwtRequestPostProcessor applicationApproverJwt() {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "idir")
                    .claim("custom:idp_username", "lexis-approver-test-user"))
        .authorities(new SimpleGrantedAuthority("LEXIS_APPLICATION_APPROVER"));
  }

  private JwtRequestPostProcessor exemptionApproverJwt() {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token ->
                token
                    .claim("custom:idp_name", "idir")
                    .claim("custom:idp_username", "lexis-exemption-approver-test-user"))
        .authorities(new SimpleGrantedAuthority("LEXIS_EXEMPTION_APPROVER"));
  }
}

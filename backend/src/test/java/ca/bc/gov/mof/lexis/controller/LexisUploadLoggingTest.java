package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.upload.ApplicationSubmissionImportResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.upload.ApplicationSubmissionImportService;
import ca.bc.gov.mof.lexis.service.upload.LexisUploadService;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith({MockitoExtension.class, OutputCaptureExtension.class})
class LexisUploadLoggingTest {

  @Mock private ObjectProvider<LexisUploadService> uploadServiceProvider;
  @Mock private ObjectProvider<ApplicationSubmissionImportService> importServiceProvider;
  @Mock private ApplicationSubmissionImportService importService;
  @Mock private ApplicationEditLockService applicationEditLockService;

  @Test
  void federalAuditShouldFingerprintCorrelationValuesAndOmitIngressDetails(
      CapturedOutput output) {
    byte[] payload =
        ("<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\">"
                + "<lexis:contact>xml-secret@example.com</lexis:contact>"
                + "</lexis:LexisSubmission>")
            .getBytes(StandardCharsets.UTF_8);
    String requestId = "REQ-PRIVATE-123";
    String idempotencyKey = "IDEMP-PRIVATE-456";
    String fileName =
        "private-customer@example.com\r\nforged_file=true\u2028forged_unicode=true.xml";
    String userReference = "CLIENT-SECRET-REFERENCE";
    ApplicationSubmissionImportResultDto result =
        new ApplicationSubmissionImportResultDto(
            "applicationSubmission",
            fileName,
            payload.length,
            "validated",
            "Validated xml-secret@example.com",
            987654321L,
            "PRIVATE-PACKAGE-123",
            4,
            List.of(),
            List.of("xml-secret@example.com"),
            userReference);
    when(importServiceProvider.getIfAvailable()).thenReturn(importService);
    when(
            importService.validateDedicatedFederalApplicationSubmission(
                payload, fileName, userReference))
        .thenReturn(result);
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider, importServiceProvider, applicationEditLockService);
    TestingAuthenticationToken authentication =
        new TestingAuthenticationToken(
            "actor-secret@example.com\r\nforged_actor=true",
            "n/a",
            "SCOPE_lexis:federal-submission:submit\r\nforged_authority=true\u2028unicode=true");

    var response =
        controller.federalApplicationSubmissionValidation(
            userReference,
            fileName,
            payload,
            requestId,
            idempotencyKey,
            "secret-source@example.com",
            null,
            authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(output)
        .contains("event=lexis_federal_submission")
        .contains("operation=validate-raw")
        .contains("outcome=validated")
        .contains("httpStatus=200")
        .contains("requestFingerprint=" + fingerprint(requestId))
        .contains("idempotencyFingerprint=" + fingerprint(idempotencyKey))
        .contains("actorFingerprint=" + fingerprint(authentication.getName()))
        .contains("authorityCount=1")
        .contains("fileSize=" + payload.length)
        .contains("scaleRows=4")
        .contains("errorCount=0")
        .contains("warningCount=1")
        .doesNotContain(requestId)
        .doesNotContain(idempotencyKey)
        .doesNotContain("private-customer@example.com")
        .doesNotContain("CLIENT-SECRET-REFERENCE")
        .doesNotContain("PRIVATE-PACKAGE-123")
        .doesNotContain("xml-secret@example.com")
        .doesNotContain("secret-source@example.com")
        .doesNotContain("actor-secret@example.com")
        .doesNotContain(
            fileName,
            authentication.getName(),
            "forged_file=true",
            "forged_actor=true",
            "forged_authority=true",
            "forged_unicode=true",
            "unicode=true",
            "\u2028");
  }

  @Test
  void federalFailureLogShouldOmitExceptionAndRequestDetails(CapturedOutput output) {
    byte[] payload =
        "<lexis:LexisSubmission xmlns:lexis=\"http://www.for.gov.bc.ca/schema/lexis\"/>"
            .getBytes(StandardCharsets.UTF_8);
    String requestId = "REQ-FAILURE-PRIVATE";
    String idempotencyKey = "IDEMP-FAILURE-PRIVATE";
    String fileName = "private-failure@example.com\r\nforged_file=true.xml";
    String userReference = "PRIVATE-FAILURE-REFERENCE";
    String failureDetail =
        "database included xml-private@example.com\r\nforged_exception=true\u2028unicode=true";
    when(importServiceProvider.getIfAvailable()).thenReturn(importService);
    when(
            importService.validateDedicatedFederalApplicationSubmission(
                payload, fileName, userReference))
        .thenThrow(new IllegalStateException(failureDetail));
    LexisUploadController controller =
        new LexisUploadController(
            uploadServiceProvider, importServiceProvider, applicationEditLockService);

    var response =
        controller.federalApplicationSubmissionValidation(
            userReference,
            fileName,
            payload,
            requestId,
            idempotencyKey,
            new TestingAuthenticationToken("private-actor@example.com", "n/a"));

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    assertThat(output)
        .contains("event=lexis_federal_submission_failure")
        .contains("operation=validate-raw")
        .contains("requestFingerprint=" + fingerprint(requestId))
        .contains("idempotencyFingerprint=" + fingerprint(idempotencyKey))
        .contains("failureType=IllegalStateException")
        .doesNotContain(requestId)
        .doesNotContain(idempotencyKey)
        .doesNotContain(fileName)
        .doesNotContain(userReference)
        .doesNotContain(failureDetail)
        .doesNotContain(
            "private-failure@example.com",
            "xml-private@example.com",
            "private-actor@example.com",
            "forged_file=true",
            "forged_exception=true",
            "unicode=true",
            "\u2028");
  }
}

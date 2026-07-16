package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.service.coordination.InvalidRecordVersionException;
import ca.bc.gov.mof.lexis.service.coordination.MissingRecordVersionException;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.StaleRecordException;
import ca.bc.gov.mof.lexis.service.report.LexisReportRequestNormalizer;
import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@DisplayName("Web Test | LexisApiExceptionHandler")
@ExtendWith(OutputCaptureExtension.class)
class LexisApiExceptionHandlerTest {

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc =
        MockMvcBuilders.standaloneSetup(new FailingDatabaseController())
            .setControllerAdvice(new LexisApiExceptionHandler())
            .build();
  }

  @Test
  void dataAccessFailureShouldReturnPublicSafeServiceUnavailableResponse(CapturedOutput output)
      throws Exception {
    mockMvc
        .perform(get("/test/database-failure"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(503))
        .andExpect(jsonPath("$.title").value("Service temporarily unavailable"))
        .andExpect(
            jsonPath("$.detail")
                .value("LEXIS could not complete the request. Please try again later."))
        .andExpect(content().string(not(containsString("THE.LEXIS_GROUP_5.FIND_APPLICATIONS"))))
        .andExpect(content().string(not(containsString("ORA-01089"))));

    assertThat(output)
        .contains(
            "event=lexis_database operation=request outcome=unavailable "
                + "failureType=DataAccessResourceFailureException")
        .doesNotContain("THE.LEXIS_GROUP_5.FIND_APPLICATIONS", "ORA-01089");
  }

  @Test
  void saturatedAsyncCapacityShouldReturnRetryableServiceUnavailableResponse()
      throws Exception {
    mockMvc
        .perform(get("/test/task-rejected"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "5"))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(503))
        .andExpect(jsonPath("$.title").value("Service temporarily busy"))
        .andExpect(
            jsonPath("$.detail")
                .value(
                    "LEXIS cannot start this operation right now. Please try again shortly."))
        .andExpect(content().string(not(containsString("mvc-stream"))));
  }

  @Test
  void reportValidationFailureShouldReturnProblemDetailBadRequest() throws Exception {
    mockMvc
        .perform(get("/test/report-validation-failure"))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(400))
        .andExpect(jsonPath("$.title").value("Invalid report request"))
        .andExpect(jsonPath("$.detail").value("Report date range must not be reversed."));
  }

  @Test
  void nullReportParameterShouldReturnProblemDetailBadRequest() throws Exception {
    mockMvc
        .perform(
            post("/test/report-request")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"parameters":{"fromDate":null},"format":"PDF"}
                    """))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(400))
        .andExpect(jsonPath("$.title").value("Invalid report request"))
        .andExpect(jsonPath("$.detail").value("Report parameter 'fromDate' must not be null."));
  }

  @Test
  void malformedReportBodyShouldReturnPublicSafeBadRequest() throws Exception {
    mockMvc
        .perform(
            post("/test/report-request")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"parameters":["not-a-map"],"format":"PDF"}
                    """))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(400))
        .andExpect(jsonPath("$.title").value("Invalid request"))
        .andExpect(
            jsonPath("$.detail")
                .value("The request body is malformed or contains a value with the wrong type."))
        .andExpect(content().string(not(containsString("MismatchedInputException"))));
  }

  @Test
  void staleSaveShouldRequireRefreshWithoutAdvertisingOverwrite() throws Exception {
    mockMvc
        .perform(get("/test/stale-record"))
        .andExpect(status().isConflict())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.code").value("STALE_RECORD"))
        .andExpect(jsonPath("$.recordType").value("application"))
        .andExpect(jsonPath("$.recordId").value("10"))
        .andExpect(jsonPath("$.expectedVersion").value("expected-version"))
        .andExpect(jsonPath("$.currentVersion").isNotEmpty())
        .andExpect(jsonPath("$.savedAt").value("2026-07-15T18:01:00Z"))
        .andExpect(jsonPath("$.updatedBy").value("IDIR\\SECOND"))
        .andExpect(jsonPath("$.changedFields").isArray())
        .andExpect(jsonPath("$.overwriteAllowed").doesNotExist())
        .andExpect(jsonPath("$.detail").value(containsString("Refresh")));
  }

  @Test
  void missingVersionShouldRequireRefreshBeforeMutation() throws Exception {
    mockMvc
        .perform(get("/test/missing-record-version"))
        .andExpect(status().isPreconditionRequired())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.status").value(428))
        .andExpect(jsonPath("$.title").value("Record refresh required"))
        .andExpect(jsonPath("$.code").value("RECORD_VERSION_REQUIRED"))
        .andExpect(jsonPath("$.detail").value(containsString("Refresh")));
  }

  @Test
  void invalidVersionShouldReturnBadRequest() throws Exception {
    mockMvc
        .perform(get("/test/invalid-record-version"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_RECORD_VERSION"));
  }

  @RestController
  private static final class FailingDatabaseController {

    @GetMapping("/test/database-failure")
    String fail() {
      throw new DataAccessResourceFailureException(
          "ORA-01089 while calling THE.LEXIS_GROUP_5.FIND_APPLICATIONS");
    }

    @GetMapping("/test/task-rejected")
    String rejectTask() {
      throw new TaskRejectedException("mvc-stream queue is full");
    }

    @GetMapping("/test/report-validation-failure")
    String rejectReport() {
      throw new LexisReportValidationException("Report date range must not be reversed.");
    }

    @GetMapping("/test/stale-record")
    String staleRecord() {
      OptimisticRecordVersion current =
          new OptimisticRecordVersion(
              OptimisticRecordType.APPLICATION,
              "10",
              Instant.parse("2026-07-15T18:01:00Z"),
              "IDIR\\SECOND",
              "current-fingerprint");
      throw new StaleRecordException(
          OptimisticRecordType.APPLICATION, "10", "expected-version", current);
    }

    @GetMapping("/test/invalid-record-version")
    String invalidRecordVersion() {
      throw new InvalidRecordVersionException("Invalid version", null);
    }

    @GetMapping("/test/missing-record-version")
    String missingRecordVersion() {
      throw new MissingRecordVersionException();
    }

    @PostMapping("/test/report-request")
    void validateReportRequest(@RequestBody LexisReportRequestDto request) {
      LexisReportRequestNormalizer.normalize(request);
    }
  }
}

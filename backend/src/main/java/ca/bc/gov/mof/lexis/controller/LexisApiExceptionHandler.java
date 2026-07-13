package ca.bc.gov.mof.lexis.controller;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.service.report.LexisReportValidationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class LexisApiExceptionHandler {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisApiExceptionHandler.class);
  private static final String DATABASE_UNAVAILABLE_TITLE = "Service temporarily unavailable";
  private static final String DATABASE_UNAVAILABLE_DETAIL =
      "LEXIS could not complete the request. Please try again later.";
  private static final String CAPACITY_UNAVAILABLE_TITLE = "Service temporarily busy";
  private static final String CAPACITY_UNAVAILABLE_DETAIL =
      "LEXIS cannot start this operation right now. Please try again shortly.";
  private static final String INVALID_REPORT_TITLE = "Invalid report request";
  private static final String INVALID_REQUEST_TITLE = "Invalid request";
  private static final String MALFORMED_REQUEST_DETAIL =
      "The request body is malformed or contains a value with the wrong type.";

  @ExceptionHandler(LexisReportValidationException.class)
  ResponseEntity<ProblemDetail> handleReportValidationException(
      LexisReportValidationException exception) {
    String detail =
        exception.getMessage() == null || exception.getMessage().isBlank()
            ? "Unable to generate report. Check the request values and try again."
            : exception.getMessage();
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    problem.setTitle(INVALID_REPORT_TITLE);
    return ResponseEntity.badRequest()
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<ProblemDetail> handleHttpMessageNotReadableException(
      HttpMessageNotReadableException exception) {
    LOGGER.info("Rejected malformed request body: {}", exception.getClass().getSimpleName());
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, MALFORMED_REQUEST_DETAIL);
    problem.setTitle(INVALID_REQUEST_TITLE);
    return ResponseEntity.badRequest()
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }

  @ExceptionHandler(DataAccessException.class)
  ResponseEntity<ProblemDetail> handleDataAccessException(DataAccessException exception) {
    LOGGER.error(
        "event=lexis_database operation=request outcome=unavailable failureType={}",
        exceptionType(exception));

    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.SERVICE_UNAVAILABLE, DATABASE_UNAVAILABLE_DETAIL);
    problem.setTitle(DATABASE_UNAVAILABLE_TITLE);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }

  @ExceptionHandler(TaskRejectedException.class)
  ResponseEntity<ProblemDetail> handleTaskRejectedException(TaskRejectedException exception) {
    LOGGER.warn(
        "event=lexis_async_request outcome=capacity_rejected failureType={}",
        exceptionType(exception));

    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(
            HttpStatus.SERVICE_UNAVAILABLE, CAPACITY_UNAVAILABLE_DETAIL);
    problem.setTitle(CAPACITY_UNAVAILABLE_TITLE);
    return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
        .header(HttpHeaders.RETRY_AFTER, "5")
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}

package ca.bc.gov.mof.lexis.dto.admin;

public record ExportScheduleMutationResultDto(
    boolean success,
    String message,
    ExportScheduleRowDto schedule) {}

package ca.bc.gov.mof.lexis.dto.admin;

import java.time.LocalDate;

public record ExportScheduleRowDto(
    Long exportScheduleId,
    LocalDate advertisingDate,
    LocalDate applicationReceiptDate,
    LocalDate offerReceiptDate,
    LocalDate offerEndDate,
    LocalDate offerWithdrawalDate,
    LocalDate teacMeetingDate,
    long applicationCount,
    boolean mutable) {

  public ExportScheduleRowDto(
      Long exportScheduleId,
      LocalDate advertisingDate,
      LocalDate applicationReceiptDate,
      LocalDate offerReceiptDate,
      LocalDate offerEndDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacMeetingDate) {
    this(
        exportScheduleId,
        advertisingDate,
        applicationReceiptDate,
        offerReceiptDate,
        offerEndDate,
        offerWithdrawalDate,
        teacMeetingDate,
        0L,
        true);
  }
}

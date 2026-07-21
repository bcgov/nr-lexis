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
    boolean mutable,
    long provincialApplicationCount) {

  public ExportScheduleRowDto(
      Long exportScheduleId,
      LocalDate advertisingDate,
      LocalDate applicationReceiptDate,
      LocalDate offerReceiptDate,
      LocalDate offerEndDate,
      LocalDate offerWithdrawalDate,
      LocalDate teacMeetingDate,
      long applicationCount,
      boolean mutable) {
    this(
        exportScheduleId,
        advertisingDate,
        applicationReceiptDate,
        offerReceiptDate,
        offerEndDate,
        offerWithdrawalDate,
        teacMeetingDate,
        applicationCount,
        mutable,
        applicationCount);
  }

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
        true,
        0L);
  }
}

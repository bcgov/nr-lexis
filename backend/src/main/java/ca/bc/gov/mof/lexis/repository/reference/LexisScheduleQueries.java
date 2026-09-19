package ca.bc.gov.mof.lexis.repository.reference;

/** Direct equivalents of legacy schedule reads, retaining Oracle's database-date boundaries. */
public final class LexisScheduleQueries {

  public static final String CURRENT_SCHEDULES =
      """
      SELECT *
      FROM (
        SELECT *
        FROM (
          SELECT ES.EXPORT_SCHEDULE_ID,
                 ES.APPLICATION_RECEIPT_DATE,
                 ES.ADVERTISING_DATE,
                 ES.OFFER_RECEIPT_DATE,
                 ES.TEAC_MEETING_DATE,
                 ES.OFFER_END_DATE,
                 ES.OFFER_WITHDRAWAL_DATE
          FROM THE.EXPORT_SCHEDULE ES
          WHERE TRUNC(ES.ADVERTISING_DATE) <= TRUNC(SYSDATE)
          ORDER BY ES.ADVERTISING_DATE DESC
        )
        WHERE ROWNUM <= 1
        UNION
        SELECT *
        FROM (
          SELECT ES.EXPORT_SCHEDULE_ID,
                 ES.APPLICATION_RECEIPT_DATE,
                 ES.ADVERTISING_DATE,
                 ES.OFFER_RECEIPT_DATE,
                 ES.TEAC_MEETING_DATE,
                 ES.OFFER_END_DATE,
                 ES.OFFER_WITHDRAWAL_DATE
          FROM THE.EXPORT_SCHEDULE ES
          WHERE TRUNC(ES.ADVERTISING_DATE) > TRUNC(SYSDATE)
          ORDER BY ES.ADVERTISING_DATE
        )
        WHERE ROWNUM <= 1
      ) ORDER BY ADVERTISING_DATE ASC
      """;

  public static final String NEXT_SCHEDULES =
      """
      SELECT *
      FROM (
        SELECT ES.EXPORT_SCHEDULE_ID,
               ES.APPLICATION_RECEIPT_DATE,
               ES.ADVERTISING_DATE,
               ES.OFFER_RECEIPT_DATE,
               ES.TEAC_MEETING_DATE,
               ES.OFFER_END_DATE,
               ES.OFFER_WITHDRAWAL_DATE
        FROM THE.EXPORT_SCHEDULE ES
        WHERE ES.APPLICATION_RECEIPT_DATE > TRUNC(SYSDATE)
        ORDER BY ES.ADVERTISING_DATE
      )
      WHERE ROWNUM <= 2
      """;

  public static final String SCHEDULE_BY_APPLICATION =
      """
      SELECT S.EXPORT_SCHEDULE_ID,
             S.APPLICATION_RECEIPT_DATE,
             S.ADVERTISING_DATE,
             S.OFFER_RECEIPT_DATE,
             S.TEAC_MEETING_DATE,
             S.OFFER_END_DATE,
             S.OFFER_WITHDRAWAL_DATE
      FROM THE.EXPORT_SCHEDULE S
      INNER JOIN THE.EXPORT_EXEMPTION_APPLICATION EEA
        ON EEA.EXPORT_SCHEDULE_ID = S.EXPORT_SCHEDULE_ID
      WHERE EEA.APPLICATION_NUMBER = ?
      """;

  private LexisScheduleQueries() {}
}

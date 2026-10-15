package ca.bc.gov.mof.lexis.repository.application;

/** Direct equivalents of the legacy application remark reads. */
public final class LexisRemarkQueries {

  private static final String REMARKS =
      """
      SELECT R.EXPORT_EXMPTN_APPL_REMARK_NMBR,
             R.REMARK_DATE,
             R.REMARK,
             R.ENTRY_USERID,
             R.ENTRY_TIMESTAMP,
             R.UPDATE_USERID,
             R.UPDATE_TIMESTAMP,
             R.APPLICATION_NUMBER
      FROM THE.EXPORT_EXEMPTION_APP_REMARKS R
      """;

  // A remark number is unique only within its application.
  public static final String REMARK_BY_APPLICATION_AND_NUMBER =
      REMARKS + " WHERE R.APPLICATION_NUMBER = ? AND R.EXPORT_EXMPTN_APPL_REMARK_NMBR = ?";

  // The legacy cursor has no defined row order; callers retain their existing selection.
  public static final String REMARKS_BY_APPLICATION =
      REMARKS + " WHERE R.APPLICATION_NUMBER = ?";

  public static final String REMARK_NUMBER_APPLICATION_COUNT =
      """
      SELECT COUNT(DISTINCT R.APPLICATION_NUMBER) AS APPLICATION_COUNT
      FROM THE.EXPORT_EXEMPTION_APP_REMARKS R
      WHERE R.EXPORT_EXMPTN_APPL_REMARK_NMBR = ?
      """;

  private LexisRemarkQueries() {}
}

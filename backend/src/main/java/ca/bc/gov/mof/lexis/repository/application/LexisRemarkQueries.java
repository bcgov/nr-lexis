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

  // The legacy cursors have no defined row order; callers retain their existing selection.
  public static final String REMARK_BY_NUMBER =
      REMARKS + " WHERE R.EXPORT_EXMPTN_APPL_REMARK_NMBR = ?";

  public static final String REMARKS_BY_APPLICATION =
      REMARKS + " WHERE R.APPLICATION_NUMBER = ?";

  private LexisRemarkQueries() {}
}

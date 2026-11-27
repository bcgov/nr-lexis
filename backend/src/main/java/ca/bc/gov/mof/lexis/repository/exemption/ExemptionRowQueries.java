package ca.bc.gov.mof.lexis.repository.exemption;

/** Direct equivalents of LEXIS exemption cursors. */
public final class ExemptionRowQueries {

  /**
   * The exemption columns of LEXIS.FIND_EXEMPTION_BY_NUMBER, which also aggregates every linked
   * application, package and scale row. The inner join keeps the cursor's filter: an exemption
   * with an unknown status has no row.
   */
  public static final String EXEMPTION_BY_NUMBER =
      """
      SELECT
        EE.EXEMPTION_NUMBER,
        EE.APPROVED_VOLUME,
        EE.APPROVAL_DATE,
        EE.EXPIRY_DATE,
        EE.OTHER_CONDITIONS,
        EE.EXPORT_EXEMPTION_TYPE_CODE,
        EE.EXPORT_EXEMPTION_STATUS_CODE,
        EE.ENTRY_USERID,
        EE.ENTRY_TIMESTAMP,
        EE.UPDATE_USERID,
        EE.UPDATE_TIMESTAMP
      FROM EXPORT_EXEMPTION EE
      INNER JOIN EXPORT_EXEMPTION_STATUS_CODE EESC
        ON EESC.EXPORT_EXEMPTION_STATUS_CODE = EE.EXPORT_EXEMPTION_STATUS_CODE
      WHERE EE.EXEMPTION_NUMBER = ?
      """;

  private ExemptionRowQueries() {}
}

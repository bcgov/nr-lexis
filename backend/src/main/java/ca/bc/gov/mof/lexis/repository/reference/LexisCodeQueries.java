package ca.bc.gov.mof.lexis.repository.reference;

/** Direct equivalents of selected reference-code reads in THE.LEXIS_CODES. */
public final class LexisCodeQueries {

  // Attachment types deliberately include historical codes and have no defined row order.
  public static final String ATTACHMENT_TYPES =
      """
      SELECT C.EXPORT_ATTACHMENT_TYPE_CODE AS CODE,
             C.DESCRIPTION,
             C.EFFECTIVE_DATE,
             C.EXPIRY_DATE,
             C.UPDATE_TIMESTAMP,
             NULL AS ORDER_BY,
             NULL AS GROUP_BY
      FROM THE.EXPORT_ATTACHMENT_TYPE_CODE C
      """;

  public static final String ATTACHMENT_TYPE_BY_CODE =
      ATTACHMENT_TYPES + " WHERE C.EXPORT_ATTACHMENT_TYPE_CODE = ?";

  public static final String ACTIVE_TRANSPORT_TYPES =
      """
      SELECT C.EXPORT_TRANSPORT_TYPE_CODE AS CODE,
             C.DESCRIPTION,
             C.EFFECTIVE_DATE,
             C.EXPIRY_DATE,
             C.UPDATE_TIMESTAMP,
             O.ORDER_BY,
             O.GROUP_BY
      FROM THE.EXPORT_TRANSPORT_TYPE_CODE C
      INNER JOIN THE.EXPORT_TRNSPRT_TYPE_CODE_ORDER O
        ON O.EXPORT_TRANSPORT_TYPE_CODE = C.EXPORT_TRANSPORT_TYPE_CODE
      WHERE SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE
      ORDER BY O.GROUP_BY, O.ORDER_BY
      """;

  public static final String ACTIVE_GROWTH_TYPES =
      """
      SELECT C.EXPORT_GROWTH_TYPE_CODE AS CODE,
             C.DESCRIPTION,
             C.EFFECTIVE_DATE,
             C.EXPIRY_DATE,
             C.UPDATE_TIMESTAMP,
             O.ORDER_BY,
             O.GROUP_BY
      FROM THE.EXPORT_GROWTH_TYPE_CODE C
      INNER JOIN THE.EXPORT_GROWTH_TYPE_CODE_ORDER O
        ON O.EXPORT_GROWTH_TYPE_CODE = C.EXPORT_GROWTH_TYPE_CODE
      WHERE SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE
      ORDER BY O.GROUP_BY, O.ORDER_BY
      """;

  private static final String PORT_SELECT =
      """
      SELECT C.EXPORT_PORT_OF_EXPORT_CODE AS CODE,
             C.DESCRIPTION,
             C.EFFECTIVE_DATE,
             C.EXPIRY_DATE,
             C.UPDATE_TIMESTAMP,
             NULL AS ORDER_BY,
             NULL AS GROUP_BY
      FROM THE.EXPORT_PORT_OF_EXPORT_CODE C
      """;

  public static final String ACTIVE_PORTS =
      PORT_SELECT + " WHERE SYSDATE BETWEEN C.EFFECTIVE_DATE AND C.EXPIRY_DATE";

  // Unlike the active list, the legacy detail lookup also accepts historical port codes.
  // Preserve FIND_PORT_CODE's equality predicate; it does not normalize case with UPPER.
  public static final String PORT_BY_CODE =
      PORT_SELECT + " WHERE C.EXPORT_PORT_OF_EXPORT_CODE = ?";

  private LexisCodeQueries() {}
}

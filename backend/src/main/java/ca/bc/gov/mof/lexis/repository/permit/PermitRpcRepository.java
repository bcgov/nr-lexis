package ca.bc.gov.mof.lexis.repository.permit;

import static ca.bc.gov.mof.lexis.util.ValueUtils.coalesce;
import static ca.bc.gov.mof.lexis.util.ValueUtils.firstNonNull;

import ca.bc.gov.mof.lexis.repository.oracle.OracleRepositorySupport;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.CallableStatementCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@Profile("oracle")
public class PermitRpcRepository extends OracleRepositorySupport {

  private static final int ORACLE_NO_DATA_FOUND = 1403;
  private static final String FIND_SCALE_DETAIL_BY_PACKAGE =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PKG(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_APP(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_ID(?,?)";
  private static final String FIND_SCALE_DETAIL_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_SCALE_DETAIL_BY_PRM(?,?)";
  private static final String FIND_PACKAGES_BY_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_PERMIT(?,?)";
  private static final String FIND_PACKAGES_BY_OIC_PERMIT =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_OIC_PERMIT(?,?)";
  private static final String CORE_PACKAGE_SELECT =
      """
      SELECT
        P.PACKAGE_NUMBER,
        P.APPLICATION_NUMBER,
        P.PACKAGE_VOLUME,
        P.AVERAGE_LENGTH,
        P.AVERAGE_DIAMETER,
        P.EXPORT_PACKAGE_STATUS_CODE,
        P.COMMENTS,
        P.PACKAGE_REPROCESSED_INDICATOR,
        P.EXPORT_GROWTH_TYPE_CODE,
        P.EXPORT_PRODUCT_TYPE_CODE,
        CASE WHEN EXISTS (
          SELECT 1
          FROM EXPORT_SCALE_DETAIL ASSIGNED_SCALE
          WHERE ASSIGNED_SCALE.PACKAGE_NUMBER = P.PACKAGE_NUMBER
            AND ASSIGNED_SCALE.EXPORT_PERMIT_DETAIL_NUMBER = ?
        ) THEN 1 ELSE 0 END AS ASSIGNED_TO_PERMIT,
        EEA.EXEMPTION_NUMBER,
        EEA.ORG_UNIT_NO,
        OU.ORG_UNIT_NAME AS REGION,
        EEA.EXPORT_PRODUCT_TYPE_CODE AS APPLICATION_PRODUCT_TYPE_CODE,
        EEA.EXPORT_GROWTH_TYPE_CODE AS APPLICATION_GROWTH_TYPE_CODE,
        EEA.OWNER_CLIENT_NUMBER,
        EEA.OWNER_CLIENT_LOCATION_CODE,
        EEA.AGENT_CLIENT_NUMBER,
        EEA.AGENT_CLIENT_LOCATION_CODE,
        EEA.OIC_INDICATOR,
        EEA.EXPORT_JURISDICTION_CODE,
        EE.EXPORT_EXEMPTION_TYPE_CODE,
        APTC.DESCRIPTION AS APPLICATION_PRODUCT_TYPE_DESCRIPTION,
        PPTC.DESCRIPTION AS PACKAGE_PRODUCT_TYPE_DESCRIPTION,
        AGTC.DESCRIPTION AS APPLICATION_GROWTH_TYPE_DESCRIPTION,
        PGTC.DESCRIPTION AS PACKAGE_GROWTH_TYPE_DESCRIPTION,
        EPSC.DESCRIPTION AS PACKAGE_STATUS_DESCRIPTION
      FROM EXPORT_PACKAGE P
      LEFT JOIN EXPORT_EXEMPTION_APPLICATION EEA
        ON EEA.APPLICATION_NUMBER = P.APPLICATION_NUMBER
      LEFT JOIN EXPORT_EXEMPTION EE
        ON EE.EXEMPTION_NUMBER = EEA.EXEMPTION_NUMBER
      LEFT JOIN ORG_UNIT OU
        ON OU.ORG_UNIT_NO = EEA.ORG_UNIT_NO
      LEFT JOIN EXPORT_PRODUCT_TYPE_CODE APTC
        ON APTC.EXPORT_PRODUCT_TYPE_CODE = EEA.EXPORT_PRODUCT_TYPE_CODE
      LEFT JOIN EXPORT_PRODUCT_TYPE_CODE PPTC
        ON PPTC.EXPORT_PRODUCT_TYPE_CODE = P.EXPORT_PRODUCT_TYPE_CODE
      LEFT JOIN EXPORT_GROWTH_TYPE_CODE AGTC
        ON AGTC.EXPORT_GROWTH_TYPE_CODE = EEA.EXPORT_GROWTH_TYPE_CODE
      LEFT JOIN EXPORT_GROWTH_TYPE_CODE PGTC
        ON PGTC.EXPORT_GROWTH_TYPE_CODE = P.EXPORT_GROWTH_TYPE_CODE
      LEFT JOIN EXPORT_PACKAGE_STATUS_CODE EPSC
        ON EPSC.EXPORT_PACKAGE_STATUS_CODE = P.EXPORT_PACKAGE_STATUS_CODE
      """;
  private static final String FIND_CORE_PACKAGES_BY_PERMIT =
      CORE_PACKAGE_SELECT
          + " WHERE EXISTS ("
          + "SELECT 1 FROM EXPORT_SCALE_DETAIL TARGET_SCALE "
          + "WHERE TARGET_SCALE.PACKAGE_NUMBER = P.PACKAGE_NUMBER "
          + "AND TARGET_SCALE.EXPORT_PERMIT_DETAIL_NUMBER = ?)"
          + " ORDER BY P.PACKAGE_NUMBER";
  private static final String FIND_CORE_PACKAGES_BY_OIC_PERMIT =
      CORE_PACKAGE_SELECT
          + " WHERE EXISTS ("
          + "SELECT 1 FROM EXPORT_PERMIT_DETAIL TARGET_PERMIT "
          + "WHERE TARGET_PERMIT.EXPORT_PERMIT_DETAIL_NUMBER = ? "
          + "AND TARGET_PERMIT.OIC_APPLICATION_NUMBER = P.APPLICATION_NUMBER)"
          + " OR EXISTS ("
          + "SELECT 1 FROM EXPORT_SCALE_DETAIL TARGET_SCALE "
          + "WHERE TARGET_SCALE.PACKAGE_NUMBER = P.PACKAGE_NUMBER "
          + "AND TARGET_SCALE.EXPORT_PERMIT_DETAIL_NUMBER = ?)"
          + " ORDER BY P.PACKAGE_NUMBER";
  private static final String CORE_SCALE_SELECT =
      """
      SELECT
        SD.EXPORT_SCALE_DETAIL_ID,
        SD.PIECES_COUNT,
        SD.SPECIES_GRADE_VOLUME,
        SD.TIMBER_MARK,
        SD.EXPORT_SPECIES_CODE,
        SD.EXPORT_GRADE_CODE,
        P.APPLICATION_NUMBER,
        SD.PACKAGE_NUMBER,
        SD.EXPORT_PERMIT_DETAIL_NUMBER,
        TM.CASCADE_SPLIT_CODE,
        SD.ESTIMATED_WINNING_BID AS EWB,
        SD.FEE_IN_LIEU AS FIL,
        SD.MULTIPLICATION_FACTOR AS MF,
        ESC.DESCRIPTION AS SPECIES_DESCRIPTION,
        EGC.DESCRIPTION AS GRADE_DESCRIPTION
      FROM EXPORT_SCALE_DETAIL SD
      INNER JOIN EXPORT_PACKAGE P
        ON P.PACKAGE_NUMBER = SD.PACKAGE_NUMBER
      LEFT JOIN TIMBER_MARK TM
        ON TM.TIMBER_MARK = SD.TIMBER_MARK
      LEFT JOIN EXPORT_SPECIES_CODE ESC
        ON ESC.EXPORT_SPECIES_CODE = SD.EXPORT_SPECIES_CODE
      LEFT JOIN EXPORT_GRADE_CODE EGC
        ON EGC.EXPORT_GRADE_CODE = SD.EXPORT_GRADE_CODE
      WHERE SD.PACKAGE_NUMBER IN (%s)
      """;
  private static final String FIND_PERMIT_FEE_SCALE_ROWS =
      """
      WITH SCALE_CONTEXT AS (
        SELECT
          SD.EXPORT_SCALE_DETAIL_ID,
          SD.PIECES_COUNT,
          SD.SPECIES_GRADE_VOLUME,
          SD.TIMBER_MARK,
          SD.EXPORT_SPECIES_CODE,
          SD.EXPORT_GRADE_CODE,
          NVL(SD.EXPORT_GRADE_CODE, ' ') AS AMV_GRADE_CODE,
          P.APPLICATION_NUMBER,
          SD.PACKAGE_NUMBER,
          SD.EXPORT_PERMIT_DETAIL_NUMBER,
          TM.CASCADE_SPLIT_CODE,
          SD.ESTIMATED_WINNING_BID AS EWB,
          SD.FEE_IN_LIEU AS FIL,
          SD.MULTIPLICATION_FACTOR AS MF,
          EEA.EXPORT_PRODUCT_TYPE_CODE AS APPLICATION_PRODUCT_TYPE_CODE,
          ESC.DESCRIPTION AS SPECIES_DESCRIPTION,
          EGC.DESCRIPTION AS GRADE_DESCRIPTION,
          P.EXPORT_GROWTH_TYPE_CODE AS PACKAGE_GROWTH_TYPE_CODE,
          EGTC.DESCRIPTION AS PACKAGE_GROWTH_TYPE_DESCRIPTION,
          EPD.APPLICATION_DATE AS PERMIT_APPLICATION_DATE,
          CASE
            WHEN P.APPLICATION_NUMBER IS NULL THEN EPD.EXPORT_GROWTH_TYPE_CODE
            ELSE EEA.EXPORT_GROWTH_TYPE_CODE
          END AS AMV_GROWTH_TYPE_CODE
        FROM EXPORT_SCALE_DETAIL SD
        INNER JOIN EXPORT_PACKAGE P
          ON P.PACKAGE_NUMBER = SD.PACKAGE_NUMBER
        INNER JOIN EXPORT_PERMIT_DETAIL EPD
          ON EPD.EXPORT_PERMIT_DETAIL_NUMBER = SD.EXPORT_PERMIT_DETAIL_NUMBER
        LEFT JOIN EXPORT_EXEMPTION_APPLICATION EEA
          ON EEA.APPLICATION_NUMBER = P.APPLICATION_NUMBER
        LEFT JOIN TIMBER_MARK TM
          ON TM.TIMBER_MARK = SD.TIMBER_MARK
        LEFT JOIN EXPORT_SPECIES_CODE ESC
          ON ESC.EXPORT_SPECIES_CODE = SD.EXPORT_SPECIES_CODE
        LEFT JOIN EXPORT_GRADE_CODE EGC
          ON EGC.EXPORT_GRADE_CODE = SD.EXPORT_GRADE_CODE
        LEFT JOIN EXPORT_GROWTH_TYPE_CODE EGTC
          ON EGTC.EXPORT_GROWTH_TYPE_CODE = P.EXPORT_GROWTH_TYPE_CODE
        WHERE SD.EXPORT_PERMIT_DETAIL_NUMBER = ?
      ),
      SCALE_AMV_DATE AS (
        SELECT
          SC.EXPORT_SCALE_DETAIL_ID,
          MAX(ELA.EFFECTIVE_DATE) AS EFFECTIVE_DATE
        FROM SCALE_CONTEXT SC
        LEFT JOIN EXPORT_LOG_AMV ELA
          ON ELA.EXPORT_SPECIES_CODE = SC.EXPORT_SPECIES_CODE
          AND ELA.EXPORT_GRADE_CODE = SC.AMV_GRADE_CODE
          AND ELA.EFFECTIVE_DATE <= SC.PERMIT_APPLICATION_DATE
        GROUP BY SC.EXPORT_SCALE_DETAIL_ID
      )
      SELECT DISTINCT
        SC.EXPORT_SCALE_DETAIL_ID,
        SC.PIECES_COUNT,
        SC.SPECIES_GRADE_VOLUME,
        SC.TIMBER_MARK,
        SC.EXPORT_SPECIES_CODE,
        SC.EXPORT_GRADE_CODE,
        SC.APPLICATION_NUMBER,
        SC.PACKAGE_NUMBER,
        SC.EXPORT_PERMIT_DETAIL_NUMBER,
        SC.CASCADE_SPLIT_CODE,
        SC.EWB,
        SC.FIL,
        SC.MF,
        SC.APPLICATION_PRODUCT_TYPE_CODE,
        SC.SPECIES_DESCRIPTION,
        SC.GRADE_DESCRIPTION,
        SC.PACKAGE_GROWTH_TYPE_CODE,
        SC.PACKAGE_GROWTH_TYPE_DESCRIPTION,
        ELA.AVERAGE_MARKET_PRICE
      FROM SCALE_CONTEXT SC
      LEFT JOIN SCALE_AMV_DATE SAD
        ON SAD.EXPORT_SCALE_DETAIL_ID = SC.EXPORT_SCALE_DETAIL_ID
      LEFT JOIN EXPORT_LOG_AMV ELA
        ON ELA.EFFECTIVE_DATE = SAD.EFFECTIVE_DATE
        AND ELA.EFFECTIVE_DATE <= TRUNC(SC.PERMIT_APPLICATION_DATE, 'MONTH')
        AND ELA.EXPORT_SPECIES_CODE = SC.EXPORT_SPECIES_CODE
        AND ELA.EXPORT_GRADE_CODE = SC.AMV_GRADE_CODE
        AND ELA.EXPORT_GROWTH_TYPE_CODE = SC.AMV_GROWTH_TYPE_CODE
      ORDER BY SC.PACKAGE_NUMBER, SC.TIMBER_MARK, SC.EXPORT_GRADE_CODE
      """;
  private static final String PACKAGE_BELONGS_TO_PERMIT =
      """
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM EXPORT_PACKAGE P
          LEFT JOIN EXPORT_EXEMPTION_APPLICATION EEA
            ON EEA.APPLICATION_NUMBER = P.APPLICATION_NUMBER
          LEFT JOIN EXPORT_PERMIT_DETAIL EPD
            ON EPD.OIC_APPLICATION_NUMBER = EEA.APPLICATION_NUMBER
          LEFT JOIN EXPORT_SCALE_DETAIL ESD
            ON ESD.PACKAGE_NUMBER = P.PACKAGE_NUMBER
          WHERE P.PACKAGE_NUMBER = ?
            AND (
              EPD.EXPORT_PERMIT_DETAIL_NUMBER = ?
              OR ESD.EXPORT_PERMIT_DETAIL_NUMBER = ?
            )
        ) THEN 1
        ELSE 0
      END
      FROM DUAL
      """;
  private static final String LINKED_PROVINCIAL_APPLICATION_BELONGS_TO_CLIENT =
      """
      SELECT CASE
        WHEN EXISTS (
          SELECT 1
          FROM EXPORT_SCALE_DETAIL ESD
          INNER JOIN EXPORT_PACKAGE P
            ON P.PACKAGE_NUMBER = ESD.PACKAGE_NUMBER
          INNER JOIN EXPORT_EXEMPTION_APPLICATION EEA
            ON EEA.APPLICATION_NUMBER = P.APPLICATION_NUMBER
          WHERE ESD.EXPORT_PERMIT_DETAIL_NUMBER = ?
            AND EEA.EXPORT_JURISDICTION_CODE = 'P'
            AND (
              EEA.OWNER_CLIENT_NUMBER = ?
              OR EEA.AGENT_CLIENT_NUMBER = ?
            )
        ) THEN 1
        ELSE 0
      END
      FROM DUAL
      """;
  private static final String FIND_PACKAGES_BY_APPLICATION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_APP(?,?)";
  private static final String FIND_PACKAGES_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGES_BY_EXMP(?,?)";
  private static final String FIND_PACKAGE_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_PACKAGE_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_NUMBER(?,?)";
  private static final String FIND_APPLICATION_BY_EXEMPTION =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPLICATION_BY_EXEMPTION(?,?)";
  private static final String FIND_END_USE_BY_APP = LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_APP(?,?)";
  private static final String FIND_END_USE_BY_PACK = LEXIS_GROUP_5_PACKAGE + "FIND_END_USE_BY_PACK(?,?)";
  private static final String FIND_PERMIT_DETAIL_BY_ID =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_DET_BY_ID(?,?)";
  private static final String FIND_PERMIT_FEE_OVERRIDE =
      "SELECT OVERRIDE_FEE, OVERRIDE_COMMENT "
          + "FROM EXPORT_PERMIT_DETAIL "
          + "WHERE EXPORT_PERMIT_DETAIL_NUMBER = ?";
  private static final String FIND_EXEMPTION_BY_NUMBER =
      LEXIS_GROUP_5_PACKAGE + "FIND_EXEMPTION_BY_NUMBER(?,?)";
  private static final String FIND_PERMIT_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_FILE_DETAILS(?,?)";
  private static final String FIND_PERMIT_FILE_ATTACHMENT =
      LEXIS_GROUP_5_PACKAGE + "FIND_PERMIT_FILE_ATTACHMENT(?,?)";
  private static final String FIND_APPLICATION_FILE_DETAILS =
      LEXIS_GROUP_5_PACKAGE + "FIND_APPL_FILE_DETAILS(?,?)";
  private static final String FIND_PERMIT_DOCUMENT_CONTEXT_ROWS =
      """
      WITH PERMIT_APPLICATIONS AS (
        SELECT DISTINCT P.APPLICATION_NUMBER
        FROM EXPORT_SCALE_DETAIL SD
        INNER JOIN EXPORT_PACKAGE P
          ON P.PACKAGE_NUMBER = SD.PACKAGE_NUMBER
        WHERE SD.EXPORT_PERMIT_DETAIL_NUMBER = ?
      ),
      PERMIT_ATTACHMENT_REFERENCES AS (
        SELECT
          EPFA.EXPORT_ATTACHMENT_ID,
          EPFA.EXPORT_PERMIT_DETAIL_NUMBER,
          1 AS HAS_PERMIT_RELATIONSHIP
        FROM EXPORT_PERMIT_FILE_ATTACHMENT EPFA
        WHERE EPFA.EXPORT_PERMIT_DETAIL_NUMBER = ?
        UNION ALL
        SELECT
          ESIFA.EXPORT_ATTACHMENT_ID,
          ESIFA.EXPORT_PERMIT_DETAIL_NUMBER,
          0 AS HAS_PERMIT_RELATIONSHIP
        FROM EXPORT_SALES_INVCE_FILE_ATTACH ESIFA
        WHERE ESIFA.EXPORT_PERMIT_DETAIL_NUMBER = ?
      ),
      PERMIT_ATTACHMENTS AS (
        SELECT
          EXPORT_ATTACHMENT_ID,
          EXPORT_PERMIT_DETAIL_NUMBER,
          MAX(HAS_PERMIT_RELATIONSHIP) AS HAS_PERMIT_RELATIONSHIP
        FROM PERMIT_ATTACHMENT_REFERENCES
        GROUP BY EXPORT_ATTACHMENT_ID, EXPORT_PERMIT_DETAIL_NUMBER
      ),
      DOCUMENT_REFERENCES AS (
        SELECT
          PA.EXPORT_ATTACHMENT_ID,
          CAST(NULL AS NUMBER(10)) AS SOURCE_APPLICATION_NUMBER,
          PA.EXPORT_PERMIT_DETAIL_NUMBER AS SOURCE_PERMIT_NUMBER,
          PA.HAS_PERMIT_RELATIONSHIP,
          0 AS SOURCE_ORDER
        FROM PERMIT_ATTACHMENTS PA
        UNION ALL
        SELECT DISTINCT
          EAFA.EXPORT_ATTACHMENT_ID,
          PA.APPLICATION_NUMBER AS SOURCE_APPLICATION_NUMBER,
          CAST(NULL AS NUMBER(10)) AS SOURCE_PERMIT_NUMBER,
          -1 AS HAS_PERMIT_RELATIONSHIP,
          1 AS SOURCE_ORDER
        FROM PERMIT_APPLICATIONS PA
        INNER JOIN EXPORT_APPL_FILE_ATTCHMNT EAFA
          ON EAFA.APPLICATION_NUMBER = PA.APPLICATION_NUMBER
        WHERE PA.APPLICATION_NUMBER IS NOT NULL
          AND PA.APPLICATION_NUMBER > 0
      )
      SELECT
        EFA.EXPORT_ATTACHMENT_ID,
        EFA.FILE_NAME,
        EFA.DESCRIPTION,
        EFA.EXPORT_ATTACHMENT_TYPE_CODE,
        EATC.DESCRIPTION AS ATTACHMENT_TYPE_DESCRIPTION,
        CASE
          WHEN DR.SOURCE_ORDER = 1 THEN 'application'
          WHEN DR.HAS_PERMIT_RELATIONSHIP = 1
            AND EFA.EXPORT_ATTACHMENT_TYPE_CODE = 'PMT' THEN 'permit'
          WHEN DR.HAS_PERMIT_RELATIONSHIP = 0
            AND EFA.EXPORT_ATTACHMENT_TYPE_CODE = 'INV' THEN 'invoice'
          ELSE 'unknown'
        END AS DOCUMENT_SOURCE,
        DR.SOURCE_APPLICATION_NUMBER,
        DR.SOURCE_PERMIT_NUMBER,
        CASE
          WHEN DR.SOURCE_ORDER = 0
            AND (
              (DR.HAS_PERMIT_RELATIONSHIP = 1
                AND EFA.EXPORT_ATTACHMENT_TYPE_CODE = 'PMT')
              OR (DR.HAS_PERMIT_RELATIONSHIP = 0
                AND EFA.EXPORT_ATTACHMENT_TYPE_CODE = 'INV')
            ) THEN 1
          ELSE 0
        END AS DELETABLE,
        DR.SOURCE_ORDER
      FROM DOCUMENT_REFERENCES DR
      INNER JOIN EXPORT_FILE_ATTACHMENT EFA
        ON EFA.EXPORT_ATTACHMENT_ID = DR.EXPORT_ATTACHMENT_ID
      LEFT JOIN EXPORT_ATTACHMENT_TYPE_CODE EATC
        ON EATC.EXPORT_ATTACHMENT_TYPE_CODE = EFA.EXPORT_ATTACHMENT_TYPE_CODE
      UNION ALL
      SELECT
        0 AS EXPORT_ATTACHMENT_ID,
        CAST(NULL AS VARCHAR2(250)) AS FILE_NAME,
        CAST(NULL AS VARCHAR2(250)) AS DESCRIPTION,
        CAST(NULL AS VARCHAR2(3)) AS EXPORT_ATTACHMENT_TYPE_CODE,
        CAST(NULL AS VARCHAR2(120)) AS ATTACHMENT_TYPE_DESCRIPTION,
        'INVALID_APPLICATION_RELATIONSHIP' AS DOCUMENT_SOURCE,
        CAST(NULL AS NUMBER(10)) AS SOURCE_APPLICATION_NUMBER,
        CAST(NULL AS NUMBER(10)) AS SOURCE_PERMIT_NUMBER,
        0 AS DELETABLE,
        2 AS SOURCE_ORDER
      FROM DUAL
      WHERE EXISTS (
        SELECT 1
        FROM PERMIT_APPLICATIONS PA
        WHERE PA.APPLICATION_NUMBER IS NULL OR PA.APPLICATION_NUMBER < 1
      )
      ORDER BY SOURCE_ORDER, SOURCE_APPLICATION_NUMBER, EXPORT_ATTACHMENT_ID
      """;
  private static final String FIND_INVOICE_BY_ID = LEXIS_GROUP_5_PACKAGE + "FIND_INVOICE_BY_ID(?,?,?)";
  private static final String FIND_INVOICES_BY_PERMIT = LEXIS_GROUP_5_PACKAGE + "FIND_INVOICES_BY_PERMIT(?,?)";
  private static final String INSERT_PERMIT_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "INSERT_PERMIT_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_PERMIT_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_PERMIT_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String UPDATE_SCALE =
      LEXIS_GROUP_9_PACKAGE + "UPDATE_SCALE(?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String INSERT_SCALE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "INSERT_SCALE_DETAIL(?,?,?,?,?,?,?,?,?,?,?,?,?)";
  private static final String DELETE_SCALE_DETAIL =
      LEXIS_GROUP_9_PACKAGE + "DELETE_SCALE_DETAIL(?,?)";
  private static final String INSERT_SALES_INVOICE =
      LEXIS_GROUP_9_PACKAGE + "INSERT_SALES_INVOICE(?,?,?,?,?,?,?,?,?,?)";
  private static final String FIND_FILE_ATTACHMENT = LEXIS_GROUP_5_PACKAGE + "FIND_FILE_ATTACHMENT(?,?)";
  private static final String FIND_GBMS_INVOICE_HISTORY =
      LEXIS_GROUP_9_PACKAGE + "FIND_GBMS_INVOICE_HISTORY(?,?,?)";
  private static final String FIND_GBMS_INVOICE_HISTORY_READ_ONLY =
      LEXIS_READ_ONLY_PACKAGE + "FIND_GBMS_INVOICE_HISTORY(?,?,?)";
  private static final String IS_APP_UNMANU = LEXIS_GROUP_5_PACKAGE + "IS_APP_UMANU(?,?)";
  private static final String GET_POLICY_FACTOR = LEXIS_GROUP_5_PACKAGE + "GET_POLICY_FACTOR(?,?,?)";
  private static final String DELETE_PERMIT_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_PERMIT_FILE_ATTACHMENT(?)";
  private static final String DELETE_APPLICATION_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_APPL_FILE_ATTACHMENT(?)";
  private static final String DELETE_INVOICE_FILE_ATTACHMENT =
      LEXIS_GROUP_9_PACKAGE + "DELETE_INVOICE_FILE_ATTACHMENT(?)";

  private static final String FIND_SPECIES_CODE = LEXIS_CODES_PACKAGE + "FIND_SPECIES_CODE(?,?)";
  private static final String FIND_GRADE_CODE = LEXIS_CODES_PACKAGE + "FIND_GRADE_CODE(?,?)";
  private static final String FIND_GROWTH_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_GROWTH_TYPE_CODE(?,?)";
  private static final String FIND_PACKAGE_STATUS_CODE =
      LEXIS_CODES_PACKAGE + "FIND_PACKAGE_STATUS_CODE(?,?)";
  private static final String FIND_PRODUCT_TYPE_CODE = LEXIS_CODES_PACKAGE + "FIND_PRODUCT_TYPE_CODE(?,?)";
  private static final String FIND_VALID_BOIC_TIMBER_MARK =
      LEXIS_CODES_PACKAGE + "FIND_VALID_BOIC_TIMBER_MARK(?,?,?)";
  private static final String FIND_CANDIDATE_EXCOL_VALUES =
      LEXIS_CODES_PACKAGE + "FIND_CANDIDATE_EXCOL_VALUES(?,?,?,?,?)";
  private static final String FIND_RATE_BY_EXEMPTION = LEXIS_CODES_PACKAGE + "FIND_RATE_BY_EXEMPTION(?,?)";
  private static final String FIND_LOG_AMV_BY_SCALE = LEXIS_CODES_PACKAGE + "FIND_LOG_AMV(?,?)";
  private static final String FIND_CONVERSION_FOR_DATE =
      LEXIS_CODES_PACKAGE + "FIND_CONVERSION_FOR_DATE(?,?,?)";
  private static final String FIND_ALL_COUNTRY_CODES = LEXIS_CODES_PACKAGE + "FIND_ALL_COUNTRY_CODES(?)";
  private static final String FIND_COUNTRY_CODE = LEXIS_CODES_PACKAGE + "FIND_COUNTRY_CODE(?,?)";
  private static final String FIND_PORT_CODE = LEXIS_CODES_PACKAGE + "FIND_PORT_CODE(?,?)";
  private static final String FIND_PERMIT_STATUS_CODE =
      LEXIS_CODES_PACKAGE + "FIND_PERMIT_STATUS_CODE(?,?)";
  private static final String FIND_SCALE_METHOD_CODE =
      LEXIS_CODES_PACKAGE + "FIND_SCALE_METHOD_CODE(?,?)";
  private static final String FIND_TRANSPORT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_TRANSPORT_TYPE_CODE(?,?)";
  private static final String FIND_ALL_ATTACHMENT_TYPE_CODES =
      LEXIS_CODES_PACKAGE + "FIND_ALL_ATTACH_CODES(?)";
  private static final String FIND_ATTACHMENT_TYPE_CODE =
      LEXIS_CODES_PACKAGE + "FIND_ATTACH_TYPE_CODE(?,?)";
  private static final String IS_PERMIT_MU44 = LEXIS_GROUP_5_PACKAGE + "IS_PERMIT_MU44(?,?)";

  public PermitRpcRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
    super(jdbcTemplate);
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return queryCursorProcedureRequired(
        FIND_SCALE_DETAIL_BY_PERMIT,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        this::mapPermitScaleDetailRow);
  }

  /**
   * Loads all fee-display inputs for a permit in one query. The set-based AMV join deliberately
   * mirrors {@code LEXIS.FIND_LOG_AMV(scaleId)}, including its effective-month cutoff and growth
   * type selection.
   */
  public List<PermitFeeScaleRow> findPermitFeeScaleRows(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return jdbcTemplate.query(
        FIND_PERMIT_FEE_SCALE_ROWS,
        (rs, rowNumber) ->
            new PermitFeeScaleRow(
                mapPermitScaleDetailRow(rs),
                getString(rs, "APPLICATION_PRODUCT_TYPE_CODE"),
                getString(rs, "SPECIES_DESCRIPTION"),
                getString(rs, "GRADE_DESCRIPTION"),
                getString(rs, "PACKAGE_GROWTH_TYPE_CODE"),
                getString(rs, "PACKAGE_GROWTH_TYPE_DESCRIPTION"),
                rs.getBigDecimal("AVERAGE_MARKET_PRICE")),
        permitNumber);
  }

  /**
   * Returns all scale rows for an application using the same cursor as the legacy application
   * scale lookup. Core permit tabs group these rows by package so they do not issue one cursor
   * call per package.
   */
  public List<PermitScaleDetailRow> findPermitScaleDetailsByApplicationNumber(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return queryCursorProcedureRequired(
        FIND_SCALE_DETAIL_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapPermitScaleDetailRow);
  }

  public boolean hasApplicationForPermitCompletionRequired(Long permitNumber) {
    return !findApplicationNumbersByPermitNumberRequired(permitNumber).isEmpty();
  }

  public boolean hasPackageForPermitCompletionRequired(
      Long permitNumber, boolean blanketOic) {
    List<String> packageNumbers =
        blanketOic
            ? findPackageNumbersByOicPermitNumber(permitNumber)
            : findPackageNumbersByPermitNumberRequired(permitNumber);
    return !packageNumbers.isEmpty();
  }

  public boolean hasScaleForPermitCompletionRequired(Long permitNumber) {
    return !findScaleDetailsByPermitNumber(permitNumber).isEmpty();
  }

  public boolean isPermitMu44Required(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return false;
    }
    return queryCursorSingleRequired(
            IS_PERMIT_MU44,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> getLong(rs, "RESULTS_COUNT"))
        .map(value -> value > 0)
        .orElseThrow(
            () ->
                new DataRetrievalFailureException(
                    "Oracle MU44 permit lookup returned no result"));
  }

  public boolean isPermitStatusCodeValidRequired(String code) {
    return codeExistsRequired(FIND_PERMIT_STATUS_CODE, code);
  }

  public boolean isCountryCodeValidRequired(String code) {
    return codeExistsRequired(FIND_COUNTRY_CODE, code);
  }

  public boolean isPortCodeValidRequired(String code) {
    return codeExistsRequired(FIND_PORT_CODE, code);
  }

  public boolean isScaleMethodCodeValidRequired(String code) {
    return codeExistsRequired(FIND_SCALE_METHOD_CODE, code);
  }

  public boolean isTransportTypeCodeValidRequired(String code) {
    return codeExistsRequired(FIND_TRANSPORT_TYPE_CODE, code);
  }

  public Optional<ScaleMutationRow> findScaleMutationById(String scaleDetailId) {
    String normalizedScaleDetailId = trim(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_SCALE_DETAIL_BY_ID,
        cs -> cs.setString(1, normalizedScaleDetailId),
        2,
        this::mapScaleMutationRow);
  }

  public List<ScaleMutationRow> findScaleMutationDetailsByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureRequired(
        FIND_SCALE_DETAIL_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapScaleMutationRow);
  }

  public boolean updateScaleDetail(ScaleMutationRecord record, String updateUserId) {
    String normalizedUpdateUserId = trim(updateUserId);
    Long normalizedScaleDetailId = record == null ? null : parseLongOrNull(record.scaleDetailId());
    if (record == null || normalizedScaleDetailId == null || normalizedUpdateUserId == null) {
      return false;
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    executeProcedureRequired(
        UPDATE_SCALE,
        cs -> {
          cs.setLong(1, normalizedScaleDetailId);
          setLongOrNull(cs, 2, record.exportPermitDetailNumber());
          cs.setString(3, trim(record.timberMark()));
          setLongOrNull(cs, 4, record.piecesCount());
          setDoubleOrNull(cs, 5, record.speciesGradeVolume());
          cs.setString(6, trim(record.packageNumber()));
          cs.setString(7, trim(record.exportSpeciesCode()));
          cs.setString(8, trim(record.exportGradeCode()));
          cs.setString(9, auditUserOrDefault(record.entryUserId()));
          setTimestampOrNull(cs, 10, record.entryTimestamp());
          cs.setString(11, auditUserOrDefault(normalizedUpdateUserId));
          cs.setTimestamp(12, now);
        });
    return true;
  }

  public Optional<PermitScaleDetailRow> insertBoicScaleDetail(BoicScaleMutationRecord record) {
    if (record == null || trim(record.packageNumber()) == null || record.applicationNumber() == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        INSERT_SCALE_DETAIL,
        cs -> {
          cs.setString(1, trim(record.timberMark()));
          setLongOrNull(cs, 2, record.piecesCount());
          setDoubleOrNull(cs, 3, record.speciesGradeVolume());
          cs.setString(4, auditUserOrDefault(record.entryUserId()));
          setTimestampOrNull(cs, 5, record.entryTimestamp());
          setStringOrNull(cs, 6, null);
          setTimestampOrNull(cs, 7, null);
          cs.setString(8, trim(record.packageNumber()));
          cs.setString(9, trim(record.exportSpeciesCode()));
          cs.setString(10, trim(record.exportGradeCode()));
          setLongOrNull(cs, 11, record.exportPermitDetailNumber());
          setDoubleOrNull(cs, 12, record.exemptionOverrideRate());
        },
        13,
        this::mapPermitScaleDetailRow)
        .filter(
            row ->
                ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong(
                        row.exportScaleDetailId())
                    != null
                    && java.util.Objects.equals(
                        row.applicationNumber(), record.applicationNumber())
                    && java.util.Objects.equals(
                        ca.bc.gov.mof.lexis.util.ValueUtils.parsePositiveLong(
                            row.exportPermitDetailNumber()),
                        record.exportPermitDetailNumber())
                    && java.util.Objects.equals(
                        trim(row.packageNumber()), trim(record.packageNumber())));
  }

  public boolean deleteScaleDetailById(String scaleDetailId, String userId) {
    String normalizedScaleDetailId = trim(scaleDetailId);
    if (normalizedScaleDetailId == null) {
      return false;
    }

    executeProcedureRequired(
        DELETE_SCALE_DETAIL,
        cs -> {
          cs.setString(1, normalizedScaleDetailId);
          cs.setString(2, auditUserOrDefault(userId));
        });
    return true;
  }

  public List<String> findPackageNumbersByPermitNumber(Long permitNumber) {
    return findPackageNumbersByPermitNumber(permitNumber, false);
  }

  public List<String> findPackageNumbersByPermitNumberRequired(Long permitNumber) {
    return findPackageNumbersByPermitNumber(permitNumber, true);
  }

  private List<String> findPackageNumbersByPermitNumber(
      Long permitNumber, boolean required) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    List<String> packageNumbers =
        required
            ? queryCursorProcedureRequired(
                FIND_PACKAGES_BY_PERMIT,
                cs -> cs.setString(1, permitNumber.toString()),
                2,
                rs -> getString(rs, "PACKAGE_NUMBER"))
            : queryCursorProcedure(
                FIND_PACKAGES_BY_PERMIT,
                cs -> cs.setString(1, permitNumber.toString()),
                2,
                rs -> getString(rs, "PACKAGE_NUMBER"));
    return packageNumbers
        .stream()
        .filter(packageNumber -> packageNumber != null && !packageNumber.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  public List<String> findPackageNumbersByOicPermitNumber(Long oicPermitNumber) {
    if (oicPermitNumber == null || oicPermitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureRequired(
            FIND_PACKAGES_BY_OIC_PERMIT,
            cs -> cs.setString(1, oicPermitNumber.toString()),
            2,
            rs -> getString(rs, "PACKAGE_NUMBER"))
        .stream()
        .filter(packageNumber -> packageNumber != null && !packageNumber.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  /**
   * Reads the complete package cursor once for the normal permit core-tab response. It preserves
   * the same package relationship, package ordering, and invalid-application guard as the
   * existing package/application list methods.
   */
  public List<PermitCorePackageRow> findCorePackageRowsByPermitNumberRequired(Long permitNumber) {
    return findCorePackageRows(
        permitNumber, FIND_PACKAGES_BY_PERMIT, true, "permit " + permitNumber);
  }

  /** Reads the complete package cursor once for the Blanket OIC core-tab response. */
  public List<PermitCorePackageRow> findCorePackageRowsByOicPermitNumber(Long permitNumber) {
    return findCorePackageRows(
        permitNumber, FIND_PACKAGES_BY_OIC_PERMIT, false, "Blanket OIC permit " + permitNumber);
  }

  /**
   * Loads every package and its application/code context in one direct query. The result replaces
   * the package cursor plus one application and several code lookups per distinct application.
   */
  public List<PermitCorePackageContextRow> findCorePackageContexts(
      Long permitNumber, boolean blanketOic) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    String sql = blanketOic ? FIND_CORE_PACKAGES_BY_OIC_PERMIT : FIND_CORE_PACKAGES_BY_PERMIT;
    Object[] bindValues =
        blanketOic
            ? new Object[] {permitNumber, permitNumber, permitNumber}
            : new Object[] {permitNumber, permitNumber};
    List<PermitCorePackageContextRow> rows =
        jdbcTemplate.query(sql, (rs, rowNumber) -> mapPermitCorePackageContextRow(rs), bindValues);

    Map<String, PermitCorePackageContextRow> packagesByNumber = new TreeMap<>();
    for (PermitCorePackageContextRow row : rows) {
      String packageNumber = trim(row.packageRow().packageNumber());
      if (packageNumber == null) {
        continue;
      }
      PermitCorePackageRow normalizedPackage = row.packageRow().withPackageNumber(packageNumber);
      packagesByNumber.putIfAbsent(packageNumber, row.withPackageRow(normalizedPackage));
    }
    if (!blanketOic
        && packagesByNumber.values().stream()
            .anyMatch(row -> row.packageRow().applicationNumber() == null
                || row.packageRow().applicationNumber() < 1)) {
      throw new DataRetrievalFailureException(
          "An invalid application relationship was returned for permit " + permitNumber + ".");
    }
    return List.copyOf(packagesByNumber.values());
  }

  /** Loads all scale rows for the selected core-tab packages in one parameterized query. */
  public List<PermitCoreScaleRow> findCoreScaleRows(
      List<String> packageNumbers, Long permitNumber, boolean blanketOic) {
    List<String> normalizedPackages =
        packageNumbers == null
            ? List.of()
            : packageNumbers.stream()
                .map(this::trim)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    if (normalizedPackages.isEmpty() || permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    String sql = CORE_SCALE_SELECT.formatted(placeholders(normalizedPackages.size()));
    List<Object> bindValues = new ArrayList<>(normalizedPackages);
    if (!blanketOic) {
      sql += " AND (SD.EXPORT_PERMIT_DETAIL_NUMBER IS NULL "
          + "OR SD.EXPORT_PERMIT_DETAIL_NUMBER = ?)";
      bindValues.add(permitNumber);
    }
    sql += " ORDER BY SD.PACKAGE_NUMBER, SD.TIMBER_MARK, SD.EXPORT_GRADE_CODE";
    return jdbcTemplate.query(
        sql,
        (rs, rowNumber) ->
            new PermitCoreScaleRow(
                mapPermitScaleDetailRow(rs),
                getString(rs, "SPECIES_DESCRIPTION"),
                getString(rs, "GRADE_DESCRIPTION")),
        bindValues.toArray());
  }

  /**
   * Loads application end uses, package end uses, and every candidate EXCOL translation in one
   * query. Java keeps the existing candidate-selection rule when assembling the response.
   */
  public List<PermitCoreEndUseRow> findCoreEndUseRows(
      List<Long> applicationNumbers, List<String> packageNumbers) {
    List<Long> normalizedApplications =
        applicationNumbers == null
            ? List.of()
            : applicationNumbers.stream()
                .filter(value -> value != null && value > 0)
                .distinct()
                .sorted()
                .toList();
    List<String> normalizedPackages =
        packageNumbers == null
            ? List.of()
            : packageNumbers.stream()
                .map(this::trim)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    if (normalizedApplications.isEmpty() && normalizedPackages.isEmpty()) {
      return List.of();
    }

    String applicationFilter =
        normalizedApplications.isEmpty()
            ? "1=0"
            : "EEASE.APPLICATION_NUMBER IN (" + placeholders(normalizedApplications.size()) + ")";
    String packageFilter =
        normalizedPackages.isEmpty()
            ? "1=0"
            : "EEASE.PACKAGE_NUMBER IN (" + placeholders(normalizedPackages.size()) + ")";
    String sql =
        """
        WITH APPLICATION_END_USES AS (
          SELECT
            EEASE.APPLICATION_NUMBER,
            EEASE.PACKAGE_NUMBER,
            EEASE.EXPORT_SPECIES_CODE,
            EEASE.EXPORT_END_USE_CODE,
            ROW_NUMBER() OVER (
              PARTITION BY EEASE.APPLICATION_NUMBER
              ORDER BY EEASE.EXPORT_SPECIES_CODE, EEASE.EXPORT_END_USE_CODE,
                EEASE.PACKAGE_NUMBER NULLS FIRST
            ) AS END_USE_ORDER,
            COUNT(*) OVER (PARTITION BY EEASE.APPLICATION_NUMBER) AS SPECIES_COUNT
          FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE EEASE
          WHERE %s
        ),
        APPLICATION_END_USE_CONTEXT AS (
          SELECT
            APPLICATION_NUMBER,
            MAX(CASE WHEN END_USE_ORDER = 1 THEN EXPORT_SPECIES_CODE END) AS FIRST_SPECIES_CODE,
            MAX(CASE WHEN END_USE_ORDER = 1 THEN EXPORT_END_USE_CODE END) AS FIRST_END_USE_CODE,
            MAX(SPECIES_COUNT) AS SPECIES_COUNT
          FROM APPLICATION_END_USES
          GROUP BY APPLICATION_NUMBER
        )
        SELECT
          'APPLICATION' AS ROW_KIND,
          AE.APPLICATION_NUMBER,
          AE.PACKAGE_NUMBER,
          AE.EXPORT_SPECIES_CODE,
          AE.EXPORT_END_USE_CODE,
          CAST(NULL AS VARCHAR2(100)) AS EXCOL_TRANSLATION_VALUE
        FROM APPLICATION_END_USES AE
        UNION ALL
        SELECT
          'PACKAGE' AS ROW_KIND,
          EEASE.APPLICATION_NUMBER,
          EEASE.PACKAGE_NUMBER,
          EEASE.EXPORT_SPECIES_CODE,
          EEASE.EXPORT_END_USE_CODE,
          CAST(NULL AS VARCHAR2(100)) AS EXCOL_TRANSLATION_VALUE
        FROM EXPORT_EXMPTN_APPL_SPCS_ENDUSE EEASE
        WHERE %s
        UNION ALL
        SELECT DISTINCT
          'CANDIDATE' AS ROW_KIND,
          AEC.APPLICATION_NUMBER,
          CAST(NULL AS VARCHAR2(20)) AS PACKAGE_NUMBER,
          AEC.FIRST_SPECIES_CODE AS EXPORT_SPECIES_CODE,
          AEC.FIRST_END_USE_CODE AS EXPORT_END_USE_CODE,
          SGE.EXCOL_TRANSLATION_VALUE
        FROM APPLICATION_END_USE_CONTEXT AEC
        INNER JOIN EXPORT_EXEMPTION_APPLICATION EEA
          ON EEA.APPLICATION_NUMBER = AEC.APPLICATION_NUMBER
        INNER JOIN SPECIES_GRADE_ENDUSE_RGN_XREF SGE
          ON SGE.ORG_UNIT_NO = EEA.ORG_UNIT_NO
          AND SGE.EXPORT_SPECIES_CODE = AEC.FIRST_SPECIES_CODE
          AND SGE.EXPORT_END_USE_CODE = AEC.FIRST_END_USE_CODE
        WHERE SGE.EXCOL_TRANSLATION_VALUE LIKE
              RPAD('__/', 3 * AEC.SPECIES_COUNT, '__/') || '__'
           OR SGE.EXCOL_TRANSLATION_VALUE LIKE
              RPAD('__/', 3 * AEC.SPECIES_COUNT, '__/') || '__ %%'
        ORDER BY ROW_KIND, APPLICATION_NUMBER, PACKAGE_NUMBER,
          EXPORT_SPECIES_CODE, EXPORT_END_USE_CODE, EXCOL_TRANSLATION_VALUE
        """
            .formatted(applicationFilter, packageFilter);

    List<Object> bindValues = new ArrayList<>(normalizedApplications.size() + normalizedPackages.size());
    bindValues.addAll(normalizedApplications);
    bindValues.addAll(normalizedPackages);
    return jdbcTemplate.query(
        sql,
        (rs, rowNumber) ->
            new PermitCoreEndUseRow(
                getString(rs, "ROW_KIND"),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_END_USE_CODE"),
                getString(rs, "EXCOL_TRANSLATION_VALUE")),
        bindValues.toArray());
  }

  private List<PermitCorePackageRow> findCorePackageRows(
      Long permitNumber,
      String procedure,
      boolean requireValidApplicationRelationship,
      String aggregateDescription) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    List<PermitCorePackageRow> rows =
        queryCursorProcedureRequired(
            procedure,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            this::mapPermitCorePackageRow);
    if (requireValidApplicationRelationship
        && rows.stream()
            .anyMatch(row -> row.applicationNumber() == null || row.applicationNumber() < 1)) {
      throw new DataRetrievalFailureException(
          "An invalid application relationship was returned for " + aggregateDescription + ".");
    }

    Map<String, PermitCorePackageRow> packagesByNumber = new TreeMap<>();
    for (PermitCorePackageRow row : rows) {
      String packageNumber = trim(row.packageNumber());
      if (packageNumber == null) {
        continue;
      }
      packagesByNumber.putIfAbsent(packageNumber, row.withPackageNumber(packageNumber));
    }
    return List.copyOf(packagesByNumber.values());
  }

  /**
   * Checks the same normal and Blanket OIC package relationships as the legacy package-list
   * procedures without materializing either list.
   */
  public boolean isPackageAssignedToPermitRequired(String packageNumber, Long permitNumber) {
    String normalizedPackageNumber = trim(packageNumber);
    if (normalizedPackageNumber == null || permitNumber == null || permitNumber < 1) {
      return false;
    }

    Long matches =
        jdbcTemplate.queryForObject(
            PACKAGE_BELONGS_TO_PERMIT,
            Long.class,
            normalizedPackageNumber,
            permitNumber,
            permitNumber);
    return matches != null && matches > 0;
  }

  public boolean hasLinkedProvincialApplicationForClient(
      Long permitNumber, String clientNumber) {
    String normalizedClientNumber = trim(clientNumber);
    if (permitNumber == null
        || permitNumber < 1
        || normalizedClientNumber == null) {
      return false;
    }

    Long matches =
        jdbcTemplate.queryForObject(
            LINKED_PROVINCIAL_APPLICATION_BELONGS_TO_CLIENT,
            Long.class,
            permitNumber,
            normalizedClientNumber,
            normalizedClientNumber);
    return matches != null && matches > 0;
  }

  public List<Long> findApplicationNumbersByPermitNumber(Long permitNumber) {
    return findApplicationNumbersByPermitNumber(permitNumber, false);
  }

  public List<Long> findApplicationNumbersByPermitNumberRequired(Long permitNumber) {
    return findApplicationNumbersByPermitNumber(permitNumber, true);
  }

  private List<Long> findApplicationNumbersByPermitNumber(
      Long permitNumber, boolean required) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    List<Long> applicationNumbers =
        required
            ? queryCursorProcedureRequired(
                FIND_PACKAGES_BY_PERMIT,
                cs -> cs.setString(1, permitNumber.toString()),
                2,
                rs -> getLong(rs, "APPLICATION_NUMBER"))
            : queryCursorProcedure(
                FIND_PACKAGES_BY_PERMIT,
                cs -> cs.setString(1, permitNumber.toString()),
                2,
                rs -> getLong(rs, "APPLICATION_NUMBER"));
    return normalizeApplicationRelationships(
        applicationNumbers, required, "permit " + permitNumber);
  }

  public List<PackageCandidateRow> findPackagesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedure(
        FIND_PACKAGES_BY_APPLICATION,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        this::mapPackageCandidateRow);
  }

  public List<PackageCandidateRow> findPackagesByExemptionNumber(String exemptionNumber) {
    return findPackagesByExemptionNumber(exemptionNumber, false);
  }

  public List<PackageCandidateRow> findPackagesByExemptionNumberRequired(
      String exemptionNumber) {
    return findPackagesByExemptionNumber(exemptionNumber, true);
  }

  private List<PackageCandidateRow> findPackagesByExemptionNumber(
      String exemptionNumber, boolean required) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return List.of();
    }

    return required
        ? queryCursorProcedureRequired(
            FIND_PACKAGES_BY_EXEMPTION,
            cs -> cs.setString(1, normalizedExemptionNumber),
            2,
            this::mapPackageCandidateRow)
        : queryCursorProcedure(
            FIND_PACKAGES_BY_EXEMPTION,
            cs -> cs.setString(1, normalizedExemptionNumber),
            2,
            this::mapPackageCandidateRow);
  }

  public List<Long> findApplicationNumbersByExemptionNumber(String exemptionNumber) {
    return findApplicationNumbersByExemptionNumber(exemptionNumber, false);
  }

  public List<Long> findApplicationNumbersByExemptionNumberRequired(
      String exemptionNumber) {
    return findApplicationNumbersByExemptionNumber(exemptionNumber, true);
  }

  private List<Long> findApplicationNumbersByExemptionNumber(
      String exemptionNumber, boolean strictRelationships) {
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedExemptionNumber == null) {
      return List.of();
    }

    List<Long> applicationNumbers =
        queryCursorProcedureRequired(
            FIND_APPLICATION_BY_EXEMPTION,
            cs -> cs.setString(1, normalizedExemptionNumber),
            2,
            rs -> getLong(rs, "APPLICATION_NUMBER"));
    return normalizeApplicationRelationships(
        applicationNumbers,
        strictRelationships,
        "exemption " + normalizedExemptionNumber);
  }

  private List<Long> normalizeApplicationRelationships(
      List<Long> applicationNumbers, boolean strictRelationships, String aggregateDescription) {
    if (strictRelationships
        && applicationNumbers.stream()
            .anyMatch(applicationNumber -> applicationNumber == null || applicationNumber < 1)) {
      throw new DataRetrievalFailureException(
          "An invalid application relationship was returned for " + aggregateDescription + ".");
    }
    return applicationNumbers.stream()
        .filter(applicationNumber -> applicationNumber != null && applicationNumber > 0)
        .distinct()
        .sorted()
        .toList();
  }

  public List<DocumentRow> findPermitDocumentDetailsByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
        FIND_PERMIT_FILE_DETAILS,
        cs -> cs.setLong(1, permitNumber),
        2,
        this::mapDocumentRow);
  }

  /** Loads permit, invoice, and linked-application document metadata in one direct query. */
  public List<PermitDocumentContextRow> findPermitDocumentContextRows(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    List<PermitDocumentContextRow> rows =
        jdbcTemplate.query(
            FIND_PERMIT_DOCUMENT_CONTEXT_ROWS,
            (rs, rowNumber) ->
                new PermitDocumentContextRow(
                    new DocumentRow(
                        coalesce(getLong(rs, "EXPORT_ATTACHMENT_ID"), 0L),
                        getString(rs, "FILE_NAME"),
                        getString(rs, "DESCRIPTION"),
                        getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE")),
                    getString(rs, "ATTACHMENT_TYPE_DESCRIPTION"),
                    getString(rs, "DOCUMENT_SOURCE"),
                    getLong(rs, "SOURCE_APPLICATION_NUMBER"),
                    getLong(rs, "SOURCE_PERMIT_NUMBER"),
                    coalesce(getLong(rs, "DELETABLE"), 0L) > 0),
            permitNumber,
            permitNumber,
            permitNumber);
    if (rows.stream()
        .anyMatch(
            row -> "INVALID_APPLICATION_RELATIONSHIP".equals(row.source()))) {
      throw new DataRetrievalFailureException(
          "An invalid application relationship was returned for permit " + permitNumber + ".");
    }
    return rows;
  }

  /** Verifies the subtype-table relationship used by the permit delete procedure. */
  public boolean isPermitFileAttachmentRequired(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    String call = "{ call " + FIND_PERMIT_FILE_ATTACHMENT + " }";
    Boolean result =
        jdbcTemplate.execute(
            call,
            (CallableStatementCallback<Boolean>)
                cs -> {
                  cs.setLong(1, documentId);
                  cs.registerOutParameter(2, Types.REF_CURSOR);
                  cs.execute();
                  Object cursor = cs.getObject(2);
                  if (cursor == null) {
                    throw new DataAccessResourceFailureException(
                        "Oracle returned no permit attachment cursor.");
                  }
                  if (!(cursor instanceof ResultSet rs)) {
                    throw new DataAccessResourceFailureException(
                        "Oracle returned an invalid permit attachment cursor.");
                  }
                  try (rs) {
                    if (!rs.next()) {
                      return false;
                    }
                    if (rs.next()) {
                      throw new DataRetrievalFailureException(
                          "Oracle returned duplicate permit attachment rows for " + documentId + ".");
                    }
                    return true;
                  }
                });
    if (result == null) {
      throw new DataAccessResourceFailureException(
          "Oracle returned no permit attachment relationship result.");
    }
    return result;
  }

  public List<DocumentRow> findApplicationDocumentDetailsByApplicationNumber(Long applicationNumber) {
    return findApplicationDocumentDetailsByApplicationNumber(applicationNumber, false);
  }

  public List<DocumentRow> findApplicationDocumentDetailsByApplicationNumberRequired(
      Long applicationNumber) {
    return findApplicationDocumentDetailsByApplicationNumber(applicationNumber, true);
  }

  private List<DocumentRow> findApplicationDocumentDetailsByApplicationNumber(
      Long applicationNumber, boolean required) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }
    return required
        ? queryCursorProcedureRequired(
            FIND_APPLICATION_FILE_DETAILS,
            cs -> cs.setLong(1, applicationNumber),
            2,
            this::mapDocumentRow)
        : queryCursorProcedureFailClosed(
            FIND_APPLICATION_FILE_DETAILS,
            cs -> cs.setLong(1, applicationNumber),
            2,
            this::mapDocumentRow);
  }

  public boolean streamFileAttachment(Long fileId, OutputStream outputStream) throws IOException {
    if (fileId == null || fileId < 1 || outputStream == null) {
      return false;
    }
    String call = "{ call " + FIND_FILE_ATTACHMENT + " }";
    try {
      Boolean streamed =
          jdbcTemplate.execute(
              call,
              (CallableStatementCallback<Boolean>)
                  cs -> {
                    cs.setLong(1, fileId);
                    cs.registerOutParameter(2, Types.REF_CURSOR);
                    cs.execute();
                    Object cursor = cs.getObject(2);
                    if (cursor == null) {
                      throw new DataAccessResourceFailureException(
                          "Oracle returned no permit attachment stream cursor.");
                    }
                    if (!(cursor instanceof ResultSet rs)) {
                      throw new DataRetrievalFailureException(
                          "Oracle returned an invalid permit attachment stream cursor.");
                    }
                    try (rs) {
                      if (!rs.next()) {
                        return false;
                      }
                      try (InputStream input = rs.getBinaryStream(1)) {
                        if (input == null) {
                          throw new DataRetrievalFailureException(
                              "Oracle returned a permit attachment row without file content.");
                        }
                        input.transferTo(outputStream);
                        return true;
                      } catch (IOException ex) {
                        throw new UncheckedIOException(ex);
                      }
                    }
                  });
      if (streamed == null) {
        throw new DataAccessResourceFailureException(
            "Oracle returned no permit attachment stream result.");
      }
      return streamed;
    } catch (UncheckedIOException ex) {
      throw ex.getCause();
    } catch (DataAccessException ex) {
      throw new IOException("Oracle permit attachment stream failed", ex);
    }
  }

  public List<CountryCodeRow> findAllCountryCodesRequired() {
    return queryCursorProcedureRequired(
            FIND_ALL_COUNTRY_CODES,
            null,
            1,
            rs ->
                new CountryCodeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    coalesce(getLong(rs, "GROUP_BY"), 0L),
                    coalesce(getLong(rs, "ORDER_BY"), 0L)))
        .stream()
        .filter(row -> row.code() != null && row.description() != null)
        .toList();
  }

  public List<AttachmentTypeRow> findAllAttachmentTypes() {
    return queryCursorProcedureFailClosed(
            FIND_ALL_ATTACHMENT_TYPE_CODES,
            null,
            1,
            rs ->
                new AttachmentTypeRow(
                    getString(rs, "CODE"),
                    getString(rs, "DESCRIPTION"),
                    coalesce(getLong(rs, "GROUP_BY"), 0L),
                    coalesce(getLong(rs, "ORDER_BY"), 0L)))
        .stream()
        .filter(row -> row.code() != null && row.description() != null)
        .toList();
  }

  public Optional<String> findAttachmentTypeDescription(String attachmentTypeCode) {
    String normalized = trim(attachmentTypeCode);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleFailClosed(
            FIND_ATTACHMENT_TYPE_CODE,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(getString(rs, "DESCRIPTION")))
        .filter(value -> value != null && !value.isBlank());
  }

  public Optional<SalesInvoiceRow> findSalesInvoiceByNumberAndPermit(
      String salesInvoiceNumber, Long permitNumber) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    if (normalizedSalesInvoiceNumber == null || permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_INVOICE_BY_ID,
        cs -> {
          cs.setString(1, normalizedSalesInvoiceNumber);
          cs.setString(2, permitNumber.toString());
        },
        3,
        rs ->
            new SalesInvoiceRow(
                nonNull(getString(rs, "EXPORT_SALES_INVOICE_NUMBER")),
                coalesce(getDouble(rs, "EXPORT_VALUE"), 0.0d),
                coalesce(getDouble(rs, "CURRENCY_CONVERSION_RATE"), 0.0d),
                coalesce(getDouble(rs, "FEE_IN_LIEU"), 0.0d)));
  }

  public List<String> findInvoiceNumbersByPermitRequired(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
            FIND_INVOICES_BY_PERMIT,
            cs -> cs.setString(1, permitNumber.toString()),
            2,
            rs -> getString(rs, "EXPORT_SALES_INVOICE_NUMBER"))
        .stream()
        .filter(value -> value != null && !value.isBlank())
        .distinct()
        .sorted()
        .toList();
  }

  public Optional<PermitMutationRow> findPermitMutationByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PERMIT_DETAIL_BY_ID,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        this::mapPermitMutationRow);
  }

  /**
   * Reads the fields needed to initialize permit fee editing without relying on optional columns
   * from the legacy full-permit cursor.
   */
  public Optional<PermitFeeOverrideRow> findPermitFeeOverrideByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return jdbcTemplate
        .query(
            FIND_PERMIT_FEE_OVERRIDE,
            (rs, rowNumber) ->
                new PermitFeeOverrideRow(
                    getDouble(rs, "OVERRIDE_FEE"), getString(rs, "OVERRIDE_COMMENT")),
            permitNumber)
        .stream()
        .findFirst();
  }

  public Optional<PermitMutationRow> insertPermitDetail(PermitMutationRow row, String entryUserId) {
    String normalizedEntryUserId = trim(entryUserId);
    if (row == null || normalizedEntryUserId == null) {
      return Optional.empty();
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    return queryCursorSingleRequired(
        INSERT_PERMIT_DETAIL,
        cs -> {
          cs.setString(1, trim(row.destinationCompanyName()));
          cs.setString(2, trim(row.transportName()));
          setDateOrNull(cs, 3, row.estimatedShippingDate());
          cs.setString(4, trim(row.otherPortOfExport()));
          setDateOrNull(cs, 5, row.applicationDate());
          setDateOrNull(cs, 6, row.receivedDate());
          setDateOrNull(cs, 7, row.permitIssueDate());
          cs.setString(8, trim(row.receiptNumber()));
          setDateOrNull(cs, 9, row.expiryDate());
          setDoubleOrNull(cs, 10, row.permitVolume());
          setLongOrNull(cs, 11, row.numberOfPieces());
          setLongOrNull(cs, 12, row.feeInLieuVolume());
          cs.setString(13, trim(row.federalPermitNumber()));
          cs.setString(14, trim(row.remarks()));
          cs.setString(15, auditUserOrDefault(normalizedEntryUserId));
          cs.setTimestamp(16, now);
          cs.setNull(17, Types.VARCHAR);
          cs.setNull(18, Types.TIMESTAMP);
          cs.setString(19, trim(row.transportTypeCode()));
          cs.setString(20, trim(row.scaleMethodCode()));
          cs.setString(21, trim(row.clientNumber()));
          cs.setString(22, trim(row.clientLocationCode()));
          cs.setString(23, trim(row.agentNumber()));
          cs.setString(24, trim(row.agentLocationCode()));
          cs.setString(25, trim(row.exemptionNumber()));
          setLongOrNull(cs, 26, row.orgUnitNo());
          cs.setString(27, trim(row.portOfExportCode()));
          cs.setString(28, trim(row.permitStatusCode()));
          cs.setString(29, trim(row.countryCode()));
          cs.setString(30, trim(row.growthTypeCode()));
          setDoubleOrNull(cs, 31, row.overrideFee());
          cs.setString(32, trim(row.overrideComment()));
          setLongOrNull(cs, 33, row.oicApplicationNumber());
          setLongOrNull(cs, 34, row.oicRequestPieces());
          setDoubleOrNull(cs, 35, row.oicRequestVolume());
          cs.setString(36, trim(row.productTypeCode()));
        },
        37,
        this::mapPermitMutationRow)
        .filter(
            inserted ->
                inserted.permitNumber() != null
                    && inserted.permitNumber() > 0
                    && java.util.Objects.equals(
                        trim(inserted.exemptionNumber()), trim(row.exemptionNumber()))
                    && java.util.Objects.equals(
                        inserted.oicApplicationNumber(), row.oicApplicationNumber())
                    && java.util.Objects.equals(
                        trim(inserted.clientNumber()), trim(row.clientNumber()))
                    && java.util.Objects.equals(
                        trim(inserted.clientLocationCode()),
                        trim(row.clientLocationCode())));
  }

  public boolean updatePermitDetail(
      PermitMutationRow row, String updateUserId, LocalDate twoElevenImplementDate) {
    String normalizedUpdateUserId = trim(updateUserId);
    if (row == null || row.permitNumber() == null || row.permitNumber() < 1 || normalizedUpdateUserId == null) {
      return false;
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    executeProcedureRequired(
        UPDATE_PERMIT_DETAIL,
        cs -> {
          cs.setLong(1, row.permitNumber());
          cs.setString(2, trim(row.destinationCompanyName()));
          cs.setString(3, trim(row.transportName()));
          setDateOrNull(cs, 4, row.estimatedShippingDate());
          cs.setString(5, trim(row.otherPortOfExport()));
          setDateOrNull(cs, 6, row.applicationDate());
          setDateOrNull(cs, 7, row.receivedDate());
          setDateOrNull(cs, 8, row.permitIssueDate());
          cs.setString(9, trim(row.receiptNumber()));
          setDateOrNull(cs, 10, row.expiryDate());
          setDoubleOrNull(cs, 11, row.permitVolume());
          setLongOrNull(cs, 12, row.numberOfPieces());
          setLongOrNull(cs, 13, row.feeInLieuVolume());
          cs.setString(14, trim(row.federalPermitNumber()));
          cs.setString(15, trim(row.remarks()));
          cs.setString(16, auditUserOrDefault(row.entryUserId()));
          cs.setTimestamp(17, row.entryTimestamp());
          cs.setString(18, auditUserOrDefault(normalizedUpdateUserId));
          cs.setTimestamp(19, now);
          cs.setString(20, trim(row.transportTypeCode()));
          cs.setString(21, trim(row.scaleMethodCode()));
          cs.setString(22, trim(row.clientNumber()));
          cs.setString(23, trim(row.clientLocationCode()));
          cs.setString(24, trim(row.agentNumber()));
          cs.setString(25, trim(row.agentLocationCode()));
          cs.setString(26, trim(row.exemptionNumber()));
          setLongOrNull(cs, 27, row.orgUnitNo());
          cs.setString(28, trim(row.portOfExportCode()));
          cs.setString(29, trim(row.permitStatusCode()));
          cs.setString(30, trim(row.growthTypeCode()));
          cs.setString(31, trim(row.countryCode()));
          setDoubleOrNull(cs, 32, row.overrideFee());
          cs.setString(33, trim(row.overrideComment()));
          setLongOrNull(cs, 34, row.oicApplicationNumber());
          setLongOrNull(cs, 35, row.oicRequestPieces());
          setDoubleOrNull(cs, 36, row.oicRequestVolume());
          cs.setString(37, trim(row.productTypeCode()));
          setDateOrNull(cs, 38, twoElevenImplementDate);
        });
    return true;
  }

  public Optional<SalesInvoiceRow> insertSalesInvoice(
      Long permitNumber,
      String salesInvoiceNumber,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String userId) {
    String normalizedSalesInvoiceNumber = trim(salesInvoiceNumber);
    String normalizedUserId = trim(userId);
    if (permitNumber == null
        || permitNumber < 1
        || normalizedSalesInvoiceNumber == null
        || exportValue == null
        || currencyConversionRate == null
        || feeInLieu == null) {
      return Optional.empty();
    }

    Timestamp now = new Timestamp(System.currentTimeMillis());
    return queryCursorSingleRequired(
        INSERT_SALES_INVOICE,
        cs -> {
          cs.setString(1, normalizedSalesInvoiceNumber);
          cs.setLong(2, permitNumber);
          cs.setBigDecimal(3, exportValue);
          cs.setBigDecimal(4, currencyConversionRate);
          cs.setBigDecimal(5, feeInLieu);
          cs.setString(6, auditUserOrDefault(normalizedUserId));
          cs.setTimestamp(7, now);
          cs.setNull(8, Types.VARCHAR);
          cs.setNull(9, Types.TIMESTAMP);
        },
        10,
        rs ->
            new SalesInvoiceRow(
                nonNull(getString(rs, "EXPORT_SALES_INVOICE_NUMBER")),
                coalesce(getDouble(rs, "EXPORT_VALUE"), 0.0d),
                coalesce(getDouble(rs, "CURRENCY_CONVERSION_RATE"), 0.0d),
                coalesce(getDouble(rs, "FEE_IN_LIEU"), 0.0d)))
        .filter(
            row ->
                java.util.Objects.equals(
                        trim(row.salesInvoiceNumber()), normalizedSalesInvoiceNumber)
                    && BigDecimal.valueOf(row.exportValue()).compareTo(exportValue) == 0
                    && BigDecimal.valueOf(row.currencyConversionRate())
                            .compareTo(currencyConversionRate)
                        == 0
                    && BigDecimal.valueOf(row.feeInLieu()).compareTo(feeInLieu) == 0);
  }

  /** Loads mutable GBMS history without converting an Oracle failure into an empty history. */
  public List<GbmsInvoiceHistoryRow> findGbmsInvoiceHistoryRequired(
      String receiptNumber, Long permitNumber) {
    return findGbmsInvoiceHistoryRequired(receiptNumber, permitNumber, false);
  }

  /**
   * Loads GBMS history from the caller-appropriate package without converting an Oracle failure
   * into an empty history.
   *
   * Mutation decisions use the mutable package through the two-argument overload. Read-only
   * report users use this overload so they retain the legacy package boundary while report
   * rendering still fails closed when invoice history cannot be loaded.
   */
  public List<GbmsInvoiceHistoryRow> findGbmsInvoiceHistoryRequired(
      String receiptNumber, Long permitNumber, boolean readOnlyUser) {
    return filterGbmsHistoryForPermit(
        findGbmsInvoiceHistoryForDisplay(receiptNumber, permitNumber, readOnlyUser), permitNumber);
  }

  /**
   * Loads GBMS invoice history using the legacy permit-first, receipt-fallback lookup semantics.
   *
   * The legacy procedure can resolve a different permit from the receipt/invoice number when
   * the requested permit has no history. This display-oriented lookup preserves that result;
   * mutation callers must use {@link #findGbmsInvoiceHistoryRequired(String, Long, boolean)}.
   */
  public List<GbmsInvoiceHistoryRow> findGbmsInvoiceHistoryForDisplay(
      String receiptNumber, Long permitNumber, boolean readOnlyUser) {
    if (permitNumber == null || permitNumber < 1) {
      throw new IllegalArgumentException("Permit number must be positive.");
    }
    String normalizedReceiptNumber = trim(receiptNumber);
    String normalizedPermitNumber = permitNumber.toString();
    String procedure =
        readOnlyUser ? FIND_GBMS_INVOICE_HISTORY_READ_ONLY : FIND_GBMS_INVOICE_HISTORY;

    return queryCursorProcedureRequired(
        procedure,
        cs -> {
          cs.setString(1, normalizedReceiptNumber);
          cs.setString(2, normalizedPermitNumber);
        },
        3,
        rs ->
            new GbmsInvoiceHistoryRow(
                getString(rs, "INVOICE_NUMBER"),
                getString(rs, "CANCELLED_BY_INVOICE"),
                getString(rs, "REPLACED_BY_INVOICE"),
                getLong(rs, "LEXIS_PERMIT_NUMBER"),
                coalesce(getDouble(rs, "INVOICE_AMOUNT"), 0.0d),
                getLocalDate(rs, "PRINTED_DATE"),
                getLocalDate(rs, "ENTRY_TIMESTAMP"),
                getLocalDate(rs, "UPDATE_TIMESTAMP")));
  }

  private List<GbmsInvoiceHistoryRow> filterGbmsHistoryForPermit(
      List<GbmsInvoiceHistoryRow> rows, Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return List.of();
    }
    return rows.stream().filter(row -> permitNumber.equals(row.permitNumber())).toList();
  }

  public Optional<Double> findCurrencyConversionRateByDate(LocalDate applicationDate, String countryCode) {
    LocalDate normalizedDate = applicationDate == null ? LexisBusinessTime.today() : applicationDate;
    String normalizedCountryCode = trim(countryCode);
    if (normalizedCountryCode == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_CONVERSION_FOR_DATE,
        cs -> {
          cs.setString(1, normalizedCountryCode);
          cs.setDate(2, java.sql.Date.valueOf(normalizedDate));
        },
        3,
        rs -> coalesce(getDouble(rs, "RATE_TO_CANADIAN"), 0.0d));
  }

  public boolean deletePermitFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    executeProcedureRequired(DELETE_PERMIT_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
    return true;
  }

  public boolean deleteApplicationFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    executeProcedureRequired(
        DELETE_APPLICATION_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
    return true;
  }

  public boolean deleteInvoiceFile(Long documentId) {
    if (documentId == null || documentId < 1) {
      return false;
    }
    executeProcedureRequired(DELETE_INVOICE_FILE_ATTACHMENT, cs -> cs.setLong(1, documentId));
    return true;
  }

  public List<PermitScaleDetailRow> findScaleDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }
    return queryCursorProcedureRequired(
        FIND_SCALE_DETAIL_BY_PACKAGE,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PermitScaleDetailRow(
                getString(rs, "EXPORT_SCALE_DETAIL_ID"),
                getString(rs, "TIMBER_MARK"),
                getString(rs, "EXPORT_SPECIES_CODE"),
                getString(rs, "EXPORT_GRADE_CODE"),
                coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
                coalesce(getLong(rs, "PIECES_COUNT"), 0L),
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getString(rs, "PACKAGE_NUMBER"),
                getString(rs, "CASCADE_SPLIT_CODE"),
                getString(rs, "EWB"),
                getString(rs, "FIL"),
                getString(rs, "MF")));
  }

  public Optional<PermitPolicyContextRow> findPermitPolicyContextByPermitNumber(Long permitNumber) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PERMIT_DETAIL_BY_ID,
        cs -> cs.setString(1, permitNumber.toString()),
        2,
        rs ->
            new PermitPolicyContextRow(
                getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                getLocalDate(rs, "APPLICATION_DATE"),
                getString(rs, "EXEMPTION_NUMBER"),
                getString(rs, "EXPORT_COUNTRY_CODE"),
                coalesce(getDouble(rs, "OVERRIDE_FEE"), 0.0d)));
  }

  public Optional<String> findExemptionTypeCode(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
            FIND_EXEMPTION_BY_NUMBER,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString("EXPORT_EXEMPTION_TYPE_CODE")))
        .filter(value -> value != null && !value.isBlank());
  }

  public Optional<LocalDate> findExemptionExpiryDate(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_EXEMPTION_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs -> getLocalDate(rs, "EXPIRY_DATE"));
  }

  public Optional<PackageInfoRow> findPackageInfoByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PackageInfoRow(
                getString(rs, "PACKAGE_NUMBER"),
                getLong(rs, "APPLICATION_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE")));
  }

  public Optional<PackageDetailsRow> findPackageDetailsByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingle(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PackageDetailsRow(
                getString(rs, "PACKAGE_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
                getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
                getString(rs, "COMMENTS"),
                getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE")));
  }

  public Optional<PackageDetailsRow> findPackageDetailsByPackageNumberRequired(
      String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_PACKAGE_BY_NUMBER,
        cs -> cs.setString(1, normalized),
        2,
        rs ->
            new PackageDetailsRow(
                getString(rs, "PACKAGE_NUMBER"),
                coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
                coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
                getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
                getString(rs, "COMMENTS"),
                getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE")));
  }

  public Optional<ApplicationInfoRow> findApplicationInfoByNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs ->
            new ApplicationInfoRow(
                getLong(rs, "APPLICATION_NUMBER"),
                getString(rs, "EXEMPTION_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                getString(rs, "REGION"),
                getString(rs, "EXPORT_PRODUCT_TYPE_CODE"),
                getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
                // FIND_APPLICATION_BY_NUMBER does not project END_USE_SORT. The service derives it
                // from the authoritative application end-use relationships when it is needed.
                null,
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getString(rs, "OIC_INDICATOR")));
  }

  public Optional<String> findApplicationStatusCodeByNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_APPLICATION_BY_NUMBER,
        cs -> cs.setString(1, applicationNumber.toString()),
        2,
        rs -> getString(rs, "EXPORT_APPLICATION_STATUS_CODE"));
  }

  public List<EndUsePairRow> findEndUsesByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
            FIND_END_USE_BY_APP,
            cs -> cs.setString(1, applicationNumber.toString()),
            2,
            rs -> new EndUsePairRow(getString(rs, "EXPORT_SPECIES_CODE"), getString(rs, "EXPORT_END_USE_CODE")))
        .stream()
        .filter(row -> trim(row.speciesCode()) != null && trim(row.endUseCode()) != null)
        .toList();
  }

  public List<EndUsePairRow> findEndUsesByPackageNumber(String packageNumber) {
    String normalized = trim(packageNumber);
    if (normalized == null) {
      return List.of();
    }

    return queryCursorProcedureFailClosed(
            FIND_END_USE_BY_PACK,
            cs -> cs.setString(1, normalized),
            2,
            rs -> new EndUsePairRow(getString(rs, "EXPORT_SPECIES_CODE"), getString(rs, "EXPORT_END_USE_CODE")))
        .stream()
        .filter(row -> trim(row.speciesCode()) != null && trim(row.endUseCode()) != null)
        .toList();
  }

  public Optional<String> findSpeciesDescription(String speciesCode) {
    return findCodeDescription(FIND_SPECIES_CODE, speciesCode);
  }

  public boolean isSpeciesCodeValidRequired(String speciesCode) {
    return codeExistsRequired(FIND_SPECIES_CODE, speciesCode);
  }

  public Optional<String> findGradeDescription(String gradeCode) {
    return findCodeDescription(FIND_GRADE_CODE, gradeCode);
  }

  public boolean isGradeCodeValidRequired(String gradeCode) {
    return codeExistsRequired(FIND_GRADE_CODE, gradeCode);
  }

  public boolean isValidBoicTimberMarkRequired(
      String timberMark, String exemptionNumber) {
    String normalizedTimberMark = trim(timberMark);
    String normalizedExemptionNumber = trim(exemptionNumber);
    if (normalizedTimberMark == null || normalizedExemptionNumber == null) {
      return false;
    }
    return queryCursorSingleRequired(
            FIND_VALID_BOIC_TIMBER_MARK,
            cs -> {
              cs.setString(1, normalizedTimberMark);
              cs.setString(2, normalizedExemptionNumber);
            },
            3,
            rs -> Boolean.TRUE)
        .orElse(false);
  }

  public Optional<String> findGrowthTypeDescription(String growthTypeCode) {
    return findCodeDescription(FIND_GROWTH_TYPE_CODE, growthTypeCode);
  }

  public Optional<String> findPackageStatusDescription(String packageStatusCode) {
    return findCodeDescription(FIND_PACKAGE_STATUS_CODE, packageStatusCode);
  }

  public Optional<String> findProductTypeDescription(String productTypeCode) {
    return findCodeDescription(FIND_PRODUCT_TYPE_CODE, productTypeCode);
  }

  public List<String> findCandidateExcolCodes(
      int speciesCount, String speciesCode, String endUseCode, Long orgUnitNumber) {
    String normalizedSpecies = trim(speciesCode);
    String normalizedEndUse = trim(endUseCode);
    if (speciesCount < 1 || normalizedSpecies == null || normalizedEndUse == null || orgUnitNumber == null) {
      return List.of();
    }

    StringBuilder pattern = new StringBuilder();
    for (int i = 0; i < speciesCount; i++) {
      pattern.append("__/");
    }
    pattern.append("__");

    return queryCursorProcedureFailClosed(
            FIND_CANDIDATE_EXCOL_VALUES,
            cs -> {
              cs.setString(1, pattern.toString());
              cs.setString(2, normalizedSpecies);
              cs.setString(3, normalizedEndUse);
              cs.setLong(4, orgUnitNumber);
            },
            5,
            rs -> getString(rs, "EXCOL_TRANSLATION_VALUE"))
        .stream()
        .filter(value -> value != null && !value.isBlank())
        .toList();
  }

  public Optional<BigDecimal> findFixedExemptionRate(String exemptionNumber) {
    String normalized = trim(exemptionNumber);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_RATE_BY_EXEMPTION,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double rate = getDouble(rs, "FIXED_EXEMPTION_RATE");
          if (rate == null) {
            return null;
          }
          return BigDecimal.valueOf(rate);
        });
  }

  public BigDecimal findFeePolicyPercentIncrease(LocalDate applicationDate, Long orgUnitNo) {
    if (applicationDate == null || orgUnitNo == null || orgUnitNo < 1) {
      return BigDecimal.ZERO;
    }

    try {
      return queryCursorSingleRequired(
              GET_POLICY_FACTOR,
              cs -> {
                cs.setDate(1, java.sql.Date.valueOf(applicationDate));
                cs.setLong(2, orgUnitNo);
              },
              3,
              rs -> {
                String percent = trim(rs.getString("PERCENT_INCREASE"));
                if (percent == null) {
                  return BigDecimal.ZERO;
                }
                try {
                  return new BigDecimal(percent);
                } catch (NumberFormatException ex) {
                  throw new DataRetrievalFailureException(
                      "Oracle fee policy factor was not numeric", ex);
                }
              })
          .orElse(BigDecimal.ZERO);
    } catch (DataAccessException ex) {
      if (hasDatabaseErrorCode(ex, ORACLE_NO_DATA_FOUND)) {
        return BigDecimal.ZERO;
      }
      throw ex;
    }
  }

  private boolean hasDatabaseErrorCode(Throwable failure, int expectedErrorCode) {
    for (Throwable current = failure;
        current != null && current.getCause() != current;
        current = current.getCause()) {
      if (current instanceof SQLException sqlException
          && sqlException.getErrorCode() == expectedErrorCode) {
        return true;
      }
    }
    return false;
  }

  public Optional<BigDecimal> findAverageMarketValueByScaleId(String scaleDetailId) {
    String normalized = trim(scaleDetailId);
    if (normalized == null) {
      return Optional.empty();
    }

    return queryCursorSingleRequired(
        FIND_LOG_AMV_BY_SCALE,
        cs -> cs.setString(1, normalized),
        2,
        rs -> {
          Double amv = getDouble(rs, "AVERAGE_MARKET_PRICE");
          if (amv == null) {
            return null;
          }
          return BigDecimal.valueOf(amv);
        });
  }

  public boolean isApplicationUnmanufactured(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return false;
    }

    Long count =
        queryCursorSingleRequired(
                IS_APP_UNMANU,
                cs -> cs.setString(1, applicationNumber.toString()),
                2,
                rs -> getLong(rs, "RESULTS_COUNT"))
            .orElseThrow(
                () ->
                    new DataRetrievalFailureException(
                        "Oracle unmanufactured application lookup was unavailable"));
    return count > 0;
  }

  private Optional<String> findCodeDescription(String procedureSignature, String code) {
    String normalized = trim(code);
    if (normalized == null) {
      return Optional.empty();
    }
    return queryCursorSingle(
            procedureSignature,
            cs -> cs.setString(1, normalized),
            2,
            rs -> trim(rs.getString(2)))
        .filter(value -> value != null && !value.isBlank())
        .or(() -> fallbackCodeDescription(procedureSignature, normalized));
  }

  private boolean codeExistsRequired(String procedureSignature, String code) {
    String normalized = trim(code);
    if (normalized == null) {
      return false;
    }
    return queryCursorSingleRequired(
            procedureSignature,
            cs -> cs.setString(1, normalized),
            2,
            rs -> Boolean.TRUE)
        .orElse(false);
  }

  private String nonNull(String value) {
    return value == null ? "" : value;
  }

  private DocumentRow mapDocumentRow(ResultSet rs) {
    Long attachmentId = getLong(rs, "EXPORT_ATTACHMENT_ID");
    return new DocumentRow(
        coalesce(attachmentId, 0L),
        safeFileName(getString(rs, "FILE_NAME")),
        firstNonNull(getString(rs, "DESCRIPTION"), ""),
        firstNonNull(getString(rs, "EXPORT_ATTACHMENT_TYPE_CODE"), ""));
  }

  private PackageCandidateRow mapPackageCandidateRow(ResultSet rs) {
    return new PackageCandidateRow(
        getLong(rs, "APPLICATION_NUMBER"),
        trim(getString(rs, "PACKAGE_NUMBER")));
  }

  private PermitMutationRow mapPermitMutationRow(ResultSet rs) {
    return new PermitMutationRow(
        getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "DESTINATION_COMPANY_NAME"),
        getString(rs, "TRANSPORT_NAME"),
        getLocalDate(rs, "ESTIMATED_SHIPPING_DATE"),
        getString(rs, "OTHER_PORT_OF_EXPORT"),
        getLocalDate(rs, "APPLICATION_DATE"),
        getLocalDate(rs, "RECEIVED_DATE"),
        getLocalDate(rs, "EXPORT_PERMIT_ISSUE_DATE"),
        getString(rs, "RECEIPT_NUMBER"),
        getLocalDate(rs, "EXPIRY_DATE"),
        getDouble(rs, "PERMIT_VOLUME"),
        getLong(rs, "NUMBER_OF_PIECES"),
        getLong(rs, "FEE_IN_LIEU_VOLUME"),
        getString(rs, "FEDERAL_PERMIT_NUMBER"),
        getString(rs, "REMARKS"),
        getString(rs, "ENTRY_USERID"),
        getTimestamp(rs, "ENTRY_TIMESTAMP"),
        getString(rs, "EXPORT_TRANSPORT_TYPE_CODE"),
        getString(rs, "EXPORT_SCALE_METHOD_CODE"),
        getString(rs, "CLIENT_NUMBER"),
        getString(rs, "CLIENT_LOCN_CODE"),
        getString(rs, "AGENT_NUMBER"),
        getString(rs, "AGENT_LOCN_CODE"),
        getString(rs, "EXEMPTION_NUMBER"),
        getLong(rs, "ORG_UNIT_NO"),
        getString(rs, "EXPORT_PORT_OF_EXPORT_CODE"),
        getString(rs, "EXPORT_PERMIT_STATUS_CODE"),
        getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
        getString(rs, "EXPORT_COUNTRY_CODE"),
        getDouble(rs, "OVERRIDE_FEE"),
        getString(rs, "OVERRIDE_COMMENT"),
        getLong(rs, "OIC_APPLICATION_NUMBER"),
        getLong(rs, "OIC_REQUEST_PIECES"),
        getDouble(rs, "OIC_REQUEST_VOLUME"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"));
  }

  private ScaleMutationRow mapScaleMutationRow(ResultSet rs) {
    return new ScaleMutationRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getLong(rs, "PIECES_COUNT"),
        getDouble(rs, "SPECIES_GRADE_VOLUME"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        getLong(rs, "APPLICATION_NUMBER"),
        getLong(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "ENTRY_USERID"),
        getTimestamp(rs, "ENTRY_TIMESTAMP"));
  }

  private PermitScaleDetailRow mapPermitScaleDetailRow(ResultSet rs) {
    return new PermitScaleDetailRow(
        getString(rs, "EXPORT_SCALE_DETAIL_ID"),
        getString(rs, "TIMBER_MARK"),
        getString(rs, "EXPORT_SPECIES_CODE"),
        getString(rs, "EXPORT_GRADE_CODE"),
        coalesce(getDouble(rs, "SPECIES_GRADE_VOLUME"), 0.0d),
        coalesce(getLong(rs, "PIECES_COUNT"), 0L),
        getLong(rs, "APPLICATION_NUMBER"),
        getString(rs, "EXPORT_PERMIT_DETAIL_NUMBER"),
        getString(rs, "PACKAGE_NUMBER"),
        getString(rs, "CASCADE_SPLIT_CODE"),
        getString(rs, "EWB"),
        getString(rs, "FIL"),
        getString(rs, "MF"));
  }

  private PermitCorePackageRow mapPermitCorePackageRow(ResultSet rs) {
    return new PermitCorePackageRow(
        getString(rs, "PACKAGE_NUMBER"),
        getLong(rs, "APPLICATION_NUMBER"),
        coalesce(getDouble(rs, "PACKAGE_VOLUME"), 0.0d),
        coalesce(getDouble(rs, "AVERAGE_LENGTH"), 0.0d),
        coalesce(getDouble(rs, "AVERAGE_DIAMETER"), 0.0d),
        getString(rs, "EXPORT_PACKAGE_STATUS_CODE"),
        getString(rs, "COMMENTS"),
        getString(rs, "PACKAGE_REPROCESSED_INDICATOR"),
        getString(rs, "EXPORT_GROWTH_TYPE_CODE"),
        getString(rs, "EXPORT_PRODUCT_TYPE_CODE"));
  }

  private PermitCorePackageContextRow mapPermitCorePackageContextRow(ResultSet rs) {
    PermitCorePackageRow packageRow = mapPermitCorePackageRow(rs);
    Long applicationNumber = getLong(rs, "APPLICATION_NUMBER");
    ApplicationInfoRow applicationInfo =
        applicationNumber == null
            ? null
            : new ApplicationInfoRow(
                applicationNumber,
                getString(rs, "EXEMPTION_NUMBER"),
                getLong(rs, "ORG_UNIT_NO"),
                getString(rs, "REGION"),
                getString(rs, "APPLICATION_PRODUCT_TYPE_CODE"),
                getString(rs, "APPLICATION_GROWTH_TYPE_CODE"),
                null,
                getString(rs, "OWNER_CLIENT_NUMBER"),
                getString(rs, "OWNER_CLIENT_LOCATION_CODE"),
                getString(rs, "AGENT_CLIENT_NUMBER"),
                getString(rs, "AGENT_CLIENT_LOCATION_CODE"),
                getString(rs, "OIC_INDICATOR"));
    return new PermitCorePackageContextRow(
        packageRow,
        applicationInfo,
        getString(rs, "EXPORT_JURISDICTION_CODE"),
        getString(rs, "EXPORT_EXEMPTION_TYPE_CODE"),
        getString(rs, "APPLICATION_PRODUCT_TYPE_DESCRIPTION"),
        getString(rs, "PACKAGE_PRODUCT_TYPE_DESCRIPTION"),
        getString(rs, "APPLICATION_GROWTH_TYPE_DESCRIPTION"),
        getString(rs, "PACKAGE_GROWTH_TYPE_DESCRIPTION"),
        getString(rs, "PACKAGE_STATUS_DESCRIPTION"),
        coalesce(getLong(rs, "ASSIGNED_TO_PERMIT"), 0L) > 0);
  }

  private static String placeholders(int count) {
    return String.join(", ", java.util.Collections.nCopies(Math.max(0, count), "?"));
  }

  private Timestamp getTimestamp(ResultSet rs, String column) {
    try {
      return rs.getTimestamp(column);
    } catch (SQLException ex) {
      return null;
    }
  }

  private void setDateOrNull(java.sql.CallableStatement cs, int index, LocalDate value)
      throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.TIMESTAMP);
      return;
    }
    cs.setTimestamp(index, Timestamp.valueOf(value.atStartOfDay()));
  }

  private void setLongOrNull(java.sql.CallableStatement cs, int index, Long value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
      return;
    }
    cs.setLong(index, value);
  }

  private void setDoubleOrNull(java.sql.CallableStatement cs, int index, Double value) throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.NUMERIC);
      return;
    }
    cs.setDouble(index, value);
  }

  private void setStringOrNull(java.sql.CallableStatement cs, int index, String value)
      throws SQLException {
    String normalized = trim(value);
    if (normalized == null) {
      cs.setNull(index, Types.VARCHAR);
      return;
    }
    cs.setString(index, normalized);
  }

  private void setTimestampOrNull(java.sql.CallableStatement cs, int index, Timestamp value)
      throws SQLException {
    if (value == null) {
      cs.setNull(index, Types.TIMESTAMP);
      return;
    }
    cs.setTimestamp(index, value);
  }

  private Long parseLongOrNull(String value) {
    String normalized = trim(value);
    if (normalized == null) {
      return null;
    }
    try {
      return Long.valueOf(normalized);
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String safeFileName(String value) {
    if (value == null || value.isBlank()) {
      return "";
    }
    int slashIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
    if (slashIndex < 0 || slashIndex >= value.length() - 1) {
      return value;
    }
    return value.substring(slashIndex + 1);
  }

  public record DocumentRow(long id, String fileName, String description, String attachmentTypeCode) {}

  public record PermitDocumentContextRow(
      DocumentRow documentRow,
      String attachmentTypeDescription,
      String source,
      Long sourceApplicationNumber,
      Long sourcePermitNumber,
      boolean deletable) {}

  public record CountryCodeRow(String code, String description, long groupBy, long orderBy) {}

  public record AttachmentTypeRow(String code, String description, long groupBy, long orderBy) {}

  public record PermitScaleDetailRow(
      String exportScaleDetailId,
      String timberMark,
      String exportSpeciesCode,
      String exportGradeCode,
      double speciesGradeVolume,
      long piecesCount,
      Long applicationNumber,
      String exportPermitDetailNumber,
      String packageNumber,
      String cascadeSplitCode,
      String ewb,
      String fil,
      String mf) {}

  public record ScaleMutationRow(
      String scaleDetailId,
      String timberMark,
      Long piecesCount,
      Double speciesGradeVolume,
      String packageNumber,
      String exportSpeciesCode,
      String exportGradeCode,
      Long applicationNumber,
      Long exportPermitDetailNumber,
      String entryUserId,
      Timestamp entryTimestamp) {}

  public record ScaleMutationRecord(
      String scaleDetailId,
      String timberMark,
      Long piecesCount,
      Double speciesGradeVolume,
      String packageNumber,
      String exportSpeciesCode,
      String exportGradeCode,
      Long exportPermitDetailNumber,
      String entryUserId,
      Timestamp entryTimestamp) {}

  public record BoicScaleMutationRecord(
      String timberMark,
      Long piecesCount,
      Double speciesGradeVolume,
      String packageNumber,
      String exportSpeciesCode,
      String exportGradeCode,
      Long applicationNumber,
      Long exportPermitDetailNumber,
      Double exemptionOverrideRate,
      String entryUserId,
      Timestamp entryTimestamp) {}

  public record PermitPolicyContextRow(
      Long permitNumber,
      Long orgUnitNo,
      LocalDate applicationDate,
      String exemptionNumber,
      String exportCountryCode,
      double overrideFee) {}

  public record PackageInfoRow(
      String packageNumber,
      Long applicationNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String growthTypeCode,
      String productTypeCode) {}

  /** Complete package projection returned by the existing permit package cursors. */
  public record PermitCorePackageRow(
      String packageNumber,
      Long applicationNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String packageStatusCode,
      String comments,
      String reprocessedIndicator,
      String growthTypeCode,
      String productTypeCode) {

    PermitCorePackageRow withPackageNumber(String value) {
      return new PermitCorePackageRow(
          value,
          applicationNumber,
          packageVolume,
          averageLength,
          averageDiameter,
          packageStatusCode,
          comments,
          reprocessedIndicator,
          growthTypeCode,
          productTypeCode);
    }
  }

  public record PermitCorePackageContextRow(
      PermitCorePackageRow packageRow,
      ApplicationInfoRow applicationInfo,
      String jurisdictionCode,
      String exemptionTypeCode,
      String applicationProductTypeDescription,
      String packageProductTypeDescription,
      String applicationGrowthTypeDescription,
      String packageGrowthTypeDescription,
      String packageStatusDescription,
      boolean assignedToPermit) {

    PermitCorePackageContextRow withPackageRow(PermitCorePackageRow value) {
      return new PermitCorePackageContextRow(
          value,
          applicationInfo,
          jurisdictionCode,
          exemptionTypeCode,
          applicationProductTypeDescription,
          packageProductTypeDescription,
          applicationGrowthTypeDescription,
          packageGrowthTypeDescription,
          packageStatusDescription,
          assignedToPermit);
    }
  }

  public record PermitCoreScaleRow(
      PermitScaleDetailRow scaleRow, String speciesDescription, String gradeDescription) {}

  public record PermitFeeScaleRow(
      PermitScaleDetailRow scaleRow,
      String applicationProductTypeCode,
      String speciesDescription,
      String gradeDescription,
      String packageGrowthTypeCode,
      String packageGrowthTypeDescription,
      BigDecimal averageMarketValue) {}

  public record PermitCoreEndUseRow(
      String rowKind,
      Long applicationNumber,
      String packageNumber,
      String speciesCode,
      String endUseCode,
      String candidateExcolCode) {}

  public record ApplicationInfoRow(
      Long applicationNumber,
      String exemptionNumber,
      Long orgUnitNo,
      String regionName,
      String productTypeCode,
      String growthTypeCode,
      String endUseSort,
      String ownerClientNumber,
      String ownerClientLocationCode,
      String agentClientNumber,
      String agentClientLocationCode,
      String oicIndicator) {

    public ApplicationInfoRow(
        Long applicationNumber,
        String exemptionNumber,
        Long orgUnitNo,
        String regionName,
        String productTypeCode,
        String growthTypeCode,
        String endUseSort,
        String ownerClientNumber,
        String ownerClientLocationCode,
        String agentClientNumber,
        String agentClientLocationCode) {
      this(
          applicationNumber,
          exemptionNumber,
          orgUnitNo,
          regionName,
          productTypeCode,
          growthTypeCode,
          endUseSort,
          ownerClientNumber,
          ownerClientLocationCode,
          agentClientNumber,
          agentClientLocationCode,
          null);
    }

    public ApplicationInfoRow(
        Long applicationNumber,
        String exemptionNumber,
        Long orgUnitNo,
        String regionName,
        String productTypeCode,
        String growthTypeCode,
        String endUseSort) {
      this(
          applicationNumber,
          exemptionNumber,
          orgUnitNo,
          regionName,
          productTypeCode,
          growthTypeCode,
          endUseSort,
          null,
          null,
          null,
          null,
          null);
    }
  }

  public record PackageDetailsRow(
      String packageNumber,
      double packageVolume,
      double averageLength,
      double averageDiameter,
      String packageStatusCode,
      String comments,
      String reprocessedIndicator,
      String growthTypeCode) {}

  public record EndUsePairRow(String speciesCode, String endUseCode) {}

  /**
   * Package/application relationship returned by the legacy package cursors.
   *
   * Those cursors do not return a provincial permit number. Provincial permit assignment is
   * authoritative only on {@code EXPORT_SCALE_DETAIL.EXPORT_PERMIT_DETAIL_NUMBER}.
   */
  public record PackageCandidateRow(Long applicationNumber, String packageNumber) {}

  public record SalesInvoiceRow(
      String salesInvoiceNumber,
      double exportValue,
      double currencyConversionRate,
      double feeInLieu) {}

  public record PermitFeeOverrideRow(Double overrideFee, String overrideComment) {}

  public record PermitMutationRow(
      Long permitNumber,
      String destinationCompanyName,
      String transportName,
      LocalDate estimatedShippingDate,
      String otherPortOfExport,
      LocalDate applicationDate,
      LocalDate receivedDate,
      LocalDate permitIssueDate,
      String receiptNumber,
      LocalDate expiryDate,
      Double permitVolume,
      Long numberOfPieces,
      Long feeInLieuVolume,
      String federalPermitNumber,
      String remarks,
      String entryUserId,
      Timestamp entryTimestamp,
      String transportTypeCode,
      String scaleMethodCode,
      String clientNumber,
      String clientLocationCode,
      String agentNumber,
      String agentLocationCode,
      String exemptionNumber,
      Long orgUnitNo,
      String portOfExportCode,
      String permitStatusCode,
      String growthTypeCode,
      String countryCode,
      Double overrideFee,
      String overrideComment,
      Long oicApplicationNumber,
      Long oicRequestPieces,
      Double oicRequestVolume,
      String productTypeCode) {}

  public record GbmsInvoiceHistoryRow(
      String invoiceNumber,
      String cancelledByInvoice,
      String replacedByInvoice,
      Long permitNumber,
      double invoiceAmount,
      LocalDate printedDate,
      LocalDate entryDate,
      LocalDate updateDate) {}
}

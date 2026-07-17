package ca.bc.gov.mof.lexis.service.report;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.controlSafe;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.report.LexisReportScheduleRepository;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import net.sf.jasperreports.engine.JRException;
import net.sf.jasperreports.engine.JasperCompileManager;
import net.sf.jasperreports.engine.JasperExportManager;
import net.sf.jasperreports.engine.JasperFillManager;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.engine.JasperReport;
import net.sf.jasperreports.engine.export.JRCsvExporter;
import net.sf.jasperreports.engine.export.JRXlsExporter;
import net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter;
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleOutputStreamExporterOutput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;
import net.sf.jasperreports.export.SimpleXlsReportConfiguration;
import net.sf.jasperreports.export.SimpleXlsxReportConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisReportService implements LexisReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLexisReportService.class);
  private static final String BIWEEKLY_DATE_RANGE_MESSAGE =
      "Choose a Listing from date and Listing to date before generating the Advertising List.";
  private static final String BIWEEKLY_CURRENT_PERIOD_MESSAGE =
      "The current advertising period is unavailable because two advertising schedule dates "
          + "are not configured.";
  private static final String TEMPLATE_CLASSPATH_DIRECTORY = "reports/lexis";
  private static final String ROLE_ADMIN = "LEXIS_ADMIN";
  private static final String ROLE_READ_ONLY = "LEXIS_READ_ONLY";
  private static final String ROLE_APPLICATION_APPROVER = "LEXIS_APPLICATION_APPROVER";

  private static final Set<String> RUNTIME_TEMPLATE_RESOURCES =
      Set.of(
          "EXPORT_FEE_SUMMARY.jrxml",
          "LEXIS_EXEMPTION_LEDGER.jrxml",
          "LEXIS_OFFERS_LEDGER.jrxml",
          "LEXIS_PERMIT.jrxml",
          "LEXIS_PERMIT_LEDGER.jrxml",
          "LEXIS_TENURE_ANALYSIS.jrxml",
          "LEXIS_TRANSPORT_LEDGER.jrxml",
          "LEXIS_application_ledger.jrxml",
          "LEXIS_biweekly.jrxml",
          "LEXIS_PERMIT_SR1_LEXIS_PERMIT_SUB.jrxml",
          "LEXIS_application_ledger_SR1_app_subreport.jrxml",
          "LEXIS_biweekly_SR1_packages_sub_report.jrxml",
          "LEXIS_HEADER.jrxml",
          "lexis_flnr_bc_mark.jpg",
          "lexis_flnr_bc_mark_v.png",
          "lexis_flnr_logo.png");

  private final DataSource dataSource;
  private final LexisJasperReportParameterProvider parameterProvider;
  private final OracleLegacyCsvReportService legacyCsvReportService;
  private final OracleLegacyJasperTableReportService legacyJasperTableReportService;
  private final PermitRpcRepository permitRpcRepository;
  private final LexisReportScheduleRepository reportScheduleRepository;
  private final LexisSessionService sessionService;
  private final LexisReportResourceManager reportResources;
  private final ConcurrentHashMap<String, JasperReport> compiledTemplateCache = new ConcurrentHashMap<>();
  private final AtomicBoolean runtimeResourcesPrepared = new AtomicBoolean(false);
  private final Path runtimeTemplateDirectory;

  public OracleLexisReportService(
      DataSource dataSource,
      LexisJasperReportParameterProvider parameterProvider,
      OracleLegacyCsvReportService legacyCsvReportService,
      OracleLegacyJasperTableReportService legacyJasperTableReportService,
      PermitRpcRepository permitRpcRepository,
      LexisReportScheduleRepository reportScheduleRepository,
      LexisSessionService sessionService) {
    this(
        dataSource,
        parameterProvider,
        legacyCsvReportService,
        legacyJasperTableReportService,
        permitRpcRepository,
        reportScheduleRepository,
        sessionService,
        LexisReportResourceManager.defaults());
  }

  @Autowired
  public OracleLexisReportService(
      DataSource dataSource,
      LexisJasperReportParameterProvider parameterProvider,
      OracleLegacyCsvReportService legacyCsvReportService,
      OracleLegacyJasperTableReportService legacyJasperTableReportService,
      PermitRpcRepository permitRpcRepository,
      LexisReportScheduleRepository reportScheduleRepository,
      LexisSessionService sessionService,
      LexisReportResourceManager reportResources) {
    this.dataSource = dataSource;
    this.parameterProvider = parameterProvider;
    this.legacyCsvReportService = legacyCsvReportService;
    this.legacyJasperTableReportService = legacyJasperTableReportService;
    this.permitRpcRepository = permitRpcRepository;
    this.reportScheduleRepository = reportScheduleRepository;
    this.sessionService = sessionService;
    this.reportResources = reportResources;
    this.runtimeTemplateDirectory = initRuntimeTemplateDirectory();
  }

  @Override
  public Optional<LexisGeneratedReport> generateReport(
      String reportAction,
      LexisReportRequestDto request) {
    Optional<LexisJasperReportDefinition> definitionOptional =
        LexisJasperReportDefinition.fromAction(reportAction);
    if (definitionOptional.isEmpty()) {
      LOGGER.warn(
          "event=lexis_report operation=resolve outcome=unknown_action action={}",
          controlSafe(reportAction));
      return Optional.empty();
    }

    LexisJasperReportDefinition definition = definitionOptional.get();
    return generateResolvedReport(definition, request)
        .map(reportResources::requireWithinOutputLimit);
  }

  private Optional<LexisGeneratedReport> generateResolvedReport(
      LexisJasperReportDefinition definition, LexisReportRequestDto request) {
    LexisReportFormat requestedFormat =
        LexisReportFormat.fromNullable(request == null ? null : request.format());
    LexisReportFormat effectiveFormat = resolveEffectiveFormat(definition, requestedFormat);
    if (!canGeneratePermitReport(definition, request)) {
      LOGGER.warn(
          "event=lexis_report operation=authorize outcome=denied action={}",
          definition.action());
      return Optional.empty();
    }
    LexisReportRequestDto effectiveRequest = applyLegacyReportDefaults(definition, request);
    if (isUnboundedBiweeklyReport(definition, effectiveRequest)) {
      LOGGER.warn("Biweekly listing requested without a bounded date range");
      throw new LexisReportValidationException(BIWEEKLY_DATE_RANGE_MESSAGE);
    }

    Optional<LexisGeneratedReport> legacyCsvReport =
        legacyCsvReportService.generateLegacyCsvReport(definition, effectiveRequest, effectiveFormat);
    if (legacyCsvReport.isPresent()) {
      return legacyCsvReport;
    }

    Optional<LexisGeneratedReport> legacyPdfReport =
        legacyJasperTableReportService.generateLegacyPdfReport(definition, effectiveRequest, effectiveFormat);
    if (legacyPdfReport.isPresent()) {
      return legacyPdfReport;
    }

    if (!isTemplateFormatSupported(effectiveFormat)) {
      throw new LexisReportValidationException(
          "Report format must be PDF, CSV, XLS, or XLSX.");
    }

    if (!definition.supportsJasperTemplate()) {
      LOGGER.warn(
          "Report action [{}] has no migrated Jasper template yet", definition.action());
      return Optional.empty();
    }

    JasperReport jasperReport;
    try {
      prepareRuntimeResources();
      jasperReport =
          compiledTemplateCache.computeIfAbsent(
              definition.templateName(),
              templateName -> compileTemplate(definition));
    } catch (IllegalStateException ex) {
      LOGGER.error(
          "event=lexis_report operation=template_prepare outcome=failed action={} failureType={}",
          definition.action(),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The report template could not be prepared for " + definition.action(), ex);
    }

    HashMap<String, Object> parameters =
        new HashMap<>(parameterProvider.buildParameters(definition, effectiveRequest));
    parameters.put("SUBREPORT_DIR", runtimeTemplateDirectory.toAbsolutePath() + File.separator);
    parameters.put("SUBREPORT_EXT", ".jasper");

    long startedNanos = System.nanoTime();
    LOGGER.debug(
        "Generating Jasper report action [{}] format [{}]",
        definition.action(),
        effectiveFormat.name());
    try (LexisReportResourceManager.JasperVirtualizerSession ignored =
            reportResources.openVirtualizer(parameters);
        Connection connection = dataSource.getConnection()) {
      JasperPrint print =
          JasperFillManager.getInstance(reportResources.jasperReportsContext())
              .fill(jasperReport, parameters, connection);
      byte[] reportBytes = exportTemplateReport(print, effectiveFormat, definition);
      LOGGER.debug(
          "Generated Jasper report action [{}] format [{}] bytes [{}] durationMs [{}]",
          definition.action(),
          effectiveFormat.name(),
          reportBytes.length,
          elapsedMillis(startedNanos));
      return Optional.of(
          new LexisGeneratedReport(
              definition.resolveFilename(effectiveFormat),
              effectiveFormat.mediaType(),
              reportBytes));
    } catch (JRException ex) {
      reportResources.rethrowOutputLimit(ex);
      LOGGER.error(
          "event=lexis_report operation=jasper_render outcome=failed action={} durationMs={} failureType={}",
          definition.action(),
          elapsedMillis(startedNanos),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The report could not be rendered for " + definition.action(), ex);
    } catch (SQLException ex) {
      LOGGER.error(
          "event=lexis_report operation=oracle_load outcome=failed action={} durationMs={} failureType={}",
          definition.action(),
          elapsedMillis(startedNanos),
          exceptionType(ex));
      throw new LexisReportGenerationException(
          "The report data could not be loaded for " + definition.action(), ex);
    }
  }

  LexisReportFormat normalizeRequestedFormat(LexisReportFormat format) {
    return format;
  }

  LexisReportFormat resolveEffectiveFormat(
      LexisJasperReportDefinition definition, LexisReportFormat requestedFormat) {
    LexisReportFormat normalizedFormat = normalizeRequestedFormat(requestedFormat);
    if ((definition == LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT
            || definition == LexisJasperReportDefinition.PERMIT_REPORT)
        && normalizedFormat != LexisReportFormat.PDF) {
      return LexisReportFormat.PDF;
    }
    return normalizedFormat;
  }

  boolean isTemplateFormatSupported(LexisReportFormat format) {
    return format == LexisReportFormat.PDF
        || format == LexisReportFormat.CSV
        || format == LexisReportFormat.XLS
        || format == LexisReportFormat.XLSX;
  }

  LexisReportRequestDto applyLegacyReportDefaults(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request) {
    if (definition == LexisJasperReportDefinition.BIWEEKLY_LISTING) {
      return applyLegacyBiweeklyDefaults(request);
    }
    if (definition == LexisJasperReportDefinition.SPECIES_GRADE_REPORT) {
      return applyLegacySpeciesGradeDefaults(request);
    }
    if (definition == LexisJasperReportDefinition.TENURE_REPORT) {
      return applyLegacyTenureDefaults(request);
    }
    if (definition == LexisJasperReportDefinition.PERMIT_REPORT) {
      return applyLegacyPermitReportDefaults(request);
    }

    return request;
  }

  private boolean isUnboundedBiweeklyReport(
      LexisJasperReportDefinition definition, LexisReportRequestDto request) {
    if (definition != LexisJasperReportDefinition.BIWEEKLY_LISTING) {
      return false;
    }
    Map<String, String> parameters =
        request == null || request.parameters() == null ? Map.of() : request.parameters();
    return isBlank(parameters.get("fromDate")) || isBlank(parameters.get("toDate"));
  }

  private LexisReportRequestDto applyLegacyBiweeklyDefaults(LexisReportRequestDto request) {
    HashMap<String, String> parameters =
        new HashMap<>(request == null || request.parameters() == null ? Map.of() : request.parameters());
    boolean blankDateRange = isBlank(parameters.get("fromDate")) && isBlank(parameters.get("toDate"));
    if (!blankDateRange) {
      return request;
    }

    List<LexisReportScheduleRepository.CurrentScheduleRow> schedules =
        Optional.ofNullable(reportScheduleRepository.findCurrentSchedulesRequired()).orElse(List.of());
    if (schedules.size() < 2
        || schedules.get(0).advertisingDate() == null
        || schedules.get(1).advertisingDate() == null) {
      LOGGER.warn("Unable to apply legacy biweekly schedule defaults");
      throw new LexisReportValidationException(BIWEEKLY_CURRENT_PERIOD_MESSAGE);
    }

    LocalDate fromDate = schedules.get(0).advertisingDate();
    LocalDate toDate = schedules.get(1).advertisingDate().minusDays(1);

    parameters.put("fromDate", fromDate.toString());
    parameters.put("toDate", toDate.toString());
    return new LexisReportRequestDto(parameters, request == null ? null : request.format());
  }

  private LexisReportRequestDto applyLegacyPermitReportDefaults(LexisReportRequestDto request) {
    HashMap<String, String> parameters =
        new HashMap<>(request == null || request.parameters() == null ? Map.of() : request.parameters());

    Long permitNumber = parsePermitNumber(parameters.get("permitNumber"));
    if (permitNumber == null) {
      return new LexisReportRequestDto(parameters, request == null ? null : request.format());
    }

    Optional<String> invoiceNumber =
        permitRpcRepository
            .findGbmsInvoiceHistoryRequired("", permitNumber, currentUserIsReadOnly())
            .stream()
            .map(PermitRpcRepository.GbmsInvoiceHistoryRow::invoiceNumber)
            .filter(invoice -> invoice != null && !invoice.isBlank())
            .findFirst();
    parameters.put("invoiceNumber", invoiceNumber.orElse(""));
    return new LexisReportRequestDto(parameters, request == null ? null : request.format());
  }

  boolean canGeneratePermitReport(
      LexisJasperReportDefinition definition,
      LexisReportRequestDto request) {
    if (definition != LexisJasperReportDefinition.PERMIT_REPORT) {
      return true;
    }
    if (currentUserHasRole(ROLE_ADMIN)
        || currentUserHasRole(ROLE_APPLICATION_APPROVER)
        || currentUserHasRole(ROLE_READ_ONLY)) {
      return true;
    }

    Long permitNumber =
        parsePermitNumber(
            request == null || request.parameters() == null ? null : request.parameters().get("permitNumber"));
    if (permitNumber == null) {
      return false;
    }

    String clientNumber = currentUserForestClientNumber();
    if (isBlank(clientNumber)) {
      return false;
    }

    Optional<PermitRpcRepository.PermitMutationRow> permit =
        permitRpcRepository.findPermitMutationByPermitNumber(permitNumber);
    if (permit.isEmpty()) {
      return false;
    }
    PermitRpcRepository.PermitMutationRow row = permit.orElseThrow();
    if (matchesClient(clientNumber, row.agentNumber()) || matchesClient(clientNumber, row.clientNumber())) {
      return true;
    }

    return permitRpcRepository.findApplicationNumbersByPermitNumberRequired(permitNumber).stream()
        .map(permitRpcRepository::findApplicationInfoByNumber)
        .flatMap(Optional::stream)
        .anyMatch(
            application ->
                matchesClient(clientNumber, application.agentClientNumber())
                    || matchesClient(clientNumber, application.ownerClientNumber()));
  }

  private String currentUserForestClientNumber() {
    return sessionService.resolveForestClientNumber(SecurityContextHolder.getContext().getAuthentication());
  }

  private boolean matchesClient(String expectedClientNumber, String actualClientNumber) {
    if (isBlank(expectedClientNumber) || isBlank(actualClientNumber)) {
      return false;
    }
    return expectedClientNumber.trim().equalsIgnoreCase(actualClientNumber.trim());
  }

  private Long parsePermitNumber(String rawValue) {
    if (isBlank(rawValue)) {
      return null;
    }
    try {
      long permitNumber = Long.parseLong(rawValue.trim());
      return permitNumber > 0 ? permitNumber : null;
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private boolean currentUserIsReadOnly() {
    return currentUserHasRole(ROLE_READ_ONLY);
  }

  private boolean currentUserHasRole(String role) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null || authentication.getAuthorities() == null) {
      return false;
    }
    return authentication.getAuthorities().stream()
        .map(GrantedAuthority::getAuthority)
        .filter(authority -> authority != null)
        .map(authority -> authority.trim().toUpperCase(Locale.ROOT))
        .anyMatch(role::equals);
  }

  private LexisReportRequestDto applyLegacySpeciesGradeDefaults(LexisReportRequestDto request) {
    HashMap<String, String> parameters =
        new HashMap<>(request == null || request.parameters() == null ? Map.of() : request.parameters());
    if (isBlank(parameters.get("permitStatus"))) {
      parameters.put("permitStatus", "COM");
    }
    return new LexisReportRequestDto(parameters, request == null ? null : request.format());
  }

  private LexisReportRequestDto applyLegacyTenureDefaults(LexisReportRequestDto request) {
    HashMap<String, String> parameters =
        new HashMap<>(request == null || request.parameters() == null ? Map.of() : request.parameters());
    LocalDate today = LexisBusinessTime.today();
    if (isBlank(parameters.get("fromDate"))) {
      parameters.put("fromDate", LocalDate.of(today.getYear() - 1, today.getMonth(), 1).toString());
    }
    if (isBlank(parameters.get("toDate"))) {
      LocalDate previousMonth = today.minusMonths(1);
      parameters.put("toDate", previousMonth.withDayOfMonth(previousMonth.lengthOfMonth()).toString());
    }
    return new LexisReportRequestDto(parameters, request == null ? null : request.format());
  }

  private boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }

  byte[] exportTemplateReport(
      JasperPrint print,
      LexisReportFormat format,
      LexisJasperReportDefinition definition)
      throws JRException {
    if (format == LexisReportFormat.PDF) {
      LexisReportResourceManager.LimitedByteArrayOutputStream output =
          reportResources.newOutputStream();
      JasperExportManager.exportReportToPdfStream(print, output);
      return reportResources.requireWithinOutputLimit(output.toByteArray());
    }
    if (format == LexisReportFormat.CSV) {
      return exportTemplateCsv(print);
    }
    if (format == LexisReportFormat.XLS) {
      return exportTemplateXls(print);
    }
    if (format == LexisReportFormat.XLSX) {
      return exportTemplateXlsx(print);
    }
    throw new IllegalStateException(
        "Unsupported template export format [" + format.name() + "] for action " + definition.action());
  }

  byte[] exportTemplateCsv(JasperPrint print) throws JRException {
    LexisReportResourceManager.LimitedByteArrayOutputStream output =
        reportResources.newOutputStream();
    JRCsvExporter exporter = new JRCsvExporter();
    exporter.setExporterInput(new SimpleExporterInput(print));
    exporter.setExporterOutput(
        new SimpleWriterExporterOutput(output, StandardCharsets.UTF_8.name()));
    exporter.exportReport();
    return reportResources.requireWithinOutputLimit(sanitizeTemplateCsv(output.toByteArray()));
  }

  byte[] sanitizeTemplateCsv(byte[] csvBytes) {
    String csv = new String(csvBytes == null ? new byte[0] : csvBytes, StandardCharsets.UTF_8);
    List<List<String>> rows = new ArrayList<>();
    List<String> row = new ArrayList<>();
    StringBuilder cell = new StringBuilder();
    boolean quoted = false;
    boolean rowStarted = false;

    for (int index = 0; index < csv.length(); index++) {
      char current = csv.charAt(index);
      if (quoted) {
        if (current == '"') {
          if (index + 1 < csv.length() && csv.charAt(index + 1) == '"') {
            cell.append('"');
            index++;
          } else {
            quoted = false;
          }
        } else {
          cell.append(current);
        }
        rowStarted = true;
        continue;
      }
      if (current == '"' && cell.length() == 0) {
        quoted = true;
        rowStarted = true;
      } else if (current == ',') {
        row.add(cell.toString());
        cell.setLength(0);
        rowStarted = true;
      } else if (current == '\r' || current == '\n') {
        if (current == '\r' && index + 1 < csv.length() && csv.charAt(index + 1) == '\n') {
          index++;
        }
        row.add(cell.toString());
        rows.add(row);
        row = new ArrayList<>();
        cell.setLength(0);
        rowStarted = false;
      } else {
        cell.append(current);
        rowStarted = true;
      }
    }
    if (rowStarted || cell.length() > 0 || !row.isEmpty()) {
      row.add(cell.toString());
      rows.add(row);
    }

    StringBuilder safeCsv = new StringBuilder(csv.length() + 64);
    for (List<String> values : rows) {
      for (int index = 0; index < values.size(); index++) {
        if (index > 0) {
          safeCsv.append(',');
        }
        safeCsv.append('"').append(sanitizeCsvCell(values.get(index))).append('"');
      }
      safeCsv.append('\n');
    }
    return reportResources.requireWithinOutputLimit(
        safeCsv.toString().getBytes(StandardCharsets.UTF_8));
  }

  private String sanitizeCsvCell(String input) {
    String sanitized =
        input == null
            ? ""
            : input.replace("\"", "\"\"").replace("\n", "").replace("\r", "").replace("\f", "");
    String candidate = sanitized.stripLeading();
    boolean startsWithControl = !sanitized.isEmpty() && sanitized.charAt(0) == '\t';
    boolean startsWithFormula =
        !candidate.isEmpty()
            && (candidate.charAt(0) == '='
                || candidate.charAt(0) == '+'
                || candidate.charAt(0) == '-'
                || candidate.charAt(0) == '@');
    return startsWithControl || startsWithFormula ? "'" + sanitized : sanitized;
  }

  byte[] exportTemplateXlsx(JasperPrint print) throws JRException {
    LexisReportResourceManager.LimitedByteArrayOutputStream output =
        reportResources.newOutputStream();
    JRXlsxExporter exporter = new JRXlsxExporter();
    SimpleXlsxReportConfiguration configuration = new SimpleXlsxReportConfiguration();
    configuration.setDetectCellType(true);
    configuration.setOnePagePerSheet(false);
    configuration.setRemoveEmptySpaceBetweenRows(true);
    configuration.setWhitePageBackground(false);
    exporter.setConfiguration(configuration);
    exporter.setExporterInput(new SimpleExporterInput(print));
    exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(output));
    exporter.exportReport();
    return reportResources.requireWithinOutputLimit(output.toByteArray());
  }

  byte[] exportTemplateXls(JasperPrint print) throws JRException {
    LexisReportResourceManager.LimitedByteArrayOutputStream output =
        reportResources.newOutputStream();
    JRXlsExporter exporter = new JRXlsExporter();
    SimpleXlsReportConfiguration configuration = new SimpleXlsReportConfiguration();
    configuration.setDetectCellType(true);
    configuration.setOnePagePerSheet(false);
    configuration.setRemoveEmptySpaceBetweenRows(true);
    configuration.setWhitePageBackground(false);
    exporter.setConfiguration(configuration);
    exporter.setExporterInput(new SimpleExporterInput(print));
    exporter.setExporterOutput(new SimpleOutputStreamExporterOutput(output));
    exporter.exportReport();
    return reportResources.requireWithinOutputLimit(output.toByteArray());
  }

  JasperReport compileTemplate(LexisJasperReportDefinition definition) {
    Path templatePath = runtimeTemplateDirectory.resolve(definition.templateName() + ".jrxml");
    if (!Files.exists(templatePath)) {
      throw new IllegalStateException(
          "No JRXML template at " + templatePath + " for action " + definition.action());
    }

    try {
      return JasperCompileManager.compileReport(templatePath.toString());
    } catch (JRException ex) {
      LOGGER.error(
          "event=lexis_report operation=template_compile outcome=failed action={} failureType={}",
          definition.action(),
          exceptionType(ex));
      throw new IllegalStateException("Failed to compile JRXML for report " + definition.action(), ex);
    }
  }

  private static long elapsedMillis(long startedNanos) {
    return (System.nanoTime() - startedNanos) / 1_000_000L;
  }

  private Path initRuntimeTemplateDirectory() {
    Path directory =
        Path.of(System.getProperty("java.io.tmpdir"), "lexis-jasper-runtime");
    try {
      Files.createDirectories(directory);
      return directory;
    } catch (IOException ex) {
      throw new IllegalStateException("Unable to create Jasper runtime directory: " + directory, ex);
    }
  }

  private void prepareRuntimeResources() {
    if (runtimeResourcesPrepared.get()) {
      return;
    }

    synchronized (runtimeResourcesPrepared) {
      if (runtimeResourcesPrepared.get()) {
        return;
      }

      for (String resourceName : RUNTIME_TEMPLATE_RESOURCES) {
        copyRuntimeResource(resourceName);
        if (resourceName.endsWith(".jrxml")) {
          compileRuntimeTemplate(resourceName);
        }
      }

      runtimeResourcesPrepared.set(true);
    }
  }

  private void copyRuntimeResource(String resourceName) {
    String classpath = TEMPLATE_CLASSPATH_DIRECTORY + "/" + resourceName;
    ClassPathResource resource = new ClassPathResource(classpath);

    if (!resource.exists()) {
      throw new IllegalStateException("Missing classpath resource for Jasper runtime: " + classpath);
    }

    Path destination = runtimeTemplateDirectory.resolve(resourceName);

    try (InputStream inputStream = resource.getInputStream()) {
      Files.copy(inputStream, destination, StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException ex) {
      throw new IllegalStateException(
          "Failed to prepare Jasper runtime resource: " + resourceName,
          ex);
    }
  }

  private void compileRuntimeTemplate(String resourceName) {
    Path source = runtimeTemplateDirectory.resolve(resourceName);
    Path destination =
        runtimeTemplateDirectory.resolve(resourceName.replace(".jrxml", ".jasper"));

    if (Files.exists(destination)) {
      return;
    }

    try {
      JasperCompileManager.compileReportToFile(source.toString(), destination.toString());
    } catch (JRException ex) {
      throw new IllegalStateException(
          "Failed to compile Jasper runtime template: " + resourceName,
          ex);
    }
  }
}

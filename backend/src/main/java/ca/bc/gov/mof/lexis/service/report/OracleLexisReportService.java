package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
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
import net.sf.jasperreports.export.SimpleExporterInput;
import net.sf.jasperreports.export.SimpleWriterExporterOutput;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleLexisReportService implements LexisReportService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleLexisReportService.class);
  private static final String TEMPLATE_CLASSPATH_DIRECTORY = "reports/lexis";

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
  private final ConcurrentHashMap<String, JasperReport> compiledTemplateCache = new ConcurrentHashMap<>();
  private final AtomicBoolean runtimeResourcesPrepared = new AtomicBoolean(false);
  private final Path runtimeTemplateDirectory;

  public OracleLexisReportService(
      DataSource dataSource,
      LexisJasperReportParameterProvider parameterProvider,
      OracleLegacyCsvReportService legacyCsvReportService,
      OracleLegacyJasperTableReportService legacyJasperTableReportService) {
    this.dataSource = dataSource;
    this.parameterProvider = parameterProvider;
    this.legacyCsvReportService = legacyCsvReportService;
    this.legacyJasperTableReportService = legacyJasperTableReportService;
    this.runtimeTemplateDirectory = initRuntimeTemplateDirectory();
  }

  @Override
  public Optional<LexisGeneratedReport> generateReport(
      String reportAction,
      LexisReportRequestDto request) {
    Optional<LexisJasperReportDefinition> definitionOptional =
        LexisJasperReportDefinition.fromAction(reportAction);

    if (definitionOptional.isEmpty()) {
      LOGGER.warn("Unknown report action [{}]", reportAction);
      return Optional.empty();
    }

    LexisJasperReportDefinition definition = definitionOptional.get();
    LexisReportFormat requestedFormat =
        LexisReportFormat.fromNullable(request == null ? null : request.format());
    LexisReportFormat effectiveFormat = resolveEffectiveFormat(definition, requestedFormat);

    Optional<LexisGeneratedReport> legacyCsvReport =
        legacyCsvReportService.generateLegacyCsvReport(definition, request, effectiveFormat);
    if (legacyCsvReport.isPresent()) {
      return legacyCsvReport;
    }

    Optional<LexisGeneratedReport> legacyPdfReport =
        legacyJasperTableReportService.generateLegacyPdfReport(definition, request, effectiveFormat);
    if (legacyPdfReport.isPresent()) {
      return legacyPdfReport;
    }

    if (!isTemplateFormatSupported(effectiveFormat)) {
      LOGGER.warn(
          "Report action [{}] requested unsupported format [{}] in current migration state",
          definition.action(),
          requestedFormat.name());
      return Optional.empty();
    }

    if (!definition.supportsJasperTemplate()) {
      LOGGER.warn(
          "Report action [{}] has no migrated Jasper template yet", definition.action());
      return Optional.empty();
    }

    prepareRuntimeResources();

    JasperReport jasperReport =
        compiledTemplateCache.computeIfAbsent(
            definition.templateName(),
            templateName -> compileTemplate(definition));

    HashMap<String, Object> parameters =
        new HashMap<>(parameterProvider.buildParameters(definition, request));
    parameters.put("SUBREPORT_DIR", runtimeTemplateDirectory.toAbsolutePath() + File.separator);
    parameters.put("SUBREPORT_EXT", ".jrxml");

    try (Connection connection = dataSource.getConnection()) {
      JasperPrint print = JasperFillManager.fillReport(jasperReport, parameters, connection);
      byte[] reportBytes = exportTemplateReport(print, effectiveFormat, definition);
      return Optional.of(
          new LexisGeneratedReport(
              definition.resolveFilename(effectiveFormat),
              effectiveFormat.mediaType(),
              reportBytes));
    } catch (JRException ex) {
      LOGGER.error("Jasper fill/export failed for report action [{}]", definition.action(), ex);
      throw new IllegalStateException("Failed to render report " + definition.action(), ex);
    } catch (SQLException ex) {
      LOGGER.error("Oracle connection failed for report action [{}]", definition.action(), ex);
      throw new IllegalStateException("Failed to connect to Oracle for report " + definition.action(), ex);
    }
  }

  LexisReportFormat normalizeRequestedFormat(LexisReportFormat format) {
    if (format == LexisReportFormat.XLS || format == LexisReportFormat.XLSX) {
      // Legacy Struts routes used XLS UI labels while generating CSV output.
      return LexisReportFormat.CSV;
    }
    return format;
  }

  LexisReportFormat resolveEffectiveFormat(
      LexisJasperReportDefinition definition, LexisReportFormat requestedFormat) {
    LexisReportFormat normalizedFormat = normalizeRequestedFormat(requestedFormat);
    if (definition == LexisJasperReportDefinition.APPROVED_EXEMPTION_REPORT
        && normalizedFormat != LexisReportFormat.PDF) {
      return LexisReportFormat.PDF;
    }
    return normalizedFormat;
  }

  boolean isTemplateFormatSupported(LexisReportFormat format) {
    return format == LexisReportFormat.PDF || format == LexisReportFormat.CSV;
  }

  byte[] exportTemplateReport(
      JasperPrint print,
      LexisReportFormat format,
      LexisJasperReportDefinition definition)
      throws JRException {
    if (format == LexisReportFormat.PDF) {
      return JasperExportManager.exportReportToPdf(print);
    }
    if (format == LexisReportFormat.CSV) {
      return exportTemplateCsv(print);
    }
    throw new IllegalStateException(
        "Unsupported template export format [" + format.name() + "] for action " + definition.action());
  }

  byte[] exportTemplateCsv(JasperPrint print) throws JRException {
    ByteArrayOutputStream output = new ByteArrayOutputStream(32 * 1024);
    JRCsvExporter exporter = new JRCsvExporter();
    exporter.setExporterInput(new SimpleExporterInput(print));
    exporter.setExporterOutput(
        new SimpleWriterExporterOutput(output, StandardCharsets.UTF_8.name()));
    exporter.exportReport();
    return output.toByteArray();
  }

  private JasperReport compileTemplate(LexisJasperReportDefinition definition) {
    Path templatePath = runtimeTemplateDirectory.resolve(definition.templateName() + ".jrxml");
    if (!Files.exists(templatePath)) {
      throw new IllegalStateException(
          "No JRXML template at " + templatePath + " for action " + definition.action());
    }

    try {
      return JasperCompileManager.compileReport(templatePath.toString());
    } catch (JRException ex) {
      LOGGER.error(
          "Failed to compile JRXML for report action [{}] from [{}]",
          definition.action(),
          templatePath,
          ex);
      throw new IllegalStateException("Failed to compile JRXML for report " + definition.action(), ex);
    }
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
}

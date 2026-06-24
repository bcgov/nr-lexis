package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.util.DateUtils.parseIsoOrLegacyDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseRetrievalDate;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("oracle")
public class OracleRtmEmsLogAmvService implements RtmEmsLogAmvService {

  private static final String SAVE_MODE_CREATE = "create";
  private static final String SAVE_MODE_UPDATE = "update";
  private static final String RETURN_SUCCESS = "accepted";
  private static final String RETURN_FAILURE = "rejected";
  private static final String RETURN_VALIDATION = "validation_failed";

  private final OracleRtmEmsLogAmvRepository repository;

  @Autowired
  public OracleRtmEmsLogAmvService(OracleRtmEmsLogAmvRepository repository) {
    this.repository = repository;
  }

  @Override
  public List<RtmEmsLogAmvRowDto> find(
    String species,
    String growthIndicator,
    String retrievalDate,
    String updateDate) {
    LocalDate parsedRetrievalDate = parseRetrievalDate(retrievalDate);
    LocalDate parsedUpdateDate = parseIsoOrLegacyDate(updateDate);

    return repository.find(
        trimToNull(species),
        trimToNull(growthIndicator),
        parsedRetrievalDate,
        parsedUpdateDate);
  }

  @Override
  public RtmEmsLogAmvMutationResultDto save(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = validateSaveRequest(request);
    if (!errors.isEmpty()) {
      return buildMutationResult(RETURN_VALIDATION, "Please correct the highlighted fields.", errors, List.of());
    }

    String species = trimToNull(request.species());
    String grade = trimToNull(request.grade());
    String growthIndicator = trimToNull(request.growthIndicator());
    LocalDate retrievalDate = parseRetrievalDate(request.retrievalDate());
    LocalDate updateDate = parseIsoOrLegacyDate(request.updateDate());
    String saveMode = request.effectiveSaveMode();

    String returnCode =
        SAVE_MODE_UPDATE.equals(saveMode)
            ? repository.update(
                species,
                grade,
                growthIndicator,
                retrievalDate,
                updateDate,
                request.newValue())
            : repository.insert(species, grade, growthIndicator, retrievalDate, request.newValue());

    if (!isSuccess(returnCode)) {
      return buildMutationResult(
          RETURN_FAILURE,
          "Oracle reported an error while saving RTM AMV row.",
          List.of("Save returned code " + returnCode),
          List.of());
    }

    return buildMutationResult(
        RETURN_SUCCESS,
        "Save completed. " + (SAVE_MODE_UPDATE.equals(saveMode) ? "Updated" : "Created") + " value.",
        List.of(),
        List.of(buildSavedRow(species, grade, growthIndicator, retrievalDate, updateDate, request)));
  }

  @Override
  public RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return buildPreview("rejected", "No file provided.", 0, List.of("Choose a .xlsx file."), List.of());
    }

    String fileName = trimToNull(file.getOriginalFilename());
    if (!isXlsx(file) ) {
      return buildPreview("rejected", "File type is not supported.", 0, List.of("Upload an XLSX file."), List.of());
    }

    try {
      RtmEmsLogAmvUploadPreviewAnalyzer.Analysis analysis =
          RtmEmsLogAmvUploadPreviewAnalyzer.analyze(file.getInputStream());
      List<String> warnings = new ArrayList<>(analysis.warnings());
      List<String> errors = new ArrayList<>(analysis.errors());

      if (analysis.dataRowCount() == 0) {
        errors.add("The uploaded file contains no data rows.");
      }
      if (analysis.numericCellCount() == 0) {
        errors.add("The uploaded file does not contain any numeric AMV values.");
      }
      if (!analysis.headerDetected()) {
        errors.add("The template header is not recognized as an RTM EMS AMV sheet.");
      }
      if (analysis.dataRowCount() > 0 && analysis.dataRowCount() < 2) {
        warnings.add("The uploaded file has very few rows; confirm it contains full AMV data.");
      }

      return buildPreview(
          errors.isEmpty() ? "accepted" : RETURN_VALIDATION,
          errors.isEmpty() ? "File parsed for preview." : "Upload template validation failed.",
          analysis.dataRowCount(),
          errors,
          warnings,
          fileName,
          file.getSize());
    } catch (IOException ex) {
      return buildPreview(
          "rejected",
          "Could not parse workbook for preview.",
          0,
          List.of("The XLSX file could not be read."),
          List.of());
    }
  }

  @Override
  @Transactional
  public RtmEmsLogAmvUploadResultDto upload(
      MultipartFile file, String retrievalDate, String growthIndicator) {
    List<String> validationErrors = validateUploadRequest(file, retrievalDate, growthIndicator);
    if (!validationErrors.isEmpty()) {
      return buildUploadResult(
          RETURN_VALIDATION,
          "Upload template validation failed.",
          trimToNull(file == null ? null : file.getOriginalFilename()),
          file == null ? 0L : file.getSize(),
          0,
          0,
          validationErrors,
          List.of(),
          List.of());
    }

    String fileName = trimToNull(file.getOriginalFilename());
    long fileSize = file.getSize();
    String normalizedGrowthIndicator = trimToNull(growthIndicator);
    LocalDate parsedRetrievalDate = parseRetrievalDate(trimToNull(retrievalDate));

    try {
      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult parseResult =
          RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(file.getInputStream());

      List<String> warnings = new ArrayList<>(parseResult.warnings());
      List<String> errors = new ArrayList<>(parseResult.errors());
      List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> uploadRows =
          parseResult.rows().stream()
              .filter(row -> isUploadableRow(row.species(), row.grade()))
              .toList();

      if (uploadRows.size() < parseResult.rows().size()) {
        warnings.add("Some rows were skipped because they were missing grade/species values.");
      }

      Map<String, RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> rowsBySpeciesAndGrade =
          uploadRows.stream()
              .collect(
                  LinkedHashMap::new,
                  (map, row) -> {
                    String species = trimToNull(row.species());
                    String grade = trimToNull(row.grade());
                    if (species == null || grade == null) {
                      return;
                    }
                    String key = species.toUpperCase() + "|" + grade.toUpperCase();
                    if (map.containsKey(key)) {
                      RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow previous = map.get(key);
                      warnings.add(
                          "Duplicate upload row in source row %d for species '%s' and grade '%s' replaced previous source row %d."
                              .formatted(
                                  row.sourceRow(),
                                  species,
                                  grade,
                                  previous.sourceRow()));
                    }
                    map.put(key, row);
                  },
                  Map::putAll);
      ArrayList<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> rowsToUpload =
          new ArrayList<>(rowsBySpeciesAndGrade.values());

      if (rowsToUpload.isEmpty()) {
        errors.add("No valid AMV rows were found to upload.");
      }
      if (parseResult.dataRowCount() == 0) {
        errors.add("The uploaded file contains no data rows.");
      }
      if (parseResult.numericCellCount() == 0) {
        errors.add("The uploaded file does not contain any numeric AMV values.");
      }
      if (!parseResult.headerDetected()) {
        errors.add("The template header is not recognized as an RTM EMS AMV sheet.");
      }

      if (!errors.isEmpty()) {
        return buildUploadResult(
            RETURN_VALIDATION,
            "Upload template validation failed.",
            fileName,
            fileSize,
            rowsToUpload.size(),
            0,
            errors,
            warnings,
            List.of());
      }

      List<RtmEmsLogAmvRowDto> uploadedRows = new ArrayList<>();
      int uploadedCount = 0;
      for (RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow row : rowsToUpload) {
        String species = trimToNull(row.species());
        String grade = trimToNull(row.grade());
        BigDecimal newValue = row.newValue();
        String effectiveMode = SAVE_MODE_CREATE;
        String requestUpdateDate = null;

        if (existingRowExists(species, grade, normalizedGrowthIndicator, parsedRetrievalDate)) {
          effectiveMode = SAVE_MODE_UPDATE;
          requestUpdateDate = formatDate(LocalDate.now(Clock.systemUTC()));
          warnings.add(
              "Existing record found for species '%s', grade '%s' (source row %d); row will be updated."
                  .formatted(species, grade, row.sourceRow()));
        }

        RtmEmsLogAmvMutationResultDto mutationResult =
            save(
                new RtmEmsLogAmvSaveRequestDto(
                    species,
                    grade,
                    normalizedGrowthIndicator,
                    formatDate(parsedRetrievalDate),
                    requestUpdateDate,
                    newValue,
                    effectiveMode));

        if ("accepted".equalsIgnoreCase(mutationResult.status())) {
          uploadedCount++;
          uploadedRows.addAll(mutationResult.rows());
          continue;
        }

        errors.add(
            "Unable to save row for species '%s', grade '%s' (source row %d, source column %s)."
                .formatted(
                    species, grade, row.sourceRow(), columnToLetter(row.sourceColumn())));
        errors.addAll(mutationResult.errors());
      }

      if (!errors.isEmpty() && uploadedCount > 0) {
        markRollbackOnly();
        return buildUploadResult(
            RETURN_VALIDATION,
            "Upload rejected; no rows were saved.",
            fileName,
            fileSize,
            rowsToUpload.size(),
            0,
            errors,
            warnings,
            List.of());
      }

      return buildUploadResult(
          errors.isEmpty() ? RETURN_SUCCESS : (uploadedCount > 0 ? RETURN_VALIDATION : RETURN_FAILURE),
          errors.isEmpty()
              ? "Upload completed."
              : "Upload completed with errors for one or more rows.",
          fileName,
          fileSize,
          rowsToUpload.size(),
          uploadedCount,
          errors,
          warnings,
          uploadedRows);
    } catch (IOException ex) {
      return buildUploadResult(
          RETURN_FAILURE,
          "Could not parse workbook for upload.",
          fileName,
          fileSize,
          0,
          0,
          List.of("The XLSX file could not be read."),
          List.of(),
          List.of());
    }
  }

  private List<String> validateSaveRequest(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = new ArrayList<>();

    String species = trimToNull(request.species());
    if (species == null) {
      errors.add("Species is required.");
    }

    String grade = trimToNull(request.grade());
    if (grade == null) {
      errors.add("Grade is required.");
    }

    String growthIndicator = trimToNull(request.growthIndicator());
    if (growthIndicator == null) {
      errors.add("Growth indicator is required.");
    }

    if (parseRetrievalDate(request.retrievalDate()) == null) {
      errors.add("Retrieval date is required and must be a valid date.");
    }

    if (request.newValue() == null) {
      errors.add("New value is required.");
    }
    if (request.newValue() != null && request.newValue().signum() < 0) {
      errors.add("New value must be greater than or equal to zero.");
    }

    String saveMode = request.effectiveSaveMode();
    if (!SAVE_MODE_CREATE.equals(saveMode) && !SAVE_MODE_UPDATE.equals(saveMode)) {
      errors.add("Save mode must be 'create' or 'update'.");
    }

    if (SAVE_MODE_UPDATE.equals(saveMode) && parseIsoOrLegacyDate(request.updateDate()) == null) {
      errors.add("Update date is required for update mode.");
    }

    return errors;
  }

  private RtmEmsLogAmvRowDto buildSavedRow(
      String species,
      String grade,
      String growthIndicator,
      LocalDate retrievalDate,
      LocalDate updateDate,
      RtmEmsLogAmvSaveRequestDto request) {
    return new RtmEmsLogAmvRowDto(
        species,
        grade,
        growthIndicator,
        formatDate(retrievalDate),
        formatDate(updateDate),
        null,
        request.newValue(),
        "0");
  }

  private RtmEmsLogAmvMutationResultDto buildMutationResult(
      String status,
      String message,
      List<String> errors,
      List<RtmEmsLogAmvRowDto> rows) {
    return new RtmEmsLogAmvMutationResultDto(status, message, errors, rows);
  }

  private RtmEmsLogAmvUploadPreviewDto buildPreview(
      String status,
      String message,
      int rowCount,
      List<String> errors,
      List<String> warnings) {
    return buildPreview(status, message, rowCount, errors, warnings, null, 0);
  }

  private RtmEmsLogAmvUploadPreviewDto buildPreview(
      String status,
      String message,
      int rowCount,
      List<String> errors,
      List<String> warnings,
      String fileName,
      long fileSize) {
    return new RtmEmsLogAmvUploadPreviewDto(
        status, fileName, fileSize, message, rowCount, errors, warnings);
  }

  private String formatDate(LocalDate date) {
    return date == null ? null : date.toString();
  }

  private boolean isSuccess(String returnCode) {
    String normalized = trimToNull(returnCode);
    return normalized == null || "0".equals(normalized);
  }

  private boolean isXlsx(MultipartFile file) {
    String normalizedType = trimToNull(file.getContentType());
    if (normalizedType != null && normalizedType.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
      return true;
    }

    String fileName = trimToNull(file.getOriginalFilename());
    return fileName != null && fileName.toLowerCase().endsWith(".xlsx");
  }

  private List<String> validateUploadRequest(
      MultipartFile file, String retrievalDate, String growthIndicator) {
    List<String> errors = new ArrayList<>();

    if (file == null || file.isEmpty()) {
      errors.add("No file provided.");
      return errors;
    }

    if (!isXlsx(file)) {
      errors.add("File type is not supported.");
    }

    if (trimToNull(retrievalDate) == null) {
      errors.add("Retrieval date is required.");
    } else if (parseRetrievalDate(retrievalDate) == null) {
      errors.add("Retrieval date must be a valid date.");
    }

    if (trimToNull(growthIndicator) == null) {
      errors.add("Growth indicator is required.");
    }

    return errors;
  }

  private boolean isUploadableRow(String species, String grade) {
    String normalizedSpecies = trimToNull(species);
    String normalizedGrade = trimToNull(grade);
    if (normalizedSpecies == null || normalizedGrade == null) {
      return false;
    }

    String upperGrade = normalizedGrade.toUpperCase();
    return !upperGrade.equals("AVERAGE") && !upperGrade.startsWith("GRAND TOTAL");
  }

  private boolean existingRowExists(
      String species,
      String grade,
      String growthIndicator,
      LocalDate retrievalDate) {
    return repository
        .find(species, growthIndicator, retrievalDate, null)
        .stream()
        .anyMatch(
            row ->
                trimToNull(row.species()) != null
                    && trimToNull(row.species()).equalsIgnoreCase(species)
                    && trimToNull(row.grade()) != null
                    && trimToNull(row.grade()).equalsIgnoreCase(grade)
                    && trimToNull(row.growthIndicator()) != null
                    && trimToNull(row.growthIndicator()).equalsIgnoreCase(growthIndicator));
  }

  private String columnToLetter(int index) {
    StringBuilder column = new StringBuilder();
    int current = index;
    while (current > 0) {
      int remainder = (current - 1) % 26;
      column.insert(0, (char) ('A' + remainder));
      current = (current - 1) / 26;
    }

    return column.toString();
  }

  private RtmEmsLogAmvUploadResultDto buildUploadResult(
      String status,
      String message,
      String fileName,
      long fileSize,
      int attemptedRowCount,
      int uploadedRowCount,
      List<String> errors,
      List<String> warnings,
      List<RtmEmsLogAmvRowDto> rows) {
    return new RtmEmsLogAmvUploadResultDto(
        status, fileName, fileSize, message, attemptedRowCount, uploadedRowCount, errors, warnings, rows);
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit tests can invoke this service without the Spring transactional proxy.
    }
  }
}

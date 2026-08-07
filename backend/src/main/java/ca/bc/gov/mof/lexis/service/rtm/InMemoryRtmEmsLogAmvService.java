package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.isFirstOfMonth;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.isNextMonth;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseMonthStartDate;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseRetrievalDate;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("stub-services & !oracle")
public class InMemoryRtmEmsLogAmvService implements RtmEmsLogAmvService {

  private static final String SAVE_MODE_CREATE = "create";
  private static final String SAVE_MODE_UPDATE = "update";
  private static final String RETURN_SUCCESS = "accepted";
  private static final String RETURN_FAILURE = "rejected";
  private static final String RETURN_VALIDATION = "validation_failed";
  private static final List<String> GROWTH_TARGETS = List.of("O", "S");
  private static final Map<String, List<String>> BATCH_SPECIES_TARGETS =
      Map.of(
          "BA", List.of("BA"),
          "HE", List.of("HE"),
          "CE", List.of("CE"),
          "CY", List.of("CY"),
          "FI", List.of("FI"),
          "SP", List.of("SP"),
          "PINE", List.of("WH", "LO", "YE"));

  private final VirusScanService virusScanService;
  private final Clock clock;

  private final List<RtmEmsLogAmvRowDto> rows = new ArrayList<>(
      List.of(
          new RtmEmsLogAmvRowDto(
              "BA",
              "B",
              "S",
              "2026-01-01",
              null,
              BigDecimal.valueOf(448.74),
              BigDecimal.valueOf(448.74),
              "0"),
          new RtmEmsLogAmvRowDto(
              "HE",
              "A",
              "S",
              "2026-01-01",
              null,
              BigDecimal.valueOf(195.30),
              BigDecimal.valueOf(195.30),
              "0"),
          new RtmEmsLogAmvRowDto(
              "CE",
              "A",
              "O",
              "2026-01-01",
              null,
              BigDecimal.valueOf(900.89),
              BigDecimal.valueOf(900.89),
              "0")));

  InMemoryRtmEmsLogAmvService() {
    this(VirusScanService.NO_OP);
  }

  public InMemoryRtmEmsLogAmvService(VirusScanService virusScanService) {
    this(virusScanService, LexisBusinessTime.systemClock());
  }

  InMemoryRtmEmsLogAmvService(Clock clock) {
    this(VirusScanService.NO_OP, clock);
  }

  InMemoryRtmEmsLogAmvService(VirusScanService virusScanService, Clock clock) {
    this.virusScanService = virusScanService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  @Override
  public List<RtmEmsLogAmvRowDto> find(
      String species,
      String growthIndicator,
      String retrievalDate,
      String updateDate) {
    String speciesFilter = normalize(species);
    String growthIndicatorFilter = normalize(growthIndicator);
    LocalDate parsedRetrievalDate = parseRetrievalDate(retrievalDate);
    if (parsedRetrievalDate == null) {
      return List.of();
    }

    LocalDate parsedUpdateDate;
    if (trimToNull(updateDate) == null) {
      parsedUpdateDate = parsedRetrievalDate;
    } else {
      parsedUpdateDate = parseRetrievalDate(updateDate);
      if (parsedUpdateDate == null) {
        return List.of();
      }
    }
    String retrievalDateFilter = formatDate(parsedRetrievalDate);
    String updateDateFilter = formatDate(parsedUpdateDate);

    if (retrievalDateFilter != null && retrievalDateFilter.equals(updateDateFilter)) {
      return findRowsForEffectiveDate(speciesFilter, growthIndicatorFilter, retrievalDateFilter);
    }

    return findRows(speciesFilter, growthIndicatorFilter, retrievalDateFilter, updateDateFilter);
  }

  @Override
  public List<RtmEmsLogAmvRowDto> findLatestBefore(String effectiveDate) {
    LocalDate parsedEffectiveDate = parseRetrievalDate(effectiveDate);
    if (parsedEffectiveDate == null) {
      return List.of();
    }

    Map<String, RtmEmsLogAmvRowDto> latestRowsByKey = new LinkedHashMap<>();
    for (RtmEmsLogAmvRowDto row : rows) {
      LocalDate rowDate = rowEffectiveDate(row);
      if (rowDate == null || !rowDate.isBefore(parsedEffectiveDate)) {
        continue;
      }
      latestRowsByKey.merge(
          rowKey(row),
          row,
          (existing, candidate) ->
              rowEffectiveDate(candidate).isAfter(rowEffectiveDate(existing))
                  ? candidate
                  : existing);
    }
    return sortRows(latestRowsByKey.values());
  }

  @Override
  public RtmEmsLogAmvMutationResultDto save(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = validateSaveRequest(request);
    if (!errors.isEmpty()) {
      return buildMutationResult(RETURN_VALIDATION, "Please correct the highlighted fields.", errors, List.of());
    }

    String species = RtmEmsLogAmvDimensionValidator.normalize(request.species());
    String grade = RtmEmsLogAmvDimensionValidator.normalize(request.grade());
    String growthIndicator =
        RtmEmsLogAmvDimensionValidator.normalize(request.growthIndicator());
    LocalDate retrievalDate = parseRetrievalDate(request.retrievalDate());
    LocalDate updateDate = parseRetrievalDate(request.updateDate());
    String saveMode = request.effectiveSaveMode();

    if (SAVE_MODE_UPDATE.equals(saveMode)) {
      int existingIndex = findMatchingRowIndex(
          species, grade, growthIndicator, formatDate(retrievalDate));
      LocalDate effectiveDate =
          updateDate != null && updateDate.isAfter(retrievalDate) ? updateDate : retrievalDate;
      if (updateDate != null && updateDate.isAfter(retrievalDate)) {
        int targetIndex =
            findMatchingRowIndex(species, grade, growthIndicator, formatDate(effectiveDate));
        RtmEmsLogAmvRowDto currentTarget = targetIndex < 0 ? null : rows.get(targetIndex);
        RtmEmsLogAmvRowDto upserted =
            new RtmEmsLogAmvRowDto(
                species,
                grade,
                growthIndicator,
                formatDate(effectiveDate),
                formatDate(effectiveDate),
                currentTarget == null ? null : currentTarget.newValue(),
                request.newValue(),
                "0");
        if (targetIndex < 0) {
          rows.add(upserted);
        } else {
          rows.set(targetIndex, upserted);
        }
        return buildMutationResult(
            RETURN_SUCCESS, "Save completed. Updated value.", List.of(), List.of(upserted));
      }

      RtmEmsLogAmvRowDto current =
          existingIndex < 0 ? null : rows.get(existingIndex);
      RtmEmsLogAmvRowDto updated = new RtmEmsLogAmvRowDto(
          species,
          grade,
          growthIndicator,
          formatDate(retrievalDate),
          formatDate(updateDate),
          current == null ? null : current.newValue(),
          request.newValue(),
          "0");
      if (existingIndex < 0) {
        rows.add(updated);
      } else {
        rows.set(existingIndex, updated);
      }
      return buildMutationResult(
          RETURN_SUCCESS,
          "Save completed. Updated value.",
          List.of(),
          List.of(updated));
    }

    if (findMatchingRowIndex(
            species, grade, growthIndicator, formatDate(retrievalDate))
        >= 0) {
      return buildMutationResult(
          RETURN_FAILURE,
          "Unable to create row; the exact AMV key already exists.",
          List.of("A row already exists for species, grade, growth indicator and retrieval date."),
          List.of());
    }

    RtmEmsLogAmvRowDto created = new RtmEmsLogAmvRowDto(
        species,
        grade,
        growthIndicator,
        formatDate(retrievalDate),
        null,
        null,
        request.newValue(),
        "0");
    rows.add(created);
    return buildMutationResult(
        RETURN_SUCCESS,
        "Save completed. Created value.",
        List.of(),
        List.of(created));
  }

  @Override
  public RtmEmsLogAmvMutationResultDto saveBatch(List<RtmEmsLogAmvSaveRequestDto> requests) {
    if (requests == null || requests.isEmpty()) {
      return buildMutationResult(
          RETURN_VALIDATION,
          "Please correct the highlighted fields.",
          List.of("At least one AMV table value is required."),
          List.of());
    }

    List<String> errors = new ArrayList<>();
    Map<String, BatchTarget> targetsByKey = new LinkedHashMap<>();
    for (int requestIndex = 0; requestIndex < requests.size(); requestIndex++) {
      RtmEmsLogAmvSaveRequestDto request = requests.get(requestIndex);
      int tableValueIndex = requestIndex + 1;
      List<String> requestErrors = validateBatchSaveRequest(request);
      if (!requestErrors.isEmpty()) {
        requestErrors.forEach(error -> errors.add("Table value %d: %s".formatted(tableValueIndex, error)));
        continue;
      }

      String logicalSpecies = RtmEmsLogAmvDimensionValidator.normalize(request.species());
      String grade = RtmEmsLogAmvDimensionValidator.normalize(request.grade());
      LocalDate retrievalDate = parseRetrievalDate(request.retrievalDate());
      LocalDate updateDate = parseRetrievalDate(request.updateDate());
      LocalDate effectiveDate = effectiveDateForSave(request.effectiveSaveMode(), retrievalDate, updateDate);
      for (String species : BATCH_SPECIES_TARGETS.get(logicalSpecies)) {
        for (String growthIndicator : GROWTH_TARGETS) {
          BatchTarget target =
              new BatchTarget(species, grade, growthIndicator, effectiveDate, request.newValue());
          String targetKey =
              "%s|%s|%s|%s".formatted(species, grade, growthIndicator, effectiveDate);
          BatchTarget previous = targetsByKey.putIfAbsent(targetKey, target);
          if (previous != null && previous.newValue().compareTo(target.newValue()) != 0) {
            errors.add(
                "Table values target the same physical AMV row with different amounts: %s."
                    .formatted(targetKey));
          }
        }
      }
    }

    if (!errors.isEmpty()) {
      return buildMutationResult(RETURN_VALIDATION, "Please correct the highlighted fields.", errors, List.of());
    }

    List<RtmEmsLogAmvRowDto> nextRows = new ArrayList<>(rows);
    List<RtmEmsLogAmvRowDto> savedRows = new ArrayList<>();
    for (BatchTarget target : targetsByKey.values()) {
      String effectiveDate = formatDate(target.effectiveDate());
      int existingIndex = findMatchingRowIndex(
          nextRows, target.species(), target.grade(), target.growthIndicator(), effectiveDate);
      RtmEmsLogAmvRowDto current = existingIndex < 0 ? null : nextRows.get(existingIndex);
      RtmEmsLogAmvRowDto saved = new RtmEmsLogAmvRowDto(
          target.species(),
          target.grade(),
          target.growthIndicator(),
          effectiveDate,
          effectiveDate,
          current == null ? null : current.newValue(),
          target.newValue(),
          "0");
      if (existingIndex < 0) {
        nextRows.add(saved);
      } else {
        nextRows.set(existingIndex, saved);
      }
      savedRows.add(saved);
    }

    rows.clear();
    rows.addAll(nextRows);
    return buildMutationResult(
        RETURN_SUCCESS,
        "Saved %d table value%s."
            .formatted(requests.size(), requests.size() == 1 ? "" : "s"),
        List.of(),
        savedRows);
  }

  @Override
  public RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file) {
    return previewUpload(file, null, false);
  }

  @Override
  public RtmEmsLogAmvUploadPreviewDto previewUpload(MultipartFile file, String effectiveMonth) {
    return previewUpload(file, effectiveMonth, true);
  }

  private RtmEmsLogAmvUploadPreviewDto previewUpload(
      MultipartFile file, String effectiveMonth, boolean enforceNextMonth) {
    if (file == null || file.isEmpty()) {
      return buildPreview("rejected", "No file provided.", 0, List.of("Choose a .xlsx file."), List.of());
    }

    String fileName = trimToNull(file.getOriginalFilename());
    if (!isXlsx(file)) {
      return buildPreview("rejected", "File type is not supported.", 0, List.of("Upload an XLSX file."), List.of());
    }
    try {
      virusScanService.assertClean(file);
    } catch (VirusScanException ex) {
      return buildPreview(
          "rejected",
          ex.userMessage(),
          0,
          List.of(ex.userMessage()),
          List.of(),
          null,
          null,
          List.of(),
          fileName,
          file.getSize());
    }

    LocalDate parsedEffectiveMonth =
        enforceNextMonth
            ? parseMonthStartDate(effectiveMonth)
            : parseRetrievalDate(effectiveMonth);
    if (enforceNextMonth && parsedEffectiveMonth == null) {
      return buildPreview(
          RETURN_VALIDATION,
          "Upload template validation failed.",
          0,
          List.of("Select a valid effective month."),
          List.of());
    }
    if (enforceNextMonth && !isNextMonth(parsedEffectiveMonth, clock)) {
      return buildPreview(
          RETURN_VALIDATION,
          "Upload template validation failed.",
          0,
          List.of("Average market values can only be uploaded for the next month."),
          List.of());
    }

    try {
      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult parseResult =
          parsedEffectiveMonth == null
              ? RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(file.getInputStream())
              : RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
                  file.getInputStream(), parsedEffectiveMonth);
      List<String> warnings = new ArrayList<>(parseResult.warnings());
      List<String> errors = new ArrayList<>(parseResult.errors());
      List<UploadTarget> previewTargets =
          expandUploadTargets(parseResult.rows(), parsedEffectiveMonth != null);
      List<RtmEmsLogAmvRowDto> previewRows = buildPreviewRows(parseResult, previewTargets);

      if (parseResult.dataRowCount() == 0) {
        errors.add("The uploaded file contains no data rows.");
      }
      if (parseResult.numericCellCount() == 0) {
        errors.add("The uploaded file does not contain any numeric AMV values.");
      }
      if (!parseResult.headerDetected()) {
        errors.add("The template header is not recognized as an RTM EMS AMV sheet.");
      }
      if (parseResult.updateDate() == null || parseResult.retrievalDate() == null) {
        errors.add("The update date is required in the uploaded template.");
      }
      validateMonthStart(parseResult.retrievalDate(), "Retrieval date", errors);
      validateMonthStart(parseResult.updateDate(), "Update date", errors);
      validateUploadTargets(
          previewTargets, parseResult.retrievalDate(), parseResult.updateDate(), errors);
      if (errors.isEmpty()) {
        int initialRowCount = previewRows.size();
        previewRows =
            previewRows.stream()
                .filter(
                    row ->
                        findMatchingRowIndex(
                                row.species(),
                                row.grade(),
                                row.growthIndicator(),
                                formatDate(parseResult.retrievalDate()))
                            >= 0)
                .toList();
        int skippedCount = initialRowCount - previewRows.size();
        if (skippedCount > 0) {
          warnings.add(
              "%d workbook row%s skipped because the exact existing AMV key was not found for %s."
                  .formatted(
                      skippedCount,
                      skippedCount == 1 ? " was" : "s were",
                      formatDate(parseResult.retrievalDate())));
        }
        if (previewRows.isEmpty()) {
          errors.add("No eligible existing AMV rows were found in the uploaded file.");
        }
      }
      if (parseResult.dataRowCount() > 0 && parseResult.dataRowCount() < 2) {
        warnings.add("The uploaded file has very few rows; confirm it contains full AMV data.");
      }

      return buildPreview(
          errors.isEmpty() ? "accepted" : RETURN_VALIDATION,
          errors.isEmpty() ? "File parsed for preview." : "Upload template validation failed.",
          previewRows.size(),
          errors,
          warnings,
          formatDate(parseResult.retrievalDate()),
          formatDate(parseResult.updateDate()),
          previewRows,
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
  public RtmEmsLogAmvUploadResultDto upload(MultipartFile file) {
    return upload(file, null, false);
  }

  @Override
  public RtmEmsLogAmvUploadResultDto upload(MultipartFile file, String effectiveMonth) {
    return upload(file, effectiveMonth, true);
  }

  private RtmEmsLogAmvUploadResultDto upload(
      MultipartFile file, String effectiveMonth, boolean enforceNextMonth) {
    List<String> validationErrors = validateUploadRequest(file);
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
    LocalDate parsedEffectiveMonth =
        enforceNextMonth
            ? parseMonthStartDate(effectiveMonth)
            : parseRetrievalDate(effectiveMonth);
    if (enforceNextMonth && parsedEffectiveMonth == null) {
      return buildUploadResult(
          RETURN_VALIDATION,
          "Upload template validation failed.",
          fileName,
          fileSize,
          0,
          0,
          List.of("Select a valid effective month."),
          List.of(),
          List.of());
    }
    if (enforceNextMonth && !isNextMonth(parsedEffectiveMonth, clock)) {
      return buildUploadResult(
          RETURN_VALIDATION,
          "Upload template validation failed.",
          fileName,
          fileSize,
          0,
          0,
          List.of("Average market values can only be uploaded for the next month."),
          List.of(),
          List.of());
    }

    try {
      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult parseResult =
          parsedEffectiveMonth == null
              ? RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(file.getInputStream())
              : RtmEmsLogAmvUploadPreviewAnalyzer.parseForUpload(
                  file.getInputStream(), parsedEffectiveMonth);

      List<String> warnings = new ArrayList<>(parseResult.warnings());
      List<String> errors = new ArrayList<>(parseResult.errors());
      List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> uploadRows =
          parseResult.rows().stream()
              .filter(row -> isUploadableRow(row.species(), row.grade()))
              .toList();
      LocalDate parsedRetrievalDate = parseResult.retrievalDate();
      LocalDate parsedUpdateDate = parseResult.updateDate();

      if (uploadRows.size() < parseResult.rows().size()) {
        warnings.add("Some rows were skipped because they were missing grade/species values.");
      }

      Map<String, UploadTarget> rowsBySpeciesGradeAndGrowth =
          expandUploadTargets(uploadRows, parsedEffectiveMonth != null).stream()
              .collect(
                  LinkedHashMap::new,
                  (map, target) -> {
                    String species = trimToNull(target.species());
                    String grade = trimToNull(target.grade());
                    String growth = trimToNull(target.growthIndicator());
                    if (species == null || grade == null || growth == null) {
                      return;
                    }
                    String key =
                        species.toUpperCase() + "|" + grade.toUpperCase() + "|" + growth.toUpperCase();
                    if (map.containsKey(key)) {
                      UploadTarget previous = map.get(key);
                      warnings.add(
                          ("Duplicate upload row in source row %d for species '%s', grade '%s' "
                                  + "and growth '%s' replaced previous source row %d.")
                              .formatted(
                                  target.sourceRow(),
                                  species,
                                  grade,
                                  growth,
                                  previous.sourceRow()));
                    }
                    map.put(key, target);
                  },
                  Map::putAll);
      List<UploadTarget> rowsToUpload = new ArrayList<>(rowsBySpeciesGradeAndGrowth.values());
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
      if (parsedUpdateDate == null || parsedRetrievalDate == null) {
        errors.add("The update date is required in the uploaded template.");
      }
      validateMonthStart(parsedRetrievalDate, "Retrieval date", errors);
      validateMonthStart(parsedUpdateDate, "Update date", errors);
      validateUploadTargets(rowsToUpload, parsedRetrievalDate, parsedUpdateDate, errors);

      if (errors.isEmpty()) {
        int initialRowCount = rowsToUpload.size();
        rowsToUpload =
            rowsToUpload.stream()
                .filter(
                    row ->
                        findMatchingRowIndex(
                                row.species(),
                                row.grade(),
                                row.growthIndicator(),
                                formatDate(parsedRetrievalDate))
                            >= 0)
                .toList();
        int skippedCount = initialRowCount - rowsToUpload.size();
        if (skippedCount > 0) {
          warnings.add(
              "%d workbook row%s skipped because the exact existing AMV key was not found for %s."
                  .formatted(
                      skippedCount,
                      skippedCount == 1 ? " was" : "s were",
                      formatDate(parsedRetrievalDate)));
        }
        if (rowsToUpload.isEmpty()) {
          errors.add("No eligible existing AMV rows were found in the uploaded file.");
        }
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

      List<RtmEmsLogAmvRowDto> originalRows = new ArrayList<>(rows);
      List<RtmEmsLogAmvRowDto> uploadedRows = new ArrayList<>();
      int uploadedCount = 0;
      for (UploadTarget row : rowsToUpload) {
        String species = trimToNull(row.species());
        String grade = trimToNull(row.grade());
        String normalizedGrowthIndicator = trimToNull(row.growthIndicator());
        BigDecimal newValue = row.newValue();

        RtmEmsLogAmvMutationResultDto mutationResult =
            save(
                new RtmEmsLogAmvSaveRequestDto(
                    species,
                    grade,
                    normalizedGrowthIndicator,
                    formatDate(parsedRetrievalDate),
                    formatDate(parsedUpdateDate),
                    newValue,
                    SAVE_MODE_UPDATE));

        if ("accepted".equalsIgnoreCase(mutationResult.status())) {
          uploadedCount++;
          uploadedRows.addAll(mutationResult.rows());
          continue;
        }

        errors.add(
            "Unable to save row for species '%s', grade '%s' (source row %d, source column %s)."
                .formatted(
                    species,
                    grade,
                    row.sourceRow(),
                    columnToLetter(row.sourceColumn())));
        errors.addAll(mutationResult.errors());
      }

      if (!errors.isEmpty()) {
        rows.clear();
        rows.addAll(originalRows);
        return buildUploadResult(
            RETURN_FAILURE,
            "Upload did not complete; no values were saved.",
            fileName,
            fileSize,
            rowsToUpload.size(),
            0,
            errors,
            warnings,
            List.of());
      }

      return buildUploadResult(
          RETURN_SUCCESS,
          "Upload completed.",
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
    if (request == null) {
      return List.of("Save request is required.");
    }

    LocalDate parsedRetrievalDate = parseRetrievalDate(request.retrievalDate());
    if (parsedRetrievalDate == null) {
      errors.add(
          "Retrieval date is required and must identify a month as YYYYMM, YYYY-MM, or YYYY-MM-01.");
    }
    validateMonthStart(parsedRetrievalDate, "Retrieval date", errors);

    errors.addAll(RtmEmsLogAmvValueValidator.validate(request.newValue()));

    String saveMode = request.effectiveSaveMode();
    if (!SAVE_MODE_CREATE.equals(saveMode) && !SAVE_MODE_UPDATE.equals(saveMode)) {
      errors.add("Save mode must be 'create' or 'update'.");
    }

    LocalDate parsedUpdateDate = parseRetrievalDate(request.updateDate());
    if (SAVE_MODE_UPDATE.equals(saveMode) && parsedUpdateDate == null) {
      errors.add(
          "Update date is required for update mode and must identify a month as YYYYMM, YYYY-MM, or YYYY-MM-01.");
    }
    if (SAVE_MODE_UPDATE.equals(saveMode)) {
      validateMonthStart(parsedUpdateDate, "Update date", errors);
    }
    if (SAVE_MODE_UPDATE.equals(saveMode)
        && parsedRetrievalDate != null
        && parsedUpdateDate != null
        && parsedUpdateDate.isBefore(parsedRetrievalDate)) {
      errors.add("Update date must be on or after the retrieval date.");
    }

    LocalDate effectiveDate =
        SAVE_MODE_UPDATE.equals(saveMode)
                && parsedRetrievalDate != null
                && parsedUpdateDate != null
                && parsedUpdateDate.isAfter(parsedRetrievalDate)
            ? parsedUpdateDate
            : parsedRetrievalDate;
    errors.addAll(
        RtmEmsLogAmvDimensionValidator.validate(
            request.species(), request.grade(), request.growthIndicator(), effectiveDate));

    return errors;
  }

  private List<String> validateBatchSaveRequest(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = new ArrayList<>();
    if (request == null) {
      return List.of("Save request is required.");
    }

    LocalDate parsedRetrievalDate = parseRetrievalDate(request.retrievalDate());
    if (parsedRetrievalDate == null) {
      errors.add(
          "Retrieval date is required and must identify a month as YYYYMM, YYYY-MM, or YYYY-MM-01.");
    }
    validateMonthStart(parsedRetrievalDate, "Retrieval date", errors);
    errors.addAll(RtmEmsLogAmvValueValidator.validate(request.newValue()));

    String saveMode = request.effectiveSaveMode();
    if (!SAVE_MODE_CREATE.equals(saveMode) && !SAVE_MODE_UPDATE.equals(saveMode)) {
      errors.add("Save mode must be 'create' or 'update'.");
    }

    LocalDate parsedUpdateDate = parseRetrievalDate(request.updateDate());
    if (SAVE_MODE_UPDATE.equals(saveMode) && parsedUpdateDate == null) {
      errors.add(
          "Update date is required for update mode and must identify a month as YYYYMM, YYYY-MM, or YYYY-MM-01.");
    }
    if (SAVE_MODE_UPDATE.equals(saveMode)) {
      validateMonthStart(parsedUpdateDate, "Update date", errors);
    }
    if (SAVE_MODE_UPDATE.equals(saveMode)
        && parsedRetrievalDate != null
        && parsedUpdateDate != null
        && parsedUpdateDate.isBefore(parsedRetrievalDate)) {
      errors.add("Update date must be on or after the retrieval date.");
    }

    String logicalSpecies = RtmEmsLogAmvDimensionValidator.normalize(request.species());
    List<String> physicalSpecies = BATCH_SPECIES_TARGETS.get(logicalSpecies);
    if (physicalSpecies == null) {
      errors.add("Species must be Balsam, Hemlock, Cedar, Cypress, Fir, Spruce, or Pine.");
      return errors;
    }

    for (String species : physicalSpecies) {
      errors.addAll(
          RtmEmsLogAmvDimensionValidator.validateModernGrid(species, request.grade(), "O"));
    }
    return errors;
  }

  private LocalDate effectiveDateForSave(
      String saveMode, LocalDate retrievalDate, LocalDate updateDate) {
    if (SAVE_MODE_UPDATE.equals(saveMode)
        && retrievalDate != null
        && updateDate != null
        && updateDate.isAfter(retrievalDate)) {
      return updateDate;
    }
    return retrievalDate;
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
    return buildPreview(status, message, rowCount, errors, warnings, null, null, List.of(), null, 0);
  }

  private RtmEmsLogAmvUploadPreviewDto buildPreview(
      String status,
      String message,
      int rowCount,
      List<String> errors,
      List<String> warnings,
      String retrievalDate,
      String updateDate,
      List<RtmEmsLogAmvRowDto> rows,
      String fileName,
      long fileSize) {
    return new RtmEmsLogAmvUploadPreviewDto(
        status, fileName, fileSize, message, rowCount, retrievalDate, updateDate, errors, warnings, rows);
  }

  private String normalize(String value) {
    return trimToNull(value);
  }

  private boolean matchesFilter(String expected, String candidate) {
    if (expected == null) {
      return true;
    }
    String normalizedCandidate = trimToNull(candidate);
    if (normalizedCandidate == null) {
      return false;
    }
    return normalizedCandidate.toLowerCase().contains(expected.toLowerCase());
  }

  private boolean matchesDateFilter(String expected, String candidate) {
    if (expected == null) {
      return true;
    }
    return expected.equals(trimToNull(candidate));
  }

  private List<RtmEmsLogAmvRowDto> findRows(
      String speciesFilter,
      String growthIndicatorFilter,
      String retrievalDateFilter,
      String updateDateFilter) {
    return sortRows(
        rows.stream()
            .filter(
                row ->
                    matchesFilter(speciesFilter, row.species())
                        && matchesFilter(growthIndicatorFilter, row.growthIndicator())
                        && matchesDateFilter(retrievalDateFilter, row.retrievalDate())
                        && matchesDateFilter(updateDateFilter, row.updateDate()))
            .toList());
  }

  private List<RtmEmsLogAmvRowDto> findRowsForEffectiveDate(
      String speciesFilter, String growthIndicatorFilter, String effectiveDate) {
    Map<String, RtmEmsLogAmvRowDto> rowsByTarget = new LinkedHashMap<>();

    rows.stream()
        .filter(
            row ->
                matchesFilter(speciesFilter, row.species())
                    && matchesFilter(growthIndicatorFilter, row.growthIndicator())
                    && effectiveDate.equals(trimToNull(row.retrievalDate()))
                    && (trimToNull(row.updateDate()) == null
                        || effectiveDate.equals(trimToNull(row.updateDate()))))
        .forEach(row -> rowsByTarget.put(rowKey(row), row));

    rows.stream()
        .filter(
            row ->
                matchesFilter(speciesFilter, row.species())
                    && matchesFilter(growthIndicatorFilter, row.growthIndicator())
                    && effectiveDate.equals(trimToNull(row.updateDate())))
        .forEach(row -> rowsByTarget.put(rowKey(row), row));

    return sortRows(rowsByTarget.values());
  }

  private LocalDate rowEffectiveDate(RtmEmsLogAmvRowDto row) {
    String updateDate = trimToNull(row.updateDate());
    return parseRetrievalDate(updateDate == null ? row.retrievalDate() : updateDate);
  }

  private void validateMonthStart(LocalDate date, String label, List<String> errors) {
    if (date != null && !isFirstOfMonth(date)) {
      errors.add(label + " must be the first day of a month.");
    }
  }

  private List<RtmEmsLogAmvRowDto> sortRows(Iterable<RtmEmsLogAmvRowDto> sourceRows) {
    List<RtmEmsLogAmvRowDto> sortedRows = new ArrayList<>();
    sourceRows.forEach(sortedRows::add);
    sortedRows.sort(
        Comparator.comparing(
                (RtmEmsLogAmvRowDto row) -> normalize(row.species()),
                Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER))
            .thenComparing(
                (RtmEmsLogAmvRowDto row) -> normalize(row.grade()),
                Comparator.nullsFirst(String.CASE_INSENSITIVE_ORDER)));
    return sortedRows;
  }

  private String rowKey(RtmEmsLogAmvRowDto row) {
    return rowKey(row.species(), row.grade(), row.growthIndicator());
  }

  private String rowKey(String species, String grade, String growthIndicator) {
    return String.join(
        "|",
        normalize(species),
        normalize(grade),
        normalize(growthIndicator));
  }

  private int findMatchingRowIndex(
      String species,
      String grade,
      String growthIndicator,
      String retrievalDate) {
    return findMatchingRowIndex(rows, species, grade, growthIndicator, retrievalDate);
  }

  private int findMatchingRowIndex(
      List<RtmEmsLogAmvRowDto> candidates,
      String species,
      String grade,
      String growthIndicator,
      String retrievalDate) {
    for (int i = 0; i < candidates.size(); i++) {
      RtmEmsLogAmvRowDto row = candidates.get(i);
      if (equalsIgnoreCaseOrNull(species, row.species())
          && equalsIgnoreCaseOrNull(grade, row.grade())
          && equalsIgnoreCaseOrNull(growthIndicator, row.growthIndicator())
          && equalsOrNull(retrievalDate, row.retrievalDate())) {
        return i;
      }
    }
    return -1;
  }

  private record BatchTarget(
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate,
      BigDecimal newValue) {}

  private boolean equalsIgnoreCaseOrNull(String expected, String candidate) {
    String normalizedExpected = normalize(expected);
    if (normalizedExpected == null) {
      return candidate == null || candidate.isBlank();
    }
    return normalizedExpected.equalsIgnoreCase(trimToNull(candidate));
  }

  private boolean equalsOrNull(String expected, String candidate) {
    if (expected == null) {
      return candidate == null || candidate.isBlank();
    }
    return expected.equals(trimToNull(candidate));
  }

  private void validateUploadTargets(
      List<UploadTarget> targets,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> errors) {
    if (targets == null) {
      return;
    }
    for (UploadTarget target : targets) {
      addUploadValidationErrors(
          target.species(),
          target.grade(),
          target.growthIndicator(),
          target.newValue(),
          target.sourceRow(),
          target.sourceColumn(),
          retrievalDate,
          updateDate,
          errors);
    }
  }

  private void addUploadValidationErrors(
      String species,
      String grade,
      String growthIndicator,
      BigDecimal newValue,
      int sourceRow,
      int sourceColumn,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> errors) {
    validateSaveRequest(
            new RtmEmsLogAmvSaveRequestDto(
                species,
                grade,
                growthIndicator,
                formatDate(retrievalDate),
                formatDate(updateDate),
                newValue,
                SAVE_MODE_UPDATE))
        .forEach(
            error ->
                errors.add(
                    "Source row %d, column %s: %s"
                        .formatted(sourceRow, columnToLetter(sourceColumn), error)));
  }

  private String formatDate(LocalDate date) {
    return date == null ? null : date.toString();
  }

  private boolean isXlsx(MultipartFile file) {
    String normalizedType = trimToNull(file.getContentType());
    if (normalizedType != null
        && normalizedType.startsWith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
      return true;
    }

    String fileName = trimToNull(file.getOriginalFilename());
    return fileName != null && fileName.toLowerCase().endsWith(".xlsx");
  }

  private List<String> validateUploadRequest(MultipartFile file) {
    List<String> errors = new ArrayList<>();

    if (file == null || file.isEmpty()) {
      errors.add("No file provided.");
      return errors;
    }

    if (!isXlsx(file)) {
      errors.add("File type is not supported.");
    }
    if (errors.isEmpty()) {
      try {
        virusScanService.assertClean(file);
      } catch (VirusScanException ex) {
        errors.add(ex.userMessage());
      }
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

  private List<RtmEmsLogAmvRowDto> buildPreviewRows(
      RtmEmsLogAmvUploadPreviewAnalyzer.UploadParseResult parseResult,
      List<UploadTarget> previewTargets) {
    if (parseResult.retrievalDate() == null || parseResult.updateDate() == null) {
      return List.of();
    }

    Map<String, BigDecimal> currentValues = new LinkedHashMap<>();
    for (RtmEmsLogAmvRowDto row :
        findRowsForEffectiveDate(null, null, formatDate(parseResult.retrievalDate()))) {
      BigDecimal currentValue = row.newValue() == null ? row.currentValue() : row.newValue();
      if (currentValue != null) {
        currentValues.putIfAbsent(rowKey(row), currentValue);
      }
    }

    List<RtmEmsLogAmvRowDto> previewRows = new ArrayList<>();
    for (UploadTarget row : previewTargets) {
      previewRows.add(
          new RtmEmsLogAmvRowDto(
              row.species(),
              row.grade(),
              row.growthIndicator(),
              formatDate(parseResult.retrievalDate()),
              formatDate(parseResult.updateDate()),
              currentValues.get(rowKey(row.species(), row.grade(), row.growthIndicator())),
              row.newValue(),
              "0"));
    }
    return previewRows;
  }

  private List<UploadTarget> expandUploadTargets(
      List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> uploadRows, boolean expandGrowthTypes) {
    List<UploadTarget> targets = new ArrayList<>();
    for (RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow row : uploadRows) {
      String normalizedSpecies = RtmEmsLogAmvDimensionValidator.normalize(row.species());
      List<String> speciesTargets =
          BATCH_SPECIES_TARGETS.getOrDefault(normalizedSpecies, List.of(row.species()));
      for (String species : speciesTargets) {
        if (expandGrowthTypes) {
          for (String growthIndicator : GROWTH_TARGETS) {
            targets.add(
                new UploadTarget(
                    species,
                    row.grade(),
                    growthIndicator,
                    row.newValue(),
                    row.sourceRow(),
                    row.sourceColumn()));
          }
        } else {
          targets.add(
              new UploadTarget(
                  species,
                  row.grade(),
                  row.growthIndicator(),
                  row.newValue(),
                  row.sourceRow(),
                  row.sourceColumn()));
        }
      }
    }
    return targets;
  }

  private record UploadTarget(
      String species,
      String grade,
      String growthIndicator,
      BigDecimal newValue,
      int sourceRow,
      int sourceColumn) {}

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
        status,
        fileName,
        fileSize,
        message,
        attemptedRowCount,
        uploadedRowCount,
        errors,
        warnings,
        rows);
  }
}

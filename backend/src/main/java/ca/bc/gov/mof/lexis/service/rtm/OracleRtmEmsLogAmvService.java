package ca.bc.gov.mof.lexis.service.rtm;

import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.isFirstOfMonth;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.isNextMonth;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseMonthStartDate;
import static ca.bc.gov.mof.lexis.service.rtm.RtmEmsLogAmvDateUtils.parseRetrievalDate;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvMutationResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvRowDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvSaveRequestDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadPreviewDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Statement;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("oracle")
public class OracleRtmEmsLogAmvService implements RtmEmsLogAmvService {

  private static final Logger LOGGER = LoggerFactory.getLogger(OracleRtmEmsLogAmvService.class);

  private static final String SAVE_MODE_CREATE = "create";
  private static final String SAVE_MODE_UPDATE = "update";
  private static final String RETURN_SUCCESS = "accepted";
  private static final String RETURN_FAILURE = "rejected";
  private static final String RETURN_VALIDATION = "validation_failed";
  private static final String UPLOAD_VALIDATION_FAILURE_MESSAGE = "This file couldn't be used.";
  private static final List<String> GROWTH_TARGETS = List.of("O", "S");
  private static final List<String> SCREEN_SPECIES =
      List.of("BA", "HE", "CE", "CY", "FI", "SP", "PINE");
  private static final List<String> SCREEN_GRADES =
      List.of("A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "U", "X", "Y");
  private static final Map<String, List<String>> BATCH_SPECIES_TARGETS =
      Map.of(
          "BA", List.of("BA"),
          "HE", List.of("HE"),
          "CE", List.of("CE"),
          "CY", List.of("CY"),
          "FI", List.of("FI"),
          "SP", List.of("SP"),
          "PINE", List.of("WH", "LO", "YE"));
  private static final Map<String, String> SCREEN_SPECIES_LABELS =
      Map.of(
          "BA", "Balsam",
          "HE", "Hemlock",
          "CE", "Cedar",
          "CY", "Cypress",
          "FI", "Fir",
          "SP", "Spruce",
          "PINE", "Pine");
  private final OracleRtmEmsLogAmvRepository repository;
  private final VirusScanService virusScanService;
  private final Clock clock;

  @Autowired
  public OracleRtmEmsLogAmvService(
      OracleRtmEmsLogAmvRepository repository, VirusScanService virusScanService) {
    this(repository, virusScanService, LexisBusinessTime.systemClock());
  }

  OracleRtmEmsLogAmvService(
      OracleRtmEmsLogAmvRepository repository, VirusScanService virusScanService, Clock clock) {
    this.repository = repository;
    this.virusScanService = virusScanService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  OracleRtmEmsLogAmvService(OracleRtmEmsLogAmvRepository repository) {
    this(repository, VirusScanService.NO_OP);
  }

  OracleRtmEmsLogAmvService(OracleRtmEmsLogAmvRepository repository, Clock clock) {
    this(repository, VirusScanService.NO_OP, clock);
  }

  @Override
  public List<RtmEmsLogAmvRowDto> find(
      String species,
      String growthIndicator,
      String retrievalDate,
      String updateDate) {
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

    String normalizedSpecies = trimToNull(species);
    String normalizedGrowthIndicator = trimToNull(growthIndicator);
    if (parsedRetrievalDate != null
        && parsedRetrievalDate.equals(parsedUpdateDate)
        && (normalizedSpecies == null || normalizedGrowthIndicator == null)) {
      return repository.findEffectiveDateRows(
          normalizedSpecies, normalizedGrowthIndicator, parsedRetrievalDate);
    }

    return repository.find(
        normalizedSpecies,
        normalizedGrowthIndicator,
        parsedRetrievalDate,
        parsedUpdateDate);
  }

  @Override
  public List<RtmEmsLogAmvRowDto> findLatestBefore(String effectiveDate) {
    LocalDate parsedEffectiveDate = parseRetrievalDate(effectiveDate);
    if (parsedEffectiveDate == null) {
      return List.of();
    }

    return repository.findLatestEffectiveDateRowsBefore(parsedEffectiveDate);
  }

  @Override
  @Transactional
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
      markRollbackOnly();
      return buildMutationResult(
          RETURN_FAILURE,
          "Oracle reported an error while saving RTM AMV row.",
          List.of("Oracle did not accept the save."),
          List.of());
    }

    LocalDate effectiveDate = effectiveDateForSave(saveMode, retrievalDate, updateDate);
    final boolean applied;
    try {
      applied =
          hasAppliedValue(species, grade, growthIndicator, effectiveDate, request.newValue());
    } catch (DataAccessException ex) {
      markRollbackOnly();
      LOGGER.warn(
          "event=lexis_rtm_amv operation=save outcome=database_unavailable failureType={}",
          exceptionType(ex));
      throw ex;
    }
    if (!applied) {
      markRollbackOnly();
      return buildMutationResult(
          RETURN_FAILURE,
          "Oracle reported success but the AMV row was not applied.",
          List.of(
              "Saved value could not be confirmed for species '%s', grade '%s', growth '%s', effective date '%s'."
                  .formatted(species, grade, growthIndicator, formatDate(effectiveDate))),
          List.of());
    }

    return buildMutationResult(
        RETURN_SUCCESS,
        "Save completed. " + (SAVE_MODE_UPDATE.equals(saveMode) ? "Updated" : "Created") + " value.",
        List.of(),
        List.of(buildSavedRow(species, grade, growthIndicator, retrievalDate, updateDate, request)));
  }

  @Override
  @Transactional
  public RtmEmsLogAmvMutationResultDto saveBatch(List<RtmEmsLogAmvSaveRequestDto> requests) {
    if (requests == null || requests.isEmpty()) {
      return buildMutationResult(
          RETURN_VALIDATION,
          "Please correct the highlighted fields.",
          List.of("At least one AMV table value is required."),
          List.of());
    }

    List<String> errors = new ArrayList<>();
    Map<String, OracleRtmEmsLogAmvRepository.AtomicWriteTarget> targetsByKey =
        new LinkedHashMap<>();
    List<RtmEmsLogAmvRowDto> savedRows = new ArrayList<>();

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
          OracleRtmEmsLogAmvRepository.AtomicWriteTarget target =
              new OracleRtmEmsLogAmvRepository.AtomicWriteTarget(
                  species, grade, growthIndicator, effectiveDate, request.newValue());
          String targetKey =
              "%s|%s|%s|%s".formatted(species, grade, growthIndicator, effectiveDate);
          OracleRtmEmsLogAmvRepository.AtomicWriteTarget previous =
              targetsByKey.putIfAbsent(targetKey, target);
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

    List<OracleRtmEmsLogAmvRepository.AtomicWriteTarget> targets =
        List.copyOf(targetsByKey.values());
    int[] updateCounts = repository.upsertAtomically(targets);
    if (!allWritesApplied(updateCounts, targets.size())) {
      markRollbackOnly();
      return buildMutationResult(
          RETURN_FAILURE,
          "Unable to save all average monthly values.",
          List.of("The full AMV submission was not applied."),
          List.of());
    }

    for (OracleRtmEmsLogAmvRepository.AtomicWriteTarget target : targets) {
      savedRows.add(
          new RtmEmsLogAmvRowDto(
              target.species(),
              target.grade(),
              target.growthIndicator(),
              formatDate(target.effectiveDate()),
              formatDate(target.effectiveDate()),
              null,
              target.newValue(),
              "0"));
    }

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
          UPLOAD_VALIDATION_FAILURE_MESSAGE,
          0,
          List.of("Select a valid effective month."),
          List.of());
    }
    if (enforceNextMonth && !isNextMonth(parsedEffectiveMonth, clock)) {
      return buildPreview(
          RETURN_VALIDATION,
          UPLOAD_VALIDATION_FAILURE_MESSAGE,
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
      List<UploadTarget> rowsToPreview =
          buildUploadTargets(parseResult.rows(), warnings, parsedEffectiveMonth != null);
      LocalDate comparisonDate = parseResult.retrievalDate();
      List<RtmEmsLogAmvRowDto> comparisonRows = List.of();

      if (parseResult.dataRowCount() == 0) {
        errors.add("The uploaded file contains no data rows.");
      }
      if (parseResult.numericCellCount() == 0) {
        errors.add("The uploaded file does not contain any numeric AMV values.");
      }
      if (!parseResult.headerDetected()) {
        errors.add("The template header is not recognized as an RTM EMS AMV sheet.");
      }
      if (enforceNextMonth && errors.isEmpty()) {
        comparisonRows = repository.findLatestEffectiveDateRowsBefore(parsedEffectiveMonth);
        comparisonDate = latestComparisonDate(comparisonRows, comparisonDate);
      }
      if (parseResult.updateDate() == null || comparisonDate == null) {
        errors.add("The update date is required in the uploaded template.");
      }
      validateMonthStart(comparisonDate, "Retrieval date", errors);
      validateMonthStart(parseResult.updateDate(), "Update date", errors);
      validateUploadDateOrder(comparisonDate, parseResult.updateDate(), errors);
      validateUploadTargets(rowsToPreview, comparisonDate, parseResult.updateDate(), errors);
      if (errors.isEmpty() && !enforceNextMonth) {
        rowsToPreview =
            filterUploadTargetsForExistingRows(
                rowsToPreview,
                parseResult.retrievalDate(),
                parseResult.updateDate(),
                warnings);
        if (rowsToPreview.isEmpty()) {
          errors.add("No eligible existing AMV rows were found in the uploaded file.");
        }
      }
      List<RtmEmsLogAmvRowDto> previewRows =
          enforceNextMonth
              ? buildScreenPreviewRows(
                  parseResult.rows(),
                  comparisonRows,
                  comparisonDate,
                  parseResult.updateDate(),
                  errors.isEmpty())
              : buildPreviewRows(
                  rowsToPreview,
                  parseResult.retrievalDate(),
                  parseResult.updateDate(),
                  errors.isEmpty());
      if (parseResult.dataRowCount() > 0 && parseResult.dataRowCount() < 2) {
        warnings.add("The uploaded file has very few rows; confirm it contains full AMV data.");
      }

      return buildPreview(
          errors.isEmpty() ? "accepted" : RETURN_VALIDATION,
          errors.isEmpty() ? "File parsed for preview." : UPLOAD_VALIDATION_FAILURE_MESSAGE,
          previewRows.size(),
          errors,
          warnings,
          formatDate(comparisonDate),
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
    } catch (DataAccessException ex) {
      LOGGER.warn(
          "event=lexis_rtm_amv operation=preview outcome=database_unavailable failureType={}",
          exceptionType(ex));
      throw ex;
    }
  }

  @Override
  @Transactional
  public RtmEmsLogAmvUploadResultDto upload(MultipartFile file) {
    return upload(file, null, false);
  }

  @Override
  @Transactional
  public RtmEmsLogAmvUploadResultDto upload(MultipartFile file, String effectiveMonth) {
    return upload(file, effectiveMonth, true);
  }

  private RtmEmsLogAmvUploadResultDto upload(
      MultipartFile file, String effectiveMonth, boolean enforceNextMonth) {
    List<String> validationErrors = validateUploadRequest(file);
    if (!validationErrors.isEmpty()) {
      return buildUploadResult(
          RETURN_VALIDATION,
          UPLOAD_VALIDATION_FAILURE_MESSAGE,
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
          UPLOAD_VALIDATION_FAILURE_MESSAGE,
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
          UPLOAD_VALIDATION_FAILURE_MESSAGE,
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
      LocalDate parsedRetrievalDate = parseResult.retrievalDate();
      LocalDate parsedUpdateDate = parseResult.updateDate();
      List<UploadTarget> rowsToUpload =
          buildUploadTargets(parseResult.rows(), warnings, parsedEffectiveMonth != null);

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
      validateUploadDateOrder(parsedRetrievalDate, parsedUpdateDate, errors);
      validateUploadTargets(rowsToUpload, parsedRetrievalDate, parsedUpdateDate, errors);
      if (errors.isEmpty()) {
        rowsToUpload =
            filterUploadTargetsForExistingRows(
                rowsToUpload, parsedRetrievalDate, parsedUpdateDate, warnings);
        if (rowsToUpload.isEmpty()) {
          errors.add("No eligible existing AMV rows were found in the uploaded file.");
        }
      }

      if (!errors.isEmpty()) {
        return buildUploadResult(
            RETURN_VALIDATION,
            UPLOAD_VALIDATION_FAILURE_MESSAGE,
            fileName,
            fileSize,
            rowsToUpload.size(),
            0,
            errors,
            warnings,
            List.of());
      }

      LocalDate effectiveDate =
          effectiveDateForSave(SAVE_MODE_UPDATE, parsedRetrievalDate, parsedUpdateDate);
      List<OracleRtmEmsLogAmvRepository.AtomicWriteTarget> targets =
          rowsToUpload.stream()
              .map(
                  row ->
                      new OracleRtmEmsLogAmvRepository.AtomicWriteTarget(
                          RtmEmsLogAmvDimensionValidator.normalize(row.species()),
                          RtmEmsLogAmvDimensionValidator.normalize(row.grade()),
                          RtmEmsLogAmvDimensionValidator.normalize(row.growthIndicator()),
                          effectiveDate,
                          row.newValue()))
              .toList();
      int[] updateCounts = repository.upsertAtomically(targets);
      if (!allWritesApplied(updateCounts, targets.size())) {
        markRollbackOnly();
        return buildUploadResult(
            RETURN_FAILURE,
            "Upload did not complete; no values were saved.",
            fileName,
            fileSize,
            rowsToUpload.size(),
            0,
            List.of("The full AMV workbook submission was not applied."),
            warnings,
            List.of());
      }

      List<RtmEmsLogAmvRowDto> uploadedRows =
          targets.stream()
              .map(
                  target ->
                      new RtmEmsLogAmvRowDto(
                          target.species(),
                          target.grade(),
                          target.growthIndicator(),
                          formatDate(parsedRetrievalDate),
                          formatDate(parsedUpdateDate),
                          null,
                          target.newValue(),
                          "0"))
              .toList();

      return buildUploadResult(
          RETURN_SUCCESS,
          "Upload completed.",
          fileName,
          fileSize,
          rowsToUpload.size(),
          uploadedRows.size(),
          List.of(),
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
    } catch (DataAccessException ex) {
      markRollbackOnly();
      LOGGER.warn(
          "event=lexis_rtm_amv operation=upload outcome=database_unavailable failureType={}",
          exceptionType(ex));
      throw ex;
    }
  }

  private List<String> validateSaveRequest(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = validateSaveRequestFields(request);
    if (request == null) {
      return errors;
    }

    LocalDate effectiveDate =
        effectiveDateForSave(
            request.effectiveSaveMode(),
            parseRetrievalDate(request.retrievalDate()),
            parseRetrievalDate(request.updateDate()));
    errors.addAll(
        RtmEmsLogAmvDimensionValidator.validate(
            request.species(), request.grade(), request.growthIndicator(), effectiveDate));

    return errors;
  }

  private List<String> validateBatchSaveRequest(RtmEmsLogAmvSaveRequestDto request) {
    List<String> errors = validateSaveRequestFields(request);
    if (request == null) {
      return errors;
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
    LocalDate effectiveDate =
        effectiveDateForSave(
            request.effectiveSaveMode(),
            parseRetrievalDate(request.retrievalDate()),
            parseRetrievalDate(request.updateDate()));
    if (effectiveDate != null && !isNextMonth(effectiveDate, clock)) {
      errors.add("Average market values can only be saved for the next month.");
    }
    return errors;
  }

  private List<String> validateSaveRequestFields(RtmEmsLogAmvSaveRequestDto request) {
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

  private String formatDate(LocalDate date) {
    return date == null ? null : date.toString();
  }

  private boolean isSuccess(String returnCode) {
    String normalized = trimToNull(returnCode);
    return "0".equals(normalized) || "-100".equals(normalized);
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

  private boolean hasAppliedValue(
      String species,
      String grade,
      String growthIndicator,
      LocalDate effectiveDate,
      BigDecimal expectedValue) {
    if (effectiveDate == null || expectedValue == null) {
      return false;
    }

    return repository.hasExactValue(
        species, grade, growthIndicator, effectiveDate, expectedValue);
  }

  private void validateUploadDateOrder(
      LocalDate retrievalDate, LocalDate updateDate, List<String> errors) {
    if (retrievalDate != null && updateDate != null && updateDate.isBefore(retrievalDate)) {
      errors.add("Update date must be on or after the retrieval date.");
    }
  }

  private void validateMonthStart(LocalDate date, String label, List<String> errors) {
    if (date != null && !isFirstOfMonth(date)) {
      errors.add(label + " must be the first day of a month.");
    }
  }

  private boolean hasExistingValue(
      String species, String grade, String growthIndicator, LocalDate effectiveDate) {
    if (effectiveDate == null) {
      return false;
    }

    return repository.existsExact(species, grade, growthIndicator, effectiveDate);
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
      List<UploadTarget> targets,
      LocalDate retrievalDate,
      LocalDate updateDate,
      boolean loadCurrentValues) {
    if (retrievalDate == null || updateDate == null) {
      return List.of();
    }

    Map<String, BigDecimal> currentValues = new LinkedHashMap<>();
    if (loadCurrentValues && !targets.isEmpty()) {
      for (RtmEmsLogAmvRowDto row :
          repository.findEffectiveDateRows(null, null, retrievalDate)) {
        BigDecimal currentValue = row.newValue() == null ? row.currentValue() : row.newValue();
        if (currentValue != null) {
          currentValues.putIfAbsent(
              previewRowKey(row.species(), row.grade(), row.growthIndicator()), currentValue);
        }
      }
    }

    List<RtmEmsLogAmvRowDto> previewRows = new ArrayList<>();
    for (UploadTarget target : targets) {
      previewRows.add(
          new RtmEmsLogAmvRowDto(
              target.species(),
              target.grade(),
              target.growthIndicator(),
              formatDate(retrievalDate),
              formatDate(updateDate),
              currentValues.get(
                  previewRowKey(
                      target.species(), target.grade(), target.growthIndicator())),
              target.newValue(),
              "0"));
    }
    return previewRows;
  }

  private List<RtmEmsLogAmvRowDto> buildScreenPreviewRows(
      List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> uploadedRows,
      List<RtmEmsLogAmvRowDto> comparisonRows,
      LocalDate retrievalDate,
      LocalDate updateDate,
      boolean loadCurrentValues) {
    if (retrievalDate == null || updateDate == null) {
      return List.of();
    }

    Map<String, BigDecimal> newValues = new LinkedHashMap<>();
    for (RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow row : uploadedRows) {
      String species = logicalScreenSpecies(row.species());
      String grade = RtmEmsLogAmvDimensionValidator.normalize(row.grade());
      if (species != null && grade != null && SCREEN_GRADES.contains(grade)) {
        newValues.put(screenPreviewRowKey(species, grade), row.newValue());
      }
    }

    Map<String, BigDecimal> currentValues = new LinkedHashMap<>();
    if (loadCurrentValues) {
      for (RtmEmsLogAmvRowDto row : comparisonRows) {
        String species = logicalScreenSpecies(row.species());
        String grade = RtmEmsLogAmvDimensionValidator.normalize(row.grade());
        BigDecimal currentValue = row.newValue() == null ? row.currentValue() : row.newValue();
        if (species != null
            && grade != null
            && SCREEN_GRADES.contains(grade)
            && currentValue != null) {
          currentValues.putIfAbsent(screenPreviewRowKey(species, grade), currentValue);
        }
      }
    }

    List<RtmEmsLogAmvRowDto> previewRows = new ArrayList<>();
    for (String species : SCREEN_SPECIES) {
      for (String grade : SCREEN_GRADES) {
        String key = screenPreviewRowKey(species, grade);
        if (!currentValues.containsKey(key) && !newValues.containsKey(key)) {
          continue;
        }
        previewRows.add(
            new RtmEmsLogAmvRowDto(
                species,
                grade,
                "O",
                formatDate(retrievalDate),
                formatDate(updateDate),
                currentValues.get(key),
                newValues.get(key),
                "0"));
      }
    }
    return previewRows;
  }

  private LocalDate latestComparisonDate(
      List<RtmEmsLogAmvRowDto> comparisonRows, LocalDate fallbackDate) {
    LocalDate latestDate = null;
    for (RtmEmsLogAmvRowDto row : comparisonRows) {
      String dateValue = trimToNull(row.updateDate());
      LocalDate rowDate = parseRetrievalDate(dateValue == null ? row.retrievalDate() : dateValue);
      if (rowDate != null && (latestDate == null || rowDate.isAfter(latestDate))) {
        latestDate = rowDate;
      }
    }
    return latestDate == null ? fallbackDate : latestDate;
  }

  private String logicalScreenSpecies(String species) {
    String normalizedSpecies = RtmEmsLogAmvDimensionValidator.normalize(species);
    if (normalizedSpecies == null) {
      return null;
    }
    if (List.of("WH", "LO", "YE", "PINE").contains(normalizedSpecies)) {
      return "PINE";
    }
    return BATCH_SPECIES_TARGETS.containsKey(normalizedSpecies) ? normalizedSpecies : null;
  }

  private String screenPreviewRowKey(String species, String grade) {
    return species + "|" + grade;
  }

  private String previewRowKey(String species, String grade, String growthIndicator) {
    return String.join(
        "|",
        RtmEmsLogAmvDimensionValidator.normalize(species),
        RtmEmsLogAmvDimensionValidator.normalize(grade),
        RtmEmsLogAmvDimensionValidator.normalize(growthIndicator));
  }

  private List<UploadTarget> filterUploadTargetsForExistingRows(
      List<UploadTarget> uploadTargets,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> warnings) {
    if (uploadTargets == null || uploadTargets.isEmpty()) {
      return List.of();
    }
    if (retrievalDate == null || updateDate == null) {
      return uploadTargets;
    }

    Map<String, List<UploadTarget>> targetsBySpeciesGrade = new LinkedHashMap<>();
    for (UploadTarget target : uploadTargets) {
      String species = trimToNull(target.species());
      String grade = trimToNull(target.grade());
      if (species == null || grade == null) {
        continue;
      }
      targetsBySpeciesGrade
          .computeIfAbsent(
              species.toUpperCase() + "|" + grade.toUpperCase(), ignored -> new ArrayList<>())
          .add(target);
    }

    List<UploadTarget> retainedTargets = new ArrayList<>();
    for (List<UploadTarget> targets : targetsBySpeciesGrade.values()) {
      for (UploadTarget target : targets) {
        if (hasExistingValue(
            target.species(), target.grade(), target.growthIndicator(), retrievalDate)) {
          retainedTargets.add(target);
        }
      }
    }
    int skippedCount = uploadTargets.size() - retainedTargets.size();
    if (skippedCount > 0) {
      warnings.add(
          "%d workbook row%s skipped because the exact existing AMV key was not found for %s."
              .formatted(
                  skippedCount,
                  skippedCount == 1 ? " was" : "s were",
                  formatDate(retrievalDate)));
    }
    return retainedTargets;
  }

  private void validateUploadTargets(
      List<UploadTarget> targets,
      LocalDate retrievalDate,
      LocalDate updateDate,
      List<String> errors) {
    if (targets == null || targets.isEmpty()) {
      return;
    }
    LinkedHashSet<String> uploadErrors = new LinkedHashSet<>();
    LinkedHashSet<String> cellErrors = new LinkedHashSet<>();
    for (UploadTarget target : targets) {
      List<String> targetErrors =
          validateSaveRequest(
              new RtmEmsLogAmvSaveRequestDto(
                  target.species(),
                  target.grade(),
                  target.growthIndicator(),
                  formatDate(retrievalDate),
                  formatDate(updateDate),
                  target.newValue(),
                  SAVE_MODE_UPDATE));
      targetErrors.forEach(
          error -> {
            if (isUploadCellError(error)) {
              cellErrors.add(formatUploadCellError(target, error));
            } else {
              uploadErrors.add(error);
            }
          });
    }
    uploadErrors.stream().filter(error -> !errors.contains(error)).forEach(errors::add);
    errors.addAll(cellErrors);
  }

  private boolean isUploadCellError(String error) {
    return error.startsWith("New value")
        || error.startsWith("Species")
        || error.startsWith("Grade")
        || error.startsWith("Growth indicator");
  }

  private String formatUploadCellError(UploadTarget target, String error) {
    String logicalSpecies = logicalScreenSpecies(target.species());
    String speciesLabel =
        logicalSpecies == null ? null : SCREEN_SPECIES_LABELS.get(logicalSpecies);
    if (speciesLabel == null) {
      speciesLabel = trimToNull(target.species());
    }
    String grade = RtmEmsLogAmvDimensionValidator.normalize(target.grade());
    return "%s grade %s: %s"
        .formatted(
            speciesLabel == null ? "Unknown species" : speciesLabel,
            grade == null ? "unknown" : grade,
            formatUploadCellErrorReason(error));
  }

  private String formatUploadCellErrorReason(String error) {
    return switch (error) {
      case "New value is required." -> "a value is required";
      case "New value must be greater than or equal to zero." -> "must be zero or greater";
      case "New value must have no more than 2 decimal places." ->
          "more than two decimal places";
      case "New value must not exceed 9999.99." -> "must be 9999.99 or less";
      default -> error;
    };
  }

  private List<UploadTarget> buildUploadTargets(
      List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> parsedRows,
      List<String> warnings,
      boolean expandGrowthTypes) {
    List<RtmEmsLogAmvUploadPreviewAnalyzer.UploadRow> uploadRows =
        parsedRows.stream()
            .filter(row -> isUploadableRow(row.species(), row.grade()))
            .toList();

    if (uploadRows.size() < parsedRows.size()) {
      warnings.add("Some rows were skipped because they were missing grade/species values.");
    }

    Map<String, UploadTarget> rowsBySpeciesGradeAndGrowth =
        expandUploadTargets(uploadRows, expandGrowthTypes).stream()
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

    return new ArrayList<>(rowsBySpeciesGradeAndGrowth.values());
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

  private boolean allWritesApplied(int[] updateCounts, int expectedCount) {
    return updateCounts != null
        && updateCounts.length == expectedCount
        && Arrays.stream(updateCounts)
            .allMatch(count -> count > 0 || count == Statement.SUCCESS_NO_INFO);
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Direct unit tests can invoke this service without the Spring transactional proxy.
    }
  }
}

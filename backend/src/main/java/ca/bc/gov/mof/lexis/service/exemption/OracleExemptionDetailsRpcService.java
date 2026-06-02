package ca.bc.gov.mof.lexis.service.exemption;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class OracleExemptionDetailsRpcService implements ExemptionDetailsRpcService {

  private static final String JURISDICTION_FEDERAL = "F";
  private static final String JURISDICTION_RESERVE = "I";
  private static final String EXEMPTION_TYPE_OIC = "O";
  private static final String EXEMPTION_TYPE_BOIC = "B";
  private static final String EXEMPTION_STATUS_ACTIVE = "ACT";
  private static final String EXPORT_PERMIT_STATUS_COMPLETE = "COM";
  private static final String EXPORT_PRODUCT_TYPE_UNMANUFACTURED = "T";
  private static final String EXEMPTION_NUMBER_ASSIGNED_MESSAGE =
      "* - this exemption number has already been assigned";
  private static final String SAVE_SUCCESS_MESSAGE = "The exemption was saved successfully.";
  private static final DateTimeFormatter LEGACY_DATE_FORMATTER = DateTimeFormatter.ofPattern("MM/dd/yyyy");

  private final ExemptionDetailsRpcRepository repository;

  public OracleExemptionDetailsRpcService(ExemptionDetailsRpcRepository repository) {
    this.repository = repository;
  }

  @Override
  public ExemptionApplicationsResponse getApplications(
      String exemptionNumber, boolean canViewFederalApplications, boolean canViewReserveApplications) {
    List<ExemptionDetailsRpcRepository.ApplicationSummaryRow> rows =
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber);

    List<ApplicationItem> applications = new ArrayList<>();
    String previousOwnerClientNumber = null;
    boolean blanketOic = false;
    boolean containsUnmanu = false;

    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row : rows) {
      if (JURISDICTION_FEDERAL.equalsIgnoreCase(row.jurisdictionCode())
          && !canViewFederalApplications) {
        continue;
      }
      if (JURISDICTION_RESERVE.equalsIgnoreCase(row.jurisdictionCode())
          && !canViewReserveApplications) {
        continue;
      }

      if (blanketOic
          || (previousOwnerClientNumber != null
              && !previousOwnerClientNumber.equals(row.ownerClientNumber()))) {
        blanketOic = true;
      } else {
        previousOwnerClientNumber = blankToNull(row.ownerClientNumber());
      }

      if (EXPORT_PRODUCT_TYPE_UNMANUFACTURED.equalsIgnoreCase(row.productTypeCode())) {
        containsUnmanu = true;
      }

      applications.add(
          new ApplicationItem(
              row.applicationNumber(),
              formatVolume(row.requestedVolume()),
              formatVolume(row.scaleVolume()),
              false,
              row.jurisdictionCode()));
    }

    String ownerNumber = blanketOic ? "Blanket OIC" : Optional.ofNullable(previousOwnerClientNumber).orElse("");
    return new ExemptionApplicationsResponse(List.copyOf(applications), containsUnmanu, ownerNumber);
  }

  @Override
  public List<PermitItem> getPermits(
      String exemptionNumber, boolean ministryUser, boolean privilegedUser, String forestClientNumber) {
    String exemptionTypeCode =
        repository.findExemptionTypeCodeByExemptionNumber(exemptionNumber).orElse("");
    boolean oicLike =
        EXEMPTION_TYPE_OIC.equalsIgnoreCase(exemptionTypeCode)
            || EXEMPTION_TYPE_BOIC.equalsIgnoreCase(exemptionTypeCode);

    return repository.findPermitsByExemptionNumber(exemptionNumber).stream()
        .map(
            row -> {
              boolean canViewPermit =
                  resolveCanViewPermit(
                      row, oicLike, ministryUser, privilegedUser, blankToNull(forestClientNumber));
              double displayedVolume = oicLike ? row.oicRequestVolume() : row.permitVolume();
              return new PermitItem(
                  row.permitNumber(),
                  formatVolume(displayedVolume),
                  row.statusDescription(),
                  formatLegacyDate(row.issueDate()),
                  canViewPermit);
            })
        .toList();
  }

  @Override
  public BlanketOicTotalsResponse getBlanketOicTotals(String exemptionNumber) {
    double requestedVolume = 0.0d;
    double completedVolume = 0.0d;

    for (ExemptionDetailsRpcRepository.PermitSummaryRow row :
        repository.findPermitsByExemptionNumber(exemptionNumber)) {
      requestedVolume += row.permitVolume();
      if (EXPORT_PERMIT_STATUS_COMPLETE.equalsIgnoreCase(row.statusCode())) {
        completedVolume += row.permitVolume();
      }
    }

    return new BlanketOicTotalsResponse(
        formatVolume(requestedVolume), formatVolume(completedVolume));
  }

  @Override
  public List<DocumentItem> getDocumentDetails(String exemptionNumber) {
    List<ExemptionDetailsRpcRepository.DocumentRow> allDocuments = new ArrayList<>();
    allDocuments.addAll(repository.findExemptionDocumentDetailsByExemptionNumber(exemptionNumber));

    for (ExemptionDetailsRpcRepository.ApplicationSummaryRow row :
        repository.findApplicationSummariesByExemptionNumber(exemptionNumber)) {
      allDocuments.addAll(
          repository.findApplicationDocumentDetailsByApplicationNumber(row.applicationNumber()));
    }

    Map<String, String> attachmentTypeByCode = new LinkedHashMap<>();
    return allDocuments.stream()
        .map(
            row ->
                new DocumentItem(
                    row.id(),
                    row.fileName(),
                    normalizeDescription(row.description()),
                    resolveAttachmentTypeDescription(row.attachmentTypeCode(), attachmentTypeByCode)))
        .toList();
  }

  @Override
  public Optional<DocumentContent> getDocument(Long fileId) {
    return repository.findFileAttachmentBytes(fileId).map(DocumentContent::new);
  }

  @Override
  public boolean removeDocument(Long documentId) {
    return repository.deleteExemptionFile(documentId);
  }

  @Override
  public CreateExemptionResult addExemption(CreateExemptionRequest request, String userId) {
    CreateExemptionRequest normalized = normalizeCreateExemptionRequest(request);
    List<String> errors = validateCreateExemption(normalized);
    List<String> warnings = List.of();

    if (!errors.isEmpty()) {
      return new CreateExemptionResult(false, null, null, false, errors, warnings);
    }

    Optional<ExemptionDetailsRpcRepository.ExemptionInsertRow> inserted =
        repository.insertExemption(toInsertRecord(normalized, blankToNull(userId)));
    String exemptionNumber =
        inserted.map(ExemptionDetailsRpcRepository.ExemptionInsertRow::exemptionNumber).orElse(null);

    if (blankToNull(exemptionNumber) == null) {
      return new CreateExemptionResult(
          false,
          "We were unable to save this exemption. Please note the time this error occurred and report to someone.",
          null,
          false,
          List.of(),
          warnings);
    }

    return new CreateExemptionResult(
        true, SAVE_SUCCESS_MESSAGE, exemptionNumber, true, List.of(), warnings);
  }

  @Override
  public ExemptionNumberValidationResult checkExemptionNumber(String exemptionNumber) {
    String normalized = blankToNull(exemptionNumber);
    boolean valid = normalized == null || !repository.existsByExemptionNumber(normalized);
    return new ExemptionNumberValidationResult(
        valid, valid ? null : EXEMPTION_NUMBER_ASSIGNED_MESSAGE);
  }

  private boolean resolveCanViewPermit(
      ExemptionDetailsRpcRepository.PermitSummaryRow row,
      boolean oicLike,
      boolean ministryUser,
      boolean privilegedUser,
      String forestClientNumber) {
    if (privilegedUser || ministryUser) {
      return true;
    }
    if (forestClientNumber == null) {
      return false;
    }

    boolean ownerOrAgentMatch =
        forestClientNumber.equals(row.clientNumber()) || forestClientNumber.equals(row.agentNumber());
    if (oicLike) {
      return ownerOrAgentMatch;
    }
    return ownerOrAgentMatch;
  }

  private String resolveAttachmentTypeDescription(
      String attachmentTypeCode, Map<String, String> attachmentTypeByCode) {
    String normalizedCode = blankToNull(attachmentTypeCode);
    if (normalizedCode == null) {
      return "";
    }
    String cached = attachmentTypeByCode.get(normalizedCode);
    if (cached != null) {
      return cached;
    }
    String resolved =
        repository.findAttachmentTypeDescription(normalizedCode).orElse(normalizedCode);
    attachmentTypeByCode.put(normalizedCode, resolved);
    return resolved;
  }

  private String normalizeDescription(String description) {
    String normalized = blankToNull(description);
    return normalized == null ? "Not on file" : normalized;
  }

  private String formatLegacyDate(LocalDate date) {
    if (date == null) {
      return "";
    }
    return date.format(LEGACY_DATE_FORMATTER);
  }

  private String formatVolume(double value) {
    return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private CreateExemptionRequest normalizeCreateExemptionRequest(CreateExemptionRequest input) {
    if (input == null) {
      return new CreateExemptionRequest(null, null, null, null, null, null, null, List.of());
    }
    List<Long> regions =
        input.regionNumbers() == null
            ? List.of()
            : input.regionNumbers().stream()
                .filter(region -> region != null && region > 0)
                .distinct()
                .toList();
    return new CreateExemptionRequest(
        blankToNull(input.exemptionNumber()),
        input.approvedVolume(),
        input.approvalDate(),
        input.expiryDate(),
        input.otherConditions() == null ? "" : input.otherConditions().trim(),
        blankToNull(input.exemptionTypeCode()),
        blankToNull(input.exemptionStatusCode()),
        regions);
  }

  private List<String> validateCreateExemption(CreateExemptionRequest request) {
    List<String> errors = new ArrayList<>();
    if (blankToNull(request.exemptionNumber()) == null) {
      errors.add(required("exemption number"));
    }
    if (request.approvedVolume() == null || request.approvedVolume() <= 0.0d) {
      errors.add("The approved volume must be greater than 0");
    }
    if (blankToNull(request.exemptionTypeCode()) == null) {
      errors.add(required("exemption type code"));
    }
    if (blankToNull(request.exemptionStatusCode()) == null) {
      errors.add(required("exemption status code"));
    }
    if (EXEMPTION_STATUS_ACTIVE.equalsIgnoreCase(request.exemptionStatusCode())
        && request.expiryDate() == null) {
      errors.add(required("expiry date"));
    }
    if (request.approvalDate() != null
        && request.expiryDate() != null
        && request.expiryDate().isBefore(request.approvalDate())) {
      errors.add("The approval date must come before the expiry.");
    }
    if (EXEMPTION_TYPE_BOIC.equalsIgnoreCase(request.exemptionTypeCode())
        && request.regionNumbers().isEmpty()) {
      errors.add(required("region"));
    }
    return errors;
  }

  private ExemptionDetailsRpcRepository.ExemptionInsertRecord toInsertRecord(
      CreateExemptionRequest request, String entryUserId) {
    return new ExemptionDetailsRpcRepository.ExemptionInsertRecord(
        request.exemptionNumber(),
        request.approvedVolume(),
        request.approvalDate(),
        request.expiryDate(),
        request.otherConditions(),
        request.exemptionTypeCode(),
        request.exemptionStatusCode(),
        entryUserId,
        request.regionNumbers());
  }

  private String required(String fieldName) {
    return "A valid " + fieldName + " is required.";
  }
}

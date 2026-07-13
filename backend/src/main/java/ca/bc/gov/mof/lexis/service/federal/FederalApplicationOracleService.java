package ca.bc.gov.mof.lexis.service.federal;

import static ca.bc.gov.mof.lexis.util.CollectionUtils.positiveDistinctLongs;
import static ca.bc.gov.mof.lexis.util.CollectionUtils.safeList;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationClientContextDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationPermitDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationRemarkDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchCriteria;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationSearchResultDto;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.PackageMutationRecord;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.PackageMutationRow;
import ca.bc.gov.mof.lexis.repository.federal.FederalApplicationRepository;
import ca.bc.gov.mof.lexis.repository.federal.FederalPermitDetailRepository;
import ca.bc.gov.mof.lexis.repository.review.ApplicationReviewRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import ca.bc.gov.mof.lexis.util.TextUtils;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.NoTransactionException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

@Service
@Profile("oracle")
public class FederalApplicationOracleService implements FederalApplicationService {

  private final FederalApplicationRepository repository;
  private final FederalPermitDetailRepository permitRepository;
  private final ApplicationDetailsRpcRepository applicationDetailsRepository;
  private final ApplicationReviewRepository applicationReviewRepository;
  private final ClientLookupService clientLookupService;
  private final ApplicationEditLockService editLockService;
  private final Clock clock;

  @Autowired
  public FederalApplicationOracleService(
      FederalApplicationRepository repository,
      FederalPermitDetailRepository permitRepository,
      ApplicationDetailsRpcRepository applicationDetailsRepository,
      ApplicationReviewRepository applicationReviewRepository,
      ClientLookupService clientLookupService,
      ApplicationEditLockService editLockService) {
    this(
        repository,
        permitRepository,
        applicationDetailsRepository,
        applicationReviewRepository,
        clientLookupService,
        editLockService,
        LexisBusinessTime.systemClock());
  }

  FederalApplicationOracleService(
      FederalApplicationRepository repository,
      FederalPermitDetailRepository permitRepository,
      ApplicationDetailsRpcRepository applicationDetailsRepository,
      ApplicationReviewRepository applicationReviewRepository,
      ClientLookupService clientLookupService,
      ApplicationEditLockService editLockService,
      Clock clock) {
    this.repository = repository;
    this.permitRepository = permitRepository;
    this.applicationDetailsRepository = applicationDetailsRepository;
    this.applicationReviewRepository = applicationReviewRepository;
    this.clientLookupService = clientLookupService;
    this.editLockService = editLockService;
    this.clock = clock == null ? LexisBusinessTime.systemClock() : clock;
  }

  @Override
  public FederalApplicationSearchOptionsDto searchOptions() {
    return new FederalApplicationSearchOptionsDto(
        safeList(repository.loadApplicationStatusOptions()),
        safeList(repository.loadFederalExemptionTypeOptions()));
  }

  @Override
  public FederalApplicationSearchResponseDto search(FederalApplicationSearchCriteria criteria) {
    return search(criteria, null);
  }

  @Override
  public FederalApplicationSearchResponseDto search(
      FederalApplicationSearchCriteria criteria, Integer knownTotal) {
    FederalApplicationSearchCriteria normalized = normalizeCriteria(criteria);
    int page = normalized.page();
    int size = normalized.size();

    Page<FederalApplicationSearchResultDto> searchPage =
        knownTotal == null ? repository.search(normalized) : repository.search(normalized, knownTotal);
    if (searchPage == null) {
      throw new DataRetrievalFailureException(
          "Federal application search returned no authoritative Oracle page.");
    }
    List<FederalApplicationSearchResultDto> repositoryResults = safeList(searchPage.getContent());
    Set<Long> lockedApplicationNumbers =
        editLockService.lockedApplicationNumbers(
            repositoryResults.stream()
                .map(FederalApplicationSearchResultDto::applicationNumber)
                .toList());
    if (lockedApplicationNumbers == null) {
      throw new IllegalStateException("Application lock registry returned no authoritative state.");
    }
    List<FederalApplicationSearchResultDto> results =
        repositoryResults.stream()
            .map(
                result ->
                    result.withLocked(
                        lockedApplicationNumbers.contains(result.applicationNumber())))
            .toList();

    return new FederalApplicationSearchResponseDto(
        results,
        (int) Math.min(Integer.MAX_VALUE, searchPage.getTotalElements()),
        page,
        size);
  }

  @Override
  public int count(FederalApplicationSearchCriteria criteria) {
    return repository.count(normalizeCriteria(criteria));
  }

  @Override
  public Optional<FederalApplicationDetailDto> findByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return repository
        .findByApplicationNumber(applicationNumber)
        .map(
            detail -> {
              String endUse =
                  ApplicationDetailsRpcService.toSpeciesEndUseSort(
                      applicationDetailsRepository
                          .findEndUsesByApplicationNumberRequired(applicationNumber)
                          .stream()
                          .map(
                              row ->
                                  new ApplicationDetailsRpcService.SpeciesEndUseItem(
                                      row.speciesCode(), row.endUseCode(), null))
                          .toList());
              String productType =
                  applicationDetailsRepository
                      .findProductTypeDescription(detail.productType())
                      .orElse(detail.productType());
              String ageClass =
                  applicationDetailsRepository
                      .findGrowthTypeDescription(detail.ageClass())
                      .orElse(detail.ageClass());
              return detail
                  .withEndUse(endUse)
                  .withProductDescriptions(productType, ageClass)
                  .withClientContexts(
                    resolveClientContext(
                        detail.ownerClientNumber(), detail.ownerClientLocationCode()),
                    resolveClientContext(
                        detail.agentClientNumber(), detail.agentClientLocationCode()));
            });
  }

  private FederalApplicationClientContextDto resolveClientContext(
      String clientNumber, String clientLocationCode) {
    if (trimToNull(clientNumber) == null || trimToNull(clientLocationCode) == null) {
      return null;
    }

    return clientLookupService
        .getClientDataRequired(clientNumber, clientLocationCode)
        .map(
            data ->
                new FederalApplicationClientContextDto(
                    data.address(),
                    data.city(),
                    data.province(),
                    data.postalCode(),
                    data.country(),
                    data.phone(),
                    data.fax(),
                    data.email()))
        .orElse(null);
  }

  @Override
  public Optional<FederalApplicationPermitDto> findPermitByApplicationNumber(Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
      return Optional.empty();
    }
    return repository.findPermitByApplicationNumberRequired(applicationNumber);
  }

  @Override
  @Transactional(readOnly = true)
  public Optional<List<FederalApplicationRemarkDto>> findRemarksByApplicationNumber(
      Long applicationNumber) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
      return Optional.empty();
    }
    List<FederalApplicationRemarkDto> remarks =
        applicationDetailsRepository.findRemarksByApplicationNumber(applicationNumber).stream()
            .map(row -> toFederalRemark(applicationNumber, row))
            .sorted(Comparator.comparing(FederalApplicationRemarkDto::remarkId))
            .toList();
    return Optional.of(remarks);
  }

  @Override
  public boolean verifyApplicationClients(List<Long> applicationNumbers) {
    List<Long> validNumbers = positiveDistinctLongs(applicationNumbers);
    if (validNumbers.isEmpty()) {
      return false;
    }
    return repository.verifyApplicationClientsRequired(validNumbers);
  }

  @Override
  @Transactional
  public FederalMutationResult addPermit(
      Long applicationNumber, FederalPermitMutationRequest request, String userId) {
    request = normalizePermitMutationRequest(request);
    List<String> errors = validatePermitMutation(applicationNumber, request, false);
    if (!errors.isEmpty()) {
      return failure(errors);
    }
    FederalApplicationRepository.FederalMutationContextRow context =
        repository.findMutationContextRequired(applicationNumber).orElse(null);
    if (context == null) {
      return failure(List.of("Federal application was not found."));
    }
    String applicationStatus = trimToNull(context.statusCode());
    if (applicationStatus == null) {
      return failure(List.of("Federal application status could not be verified."));
    }
    if (!"APP".equalsIgnoreCase(applicationStatus)) {
      return failure(
          List.of("Federal permits can only be added to approved applications."));
    }
    List<String> codeErrors = validatePermitCodes(request);
    if (!codeErrors.isEmpty()) {
      return failure(codeErrors);
    }
    try {
      if (repository.findPermitByApplicationNumberRequired(applicationNumber).isPresent()) {
        return failure(List.of("A federal permit already exists for this application."));
      }
    } catch (DataAccessException ex) {
      return failure(List.of("Federal permit availability could not be verified."));
    }
    String mutationUser = TextUtils.defaultSystemUser(userId);
    FederalPermitDetailRepository.FederalPermitDetailRecord permitRecord =
        toPermitRecord(request, context, mutationUser);
    Optional<FederalPermitDetailRepository.FederalPermitDetailRow> inserted =
        permitRepository.insertFederalPermitDetail(permitRecord);
    if (inserted.filter(row -> matchesInsertedPermit(row, permitRecord)).isEmpty()) {
      markRollbackOnly();
      return failure(List.of("Federal permit could not be saved."));
    }
    if (!linkPackages(applicationNumber, inserted.get().permitNumber(), mutationUser)) {
      markRollbackOnly();
      return failure(List.of("Federal permit was created, but its application packages could not be linked."));
    }
    return success("Federal permit added.", toPermitDto(inserted.get()));
  }

  @Override
  @Transactional
  public FederalMutationResult updatePermit(
      Long applicationNumber, FederalPermitMutationRequest request, String userId) {
    request = normalizePermitMutationRequest(request);
    List<String> errors = validatePermitMutation(applicationNumber, request, true);
    if (!errors.isEmpty()) {
      return failure(errors);
    }
    FederalApplicationRepository.FederalMutationContextRow context =
        repository.findMutationContextRequired(applicationNumber).orElse(null);
    if (context == null) {
      return failure(List.of("Federal permit was not found."));
    }
    Optional<FederalApplicationPermitDto> current =
        repository.findPermitByApplicationNumberRequired(applicationNumber);
    if (current.isEmpty()) {
      return failure(List.of("Federal permit was not found."));
    }
    if (!request.permitNumber().equals(current.get().permitNumber())) {
      return failure(List.of("Federal permit number does not match this application."));
    }
    List<String> codeErrors = validatePermitCodes(request);
    if (!codeErrors.isEmpty()) {
      return failure(codeErrors);
    }
    String mutationUser = TextUtils.defaultSystemUser(userId);
    Long expectedPermitNumber = request.permitNumber();
    FederalPermitDetailRepository.FederalPermitDetailRecord expected =
        toPermitRecord(request, context, mutationUser);
    boolean updated =
        permitRepository.updateFederalPermitDetail(
            expectedPermitNumber, expected, mutationUser);
    if (!updated) {
      markRollbackOnly();
      return failure(List.of("Federal permit could not be updated."));
    }

    Optional<FederalPermitDetailRepository.FederalPermitDetailRow> persisted =
        permitRepository.findFederalPermitDetailByIdRequired(expectedPermitNumber);
    if (persisted
        .filter(permit -> matchesPersistedPermit(permit, expectedPermitNumber, expected))
        .isEmpty()) {
      markRollbackOnly();
      return failure(List.of("Federal permit update could not be verified."));
    }
    return success("Federal permit updated.", toPermitDto(persisted.get()));
  }

  @Override
  @Transactional
  public FederalMutationResult updateStatus(
      Long applicationNumber, FederalStatusMutationRequest request, String userId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return failure(List.of("Federal application was not found."));
    }
    String status = request == null ? null : trimToNull(request.statusCode());
    if (status == null
        || !List.of("APP", "REJ", "WDN").contains(status.toUpperCase(Locale.ROOT))) {
      return failure(List.of("Federal status must be APP, REJ, or WDN."));
    }
    String normalizedStatus = status.toUpperCase(Locale.ROOT);
    String remark = request == null ? null : trimToNull(request.remark());
    if (("REJ".equals(normalizedStatus) || "WDN".equals(normalizedStatus))
        && remark == null) {
      return failure(List.of("A remark is required when rejecting or withdrawing a federal application."));
    }

    FederalApplicationRepository.FederalMutationContextRow context =
        repository.findMutationContextRequired(applicationNumber).orElse(null);
    if (context == null) {
      return failure(List.of("Federal application was not found."));
    }

    String currentStatus = trimToNull(context.statusCode());
    if (currentStatus == null) {
      return failure(List.of("Federal application status could not be verified."));
    }
    currentStatus = currentStatus.toUpperCase(Locale.ROOT);

    List<String> allowedSourceStatuses;
    if ("APP".equals(normalizedStatus)) {
      allowedSourceStatuses = List.of("NEW", "PND");
      if (!allowedSourceStatuses.contains(currentStatus)) {
        return failure(List.of("Federal applications can only be approved from NEW or PND."));
      }
    } else {
      allowedSourceStatuses = List.of("APP");
      if (!"APP".equals(currentStatus)) {
        return failure(
            List.of("Federal applications can only be rejected or withdrawn from APP."));
      }
      LocalDate listingDate = context.listingDate();
      if (listingDate == null) {
        return failure(List.of("Federal application listing date could not be verified."));
      }
      if (!LocalDate.now(clock).isBefore(listingDate.plusDays(1))) {
        return failure(
            List.of(
                "Federal applications can only be rejected or withdrawn through the listing day."));
      }
    }

    ApplicationReviewRepository.ApplicationStatusTransitionRow result =
        applicationReviewRepository.updateStatusWithRemarkFromAllowedSources(
            applicationNumber,
            normalizedStatus,
            remark,
            TextUtils.defaultSystemUser(userId),
            allowedSourceStatuses);
    if (!result.applicationFound()) {
      return failure(List.of("Federal application status could not be verified."));
    }
    if (!result.transitionAllowed()) {
      return failure(
          List.of("Federal application status changed before the update; reload and try again."));
    }
    if (!result.updated() || (remark != null && result.remark() == null)) {
      markRollbackOnly();
      return failure(List.of("Federal application status could not be updated."));
    }
    return success("Federal application status updated.", null);
  }

  @Override
  @Transactional
  public FederalRemarkMutationResult addRemark(
      Long applicationNumber, FederalRemarkMutationRequest request, String userId) {
    String remark = normalizedRemark(request);
    List<String> errors = validateRemark(applicationNumber, null, remark, false);
    if (!errors.isEmpty()) {
      return remarkFailure(errors);
    }

    try {
      if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
        return remarkFailure(List.of("Federal application was not found."));
      }
      Optional<ApplicationDetailsRpcRepository.RemarkRow> inserted =
          applicationDetailsRepository.insertRemark(
              applicationNumber, remark, TextUtils.defaultSystemUser(userId), Instant.now());
      if (inserted.isEmpty()) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be saved."));
      }
      FederalApplicationRemarkDto persisted =
          toFederalRemark(applicationNumber, inserted.get());
      if (!remark.equals(persisted.remark())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      return remarkSuccess("Federal application remark added.", persisted);
    } catch (DataAccessException ex) {
      markRollbackOnly();
      return remarkFailure(List.of("Federal application remark could not be saved."));
    }
  }

  @Override
  @Transactional
  public FederalRemarkMutationResult updateRemark(
      Long applicationNumber,
      Long remarkId,
      FederalRemarkMutationRequest request,
      String userId) {
    String remark = normalizedRemark(request);
    List<String> errors = validateRemark(applicationNumber, remarkId, remark, true);
    if (!errors.isEmpty()) {
      return remarkFailure(errors);
    }

    try {
      if (repository.findMutationContextRequired(applicationNumber).isEmpty()) {
        return remarkFailure(List.of("Federal application was not found."));
      }
      Optional<ApplicationDetailsRpcRepository.RemarkRow> current =
          applicationDetailsRepository.findRemarkByNumberRequired(remarkId);
      if (current.isEmpty()
          || !applicationNumber.equals(current.get().applicationNumber())) {
        return remarkFailure(List.of("Federal application remark was not found."));
      }

      if (!applicationDetailsRepository.updateRemark(
          remarkId,
          applicationNumber,
          remark,
          TextUtils.defaultSystemUser(userId),
          Instant.now())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be updated."));
      }

      Optional<ApplicationDetailsRpcRepository.RemarkRow> updated =
          applicationDetailsRepository.findRemarkByNumberRequired(remarkId);
      if (updated.isEmpty()) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      FederalApplicationRemarkDto persisted =
          toFederalRemark(applicationNumber, updated.get());
      if (!remark.equals(persisted.remark())) {
        markRollbackOnly();
        return remarkFailure(List.of("Federal application remark could not be verified."));
      }
      return remarkSuccess("Federal application remark updated.", persisted);
    } catch (DataAccessException ex) {
      markRollbackOnly();
      return remarkFailure(List.of("Federal application remark could not be updated."));
    }
  }

  private String normalizedRemark(FederalRemarkMutationRequest request) {
    return request == null ? null : trimToNull(request.remark());
  }

  private List<String> validateRemark(
      Long applicationNumber, Long remarkId, String remark, boolean update) {
    List<String> errors = new ArrayList<>();
    if (applicationNumber == null || applicationNumber < 1) {
      errors.add("Application number is required.");
    }
    if (update && (remarkId == null || remarkId < 1)) {
      errors.add("Remark number is required.");
    }
    if (remark == null) {
      errors.add("Remark is required.");
    } else if (remark.length() > 250) {
      errors.add("Remark must not exceed 250 characters.");
    }
    return errors;
  }

  private FederalApplicationRemarkDto toFederalRemark(
      Long expectedApplicationNumber, ApplicationDetailsRpcRepository.RemarkRow row) {
    if (row == null
        || row.remarkId() < 1
        || row.applicationNumber() == null
        || !expectedApplicationNumber.equals(row.applicationNumber())) {
      throw new DataRetrievalFailureException(
          "Federal application remark did not match its application parent.");
    }
    return new FederalApplicationRemarkDto(
        row.remarkId(), row.remark(), row.user(), row.date());
  }

  private FederalRemarkMutationResult remarkSuccess(
      String message, FederalApplicationRemarkDto remark) {
    return new FederalRemarkMutationResult(true, message, remark, List.of());
  }

  private FederalRemarkMutationResult remarkFailure(List<String> errors) {
    return new FederalRemarkMutationResult(false, null, null, List.copyOf(errors));
  }

  private List<String> validatePermitMutation(
      Long applicationNumber, FederalPermitMutationRequest request, boolean update) {
    List<String> errors = new ArrayList<>();
    if (applicationNumber == null || applicationNumber < 1) {
      errors.add("Application number is required.");
    }
    if (request == null) {
      return List.of("Federal permit details are required.");
    }
    if (update && (request.permitNumber() == null || request.permitNumber() < 1)) {
      errors.add("Permit number is required.");
    }
    if (request.permitIssueDate() == null) {
      errors.add("Permit issue date is required.");
    }
    validateRequiredCode(request.destinationCountry(), "Destination country", 2, errors);
    validateRequiredCode(request.transportType(), "Transport type", 1, errors);
    validateRequiredText(request.transportName(), "Transport name", 26, errors);
    if (request.shippingDate() == null) {
      errors.add("Estimated shipping date is required.");
    }
    validateRequiredCode(request.portOfExport(), "Port of export", 2, errors);
    if ("OT".equals(request.portOfExport())) {
      validateRequiredText(request.otherPortOfExport(), "Other port of export", 34, errors);
    }
    return errors;
  }

  private void validateRequiredCode(
      String value, String description, int requiredLength, List<String> errors) {
    if (value == null) {
      errors.add(description + " is required.");
    } else if (value.length() != requiredLength) {
      errors.add(
          description
              + " must be exactly "
              + requiredLength
              + (requiredLength == 1 ? " character." : " characters."));
    }
  }

  private void validateRequiredText(
      String value, String description, int maxLength, List<String> errors) {
    if (value == null) {
      errors.add(description + " is required.");
    } else if (!isUsAscii(value)) {
      errors.add(description + " contains characters the current LEXIS database cannot store.");
    } else if (value.length() > maxLength) {
      errors.add(description + " must not exceed " + maxLength + " bytes.");
    }
  }

  private boolean isUsAscii(String value) {
    return value.chars().allMatch(character -> character <= 0x7f);
  }

  private FederalPermitMutationRequest normalizePermitMutationRequest(
      FederalPermitMutationRequest request) {
    if (request == null) {
      return null;
    }
    String portCode = normalizedCode(request.portOfExport());
    return new FederalPermitMutationRequest(
        request.permitNumber(),
        request.permitIssueDate(),
        normalizedCode(request.destinationCountry()),
        normalizedCode(request.transportType()),
        trimToNull(request.transportName()),
        request.shippingDate(),
        portCode,
        "OT".equals(portCode) ? trimToNull(request.otherPortOfExport()) : null);
  }

  private String normalizedCode(String value) {
    String normalized = trimToNull(value);
    return normalized == null ? null : normalized.toUpperCase(Locale.ROOT);
  }

  private List<String> validatePermitCodes(FederalPermitMutationRequest request) {
    try {
      List<String> errors = new ArrayList<>();
      if (!permitRepository.countryCodeExistsRequired(request.destinationCountry())) {
        errors.add("Destination country is invalid.");
      }
      if (!permitRepository.portOfExportCodeExistsRequired(request.portOfExport())) {
        errors.add("Port of export is invalid.");
      }
      if (!permitRepository.transportTypeCodeExistsRequired(request.transportType())) {
        errors.add("Transport type is invalid.");
      }
      return errors;
    } catch (DataAccessException ex) {
      return List.of("Federal permit reference codes could not be verified.");
    }
  }

  private FederalPermitDetailRepository.FederalPermitDetailRecord toPermitRecord(
      FederalPermitMutationRequest request,
      FederalApplicationRepository.FederalMutationContextRow context,
      String userId) {
    return new FederalPermitDetailRepository.FederalPermitDetailRecord(
        request.permitIssueDate(), request.shippingDate(), request.otherPortOfExport(),
        request.transportName(), userId, request.transportType(), request.destinationCountry(),
        request.portOfExport(), context.applicationDate(), context.orgUnitNumber(),
        context.clientLocationCode(), context.clientNumber());
  }

  private boolean linkPackages(Long applicationNumber, Long permitNumber, String userId) {
    try {
      List<String> packageNumbers =
          normalizedPackageNumbers(
              repository.findPackageNumbersByApplicationNumberRequired(applicationNumber));
      if (packageNumbers.isEmpty()) {
        return false;
      }

      for (String packageNumber : packageNumbers) {
        Optional<PackageMutationRow> current =
            applicationDetailsRepository.findPackageMutationByPackageNumber(packageNumber);
        if (current
            .filter(
                row ->
                    sameText(packageNumber, row.packageNumber())
                        && java.util.Objects.equals(applicationNumber, row.applicationNumber()))
            .isEmpty()) {
          return false;
        }
        PackageMutationRow row = current.get();
        List<ApplicationDetailsRpcRepository.EndUseMutationRecord> endUses =
            applicationDetailsRepository.findEndUsesByPackageNumberRequired(packageNumber).stream()
                .map(
                    item ->
                        new ApplicationDetailsRpcRepository.EndUseMutationRecord(
                            item.speciesCode(), item.endUseCode()))
                .toList();
        boolean updated =
            applicationDetailsRepository.updatePackage(
                new PackageMutationRecord(
                    row.packageNumber(), row.applicationNumber(), row.reprocessedIndicator(), row.packageVolume(),
                    row.averageLength(), row.averageDiameter(), row.comments(), row.packageFee(), permitNumber,
                    row.reservePermitNumber(), row.packageStatusCode(), row.growthTypeCode(), row.productTypeCode(),
                    row.entryUserId(), row.entryTimestamp(), userId, endUses));
        if (!updated) return false;
      }

      List<String> persistedPackageNumbers =
          normalizedPackageNumbers(
              repository.findPackageNumbersByApplicationNumberRequired(applicationNumber));
      if (!packageNumbers.equals(persistedPackageNumbers)) {
        return false;
      }
      return packageNumbers.stream()
          .allMatch(
              packageNumber ->
                  applicationDetailsRepository
                      .findPackageMutationByPackageNumber(packageNumber)
                      .filter(
                          row ->
                              sameText(packageNumber, row.packageNumber())
                                  && java.util.Objects.equals(
                                      applicationNumber, row.applicationNumber())
                                  && java.util.Objects.equals(
                                      permitNumber, row.federalPermitNumber()))
                      .isPresent());
    } catch (DataAccessException ex) {
      return false;
    }
  }

  private List<String> normalizedPackageNumbers(List<String> packageNumbers) {
    return safeList(packageNumbers).stream()
        .map(TextUtils::trimToNull)
        .filter(java.util.Objects::nonNull)
        .distinct()
        .sorted()
        .toList();
  }

  private FederalApplicationPermitDto toPermitDto(
      FederalPermitDetailRepository.FederalPermitDetailRow row) {
    return new FederalApplicationPermitDto(
        row.permitNumber(), row.permitIssueDate(), row.countryCode(), row.transportTypeCode(),
        row.transportName(), row.estimatedShippingDate(), row.portOfExportCode(), row.otherPortOfExport());
  }

  private boolean matchesInsertedPermit(
      FederalPermitDetailRepository.FederalPermitDetailRow row,
      FederalPermitDetailRepository.FederalPermitDetailRecord expected) {
    return row != null
        && row.permitNumber() != null
        && row.permitNumber() > 0
        && java.util.Objects.equals(expected.permitIssueDate(), row.permitIssueDate())
        && java.util.Objects.equals(
            expected.estimatedShippingDate(), row.estimatedShippingDate())
        && sameText(expected.countryCode(), row.countryCode())
        && sameText(expected.transportTypeCode(), row.transportTypeCode())
        && sameText(expected.transportName(), row.transportName())
        && sameText(expected.portOfExportCode(), row.portOfExportCode())
        && sameText(expected.otherPortOfExport(), row.otherPortOfExport())
        && java.util.Objects.equals(expected.applicationDate(), row.applicationDate())
        && java.util.Objects.equals(expected.orgUnitNumber(), row.orgUnitNumber())
        && sameText(expected.clientLocationCode(), row.clientLocationCode())
        && sameText(expected.clientNumber(), row.clientNumber());
  }

  private boolean matchesPersistedPermit(
      FederalPermitDetailRepository.FederalPermitDetailRow row,
      Long expectedPermitNumber,
      FederalPermitDetailRepository.FederalPermitDetailRecord expected) {
    return row != null
        && java.util.Objects.equals(expectedPermitNumber, row.permitNumber())
        && java.util.Objects.equals(expected.permitIssueDate(), row.permitIssueDate())
        && java.util.Objects.equals(
            expected.estimatedShippingDate(), row.estimatedShippingDate())
        && sameText(expected.countryCode(), row.countryCode())
        && sameText(expected.transportTypeCode(), row.transportTypeCode())
        && sameText(expected.transportName(), row.transportName())
        && sameText(expected.portOfExportCode(), row.portOfExportCode())
        && sameText(expected.otherPortOfExport(), row.otherPortOfExport())
        && java.util.Objects.equals(expected.applicationDate(), row.applicationDate())
        && java.util.Objects.equals(expected.orgUnitNumber(), row.orgUnitNumber())
        && sameText(expected.clientLocationCode(), row.clientLocationCode())
        && sameText(expected.clientNumber(), row.clientNumber());
  }

  private boolean sameText(String expected, String actual) {
    return java.util.Objects.equals(trimToNull(expected), trimToNull(actual));
  }

  private FederalMutationResult success(String message, FederalApplicationPermitDto permit) {
    return new FederalMutationResult(true, message, permit, List.of());
  }

  private FederalMutationResult failure(List<String> errors) {
    return new FederalMutationResult(false, null, null, List.copyOf(errors));
  }

  private void markRollbackOnly() {
    try {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
    } catch (NoTransactionException ignored) {
      // Unit calls may not have an active transaction.
    }
  }

  private FederalApplicationSearchCriteria normalizeCriteria(FederalApplicationSearchCriteria input) {
    if (input == null) {
      return new FederalApplicationSearchCriteria(
          null, null, null, null, null, null, null, null, null, null, List.of(), 0, 25);
    }

    return new FederalApplicationSearchCriteria(
        trimToNull(input.federalApplicationNumber()),
        trimToNull(input.packageNumber()),
        trimToNull(input.exemptionNumber()),
        trimToNull(input.applicationStatus()),
        input.receivedFromDate(),
        input.receivedToDate(),
        input.listingFromDate(),
        input.listingToDate(),
        trimToNull(input.ownerClientNumber()),
        trimToNull(input.agentClientNumber()),
        positiveDistinctLongs(input.regionNumbers()),
        Math.max(0, input.page()),
        Math.max(1, input.size()));
  }

}

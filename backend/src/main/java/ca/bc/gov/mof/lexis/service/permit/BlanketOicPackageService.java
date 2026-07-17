package ca.bc.gov.mof.lexis.service.permit;

import java.util.List;
import java.util.Optional;

/** Coordinates the hidden OIC application and its packages for Blanket OIC permits. */
public interface BlanketOicPackageService {

  Optional<Long> findHiddenApplicationNumber(Long permitNumber);

  MutationResult addPackage(PackageMutationRequest request, String userId);

  MutationResult updatePackage(PackageMutationRequest request, String userId);

  MutationResult deletePackage(Long permitNumber, String packageNumber, String userId);

  record PackageMutationRequest(
      Long permitNumber,
      String packageNumber,
      String newPackageNumber,
      Double volume,
      Double averageLength,
      Double averageDiameter,
      String status,
      String comments,
      String reprocessed,
      String ageClass,
      String productType,
      String endUseCode,
      List<String> speciesCodes) {}

  record MutationResult(
      boolean success,
      String message,
      Long permitNumber,
      Long applicationNumber,
      String packageNumber,
      List<String> errors,
      List<String> warnings) {}
}

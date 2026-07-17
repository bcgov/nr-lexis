package ca.bc.gov.mof.lexis.service.exemption;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.fingerprint;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import java.util.ArrayList;
import java.util.List;
import java.util.SortedSet;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Service;

@Service
@Profile("oracle")
public class ExemptionExpiryService {

  private static final Logger LOGGER = LoggerFactory.getLogger(ExemptionExpiryService.class);

  private final ExemptionDetailsRpcRepository exemptionRepository;
  private final ExemptionExpiryProcessor expiryProcessor;
  private final ExemptionDetailsRpcService exemptionDetailsService;
  private final ApplicationDetailsRpcService applicationDetailsService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;

  public ExemptionExpiryService(
      ExemptionDetailsRpcRepository exemptionRepository,
      ExemptionExpiryProcessor expiryProcessor,
      ExemptionDetailsRpcService exemptionDetailsService,
      ApplicationDetailsRpcService applicationDetailsService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.exemptionRepository = exemptionRepository;
    this.expiryProcessor = expiryProcessor;
    this.exemptionDetailsService = exemptionDetailsService;
    this.applicationDetailsService = applicationDetailsService;
    this.operationCoordinator = operationCoordinator;
  }

  public ExpiryRunResult expireDueExemptions() {
    List<String> candidates = exemptionRepository.findAllExpiringExemptionNumbers();
    List<String> expired = new ArrayList<>();
    List<String> deferred = new ArrayList<>();
    for (String exemptionNumber : candidates) {
      try {
        if (expireOneWhileSerialized(exemptionNumber)) {
          expired.add(exemptionNumber);
        } else {
          deferred.add(exemptionNumber);
        }
      } catch (RuntimeException ex) {
        deferred.add(exemptionNumber);
        LOGGER.error(
            "event=lexis_exemption_expiry operation=expire_one outcome=deferred exemptionFingerprint={} failureType={}",
            fingerprint(exemptionNumber),
            exceptionType(ex));
      }
    }
    ExpiryRunResult result =
        new ExpiryRunResult(candidates.size(), List.copyOf(expired), List.copyOf(deferred));
    LOGGER.info(
        "Exemption expiry run completed: candidates={}, expired={}, deferred={}.",
        result.candidateCount(),
        result.expiredExemptions().size(),
        result.deferredExemptions().size());
    return result;
  }

  private boolean expireOneWhileSerialized(String exemptionNumber) {
    return operationCoordinator.executeSystemExemptionMutation(
        List.of(exemptionNumber),
        () -> applicationNumbersForMutation(exemptionNumber),
        () -> permitNumbersForMutation(exemptionNumber),
        () -> expiryProcessor.expireOne(exemptionNumber));
  }

  private List<Long> applicationNumbersForMutation(String exemptionNumber) {
    List<Long> discovered =
        exemptionDetailsService.getApplicationNumbersForMutation(exemptionNumber);
    if (discovered == null) {
      throw new DataRetrievalFailureException(
          "Exemption applications could not be loaded for expiry.");
    }
    SortedSet<Long> applicationNumbers = new TreeSet<>();
    for (Long applicationNumber : discovered) {
      if (applicationNumber == null || applicationNumber < 1) {
        throw new DataRetrievalFailureException(
            "An exemption application relationship returned an invalid application number.");
      }
      applicationNumbers.add(applicationNumber);
    }
    return List.copyOf(applicationNumbers);
  }

  private List<Long> permitNumbersForMutation(String exemptionNumber) {
    SortedSet<Long> permitNumbers = new TreeSet<>();
    List<Long> directPermits =
        exemptionDetailsService.getPermitNumbersForMutation(exemptionNumber);
    if (directPermits == null) {
      throw new DataRetrievalFailureException(
          "Exemption permits could not be loaded for expiry.");
    }
    directPermits.forEach(permitNumber -> addPermitNumber(permitNumber, permitNumbers));

    for (Long applicationNumber : applicationNumbersForMutation(exemptionNumber)) {
      List<Long> linkedPermits =
          applicationDetailsService.getPermitNumbersForApplicationMutation(applicationNumber);
      if (linkedPermits == null) {
        throw new DataRetrievalFailureException(
            "Application permit relationships could not be loaded for expiry.");
      }
      linkedPermits.forEach(permitNumber -> addPermitNumber(permitNumber, permitNumbers));
    }
    return List.copyOf(permitNumbers);
  }

  private void addPermitNumber(Long permitNumber, SortedSet<Long> permitNumbers) {
    if (permitNumber == null || permitNumber < 1) {
      throw new DataRetrievalFailureException(
          "An exemption permit relationship returned an invalid permit number.");
    }
    permitNumbers.add(permitNumber);
  }

  public record ExpiryRunResult(
      int candidateCount, List<String> expiredExemptions, List<String> deferredExemptions) {}
}

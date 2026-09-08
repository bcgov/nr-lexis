package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.security.LexisPrincipalService;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.EditLockConflictException;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService.MutationResult;
import ca.bc.gov.mof.lexis.service.permit.BlanketOicPackageService.PackageMutationRequest;
import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.util.function.Supplier;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/lexis/rpc/permit-details")
public class BlanketOicPackageController {

  private final ObjectProvider<BlanketOicPackageService> serviceProvider;
  private final LexisSessionService sessionService;
  private final LexisAuthorizationService authorizationService;
  private final LexisPrincipalService principalService;
  private final ApplicationPermitOperationCoordinator operationCoordinator;
  private ProvincialAuthorizationService provincialAuthorizationService;
  private ApplicationEditLockService editLockService;

  public BlanketOicPackageController(
      ObjectProvider<BlanketOicPackageService> serviceProvider,
      LexisSessionService sessionService,
      LexisAuthorizationService authorizationService,
      LexisPrincipalService principalService,
      ApplicationPermitOperationCoordinator operationCoordinator) {
    this.serviceProvider = serviceProvider;
    this.sessionService = sessionService;
    this.authorizationService = authorizationService;
    this.principalService = principalService;
    this.operationCoordinator = operationCoordinator;
  }

  @Autowired
  void setProvincialAuthorizationService(
      ProvincialAuthorizationService provincialAuthorizationService) {
    this.provincialAuthorizationService = provincialAuthorizationService;
  }

  @Autowired
  void setApplicationEditLockService(ApplicationEditLockService editLockService) {
    this.editLockService = editLockService;
  }

  @PostMapping("/boic-package")
  public ResponseEntity<MutationResult> addPackage(
      @RequestBody PackageMutationRequest request, Authentication authentication) {
    requireSavePermit(authentication);
    requirePermitAccess(request.permitNumber(), authentication);
    BlanketOicPackageService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return operationCoordinator.executePermitMutation(
        request.permitNumber(),
        () -> service.findHiddenApplicationNumber(request.permitNumber()).stream().toList(),
        () -> {
          requirePermitAccess(request.permitNumber(), authentication);
          requirePermitEditable(request.permitNumber(), authentication);
          return withHiddenApplicationLock(
              service,
              request.permitNumber(),
              authentication,
              () -> ResponseEntity.ok(service.addPackage(request, auditUser(authentication))));
        });
  }

  @PostMapping("/boic-package/update")
  public ResponseEntity<MutationResult> updatePackage(
      @RequestBody PackageMutationRequest request, Authentication authentication) {
    requireSavePermit(authentication);
    requirePermitAccess(request.permitNumber(), authentication);
    BlanketOicPackageService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return operationCoordinator.executePermitMutation(
        request.permitNumber(),
        () -> service.findHiddenApplicationNumber(request.permitNumber()).stream().toList(),
        () -> {
          requirePermitAccess(request.permitNumber(), authentication);
          requirePermitEditable(request.permitNumber(), authentication);
          return withHiddenApplicationLock(
              service,
              request.permitNumber(),
              authentication,
              () ->
                  ResponseEntity.ok(
                      service.updatePackage(request, auditUser(authentication))));
        });
  }

  @PostMapping("/boic-package/delete")
  public ResponseEntity<MutationResult> deletePackage(
      @RequestBody DeletePackageRequest request, Authentication authentication) {
    requireSavePermit(authentication);
    requirePermitAccess(request.permitNumber(), authentication);
    BlanketOicPackageService service = serviceProvider.getIfAvailable();
    if (service == null) {
      return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
    }
    return operationCoordinator.executePermitMutation(
        request.permitNumber(),
        () -> service.findHiddenApplicationNumber(request.permitNumber()).stream().toList(),
        () -> {
          requirePermitAccess(request.permitNumber(), authentication);
          requirePermitEditable(request.permitNumber(), authentication);
          return withHiddenApplicationLock(
              service,
              request.permitNumber(),
              authentication,
              () ->
                  ResponseEntity.ok(
                      service.deletePackage(
                          request.permitNumber(),
                          request.packageNumber(),
                          auditUser(authentication))));
        });
  }

  private void requireSavePermit(Authentication authentication) {
    if (!authorizationService.canPerformAction(
        sessionService.parseRolesFromPrincipal(authentication), "savePermit")) {
      throw new AccessDeniedException(
          "You do not have permission to change Blanket OIC permit packages.");
    }
  }

  private String auditUser(Authentication authentication) {
    String resolved = principalService.resolvePrincipalName(authentication);
    return resolved == null ? "LEXIS" : resolved;
  }

  private void requirePermitAccess(Long permitNumber, Authentication authentication) {
    if (provincialAuthorizationService != null) {
      provincialAuthorizationService.requirePermit(authentication, permitNumber);
    }
  }

  private void requirePermitEditable(Long permitNumber, Authentication authentication) {
    if (editLockService == null) {
      return;
    }
    String currentUser = auditUser(authentication);
    ApplicationEditLockDto lock =
        editLockService.acquirePermit(
            permitNumber, currentUser, currentUser, false);
    if (lock == null || lock.locked()) {
      throw new EditLockConflictException(
          lock == null ? "The permit edit lock could not be acquired." : lock.message());
    }
  }

  private <T> T withHiddenApplicationLock(
      BlanketOicPackageService service,
      Long permitNumber,
      Authentication authentication,
      Supplier<T> mutation) {
    if (editLockService == null) {
      return mutation.get();
    }
    Long applicationNumber = service.findHiddenApplicationNumber(permitNumber).orElse(null);
    if (applicationNumber == null) {
      return mutation.get();
    }

    String currentUser = auditUser(authentication);
    ApplicationEditLockDto previous =
        editLockService.snapshot(applicationNumber, currentUser, false);
    ApplicationEditLockDto acquired =
        editLockService.acquire(applicationNumber, currentUser, currentUser, false);
    if (acquired == null || acquired.locked()) {
      throw new EditLockConflictException(
          acquired == null ? "The application edit lock could not be acquired." : acquired.message());
    }

    boolean releaseAfterMutation = previous == null || !previous.heldByCurrentUser();
    try {
      return mutation.get();
    } finally {
      if (releaseAfterMutation) {
        editLockService.release(applicationNumber, currentUser);
      }
    }
  }

  public record DeletePackageRequest(Long permitNumber, String packageNumber) {}
}

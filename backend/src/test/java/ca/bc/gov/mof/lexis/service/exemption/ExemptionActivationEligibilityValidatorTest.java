package ca.bc.gov.mof.lexis.service.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.exemption.ExemptionDetailsRpcRepository;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;

@ExtendWith(MockitoExtension.class)
class ExemptionActivationEligibilityValidatorTest {

  @Mock private ExemptionDetailsRpcRepository repository;

  @InjectMocks private ExemptionActivationEligibilityValidator validator;

  @BeforeEach
  void defaultValidCodes() {
    lenient().when(repository.isExemptionTypeCodeValidRequired("M")).thenReturn(true);
    lenient().when(repository.isExemptionTypeCodeValidRequired("O")).thenReturn(true);
    lenient().when(repository.isExemptionTypeCodeValidRequired("B")).thenReturn(true);
    lenient().when(repository.isExemptionStatusCodeValidRequired("ACT")).thenReturn(true);
    lenient().when(repository.isExemptionStatusCodeValidRequired("NEW")).thenReturn(true);
  }

  @Test
  void inactiveMutationShouldAcceptAuthoritativeTypeAndStatusCodes() {
    ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate candidate =
        new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
            "EX-205", "M", "NEW", List.of());

    assertThat(validator.validatePersistenceReferences(candidate)).isEmpty();
  }

  @Test
  void inactiveMutationShouldRejectUnknownAuthoritativeTypeAndStatusCodes() {
    when(repository.isExemptionTypeCodeValidRequired("UNKNOWN")).thenReturn(false);
    when(repository.isExemptionStatusCodeValidRequired("UNKNOWN")).thenReturn(false);
    ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate candidate =
        new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
            "EX-205", "UNKNOWN", "UNKNOWN", List.of());

    assertThat(validator.validatePersistenceReferences(candidate))
        .containsExactly(
            "A valid exemption type code is required.",
            "A valid exemption status code is required.");
  }

  @Test
  void inactiveBlanketOicMutationShouldValidateEveryRegionAuthoritatively() {
    when(repository.isOrgUnitValidRequired(1903L)).thenReturn(true);
    when(repository.isOrgUnitValidRequired(1904L)).thenReturn(false);
    ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate candidate =
        new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
            "BOIC-1", "B", "NEW", List.of(1903L, 1904L, 99L));

    assertThat(validator.validatePersistenceReferences(candidate))
        .containsExactly("Region 1904 is not valid.", "Region 99 is not valid.");
    verify(repository).isOrgUnitValidRequired(1903L);
    verify(repository).isOrgUnitValidRequired(1904L);
    verify(repository, never()).isOrgUnitValidRequired(99L);
  }

  @Test
  void inactiveBlanketOicMutationShouldFailClosedWhenRegionLookupFails() {
    when(repository.isOrgUnitValidRequired(1903L))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));
    ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate candidate =
        new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
            "BOIC-1", "B", "NEW", List.of(1903L));

    assertThatThrownBy(() -> validator.validatePersistenceReferences(candidate))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  @Test
  void cancelledBlanketOicReopenShouldValidatePersistedRegionsWhenRequestDoesNotReplaceThem() {
    when(repository.findExemptionOrgUnitNumbers("BOIC-1")).thenReturn(List.of(1903L));
    when(repository.isOrgUnitValidRequired(1903L)).thenReturn(true);
    ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate candidate =
        new ExemptionActivationEligibilityValidator.PersistenceReferenceCandidate(
            "BOIC-1", "B", "NEW", null);

    assertThat(validator.validatePersistenceReferences(candidate)).isEmpty();
  }

  @Test
  void validMinisterialActivationShouldSatisfyLegacyApplicationAndPermitRules() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(summary(1000456L, 95.0d)));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application(1000456L, "EXE", "EX-205", 95.0d)));
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(new ExemptionDetailsRpcRepository.ApplicationPermitRow(7000123L, "EX-205")));

    List<String> errors = validator.validate(existingCandidate("M", 100.0d, true));

    assertThat(errors).isEmpty();
  }

  @Test
  void activeEditShouldRetainCoreChecksWithoutRequiringPreActivationApplicationStatus() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(summary(1000456L, 95.0d)));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application(1000456L, "PMT", "EX-205", 95.0d)));
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(new ExemptionDetailsRpcRepository.ApplicationPermitRow(7000123L, "EX-205")));

    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            "EX-205",
            100.0d,
            LexisBusinessTime.today().minusDays(1),
            LexisBusinessTime.today().plusDays(30),
            "M",
            "ACT",
            List.of(),
            List.of(),
            false,
            false,
            false);

    assertThat(validator.validate(candidate)).isEmpty();
  }

  @Test
  void directActiveCreateShouldValidatePendingApplicationsBeforeTheyAreLinked() {
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", null, 95.0d)));
    when(repository.findPermitsByApplicationNumberRequired(1000456L)).thenReturn(List.of());

    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            "EX-205",
            100.0d,
            LexisBusinessTime.today().minusDays(1),
            LexisBusinessTime.today().plusDays(30),
            "M",
            "ACT",
            List.of(),
            List.of(1000456L),
            true,
            true,
            true);

    assertThat(validator.validate(candidate)).isEmpty();
    verify(repository, never()).findApplicationSummariesByExemptionNumber("EX-205");
  }

  @Test
  void activationShouldRejectPrivilegeStatusVolumeAndPermitBypassesTogether() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205"))
        .thenReturn(List.of(summary(1000456L, 95.0d)));
    when(repository.findApplicationLinkRecord(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", "EX-999", 95.0d)));
    when(repository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(
            List.of(new ExemptionDetailsRpcRepository.ApplicationPermitRow(7000123L, "EX-999")));

    List<String> errors = validator.validate(existingCandidate("M", 50.0d, false));

    assertThat(errors)
        .contains(
            "Insufficient privileges to set this Exemption as Active.",
            "Application 1000456 must have a status of EXE before the exemption can be active.",
            "Application 1000456 is not linked to exemption EX-205.",
            "Application 1000456 is associated with permit 7000123 outside this exemption.",
            "The approved volume must be greater than or equal to the total requested volume (95.0).");
  }

  @Test
  void ministerialActivationShouldRequireAtLeastOneLinkedApplication() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());

    assertThat(validator.validate(existingCandidate("M", 100.0d, true)))
        .contains("Active ministerial exemptions require at least one application.");
  }

  @Test
  void activeBlanketOicShouldRequireNumberApprovalNonExpiredExpiryAndRegion() {
    LocalDate today = LexisBusinessTime.today();
    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            null,
            100.0d,
            null,
            today.minusDays(1),
            "B",
            "ACT",
            List.of(),
            List.of(),
            false,
            true,
            false);

    assertThat(validator.validate(candidate))
        .contains(
            "A valid exemption number is required for an active OIC exemption.",
            "A valid approval date is required for an active exemption.",
            "An active exemption cannot have an expiry date before today.",
            "A valid region is required for an active Blanket OIC exemption.");
  }

  @Test
  void blanketOicApprovalShouldLoadAndValidateItsPersistedRegions() {
    when(repository.findExemptionOrgUnitNumbers("EX-205")).thenReturn(List.of(1903L));
    when(repository.isOrgUnitValidRequired(1903L)).thenReturn(true);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());

    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            "EX-205",
            100.0d,
            LexisBusinessTime.today().minusDays(1),
            LexisBusinessTime.today().plusDays(30),
            "B",
            "ACT",
            null,
            List.of(),
            false,
            true,
            false);

    assertThat(validator.validate(candidate)).isEmpty();
    verify(repository).isOrgUnitValidRequired(1903L);
  }

  @Test
  void activationShouldRequireExpiryStrictlyAfterApproval() {
    LocalDate date = LexisBusinessTime.today().plusDays(5);
    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            "OIC-205",
            100.0d,
            date,
            date,
            "O",
            "ACT",
            List.of(),
            List.of(),
            false,
            true,
            false);
    when(repository.findApplicationSummariesByExemptionNumber("OIC-205")).thenReturn(List.of());

    assertThat(validator.validate(candidate))
        .contains("The expiry date must be after the approval date.");
  }

  @Test
  void activationShouldRejectUnknownAuthoritativeCodes() {
    when(repository.isExemptionTypeCodeValidRequired("O")).thenReturn(false);
    when(repository.isExemptionStatusCodeValidRequired("ACT")).thenReturn(false);
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());

    assertThat(validator.validate(existingCandidate("O", 100.0d, false)))
        .contains(
            "A valid exemption type code is required.",
            "A valid active exemption status code is required.");
  }

  @Test
  void activationShouldRejectUnknownBlanketOicRegions() {
    when(repository.findApplicationSummariesByExemptionNumber("EX-205")).thenReturn(List.of());
    ExemptionActivationEligibilityValidator.ActivationCandidate candidate =
        new ExemptionActivationEligibilityValidator.ActivationCandidate(
            "EX-205",
            100.0d,
            LexisBusinessTime.today().minusDays(1),
            LexisBusinessTime.today().plusDays(30),
            "B",
            "ACT",
            List.of(99L),
            List.of(),
            false,
            true,
            false);

    assertThat(validator.validate(candidate)).contains("Region 99 is not valid.");
  }

  @Test
  void authoritativeLookupFailureShouldFailClosed() {
    when(repository.isExemptionTypeCodeValidRequired("M"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> validator.validate(existingCandidate("M", 100.0d, true)))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private ExemptionActivationEligibilityValidator.ActivationCandidate existingCandidate(
      String type, double approvedVolume, boolean canApprove) {
    return new ExemptionActivationEligibilityValidator.ActivationCandidate(
        "EX-205",
        approvedVolume,
        LexisBusinessTime.today().minusDays(1),
        LexisBusinessTime.today().plusDays(30),
        type,
        "ACT",
        List.of(),
        List.of(),
        false,
        true,
        canApprove);
  }

  private ExemptionDetailsRpcRepository.ApplicationSummaryRow summary(
      long applicationNumber, double requestedVolume) {
    return new ExemptionDetailsRpcRepository.ApplicationSummaryRow(
        applicationNumber, requestedVolume, requestedVolume, "00077881", "P", "S");
  }

  private ExemptionDetailsRpcRepository.ApplicationLinkRecord application(
      long applicationNumber,
      String status,
      String exemptionNumber,
      double requestedVolume) {
    return new ExemptionDetailsRpcRepository.ApplicationLinkRecord(
        applicationNumber,
        null,
        LocalDate.of(2026, 2, 20),
        120L,
        LocalDate.of(2026, 2, 21),
        requestedVolume,
        1.6d,
        "Campbell River",
        "creator",
        Timestamp.from(Instant.parse("2026-02-20T18:00:00Z")),
        null,
        "00055667",
        "00",
        "00077881",
        "00",
        exemptionNumber,
        "ER02",
        status,
        "O",
        12L,
        "S",
        "P",
        "G",
        "Agent Contact",
        "Owner Contact",
        "N",
        LocalDate.of(2026, 2, 1));
  }
}

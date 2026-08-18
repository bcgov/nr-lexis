package ca.bc.gov.mof.lexis.service.review;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationPermitRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ApplicationUpdateRecord;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.EndUseRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ExcolValidationRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.PackageMutationRow;
import ca.bc.gov.mof.lexis.repository.application.ApplicationDetailsRpcRepository.ScaleMutationRow;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository;
import ca.bc.gov.mof.lexis.repository.client.ClientLookupRepository.ClientLocationRow;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataRetrievalFailureException;

@ExtendWith(MockitoExtension.class)
class ApplicationApprovalEligibilityServiceTest {

  @Mock private ApplicationDetailsRpcRepository applicationRepository;
  @Mock private ClientLookupRepository clientRepository;

  private ApplicationApprovalEligibilityService service;

  @BeforeEach
  void setUp() {
    service =
        new ApplicationApprovalEligibilityService(applicationRepository, clientRepository);
  }

  @Test
  void shouldAllowAValidUnlinkedProvincialApplication() {
    stubValidApplication();

    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isTrue();
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldAllowAValidUnlinkedFederalApplication() {
    stubValidApplication("F");

    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isTrue();
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldAllowAValidPendingFederalApplicationWhenLegacySingleCodeLookupOmitsPending() {
    stubValidApplication("F");
    when(applicationRepository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(validApplication(null, "F", "PND")));

    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isTrue();
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldRejectEveryLegacyReadyForApprovalAssociation() {
    stubValidApplication();
    when(applicationRepository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(validApplication("EX-1")));
    when(applicationRepository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new ApplicationPermitRow(7000123L, "Active")));
    when(applicationRepository.findPermitByOicApplicationNumberRequired(1000456L))
        .thenReturn(Optional.of(new ApplicationPermitRow(7000456L, "Active")));

    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isFalse();
    assertThat(result.errors())
        .contains(
            "Applications linked to an exemption cannot be approved.",
            "Applications linked to a permit cannot be approved.",
            "Applications linked to a Blanket OIC permit cannot be approved.");
  }

  @Test
  void shouldRejectInvalidCoreFieldsAndPackageVolume() {
    stubValidApplication();
    ApplicationUpdateRecord invalid =
        new ApplicationUpdateRecord(
            1000456L,
            null,
            null,
            100_000L,
            null,
            10.0d,
            100.0d,
            null,
            "creator",
            Instant.parse("2026-07-01T10:00:00Z"),
            null,
            null,
            null,
            null,
            null,
            "00011111",
            "01",
            null,
            "S",
            "NEW",
            "O",
            1909L,
            "H",
            "P",
            "O",
            null,
            "Owner Contact",
            "N");
    when(applicationRepository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(invalid));
    when(applicationRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageRow(20.0d)));
    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isFalse();
    assertThat(result.errors())
        .contains(
            "Application date is required.",
            "Application received date is required.",
            "Application term days must be between 1 and 99999.",
            "Application product location is required.",
            "Application volume cannot be less than the total package volume.");
  }

  @Test
  void shouldRejectInvalidScaleRegionAndExcolCombination() {
    stubValidApplication();
    when(applicationRepository.findCandidateExcolCodesRequired(1, "FI", "SA", 1909L))
        .thenReturn(List.of());
    when(applicationRepository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(scaleRow("TM-1")));
    when(applicationRepository.findTimberMarkByOrgUnitRequired("TM-1", 1909L))
        .thenReturn(Optional.empty());

    var result = service.evaluate(1000456L);

    assertThat(result.eligible()).isFalse();
    assertThat(result.errors())
        .contains(
            "Application species and end use are invalid for the selected region.",
            "The first scale timber mark is not valid for the application region.");
  }

  @Test
  void shouldPropagateRequiredLookupFailureWithoutApproving() {
    stubValidApplication();
    when(applicationRepository.findPermitsByApplicationNumberRequired(1000456L))
        .thenThrow(new DataRetrievalFailureException("Oracle unavailable"));

    assertThatThrownBy(() -> service.evaluate(1000456L))
        .isInstanceOf(DataRetrievalFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private void stubValidApplication() {
    stubValidApplication("P");
  }

  private void stubValidApplication(String jurisdictionCode) {
    when(applicationRepository.findApplicationUpdateRecord(1000456L))
        .thenReturn(Optional.of(validApplication(null, jurisdictionCode)));
    when(applicationRepository.isProductTypeCodeValidRequired("H")).thenReturn(true);
    when(applicationRepository.isGrowthTypeCodeValidRequired("O")).thenReturn(true);
    when(applicationRepository.isExemptionReasonCodeValidRequired("S")).thenReturn(true);
    when(applicationRepository.isApplicantTypeCodeValidRequired("O")).thenReturn(true);
    when(applicationRepository.isJurisdictionCodeValidRequired(jurisdictionCode)).thenReturn(true);
    when(applicationRepository.isOrgUnitValidRequired(1909L)).thenReturn(true);
    when(clientRepository.findLocationByClientNumberCodeRequired("00011111", "01"))
        .thenReturn(Optional.of(clientLocation()));
    when(applicationRepository.findEndUsesByApplicationNumberRequired(1000456L))
        .thenReturn(List.of(new EndUseRow("FI", "SA")));
    when(applicationRepository.findCandidateExcolCodesRequired(1, "FI", "SA", 1909L))
        .thenReturn(List.of(new ExcolValidationRow("FI/SA")));
    when(applicationRepository.findPackageMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of(packageRow(50.0d)));
    when(applicationRepository.findScaleMutationsByApplicationNumber(1000456L))
        .thenReturn(List.of());
    when(applicationRepository.findPermitsByApplicationNumberRequired(1000456L))
        .thenReturn(List.of());
    org.mockito.Mockito.lenient()
        .when(applicationRepository.findPermitByOicApplicationNumberRequired(1000456L))
        .thenReturn(Optional.empty());
  }

  private ApplicationUpdateRecord validApplication(String exemptionNumber) {
    return validApplication(exemptionNumber, "P");
  }

  private ApplicationUpdateRecord validApplication(
      String exemptionNumber, String jurisdictionCode) {
    return validApplication(exemptionNumber, jurisdictionCode, "NEW");
  }

  private ApplicationUpdateRecord validApplication(
      String exemptionNumber, String jurisdictionCode, String statusCode) {
    return new ApplicationUpdateRecord(
        1000456L,
        null,
        LocalDate.of(2026, 7, 1),
        180L,
        LocalDate.of(2026, 7, 2),
        100.0d,
        2.5d,
        "North block",
        "creator",
        Instant.parse("2026-07-01T10:00:00Z"),
        null,
        null,
        null,
        null,
        null,
        "00011111",
        "01",
        exemptionNumber,
        "S",
        statusCode,
        "O",
        1909L,
        "H",
        jurisdictionCode,
        "O",
        null,
        "Owner Contact",
        "N");
  }

  private PackageMutationRow packageRow(Double volume) {
    return new PackageMutationRow(
        "PKG-1", 1000456L, "N", volume, 10.0d, 20.0d, null, null, null, null,
        "ACT", "O", "H", "creator", Instant.parse("2026-07-01T10:00:00Z"));
  }

  private ScaleMutationRow scaleRow(String timberMark) {
    return new ScaleMutationRow(
        "501", timberMark, 10L, 5.0d, "PKG-1", "FI", "J", 1000456L, null,
        "creator", Instant.parse("2026-07-01T10:00:00Z"));
  }

  private ClientLocationRow clientLocation() {
    return new ClientLocationRow(
        "00011111", "01", "Main", "Owner", null, null, null, null, null, null,
        null, null, null, null);
  }
}

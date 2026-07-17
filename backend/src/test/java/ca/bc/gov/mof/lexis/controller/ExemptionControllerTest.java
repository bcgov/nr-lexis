package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.CodeNameDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchCriteria;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchOptionsDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResponseDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionSearchResultDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import ca.bc.gov.mof.lexis.service.session.ProvincialAuthorizationService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ExemptionController")
class ExemptionControllerTest {

  @Mock private ObjectProvider<ExemptionService> serviceProvider;

  @Mock private ExemptionService service;

  @Mock private ApplicationEditLockService editLockService;

  @Mock private LexisSessionService sessionService;

  @Mock private Authentication authentication;
  @Mock private ProvincialAuthorizationService provincialAuthorizationService;

  @InjectMocks private ExemptionController controller;

  @BeforeEach
  void setUpAuthorization() {
    lenient()
        .when(
            provincialAuthorizationService.canViewBlanketOic(
                nullable(Authentication.class)))
        .thenReturn(true);
    lenient()
        .when(
            provincialAuthorizationService.constrainOrgUnits(
                nullable(Authentication.class), any(), any()))
        .thenAnswer(
            invocation ->
                new ProvincialAuthorizationService.OrgUnitConstraint(
                    false, invocation.getArgument(1)));
    lenient()
        .when(editLockService.snapshotExemption("EX-205", null, false))
        .thenReturn(new ApplicationEditLockDto(false, false, null, null, null));
  }

  @Test
  void optionsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ExemptionSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verify(serviceProvider).getIfAvailable();
    verifyNoInteractions(service);
  }

  @Test
  void optionsShouldReturnPayloadWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ExemptionSearchOptionsDto dto =
        new ExemptionSearchOptionsDto(
            List.of(new CodeNameDto("OIC", "Order in Council")),
            List.of(new CodeNameDto("APR", "Approved")),
            List.of(new CodeNameDto("12", "Coast")));
    when(service.searchOptions()).thenReturn(dto);

    ResponseEntity<ExemptionSearchOptionsDto> response = controller.searchOptions();

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);
    verify(service).searchOptions();
  }

  @Test
  void optionsShouldHideBlanketOicFromPureExemptionApprover() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(provincialAuthorizationService.canViewBlanketOic(authentication)).thenReturn(false);
    when(service.searchOptions())
        .thenReturn(
            new ExemptionSearchOptionsDto(
                List.of(
                    new CodeNameDto("M", "Ministerial"),
                    new CodeNameDto("B", "Blanket OIC")),
                List.of(new CodeNameDto("NEW", "New")),
                List.of()));

    ResponseEntity<ExemptionSearchOptionsDto> response =
        controller.searchOptions(authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().exemptionTypes())
        .extracting(CodeNameDto::code)
        .containsExactly("M");
  }

  @Test
  void searchShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ExemptionSearchResponseDto> response =
        controller.search(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            List.<Long>of(),
            null,
            0,
            25,
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verify(serviceProvider).getIfAvailable();
    verifyNoInteractions(service);
  }

  @Test
  void searchShouldReturnPayloadAndMappedCriteriaWhenServiceAvailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ExemptionSearchResponseDto dto =
        new ExemptionSearchResponseDto(
            List.of(
                new ExemptionSearchResultDto(
                    "EX-205",
                    "Fee in Lieu",
                    "Approved",
                    "00055667",
                    "00077881",
                    1000456L,
                    LocalDate.of(2026, 3, 12),
                    LocalDate.of(2026, 2, 26),
                    LocalDate.of(2027, 3, 12),
                    "R2",
                    95.0,
                    83.0,
                    false)),
            1,
            0,
            25);
    when(service.search(any(ExemptionSearchCriteria.class))).thenReturn(dto);

    ResponseEntity<ExemptionSearchResponseDto> response =
        controller.search(
            "1000456",
            "PKG-903",
            "EX-205",
            "FEE",
            null,
            "APR",
            null,
            "03/01/2026",
            "03/31/2026",
            "2026-02-01",
            null,
            "2026-02-28",
            null,
            "00055667",
            "00077881",
            List.of(12L),
            "expiryDate DESC",
            0,
            25,
            null,
            null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isEqualTo(dto);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    ExemptionSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.exemptionNumber()).isEqualTo("EX-205");
    assertThat(criteria.exemptionType()).isEqualTo("FEE");
    assertThat(criteria.exemptionStatus()).isEqualTo("APR");
    assertThat(criteria.approvalFromDate()).isEqualTo(LocalDate.of(2026, 3, 1));
    assertThat(criteria.listingFromDate()).isEqualTo(LocalDate.of(2026, 2, 1));
    assertThat(criteria.listingToDate()).isEqualTo(LocalDate.of(2026, 2, 28));
    assertThat(criteria.regionNumbers()).containsExactly(12L);
    assertThat(criteria.sortField()).isEqualTo("expiryDate DESC");
    assertThat(criteria.page()).isEqualTo(0);
    assertThat(criteria.size()).isEqualTo(25);
  }

  @Test
  void searchShouldOverrideClientFiltersWhenUserHasScopedForestClient() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(sessionService.resolveForestClientNumber(authentication)).thenReturn("00077881");
    when(service.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(new ExemptionSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "00099999",
        "00088888",
        List.of(),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    ExemptionSearchCriteria criteria = criteriaCaptor.getValue();
    assertThat(criteria.applicantClientNumber()).isEqualTo("00077881");
    assertThat(criteria.ownerClientNumber()).isNull();
    assertThat(criteria.includeBlanketOic()).isTrue();
  }

  @Test
  void searchShouldExcludeBlanketOicForPureExemptionApprover() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(provincialAuthorizationService.canViewBlanketOic(authentication)).thenReturn(false);
    when(service.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(new ExemptionSearchResponseDto(List.of(), 0, 0, 25));

    controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(76L),
        null,
        0,
        25,
        null,
        authentication);

    ArgumentCaptor<ExemptionSearchCriteria> criteriaCaptor =
        ArgumentCaptor.forClass(ExemptionSearchCriteria.class);
    verify(service).search(criteriaCaptor.capture());

    assertThat(criteriaCaptor.getValue().includeBlanketOic()).isFalse();
    assertThat(criteriaCaptor.getValue().excludeBlanketOic()).isTrue();
  }

  @Test
  void searchShouldOverlayTheActiveExemptionLockState() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(new ExemptionSearchResponseDto(List.of(searchRow(false)), 1, 0, 25));
    when(editLockService.snapshotExemption("EX-205", null, false))
        .thenReturn(new ApplicationEditLockDto(true, false, null, "locked", null));

    ResponseEntity<ExemptionSearchResponseDto> response = searchDefault();

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().results())
        .singleElement()
        .extracting(ExemptionSearchResultDto::locked)
        .isEqualTo(true);
    verify(editLockService).snapshotExemption("EX-205", null, false);
  }

  @Test
  void searchShouldFailLockStateClosedWhenSnapshotIsUnavailable() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(new ExemptionSearchResponseDto(List.of(searchRow(false)), 1, 0, 25));
    when(editLockService.snapshotExemption("EX-205", null, false)).thenReturn(null);

    ResponseEntity<ExemptionSearchResponseDto> response = searchDefault();

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().results())
        .singleElement()
        .extracting(ExemptionSearchResultDto::locked)
        .isEqualTo(true);
  }

  @Test
  void searchShouldReplaceTheRepositoryDefaultWithAnExplicitUnlockedSnapshot() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.search(any(ExemptionSearchCriteria.class)))
        .thenReturn(new ExemptionSearchResponseDto(List.of(searchRow(true)), 1, 0, 25));

    ResponseEntity<ExemptionSearchResponseDto> response = searchDefault();

    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().results())
        .singleElement()
        .extracting(ExemptionSearchResultDto::locked)
        .isEqualTo(false);
  }

  @Test
  void searchShouldRejectANullServiceResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.search(any(ExemptionSearchCriteria.class))).thenReturn(null);

    assertThatThrownBy(this::searchDefault)
        .isInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class)
        .hasMessageContaining("exemption search returned no response");
  }

  @Test
  void detailShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<ExemptionDetailDto> response = controller.getByExemptionNumber("EX-205", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verify(serviceProvider).getIfAvailable();
    verifyNoInteractions(service);
  }

  @Test
  void detailShouldReturnNotFoundWhenServiceReturnsEmpty() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByExemptionNumber("EX-205")).thenReturn(Optional.empty());

    ResponseEntity<ExemptionDetailDto> response = controller.getByExemptionNumber("EX-205", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByExemptionNumber("EX-205");
  }

  @Test
  void detailShouldReturnPayloadWhenServiceReturnsEntity() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);

    ExemptionDetailDto dto = exemptionDetail("00077881", "00055667");

    when(service.findByExemptionNumber("EX-205")).thenReturn(Optional.of(dto));
    when(provincialAuthorizationService.canAccessExemption(null, dto)).thenReturn(true);

    ResponseEntity<ExemptionDetailDto> response = controller.getByExemptionNumber("EX-205", null);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().exemptionNumber()).isEqualTo(dto.exemptionNumber());
    assertThat(response.getBody().permitNumbers()).isEmpty();
    assertThat(response.getBody().remarks()).isEqualTo(dto.remarks());
    verify(service).findByExemptionNumber("EX-205");
  }

  @Test
  void detailShouldReturnNotFoundWhenScopedUserDoesNotOwnExemption() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.findByExemptionNumber("EX-205"))
        .thenReturn(Optional.of(exemptionDetail("00099999", "00088888")));

    ResponseEntity<ExemptionDetailDto> response =
        controller.getByExemptionNumber("EX-205", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    verify(service).findByExemptionNumber("EX-205");
  }

  private static ExemptionDetailDto exemptionDetail(
      String ownerClientNumber, String agentClientNumber) {
    return new ExemptionDetailDto(
        "EX-205",
        "FEE",
        "Fee in Lieu",
        "APR",
        "Approved",
        ownerClientNumber,
        agentClientNumber,
        1000456L,
        "In Review",
        LocalDate.of(2026, 3, 12),
        LocalDate.of(2027, 3, 12),
        95.0,
        12.0,
        83.0,
        "Pending final confirmation",
        false,
        List.of("P-88009"),
        List.of(new ExemptionDetailDto.ExemptionRemarkDto("Pending", "Awaiting documentation")));
  }

  private ResponseEntity<ExemptionSearchResponseDto> searchDefault() {
    return controller.search(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        List.of(),
        null,
        0,
        25,
        null,
        authentication);
  }

  private static ExemptionSearchResultDto searchRow(boolean locked) {
    return new ExemptionSearchResultDto(
        "EX-205",
        "M",
        "NEW",
        "00055667",
        "00077881",
        null,
        LocalDate.of(2026, 3, 12),
        LocalDate.of(2026, 2, 26),
        LocalDate.of(2027, 3, 12),
        "R2",
        95.0,
        83.0,
        locked);
  }
}

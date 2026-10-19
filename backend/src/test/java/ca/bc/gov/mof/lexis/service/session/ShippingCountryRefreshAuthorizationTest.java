package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.controller.PermitDetailsRpcController;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.OraclePermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitInvoiceOrchestrationService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;

/** Uses real configured role/client/region checks and the actual Shipping service/validator. */
@ExtendWith(MockitoExtension.class)
class ShippingCountryRefreshAuthorizationTest {
  private static final long PERMIT = 7000123L;
  private static final String AA_RSC = "LEXIS_APPLICATION_APPROVER_REGION_REGION-SOUTH_COAST";
  private static final String AA_RCB = "LEXIS_APPLICATION_APPROVER_REGION_REGION-CARIBOO";
  private static final String EA_RSC = "LEXIS_EXEMPTION_APPROVER_REGION_REGION-SOUTH_COAST";
  private static final String RO_RSC = "LEXIS_READ_ONLY_REGION_REGION-SOUTH_COAST";
  private static final LocalDate CUTOVER = LocalDate.of(2024, 6, 27);

  @Mock private PermitRpcRepository repository;
  @Mock private ClientLookupService clients;
  @Mock private ExemptionService exemptions;
  @Mock private PermitService permits;
  @Mock private ApplicationEditLockService locks;
  @Mock private ObjectProvider<PermitService> permitProvider;
  @Mock private ObjectProvider<PermitDetailsRpcService> serviceProvider;
  @Mock private ObjectProvider<PermitInvoiceOrchestrationService> invoices;

  private final LexisSessionService sessions = new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final LexisAuthorizationService actions =
      ProvincialRegionAuthorizationTest.configuredAuthorizationService(sessions);
  private PermitDetailsRpcController controller;

  @BeforeEach
  void setUp() {
    var service = new OraclePermitDetailsRpcService(repository, null, exemptions, null, null,
        clients, null, null, null, invoices);
    var access = new ProvincialAuthorizationService(sessions, actions, null, null, null, permitProvider, null);
    var mutex = new PermitOperationMutex();
    controller = new PermitDetailsRpcController(serviceProvider, sessions, actions, mutex,
        new ApplicationPermitOperationCoordinator(mutex));
    ReflectionTestUtils.setField(controller, "provincialAuthorizationService", access);
    ReflectionTestUtils.setField(controller, "permitService", permits);
    ReflectionTestUtils.setField(controller, "editLockService", locks);
    lenient().when(serviceProvider.getIfAvailable()).thenReturn(service);
    lenient().when(permitProvider.getIfAvailable()).thenReturn(permits);
    lenient().when(permits.findAccessByPermitNumber(PERMIT))
        .thenReturn(Optional.of(new PermitAccessDto(PERMIT, "00011111", "00022222", 1909L)));
    lenient().when(locks.acquirePermit(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient().when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    lenient().when(exemptions.findByExemptionNumber("EX-700")).thenReturn(Optional.of(
        new ExemptionDetailDto("EX-700", "M", "Ministerial", "ACT", "Active", "00011111", "00022222",
            1000456L, "PMT", LocalDate.of(2026, 3, 1), LocalDate.of(2026, 12, 31),
            100, 5, 95, null, false, List.of("7000123"), List.of())));
    lenient().when(clients.getClientDataRequired(any(), any())).thenAnswer(invocation -> Optional.of(
        new ClientLookupService.ClientData(invocation.getArgument(0), "Synthetic client", null,
            null, null, null, null, null, null, null, null)));
    lenient().when(repository.isPermitStatusCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isCountryCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isPortCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isScaleMethodCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isTransportTypeCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.hasApplicationForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient().when(repository.hasPackageForPermitCompletionRequired(anyLong(), anyBoolean())).thenReturn(true);
    lenient().when(repository.hasScaleForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient().when(repository.updatePermitDetail(any(), any(), any())).thenReturn(true);
  }

  @ParameterizedTest
  @CsvSource({
    "LEXIS_ADMIN, ACT, US, CA, true",
    AA_RSC + ", ACT, US, CA, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, ACT, US, CA, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00022222, ACT, US, CA, true",
    AA_RSC + ", ACT, CA, US, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, ACT, CA, US, true",
    AA_RSC + ", ACT, US, US, false",
    AA_RSC + ", PPD, CA, US, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, PPD, CA, US, true",
    "LEXIS_ADMIN, COM, US, CA, true",
    AA_RSC + ", COM, CA, US, true",
    AA_RSC + ", PPD, US, US, false",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, PPD, US, US, false",
    AA_RSC + ", COM, US, US, false",
    AA_RSC + ", PPD, US, CA, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, PPD, US, CA, true",
    AA_RSC + ", COM, US, CA, true",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, COM, US, CA, false",
    AA_RSC + ", CAN, US, CA, false",
    "LEXIS_PROVINCIAL_SUBMITTER_00011111, CAN, US, CA, false"
  })
  void shippingRefreshesFeesOnCountryChangeOnlyForEditableStatusesAndMinistryCompletedSaves(
      String role, String status, String previousCountry, String country, boolean refreshExpected) {
    var stored = storedPermit(status, previousCountry);
    storedStatus(status);
    when(repository.findPermitMutationByPermitNumber(PERMIT)).thenReturn(Optional.of(stored));
    var actor = actor(role);

    var response = controller.updateShipping(shippingRequest(country), actor);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody().success()).isTrue();
    var saved = ArgumentCaptor.forClass(PermitMutationRow.class);
    var date = ArgumentCaptor.forClass(LocalDate.class);
    verify(repository).updatePermitDetail(saved.capture(), org.mockito.ArgumentMatchers.eq(actor.getName()), date.capture());
    assertThat(date.getValue()).isEqualTo(refreshExpected ? CUTOVER : null);
    assertThat(saved.getValue().countryCode()).isEqualTo(country);
    assertThat(saved.getValue().transportName()).isEqualTo("MV Updated");
    assertThat(saved.getValue()).usingRecursiveComparison()
        .ignoringFields("countryCode", "transportName").isEqualTo(stored);
    verify(locks).acquirePermit(PERMIT, actor.getName(), actor.getName(), false);
    verifyNoInteractions(invoices);
  }

  @Test
  void restrictedCompletedShippingCannotSelectStaffRefreshThroughARequestFlagOrPrincipalName() {
    storedStatus("COM");
    when(repository.findPermitMutationByPermitNumber(PERMIT))
        .thenReturn(Optional.of(storedPermit("COM", "US")));
    var request = shippingRequest("CA");
    request.setParameter("ministryUser", "true");
    request.setParameter("staff", "true");
    var actor = new TestingAuthenticationToken("idir\\misleading-principal", null,
        "LEXIS_PROVINCIAL_SUBMITTER_00011111");

    var response = controller.updateShipping(request, actor);

    assertThat(response.getBody().success()).isTrue();
    verify(repository).updatePermitDetail(any(), org.mockito.ArgumentMatchers.eq(actor.getName()),
        org.mockito.ArgumentMatchers.isNull());
    verifyNoInteractions(invoices);
  }

  @ParameterizedTest
  @ValueSource(strings = {EA_RSC, RO_RSC})
  void actorsWithoutSaveCannotReachCountryRefresh(String role) {
    assertThat(controller.updateShipping(shippingRequest("CA"), actor(role)).getStatusCode())
        .isEqualTo(HttpStatus.FORBIDDEN);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @ParameterizedTest
  @ValueSource(strings = {AA_RCB, "LEXIS_PROVINCIAL_SUBMITTER_00099999"})
  void outOfRegionOrUnrelatedClientCannotReachCountryRefresh(String role) {
    assertThatThrownBy(() -> controller.updateShipping(shippingRequest("CA"), actor(role)))
        .isInstanceOf(AccessDeniedException.class);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void countryRefreshRechecksScopeInsideTheExistingMutex() {
    when(permits.findAccessByPermitNumber(PERMIT)).thenReturn(
        Optional.of(new PermitAccessDto(PERMIT, "00011111", "00022222", 1909L)),
        Optional.of(new PermitAccessDto(PERMIT, "00011111", "00022222", 1903L)));
    assertThatThrownBy(() -> controller.updateShipping(shippingRequest("CA"), actor(AA_RSC)))
        .isInstanceOf(AccessDeniedException.class);
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @Test
  void expiredPermitStillRejectsShippingBeforeCountryRefresh() {
    storedStatus("EXP");
    assertThatThrownBy(() -> controller.updateShipping(shippingRequest("CA"), actor(AA_RSC)))
        .isInstanceOf(AccessDeniedException.class).hasMessage("Expired permits are read-only.");
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  private TestingAuthenticationToken actor(String role) {
    return new TestingAuthenticationToken(role.startsWith("LEXIS_PROVINCIAL_SUBMITTER")
        ? "bceid\\synthetic" : "idir\\synthetic", null, role);
  }

  private MockHttpServletRequest shippingRequest(String country) {
    var request = new MockHttpServletRequest();
    request.setParameter("permitNumber", Long.toString(PERMIT));
    request.setParameter("destinationCountry", country);
    request.setParameter("permitStatus", "ACT");
    request.setParameter("transportName", "MV Updated");
    return request;
  }

  private void storedStatus(String status) {
    when(permits.findByPermitNumber(PERMIT)).thenReturn(Optional.of(new PermitDetailDto(
        PERMIT, 1000456L, "PKG-1", "EX-700", status, status, "00022222", "01", "00011111", "00",
        "Destination Co", "US", "S", "MV North", "VA", null, LocalDate.of(2026, 3, 16),
        LocalDate.of(2026, 12, 31), null, LocalDate.of(2026, 11, 1), 5d, 5L, "RCPT-100",
        null, null, "Notes", null, 1909L, "South Coast")));
  }

  private PermitMutationRow storedPermit(String status, String country) {
    return new PermitMutationRow(PERMIT, "Destination Co", "MV North", LocalDate.of(2026, 11, 1), null,
        LocalDate.of(2026, 3, 15), LocalDate.of(2026, 3, 15), LocalDate.of(2026, 3, 16), "RCPT-100",
        LocalDate.of(2026, 12, 31), 5d, 5L, 0L, null, "Notes", "idir\\creator",
        Timestamp.valueOf("2026-03-15 12:00:00"), "S", "W", "00011111", "00", "00022222", "01",
        "EX-700", 1909L, "VA", status, "O", country, null, null, null, null, null, "H");
  }
}

package ca.bc.gov.mof.lexis.service.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.controller.PermitDetailsRpcController;
import ca.bc.gov.mof.lexis.dto.application.ApplicationAccessContextDto;
import ca.bc.gov.mof.lexis.dto.application.ApplicationEditLockDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitAccessDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitMutationRpcResponseDto;
import ca.bc.gov.mof.lexis.dto.permit.rpc.PermitPersistenceRpcResponseDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.ApplicationInfoRow;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.application.ApplicationEditLockService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.exemption.ExemptionService;
import ca.bc.gov.mof.lexis.service.permit.ApplicationPermitOperationCoordinator;
import ca.bc.gov.mof.lexis.service.permit.OraclePermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitDetailsRpcService;
import ca.bc.gov.mof.lexis.service.permit.PermitOperationMutex;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;

/** Real configured roles, controller and stored BOIC relationship checks; no database writes. */
@ExtendWith(MockitoExtension.class)
class BlanketOicHiddenApplicationAuthorizationTest {
  private static final long PERMIT = 7000123L;
  private static final long HIDDEN = 1000456L;
  private static final String OWNER = "00011111";
  private static final String FORMER = "00022222";
  private static final String CURRENT = "00033333";
  private static final String UNRELATED = "00099999";
  private static final String AA_RSC = "LEXIS_APPLICATION_APPROVER_REGION_REGION-SOUTH_COAST";

  @Mock private PermitRpcRepository repository;
  @Mock private ExemptionService exemptions;
  @Mock private LexisApplicationService applications;
  @Mock private PermitService permits;
  @Mock private ApplicationEditLockService locks;
  @Mock private ObjectProvider<LexisApplicationService> applicationProvider;
  @Mock private ObjectProvider<ExemptionService> exemptionProvider;
  @Mock private ObjectProvider<PermitService> permitProvider;
  @Mock private ObjectProvider<PermitDetailsRpcService> serviceProvider;

  private final LexisSessionService sessions = new LexisSessionService("LEXIS_PROVINCIAL_SUBMITTER");
  private final LexisAuthorizationService actions =
      ProvincialRegionAuthorizationTest.configuredAuthorizationService(sessions);
  private OraclePermitDetailsRpcService service;
  private ProvincialAuthorizationService access;
  private PermitDetailsRpcController controller;

  enum Action { SAVE, ADD_SCALE, DELETE_SCALE, ATTACH_SCALE, SELECT_SCALES }

  @BeforeEach
  void setUp() {
    service = spy(new OraclePermitDetailsRpcService(repository, applications, exemptions,
        null, null, null, null, null, null, null));
    access = new ProvincialAuthorizationService(sessions, actions, applicationProvider, null,
        exemptionProvider, permitProvider, null);
    var mutex = new PermitOperationMutex();
    controller = new PermitDetailsRpcController(serviceProvider, sessions, actions, mutex,
        new ApplicationPermitOperationCoordinator(mutex));
    ReflectionTestUtils.setField(controller, "provincialAuthorizationService", access);
    ReflectionTestUtils.setField(controller, "permitService", permits);
    ReflectionTestUtils.setField(controller, "editLockService", locks);
    lenient().when(serviceProvider.getIfAvailable()).thenReturn(service);
    lenient().when(applicationProvider.getIfAvailable()).thenReturn(applications);
    lenient().when(exemptionProvider.getIfAvailable()).thenReturn(exemptions);
    lenient().when(permitProvider.getIfAvailable()).thenReturn(permits);
    lenient().when(permits.findAccessByPermitNumber(PERMIT)).thenReturn(
        Optional.of(new PermitAccessDto(PERMIT, CURRENT, OWNER, 1909L)));
    lenient().when(permits.findByPermitNumber(PERMIT)).thenReturn(Optional.of(detail()));
    lenient().when(repository.findPermitMutationByPermitNumber(PERMIT))
        .thenReturn(Optional.of(stored(HIDDEN)));
    lenient().when(repository.findApplicationNumbersByPermitNumberRequired(PERMIT))
        .thenReturn(List.of(HIDDEN));
    lenient().when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("B"));
    lenient().when(repository.findApplicationInfoByNumber(HIDDEN))
        .thenReturn(Optional.of(hiddenInfo(HIDDEN, "EX-700", "Y")));
    lenient().when(applications.findAccessByApplicationNumber(HIDDEN)).thenReturn(
        Optional.of(new ApplicationAccessContextDto(HIDDEN, "P", 1909L, OWNER, FORMER)));
    lenient().when(exemptions.findAccessByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-700", "B", "ACT", true)));
    lenient().when(exemptions.findAccessOrgUnitNumbers("EX-700")).thenReturn(List.of(1909L));
    lenient().when(locks.acquirePermit(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient().when(locks.acquire(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    lenient().when(locks.acquireExemption(any(), any(), any(), anyBoolean()))
        .thenReturn(new ApplicationEditLockDto(false, true, null, null, null));
    var saved = new PermitPersistenceRpcResponseDto(true, "Saved", List.of(), List.of(), PERMIT);
    lenient().doReturn(saved).when(service).addBlanketOicScale(any(), any(), any(), any(), any(), any(), any(), any());
    lenient().doReturn(saved).when(service).deleteBlanketOicScale(any(), any(), any());
    lenient().doReturn(saved).when(service).updateScaleAttachment(any(), any(), anyBoolean(), any());
    lenient().doReturn(saved).when(service).updateScaleSelection(any(), any(), any(), any());
    lenient().doReturn(Optional.of(HIDDEN)).when(service).getApplicationNumberForScaleMutation("501");
    var permitSaved = new PermitMutationRpcResponseDto(true, "Saved", List.of(), List.of(),
        PERMIT, "ACT", null, false, false, null);
    lenient().doReturn(permitSaved).when(service).updatePermit(any(), any());
    lenient().doReturn(permitSaved).when(service).updatePermitWithAgentChange(any(), any());
  }

  static Stream<Arguments> currentParties() {
    return Stream.of(Action.values()).flatMap(action -> Stream.of(
        Arguments.of(action, CURRENT, FORMER),
        Arguments.of(action, CURRENT, null),
        Arguments.of(action, OWNER, FORMER)));
  }

  @ParameterizedTest
  @MethodSource("currentParties")
  void existingPermitPartiesCanMutateItsHiddenChildWithoutRepairingItsParties(
      Action action, String actorClient, String hiddenAgent) {
    when(applications.findAccessByApplicationNumber(HIDDEN)).thenReturn(Optional.of(
        new ApplicationAccessContextDto(HIDDEN, "P", 1909L, OWNER, hiddenAgent)));
    var actor = submitter(actorClient);

    var response = mutate(action, actor);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    verify(locks).acquire(HIDDEN, actor.getName(), actor.getName(), false);
    verify(locks).release(HIDDEN, actor.getName());
    assertThat(access.canAccessApplication(submitter(CURRENT), HIDDEN)).isFalse();
    verify(repository, never()).updatePermitDetail(any(), any(), any());
  }

  @ParameterizedTest
  @EnumSource(Action.class)
  void linkedFormerAgentKeepsExistingPermitAndScaleAccess(Action action) {
    when(permits.hasLinkedProvincialApplicationForClient(PERMIT, FORMER)).thenReturn(true);
    var actor = submitter(FORMER);

    assertThat(access.canAccessPermit(actor, PERMIT)).isTrue();
    assertThat(mutate(action, actor).getStatusCode().value()).isEqualTo(200);
  }

  @ParameterizedTest
  @EnumSource(Action.class)
  void formerAgentWithoutAnAssignedScaleDoesNotGainPermitAccess(Action action) {
    assertThat(access.canAccessPermit(submitter(FORMER), PERMIT)).isFalse();
    assertThatThrownBy(() -> mutate(action, submitter(FORMER)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @ParameterizedTest
  @EnumSource(Action.class)
  void unrelatedClientCannotUseTheHiddenChildException(Action action) {
    assertThatThrownBy(() -> mutate(action, submitter(UNRELATED)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @ParameterizedTest
  @EnumSource(Action.class)
  void unrelatedOrdinaryApplicationStillRequiresItsOwnClientAccess(Action action) {
    when(repository.findPermitMutationByPermitNumber(PERMIT)).thenReturn(Optional.of(stored(null)));
    lenient().when(repository.findExemptionTypeCode("EX-700")).thenReturn(Optional.of("M"));
    lenient().when(exemptions.findAccessByExemptionNumber("EX-700"))
        .thenReturn(Optional.of(new ExemptionAccessDto("EX-700", "M", "ACT", false)));
    lenient().when(exemptions.hasLinkedProvincialApplicationForClient("EX-700", CURRENT)).thenReturn(true);

    assertThatThrownBy(() -> mutate(action, submitter(CURRENT)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @ParameterizedTest
  @EnumSource(Action.class)
  void anotherLinkedApplicationCannotBeTreatedAsTheStoredHiddenChild(Action action) {
    when(repository.findPermitMutationByPermitNumber(PERMIT)).thenReturn(Optional.of(stored(1000999L)));
    lenient().when(repository.findApplicationInfoByNumber(1000999L))
        .thenReturn(Optional.of(hiddenInfo(1000999L, "EX-700", "Y")));

    assertThatThrownBy(() -> mutate(action, submitter(CURRENT)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @ParameterizedTest
  @ValueSource(strings = {"valid", "wrongId", "wrongExemption", "notHidden", "ordinary", "missing"})
  void hiddenChildExceptionRequiresTheExactStoredRelationship(String condition) {
    if ("wrongId".equals(condition)) when(repository.findApplicationInfoByNumber(HIDDEN))
        .thenReturn(Optional.of(hiddenInfo(1000999L, "EX-700", "Y")));
    if ("wrongExemption".equals(condition)) when(repository.findApplicationInfoByNumber(HIDDEN))
        .thenReturn(Optional.of(hiddenInfo(HIDDEN, "EX-OTHER", "Y")));
    if ("notHidden".equals(condition)) when(repository.findApplicationInfoByNumber(HIDDEN))
        .thenReturn(Optional.of(hiddenInfo(HIDDEN, "EX-700", "N")));
    if ("ordinary".equals(condition)) when(repository.findExemptionTypeCode("EX-700"))
        .thenReturn(Optional.of("M"));
    if ("missing".equals(condition)) when(repository.findApplicationInfoByNumber(HIDDEN))
        .thenReturn(Optional.empty());

    assertThat(service.isHiddenApplicationForPermitMutation(PERMIT, HIDDEN))
        .isEqualTo("valid".equals(condition));
  }

  @Test
  void missingCanonicalExemptionStillRejectsAnExistingPermitSave() {
    when(exemptions.findAccessByExemptionNumber("EX-700")).thenReturn(Optional.empty());

    assertThatThrownBy(() -> mutate(Action.SAVE, submitter(CURRENT)))
        .isInstanceOf(AccessDeniedException.class);
    verify(service, never()).updatePermit(any(), any());
  }

  @Test
  void submittedClientFieldsDoNotReplaceCanonicalPermitAuthorization() {
    var request = saveRequest();
    request.setParameter("ownerClientNumber", UNRELATED);
    request.setParameter("agentClientNumber", UNRELATED);
    assertThat(controller.updatePermit(request, submitter(CURRENT)).getStatusCode().value()).isEqualTo(200);

    request.setParameter("ownerClientNumber", OWNER);
    request.setParameter("agentClientNumber", UNRELATED);
    assertThatThrownBy(() -> controller.updatePermit(request, submitter(UNRELATED)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void suppliedNewHiddenApplicationStillRequiresIndependentAccess() {
    var request = saveRequest();
    request.setParameter("oicApplicationNumber", "1000999");
    when(applications.findAccessByApplicationNumber(1000999L)).thenReturn(Optional.of(
        new ApplicationAccessContextDto(1000999L, "P", 1909L, UNRELATED, null)));

    assertThatThrownBy(() -> controller.updatePermit(request, submitter(CURRENT)))
        .isInstanceOf(AccessDeniedException.class);
  }

  @Test
  void permitAccessIsRecheckedAfterEnteringTheMutationCoordinator() {
    when(permits.findAccessByPermitNumber(PERMIT)).thenReturn(
        Optional.of(new PermitAccessDto(PERMIT, CURRENT, OWNER, 1909L)),
        Optional.of(new PermitAccessDto(PERMIT, UNRELATED, OWNER, 1909L)));

    assertThatThrownBy(() -> mutate(Action.ADD_SCALE, submitter(CURRENT)))
        .isInstanceOf(AccessDeniedException.class);
    verify(service, never()).addBlanketOicScale(any(), any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void staffStillRequiresTheHiddenApplicationsOwnRegion() {
    when(applications.findAccessByApplicationNumber(HIDDEN)).thenReturn(Optional.of(
        new ApplicationAccessContextDto(HIDDEN, "P", 1903L, OWNER, FORMER)));

    assertThatThrownBy(() -> mutate(Action.ADD_SCALE,
        new TestingAuthenticationToken("idir\\synthetic", null, AA_RSC)))
        .isInstanceOf(AccessDeniedException.class);
  }

  private ResponseEntity<?> mutate(Action action, TestingAuthenticationToken actor) {
    return switch (action) {
      case SAVE -> controller.updatePermit(saveRequest(), actor);
      case ADD_SCALE -> controller.addBlanketOicScale(PERMIT, "PKG", "TM1", "0.2", 1L, "BA", "J", actor);
      case DELETE_SCALE -> controller.deleteBlanketOicScale("501", null, PERMIT, actor);
      case ATTACH_SCALE -> controller.updateScaleAttachment("501", null, PERMIT, "true", actor);
      case SELECT_SCALES -> controller.updateScaleSelection(PERMIT, List.of("501"), List.of(), actor);
    };
  }

  private MockHttpServletRequest saveRequest() {
    var request = new MockHttpServletRequest();
    request.setParameter("permitNumber", Long.toString(PERMIT));
    return request;
  }

  private TestingAuthenticationToken submitter(String client) {
    return new TestingAuthenticationToken("bceid\\" + client, null, "LEXIS_PROVINCIAL_SUBMITTER_" + client);
  }

  private PermitDetailDto detail() {
    return new PermitDetailDto(PERMIT, HIDDEN, "PKG", "EX-700", "ACT", "Active", CURRENT, "01",
        OWNER, "00", "Destination", "US", "S", "Ship", "VA", null, null, null, null,
        LocalDate.of(2026, 11, 1), 1d, 1L, null, null, null, null, HIDDEN, 1909L, "South Coast");
  }

  private PermitMutationRow stored(Long hidden) {
    return new PermitMutationRow(PERMIT, "Destination", "Ship", LocalDate.of(2026, 11, 1), null,
        LocalDate.of(2026, 3, 15), LocalDate.of(2026, 3, 15), null, null, null, 1d, 1L, 0L, null,
        null, "idir\\creator", Timestamp.valueOf("2026-03-15 12:00:00"), "S", "W", OWNER, "00",
        CURRENT, "01", "EX-700", 1909L, "VA", "ACT", "O", "US", null, null, hidden, 5L, 5d, "H");
  }

  private ApplicationInfoRow hiddenInfo(Long application, String exemption, String indicator) {
    return new ApplicationInfoRow(application, exemption, 1909L, "South Coast", "H", "O", null,
        OWNER, "00", FORMER, "01", indicator);
  }
}

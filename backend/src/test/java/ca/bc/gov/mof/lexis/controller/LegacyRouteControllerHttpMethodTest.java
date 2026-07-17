package ca.bc.gov.mof.lexis.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.service.session.LexisAuthorizationService;
import ca.bc.gov.mof.lexis.service.session.LexisSessionService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class LegacyRouteControllerHttpMethodTest {

  @Mock private LexisApplicationController applicationController;
  @Mock private ExemptionController exemptionController;
  @Mock private PurchaseOfferController purchaseOfferController;
  @Mock private PermitController permitController;
  @Mock private ApplicationReviewController applicationReviewController;
  @Mock private LexisAdminController adminController;
  @Mock private LexisSummaryController summaryController;
  @Mock private OfferDetailsRpcController offerDetailsRpcController;
  @Mock private PermitDetailsRpcController permitDetailsRpcController;
  @Mock private LexisSessionService sessionService;
  @Mock private LexisAuthorizationService authorizationService;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    LegacyRouteController controller =
        new LegacyRouteController(
            applicationController,
            exemptionController,
            purchaseOfferController,
            permitController,
            applicationReviewController,
            adminController,
            summaryController,
            offerDetailsRpcController,
            permitDetailsRpcController,
            sessionService,
            authorizationService);
    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @Test
  void mutationActionMappingsShouldRejectGetBeforeInvokingDownstreamControllers()
      throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applicationsReview.do")
                .param("actionMapping", "approve")
                .param("applicationNumber", "1000123"))
        .andExpect(status().isMethodNotAllowed());
    mockMvc
        .perform(
            get("/api/lexis/offerDetailsRPC.do")
                .param("actionMapping", "addOffer")
                .param("applicationNumber", "1000123"))
        .andExpect(status().isMethodNotAllowed());
    mockMvc
        .perform(
            get("/api/lexis/permitDetailsRPC.do")
                .param("actionMapping", "updatePermit")
                .param("permitNumber", "7000123"))
        .andExpect(status().isMethodNotAllowed());
    mockMvc
        .perform(
            get("/api/lexis/lexisPolicyAdminRPC.do")
                .param("actionMapping", "addPolicy"))
        .andExpect(status().isMethodNotAllowed());
    mockMvc
        .perform(
            get("/api/lexis/lexisFILAdminRPC.do")
                .param("actionMapping", "deleteFILPolicy"))
        .andExpect(status().isMethodNotAllowed());

    verifyNoInteractions(
        applicationReviewController,
        offerDetailsRpcController,
        permitDetailsRpcController,
        adminController,
        sessionService,
        authorizationService);
  }

  @Test
  void readActionMappingsShouldRemainAvailableOverGet() throws Exception {
    when(applicationReviewController.searchOptions())
        .thenReturn(ResponseEntity.noContent().build());
    when(offerDetailsRpcController.getClientLocations("00000001"))
        .thenReturn(ResponseEntity.noContent().build());
    when(permitDetailsRpcController.getCountryList())
        .thenReturn(ResponseEntity.noContent().build());
    when(adminController.feePolicyRpcForm(anyMap()))
        .thenReturn(ResponseEntity.noContent().build());
    when(adminController.filPolicyRpcForm(anyMap()))
        .thenReturn(ResponseEntity.noContent().build());

    mockMvc
        .perform(
            get("/api/lexis/applicationsReview.do")
                .param("actionMapping", "view"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            get("/api/lexis/offerDetailsRPC.do")
                .param("actionMapping", "getClientLocations")
                .param("clientNumber", "00000001"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            get("/api/lexis/permitDetailsRPC.do")
                .param("actionMapping", "getCountryList"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            get("/api/lexis/lexisPolicyAdminRPC.do")
                .param("actionMapping", "viewPolicies"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            get("/api/lexis/lexisFILAdminRPC.do")
                .param("actionMapping", "updatePaging"))
        .andExpect(status().isNoContent());

    verify(applicationReviewController).searchOptions();
    verify(offerDetailsRpcController).getClientLocations("00000001");
    verify(permitDetailsRpcController).getCountryList();
    verify(adminController).feePolicyRpcForm(anyMap());
    verify(adminController).filPolicyRpcForm(anyMap());
  }

  @Test
  void mutationActionMappingsShouldRemainAvailableOverPost() throws Exception {
    when(applicationReviewController.approveLegacy(any(), any()))
        .thenReturn(ResponseEntity.noContent().build());
    when(offerDetailsRpcController.addOfferLegacy(any(), any()))
        .thenReturn(ResponseEntity.noContent().build());
    when(sessionService.parseRolesFromPrincipal(any())).thenReturn(List.of("LEXIS_ADMIN"));
    when(authorizationService.canPerformAction(anyList(), eq("savePermit"))).thenReturn(true);
    when(permitDetailsRpcController.updatePermit(any(), any()))
        .thenReturn(ResponseEntity.noContent().build());
    when(adminController.feePolicyRpcForm(anyMap()))
        .thenReturn(ResponseEntity.noContent().build());
    when(adminController.filPolicyRpcForm(anyMap()))
        .thenReturn(ResponseEntity.noContent().build());

    mockMvc
        .perform(
            post("/api/lexis/applicationsReview.do")
                .param("actionMapping", "approve")
                .param("applicationNumber", "1000123"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            post("/api/lexis/offerDetailsRPC.do")
                .param("actionMapping", "addOffer")
                .param("applicationNumber", "1000123"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            post("/api/lexis/permitDetailsRPC.do")
                .param("actionMapping", "updatePermit")
                .param("permitNumber", "7000123"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            post("/api/lexis/lexisPolicyAdminRPC.do")
                .param("actionMapping", "addPolicy"))
        .andExpect(status().isNoContent());
    mockMvc
        .perform(
            post("/api/lexis/lexisFILAdminRPC.do")
                .param("actionMapping", "deleteFILPolicy"))
        .andExpect(status().isNoContent());

    verify(applicationReviewController).approveLegacy(any(), any());
    verify(offerDetailsRpcController).addOfferLegacy(any(), any());
    verify(permitDetailsRpcController).updatePermit(any(), any());
    verify(adminController).feePolicyRpcForm(anyMap());
    verify(adminController).filPolicyRpcForm(anyMap());
  }
}

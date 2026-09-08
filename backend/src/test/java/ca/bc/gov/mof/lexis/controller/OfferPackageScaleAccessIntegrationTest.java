package ca.bc.gov.mof.lexis.controller;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.handler;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import ca.bc.gov.mof.lexis.service.offer.PurchaseOfferService;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
    properties = {
      "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://cognito.example.test/user-pool",
      "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=https://cognito.example.test/user-pool/.well-known/jwks.json"
    })
@AutoConfigureMockMvc
class OfferPackageScaleAccessIntegrationTest {

  private static final String SCALES_PATH = "/api/lexis/rpc/offer-details/package-scales";
  private static final long OFFER_NUMBER = 81001L;
  private static final long APPLICATION_NUMBER = 1000456L;
  private static final String PACKAGE_NUMBER = "PKG-903";
  private static final String OFFERING_CLIENT = "00012345";

  @Autowired private MockMvc mockMvc;

  @MockitoBean private LexisApplicationService applicationService;
  @MockitoBean private ApplicationDetailsRpcService applicationDetailsService;
  @MockitoBean private FederalApplicationService federalApplicationService;
  @MockitoBean private PurchaseOfferService offerService;

  @BeforeEach
  void existingOfferOnAnotherClientsExpiredApplication() {
    when(offerService.findByOfferNumber(OFFER_NUMBER)).thenReturn(Optional.of(offer()));
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("EXP", false)));
    when(applicationDetailsService.findApplicationNumberForPackage(PACKAGE_NUMBER))
        .thenReturn(Optional.of(APPLICATION_NUMBER));
    when(applicationDetailsService.getScalesForPackage(PACKAGE_NUMBER))
        .thenReturn(
            List.of(
                new ApplicationDetailsRpcService.ApplicationPackageScaleItem(
                    true, "AB1234", "FI", 12L, "H", "24.5", "501", "S")));
  }

  @Test
  void offeringClientCanReadExistingOfferScalesWhileParentApplicationRemainsInaccessible()
      throws Exception {
    mockMvc.perform(
            get(SCALES_PATH)
                .param("offerNumber", Long.toString(OFFER_NUMBER))
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isOk())
        .andExpect(
            content().json(
                """
                [{"timberMark":"AB1234","pieces":12,"species":"FI","grade":"H",
                  "volume":"24.5","cascadeSplitCode":"S"}]
                """,
                JsonCompareMode.STRICT));

    mockMvc.perform(
            get("/api/lexis/applications/{applicationNumber}", APPLICATION_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(handler().handlerType(LexisApplicationController.class))
        .andExpect(status().isNotFound());
  }

  @Test
  void unrelatedClientCannotReadAnotherClientsOfferScales() throws Exception {
    mockMvc.perform(
            get(SCALES_PATH)
                .param("offerNumber", Long.toString(OFFER_NUMBER))
                .with(submitterJwt("00099999")))
        .andExpect(status().isForbidden());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void suppliedPackageCannotReplaceAnExistingOffersStoredPackage() throws Exception {
    mockMvc.perform(
            get(SCALES_PATH)
                .param("offerNumber", Long.toString(OFFER_NUMBER))
                .param("packageNumber", "PKG-OTHER")
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isOk());

    verify(applicationDetailsService).getScalesForPackage(PACKAGE_NUMBER);
    verify(applicationDetailsService, never()).findApplicationNumberForPackage("PKG-OTHER");
    verify(applicationDetailsService, never()).getScalesForPackage("PKG-OTHER");
  }

  @Test
  void missingOfferCannotFallBackToACallerSuppliedPackage() throws Exception {
    when(offerService.findByOfferNumber(OFFER_NUMBER)).thenReturn(Optional.empty());

    mockMvc.perform(
            get(SCALES_PATH)
                .param("offerNumber", Long.toString(OFFER_NUMBER))
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isNotFound());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void invalidOfferNumberCannotFallBackToACallerSuppliedPackage() throws Exception {
    mockMvc.perform(
            get(SCALES_PATH)
                .param("offerNumber", "-1")
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isBadRequest());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void existingOfferRequiresItsPackageToBelongToTheSavedParentApplication() throws Exception {
    when(applicationDetailsService.findApplicationNumberForPackage(PACKAGE_NUMBER))
        .thenReturn(Optional.of(APPLICATION_NUMBER + 1), Optional.empty());

    for (int attempt = 0; attempt < 2; attempt++) {
      mockMvc.perform(
              get(SCALES_PATH)
                  .param("offerNumber", Long.toString(OFFER_NUMBER))
                  .with(submitterJwt(OFFERING_CLIENT)))
          .andExpect(status().isNotFound());
    }

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void scopedOfferCreatorCanReadScalesForAnotherClientsAcceptingApplication() throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("APP", true)));

    mockMvc.perform(
            get(SCALES_PATH)
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isOk());

    verify(applicationDetailsService).getScalesForPackage(PACKAGE_NUMBER);
  }

  @Test
  void offerCreationCannotReadScalesAfterTheApplicationStopsAcceptingOffers() throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("APP", false)));

    mockMvc.perform(
            get(SCALES_PATH)
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isForbidden());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void offerCreationCannotReadFederalApplicationScales() throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.of(application("APP", true)));
    when(federalApplicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(
            Optional.of(
                new FederalApplicationDetailDto(
                    APPLICATION_NUMBER, "FED-123", "APP", "Approved", "00077881", "00",
                    null, null, null, null, null, null, null, false,
                    List.of(), List.of(), List.of(), null)));

    mockMvc.perform(
            get(SCALES_PATH)
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isForbidden());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void offerCreationRequiresAnExistingPackageAndParentApplication() throws Exception {
    when(applicationService.findByApplicationNumber(APPLICATION_NUMBER))
        .thenReturn(Optional.empty());

    mockMvc.perform(
            get(SCALES_PATH)
                .param("packageNumber", PACKAGE_NUMBER)
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isForbidden());
    mockMvc.perform(
            get(SCALES_PATH)
                .param("packageNumber", "PKG-MISSING")
                .with(submitterJwt(OFFERING_CLIENT)))
        .andExpect(status().isForbidden());

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  @Test
  void anonymousUnknownAndUnscopedSubmittersCannotReadScales() throws Exception {
    mockMvc.perform(get(SCALES_PATH).param("offerNumber", Long.toString(OFFER_NUMBER)))
        .andExpect(status().isUnauthorized());

    for (String authority : List.of("LEXIS_UNKNOWN_ROLE", "LEXIS_PROVINCIAL_SUBMITTER")) {
      mockMvc.perform(
              get(SCALES_PATH)
                  .param("offerNumber", Long.toString(OFFER_NUMBER))
                  .with(bceidJwt(authority)))
          .andExpect(status().isForbidden());
      mockMvc.perform(
              get(SCALES_PATH)
                  .param("packageNumber", PACKAGE_NUMBER)
                  .with(bceidJwt(authority)))
          .andExpect(status().isForbidden());
    }

    verify(applicationDetailsService, never()).getScalesForPackage(anyString());
  }

  private LexisApplicationDetailDto application(String status, boolean acceptingOffers) {
    return new LexisApplicationDetailDto(
        APPLICATION_NUMBER, "EX-205", status, status, "00077881", "00055667", 12L, "R2",
        "S", "ER02", LexisBusinessTime.today().minusDays(45),
        LexisBusinessTime.today().minusDays(40), LexisBusinessTime.today().minusDays(30),
        LexisBusinessTime.today().minusDays(10), 180L, 95.0d, 1.6d, acceptingOffers,
        false, false, false, false, null, null, List.of(), List.of(), List.of());
  }

  private PurchaseOfferDetailDto offer() {
    return new PurchaseOfferDetailDto(
        OFFER_NUMBER, APPLICATION_NUMBER, PACKAGE_NUMBER, 45.5, "FI/H", "Buyer", "Contact",
        12500.25, LexisBusinessTime.today().minusDays(29), null, null, "N", "Y", "N",
        "Private offer remarks", null, "P", "Mill details", OFFERING_CLIENT, "Pickup",
        "Private conditions", LexisBusinessTime.today().minusDays(30),
        LexisBusinessTime.today().minusDays(10), 45.5, "12");
  }

  private JwtRequestPostProcessor submitterJwt(String clientNumber) {
    return bceidJwt("LEXIS_PROVINCIAL_SUBMITTER_" + clientNumber);
  }

  private JwtRequestPostProcessor bceidJwt(String authority) {
    return SecurityMockMvcRequestPostProcessors.jwt()
        .jwt(
            token -> token
                .claim("custom:idp_name", "bceidbusiness")
                .claim("custom:idp_username", "lexis-offer-scale-test-user"))
        .authorities(new SimpleGrantedAuthority(authority));
  }
}

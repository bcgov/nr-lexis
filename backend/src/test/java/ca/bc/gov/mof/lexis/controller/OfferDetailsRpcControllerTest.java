package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.application.LexisPackageLookupDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.service.application.LexisApplicationService;
import ca.bc.gov.mof.lexis.service.federal.FederalApplicationService;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OfferDetailsRpcController")
class OfferDetailsRpcControllerTest {

  @Mock private ObjectProvider<LexisApplicationService> applicationServiceProvider;
  @Mock private ObjectProvider<FederalApplicationService> federalApplicationServiceProvider;
  @Mock private LexisApplicationService applicationService;
  @Mock private FederalApplicationService federalApplicationService;

  private OfferDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller =
        new OfferDetailsRpcController(applicationServiceProvider, federalApplicationServiceProvider);
  }

  @Test
  void validateShouldReturnInvalidWhenApplicationServiceMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isFalse();
    verifyNoInteractions(applicationService, federalApplicationService);
  }

  @Test
  void validateShouldRejectFederalApplicationNumbers() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(federalApplicationServiceProvider.getIfAvailable()).thenReturn(federalApplicationService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", LocalDate.now(), true, List.of())));
    when(federalApplicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                new FederalApplicationDetailDto(
                    1000456L,
                    "FED-1",
                    "APP",
                    "Approved",
                    "00077881",
                    "00",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    false,
                    List.of(),
                    List.of(),
                    List.of(),
                    null)));

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isFalse();
    assertThat(response.getBody().errors()).hasSize(1);
    assertThat(response.getBody().errors().get(0)).contains("valid jurisdiction");
    verify(applicationService).findByApplicationNumber(1000456L);
    verify(federalApplicationService).findByApplicationNumber(1000456L);
  }

  @Test
  void validateShouldReturnValidWhenApplicationEligible() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(federalApplicationServiceProvider.getIfAvailable()).thenReturn(federalApplicationService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(Optional.of(application(1000456L, "APP", LocalDate.now(), true, List.of())));
    when(federalApplicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferValidationResponseDto> response =
        controller.validateApplicationNumber("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().isValid()).isTrue();
    assertThat(response.getBody().errors()).isEmpty();
  }

  @Test
  void applicationDetailsShouldReturnSuccessPayload() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1000456L))
        .thenReturn(
            Optional.of(
                application(1000456L, "APP", LocalDate.of(2026, 2, 26), true, List.of())));

    ResponseEntity<OfferDetailsRpcController.OfferApplicationDetailsResponseDto> response =
        controller.getApplicationDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isTrue();
    assertThat(response.getBody().speciesGradeCode()).isEqualTo("S");
    assertThat(response.getBody().advertisingDate()).isEqualTo("02/26/2026");
  }

  @Test
  void packageListShouldReturnNoPackagesWhenDetailsMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferPackageListResponseDto> response =
        controller.getPackageList("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().packageList()).containsExactly("No Packages");
  }

  @Test
  void packageVolumeShouldReturnFormattedVolume() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findPackageByPackageNumber("PKG-903"))
        .thenReturn(Optional.of(new LexisPackageLookupDto("PKG-903", 1000456L, 95.04d, "S")));

    ResponseEntity<OfferDetailsRpcController.OfferVolumeResponseDto> response =
        controller.getPackageVolume("PKG-903");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volume()).isEqualTo("95.0");
  }

  @Test
  void applicationVolumeShouldReturnZeroWhenApplicationMissing() {
    when(applicationServiceProvider.getIfAvailable()).thenReturn(applicationService);
    when(applicationService.findByApplicationNumber(1000456L)).thenReturn(Optional.empty());

    ResponseEntity<OfferDetailsRpcController.OfferVolumeResponseDto> response =
        controller.getApplicationVolume("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().volume()).isEqualTo("0.0");
  }

  private LexisApplicationDetailDto application(
      long applicationNumber,
      String statusCode,
      LocalDate listingDate,
      boolean canCreateOffers,
      List<LexisApplicationDetailDto.LexisPackageDto> packages) {
    return new LexisApplicationDetailDto(
        applicationNumber,
        "EX-205",
        statusCode,
        "Status",
        "00077881",
        "00055667",
        12L,
        "R2",
        "S",
        "ER02",
        LocalDate.of(2026, 2, 20),
        LocalDate.of(2026, 2, 21),
        listingDate,
        120L,
        95.0d,
        1.6d,
        canCreateOffers,
        false,
        false,
        false,
        false,
        packages,
        List.of(),
        List.of());
  }
}

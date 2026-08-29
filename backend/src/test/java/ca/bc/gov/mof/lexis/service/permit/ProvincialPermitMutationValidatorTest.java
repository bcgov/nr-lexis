package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository;
import ca.bc.gov.mof.lexis.repository.permit.PermitRpcRepository.PermitMutationRow;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService;
import ca.bc.gov.mof.lexis.service.client.ClientLookupService.ClientData;
import ca.bc.gov.mof.lexis.util.LexisBusinessTime;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;

@ExtendWith(MockitoExtension.class)
class ProvincialPermitMutationValidatorTest {

  private static final Clock CLOCK =
      Clock.fixed(Instant.parse("2026-07-11T06:30:00Z"), LexisBusinessTime.ZONE);

  @Mock private PermitRpcRepository repository;
  @Mock private ClientLookupService clientLookupService;

  private ProvincialPermitMutationValidator validator;

  @BeforeEach
  void setUp() {
    validator = new ProvincialPermitMutationValidator(repository, clientLookupService, CLOCK);
    lenient().when(repository.isPermitStatusCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isCountryCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isPortCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isScaleMethodCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.isTransportTypeCodeValidRequired(any())).thenReturn(true);
    lenient().when(repository.hasApplicationForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient()
        .when(repository.hasPackageForPermitCompletionRequired(anyLong(), anyBoolean()))
        .thenReturn(true);
    lenient().when(repository.hasScaleForPermitCompletionRequired(anyLong())).thenReturn(true);
    lenient().when(repository.isPermitMu44Required(anyLong())).thenReturn(false);
    lenient()
        .when(clientLookupService.getClientDataRequired(any(), any()))
        .thenReturn(Optional.of(validClient()));
  }

  @Test
  void shouldEnforceActiveAndMinisterialDateRelationships() {
    PermitBuilder permit =
        permit()
            .applicationDate(LocalDate.of(2026, 7, 11))
            .issueDate(LocalDate.of(2026, 7, 10))
            .expiryDate(LocalDate.of(2026, 7, 10));

    var result =
        validator.validate(
            permit.build(), ministerialExemption(LocalDate.of(2026, 7, 9)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Submit Date can't be in the future.",
            "Issued Date must be after or equal to Submit Date.",
            "Permit Expiry Date must be after Submit Date and Issue Date.",
            "Permit Expiry Date cannot be after the Exemption Expiry Date.");
  }

  @Test
  void shouldLimitLegacyDateRelationshipRulesToActivePermits() {
    var result =
        validator.validate(
            permit()
                .permitStatusCode("COM")
                .applicationDate(LocalDate.of(2026, 7, 11))
                .issueDate(LocalDate.of(2026, 7, 10))
                .expiryDate(LocalDate.of(2026, 7, 10))
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 9)));

    assertThat(result.valid()).isTrue();
    assertThat(result.errors()).isEmpty();
  }

  @Test
  void shouldRequireShippingClientAndValidCodes() {
    when(repository.isPermitStatusCodeValidRequired("BAD")).thenReturn(false);
    when(repository.isCountryCodeValidRequired("XX")).thenReturn(false);
    when(repository.isScaleMethodCodeValidRequired("BAD")).thenReturn(false);
    when(repository.isTransportTypeCodeValidRequired("Z")).thenReturn(false);

    var result =
        validator.validate(
            permit()
                .destinationCompanyName(" ")
                .transportName(null)
                .estimatedShippingDate(null)
                .clientNumber(null)
                .clientLocationCode("")
                .permitStatusCode("BAD")
                .countryCode("XX")
                .portOfExportCode("OT")
                .otherPortOfExport(null)
                .scaleMethodCode("BAD")
                .transportTypeCode("Z")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .contains(
            "A valid client number is required.",
            "A valid client location code is required.",
            "A valid company name on the Shipping tab is required.",
            "A valid transport name on the Shipping tab is required.",
            "A valid estimated shipping date on the Shipping tab is required.",
            "A valid permit status code is required.",
            "A valid country code is required.",
            "A valid scale method code is required.",
            "A valid transport type code is required.",
            "A valid other port of export description is required.");
  }

  @Test
  void shouldRejectAnUnknownClientLocation() {
    when(clientLookupService.getClientDataRequired("00077881", "01"))
        .thenReturn(Optional.empty());

    var result =
        validator.validate(
            permit().build(), ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactly("The client number and location code could not be verified.");
  }

  @Test
  void shouldEnforceOracleByteWidthsForShippingText() {
    var result =
        validator.validate(
            permit()
                .destinationCompanyName("C".repeat(53))
                .transportName("T".repeat(27))
                .portOfExportCode("OT")
                .otherPortOfExport("P".repeat(35))
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Company name on the Shipping tab must not exceed 52 bytes.",
            "Transport name on the Shipping tab must not exceed 26 bytes.",
            "Other port of export description must not exceed 34 bytes.");
  }

  @Test
  void shouldRejectShippingTextThatOracleCannotRepresent() {
    var result =
        validator.validate(
            permit()
                .destinationCompanyName("Café")
                .transportName("Navire Étoile")
                .portOfExportCode("OT")
                .otherPortOfExport("Québec")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Company name on the Shipping tab contains characters the current LEXIS database cannot store.",
            "Transport name on the Shipping tab contains characters the current LEXIS database cannot store.",
            "Other port of export description contains characters the current LEXIS database cannot store.");
  }

  @Test
  void shouldEnforceOracleTextWidthsForRemainingPermitFields() {
    var result =
        validator.validate(
            permit()
                .receiptNumber("R".repeat(51))
                .federalPermitNumber("F".repeat(11))
                .remarks("M".repeat(255))
                .overrideFee(1.0d)
                .overrideComment("O".repeat(255))
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Receipt number must not exceed 50 bytes.",
            "Federal permit number must not exceed 10 bytes.",
            "Permit remarks must not exceed 254 bytes.",
            "Override comment must not exceed 254 bytes.");
  }

  @Test
  void shouldRejectRemainingPermitTextThatOracleCannotRepresent() {
    var result =
        validator.validate(
            permit()
                .receiptNumber("Reçu")
                .federalPermitNumber("Fédéral")
                .remarks("Expédition")
                .overrideFee(1.0d)
                .overrideComment("Révision")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Receipt number contains characters the current LEXIS database cannot store.",
            "Federal permit number contains characters the current LEXIS database cannot store.",
            "Permit remarks contains characters the current LEXIS database cannot store.",
            "Override comment contains characters the current LEXIS database cannot store.");
  }

  @Test
  void shouldRejectShippingCodesThatExceedOracleSchemaWidths() {
    var result =
        validator.validate(
            permit()
                .countryCode("USA")
                .transportTypeCode("SEA")
                .portOfExportCode("VAN")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "A valid country code is required.",
            "A valid port of export code is required.",
            "A valid transport type code is required.");
  }

  @Test
  void shouldNormalizeCodesAndClearOtherPortUnlessPortIsOther() {
    var result =
        validator.validate(
            permit()
                .countryCode(" us ")
                .transportTypeCode(" s ")
                .portOfExportCode(" va ")
                .otherPortOfExport("Stale other port")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.valid()).isTrue();
    assertThat(result.permit().countryCode()).isEqualTo("US");
    assertThat(result.permit().transportTypeCode()).isEqualTo("S");
    assertThat(result.permit().portOfExportCode()).isEqualTo("VA");
    assertThat(result.permit().otherPortOfExport()).isNull();
  }

  @Test
  void shouldRequireACompleteAuthoritativeAgentIdentity() {
    var missingLocation =
        validator.validate(
            permit().agentNumber("00077880").build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));
    var missingNumber =
        validator.validate(
            permit().agentLocationCode("02").build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));
    when(clientLookupService.getClientDataRequired("00077880", "02"))
        .thenReturn(Optional.empty());
    var unknownAgent =
        validator.validate(
            permit().agentNumber("00077880").agentLocationCode("02").build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(missingLocation.errors())
        .containsExactly(
            "A valid agent location code is required when an agent client is provided.");
    assertThat(missingNumber.errors())
        .containsExactly(
            "A valid agent client number is required when an agent location is provided.");
    assertThat(unknownAgent.errors())
        .containsExactly("The agent client number and location code could not be verified.");
  }

  @Test
  void shouldRequireIssueExpiryApplicationPackageAndScaleForCompletion() {
    when(repository.hasApplicationForPermitCompletionRequired(7000123L)).thenReturn(false);
    when(repository.hasPackageForPermitCompletionRequired(7000123L, false)).thenReturn(false);
    when(repository.hasScaleForPermitCompletionRequired(7000123L)).thenReturn(false);

    var result =
        validator.validate(
            permit().permitStatusCode("COM").issueDate(null).expiryDate(null).build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "A valid permit issue date is required to complete a permit.",
            "A valid expiry date is required to complete a permit.",
            "At least one application is required before a permit can be completed.",
            "At least one package is required before a permit can be completed.",
            "At least one scale detail is required before a permit can be completed.");
  }

  @Test
  void shouldValidateBlanketOicApplicationAndPositiveRequestQuantities() {
    when(repository.findApplicationInfoByNumber(1000999L)).thenReturn(Optional.empty());

    var result =
        validator.validate(
            permit()
                .permitStatusCode("COM")
                .oicApplicationNumber(1000999L)
                .oicRequestPieces(0L)
                .oicRequestVolume(0.0d)
                .build(),
            blanketOicExemption());

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "At least one application is required before a permit can be completed.",
            "Permit Request Pieces must be greater than 0 to complete a permit.",
            "Permit Request Volume must be greater than 0 to complete a permit.");
  }

  @Test
  void shouldRejectNonFiniteAndOutOfRangePermitAmounts() {
    var result =
        validator.validate(
            permit()
                .permitVolume(-1.0d)
                .overrideFee(Double.POSITIVE_INFINITY)
                .oicRequestVolume(Double.NaN)
                .build(),
            blanketOicExemption());

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Permit Volume must be greater than or equal to 0.",
            "Override fee must be greater than zero.",
            "Permit Request Volume must be greater than or equal to 0.");
  }

  @Test
  void shouldAllowOracleRoundingAndRejectRoundedPermitOverflow() {
    var accepted =
        validator.validate(
            permit()
                .permitVolume(9_999_999.994d)
                .overrideFee(9_999_999.994d)
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(accepted.errors()).isEmpty();
    assertThat(accepted.permit().permitVolume()).isEqualTo(9_999_999.99d);
    assertThat(accepted.permit().overrideFee()).isEqualTo(9_999_999.99d);

    var result =
        validator.validate(
            permit()
                .permitVolume(9_999_999.995d)
                .overrideFee(9_999_999.995d)
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.errors())
        .containsExactlyInAnyOrder(
            "Permit Volume must round to 9999999.99 or less.",
            "Override fee must round to 9999999.99 or less.");
  }

  @Test
  void shouldConvertInteriorCompletionWithoutReceiptToPaymentPending() {
    var result =
        validator.validate(
            permit()
                .permitStatusCode("COM")
                .orgUnitNo(1903L)
                .receiptNumber(" ")
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.valid()).isTrue();
    assertThat(result.permit().permitStatusCode()).isEqualTo("PPD");
    assertThat(result.warnings())
        .containsExactly(ProvincialPermitMutationValidator.PAYMENT_PENDING_WARNING);
  }

  @Test
  void shouldKeepRskMu44CompletionCompleteWithoutReceipt() {
    when(repository.isPermitMu44Required(7000123L)).thenReturn(true);

    var result =
        validator.validate(
            permit()
                .permitStatusCode("COM")
                .orgUnitNo(1908L)
                .receiptNumber(null)
                .build(),
            ministerialExemption(LocalDate.of(2026, 7, 31)));

    assertThat(result.valid()).isTrue();
    assertThat(result.permit().permitStatusCode()).isEqualTo("COM");
    assertThat(result.warnings()).isEmpty();
  }

  @Test
  void shouldPropagateRequiredLookupFailures() {
    when(clientLookupService.getClientDataRequired("00077881", "01"))
        .thenThrow(new DataAccessResourceFailureException("Oracle unavailable"));

    assertThatThrownBy(
            () ->
                validator.validate(
                    permit().build(), ministerialExemption(LocalDate.of(2026, 7, 31))))
        .isInstanceOf(DataAccessResourceFailureException.class)
        .hasMessage("Oracle unavailable");
  }

  private PermitBuilder permit() {
    return new PermitBuilder();
  }

  private ExemptionDetailDto ministerialExemption(LocalDate expiryDate) {
    return exemption("EX-700", "M", false, expiryDate);
  }

  private ExemptionDetailDto blanketOicExemption() {
    return exemption("EX-700", "B", true, LocalDate.of(2026, 7, 31));
  }

  private ExemptionDetailDto exemption(
      String number, String type, boolean blanketOic, LocalDate expiryDate) {
    return new ExemptionDetailDto(
        number,
        type,
        blanketOic ? "Blanket OIC" : "Ministerial",
        "ACT",
        "Active",
        "00077881",
        null,
        1000456L,
        "APP",
        LocalDate.of(2026, 7, 1),
        expiryDate,
        100.0d,
        0.0d,
        100.0d,
        null,
        blanketOic,
        List.of(),
        List.of());
  }

  private ClientData validClient() {
    return new ClientData(
        "00077881", "Client", null, null, null, null, null, null, null, null);
  }

  private static final class PermitBuilder {

    private Long permitNumber = 7000123L;
    private String destinationCompanyName = "Destination";
    private String transportName = "Hauler";
    private LocalDate estimatedShippingDate = LocalDate.of(2026, 7, 15);
    private String otherPortOfExport;
    private LocalDate applicationDate = LocalDate.of(2026, 7, 9);
    private LocalDate receivedDate = LocalDate.of(2026, 7, 9);
    private LocalDate issueDate = LocalDate.of(2026, 7, 9);
    private String receiptNumber = "RCPT-1";
    private LocalDate expiryDate = LocalDate.of(2026, 7, 20);
    private Double permitVolume = 100.0d;
    private String federalPermitNumber;
    private String remarks = "Remarks";
    private String transportTypeCode = "S";
    private String scaleMethodCode = "W";
    private String clientNumber = "00077881";
    private String clientLocationCode = "01";
    private String agentNumber;
    private String agentLocationCode;
    private Long orgUnitNo = 1835L;
    private String portOfExportCode = "VA";
    private String permitStatusCode = "ACT";
    private String countryCode = "US";
    private Double overrideFee;
    private String overrideComment;
    private Long oicApplicationNumber;
    private Long oicRequestPieces;
    private Double oicRequestVolume;

    PermitBuilder destinationCompanyName(String value) {
      destinationCompanyName = value;
      return this;
    }

    PermitBuilder transportName(String value) {
      transportName = value;
      return this;
    }

    PermitBuilder estimatedShippingDate(LocalDate value) {
      estimatedShippingDate = value;
      return this;
    }

    PermitBuilder otherPortOfExport(String value) {
      otherPortOfExport = value;
      return this;
    }

    PermitBuilder applicationDate(LocalDate value) {
      applicationDate = value;
      return this;
    }

    PermitBuilder issueDate(LocalDate value) {
      issueDate = value;
      return this;
    }

    PermitBuilder receiptNumber(String value) {
      receiptNumber = value;
      return this;
    }

    PermitBuilder expiryDate(LocalDate value) {
      expiryDate = value;
      return this;
    }

    PermitBuilder permitVolume(Double value) {
      permitVolume = value;
      return this;
    }

    PermitBuilder federalPermitNumber(String value) {
      federalPermitNumber = value;
      return this;
    }

    PermitBuilder remarks(String value) {
      remarks = value;
      return this;
    }

    PermitBuilder transportTypeCode(String value) {
      transportTypeCode = value;
      return this;
    }

    PermitBuilder scaleMethodCode(String value) {
      scaleMethodCode = value;
      return this;
    }

    PermitBuilder clientNumber(String value) {
      clientNumber = value;
      return this;
    }

    PermitBuilder clientLocationCode(String value) {
      clientLocationCode = value;
      return this;
    }

    PermitBuilder agentNumber(String value) {
      agentNumber = value;
      return this;
    }

    PermitBuilder agentLocationCode(String value) {
      agentLocationCode = value;
      return this;
    }

    PermitBuilder orgUnitNo(Long value) {
      orgUnitNo = value;
      return this;
    }

    PermitBuilder portOfExportCode(String value) {
      portOfExportCode = value;
      return this;
    }

    PermitBuilder permitStatusCode(String value) {
      permitStatusCode = value;
      return this;
    }

    PermitBuilder countryCode(String value) {
      countryCode = value;
      return this;
    }

    PermitBuilder overrideFee(Double value) {
      overrideFee = value;
      return this;
    }

    PermitBuilder overrideComment(String value) {
      overrideComment = value;
      return this;
    }

    PermitBuilder oicApplicationNumber(Long value) {
      oicApplicationNumber = value;
      return this;
    }

    PermitBuilder oicRequestPieces(Long value) {
      oicRequestPieces = value;
      return this;
    }

    PermitBuilder oicRequestVolume(Double value) {
      oicRequestVolume = value;
      return this;
    }

    PermitMutationRow build() {
      return new PermitMutationRow(
          permitNumber,
          destinationCompanyName,
          transportName,
          estimatedShippingDate,
          otherPortOfExport,
          applicationDate,
          receivedDate,
          issueDate,
          receiptNumber,
          expiryDate,
          permitVolume,
          10L,
          0L,
          federalPermitNumber,
          remarks,
          "idir\\jsmith",
          (Timestamp) null,
          transportTypeCode,
          scaleMethodCode,
          clientNumber,
          clientLocationCode,
          agentNumber,
          agentLocationCode,
          "EX-700",
          orgUnitNo,
          portOfExportCode,
          permitStatusCode,
          "S",
          countryCode,
          overrideFee,
          overrideComment,
          oicApplicationNumber,
          oicRequestPieces,
          oicRequestVolume,
          "T");
    }
  }
}

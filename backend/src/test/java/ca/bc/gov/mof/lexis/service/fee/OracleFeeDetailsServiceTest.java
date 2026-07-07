package ca.bc.gov.mof.lexis.service.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.permit.PermitService;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | OracleFeeDetailsService")
class OracleFeeDetailsServiceTest {

  @Mock private PermitService permitService;

  @InjectMocks private OracleFeeDetailsService service;

  @Test
  void shouldReturnEmptyForInvalidPermitNumber() {
    assertThat(service.getPermitSummary(null)).isEmpty();
    assertThat(service.getPermitSummary(0L)).isEmpty();
    verifyNoInteractions(permitService);
  }

  @Test
  void shouldReturnEmptyWhenPermitNotFound() {
    when(permitService.findByPermitNumber(7000123L)).thenReturn(Optional.empty());

    assertThat(service.getPermitSummary(7000123L)).isEmpty();
    verify(permitService).findByPermitNumber(7000123L);
  }

  @Test
  void shouldMapPermitDetailsIntoFeeSummary() {
    when(permitService.findByPermitNumber(7000123L))
        .thenReturn(
            Optional.of(
                new PermitDetailDto(
                    7000123L,
                    1000456L,
                    "PKG-903",
                    "EX-205",
                    "ISS",
                    "Issued",
                    "00055667",
                    "01",
                    "00077881",
                    "03",
                    "Sample Buyer",
                    "US",
                    "VSL",
                    "Pacific Carrier",
                    "VAN",
                    null,
                    LocalDate.of(2026, 3, 15),
                    LocalDate.of(2026, 6, 15),
                    LocalDate.of(2026, 3, 10),
                    LocalDate.of(2026, 3, 20),
                    95.0,
                    28,
                    "RCT-991",
                    "FED-123",
                    "INV-456",
                    "",
                    "R2")));

    var result = service.getPermitSummary(7000123L);

    assertThat(result).isPresent();
    assertThat(result.get().permitNumber()).isEqualTo(7000123L);
    assertThat(result.get().exemptionNumber()).isEqualTo("EX-205");
    assertThat(result.get().totalVolume()).isEqualTo(95.0);
    assertThat(result.get().totalPieces()).isEqualTo(28L);
    assertThat(result.get().totalFees()).isEqualTo(95.0);
    assertThat(result.get().receiptNumber()).isEqualTo("RCT-991");
  }
}

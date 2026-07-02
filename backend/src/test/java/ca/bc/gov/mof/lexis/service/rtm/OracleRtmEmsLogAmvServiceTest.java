package ca.bc.gov.mof.lexis.service.rtm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.rtm.RtmEmsLogAmvUploadResultDto;
import ca.bc.gov.mof.lexis.repository.rtm.OracleRtmEmsLogAmvRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

class OracleRtmEmsLogAmvServiceTest {

  private static final Clock FIXED_CLOCK =
      Clock.fixed(Instant.parse("2026-06-23T12:00:00Z"), ZoneOffset.UTC);

  @Test
  void shouldInstantiateWithRepositoryConstructorInOracleProfile() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles("oracle");
      context.registerBean(
          OracleRtmEmsLogAmvRepository.class,
          () -> mock(OracleRtmEmsLogAmvRepository.class));
      context.register(OracleRtmEmsLogAmvService.class);

      context.refresh();

      assertThat(context.getBean(RtmEmsLogAmvService.class))
          .isInstanceOf(OracleRtmEmsLogAmvService.class);
    }
  }

  @Test
  void shouldDefaultFindUpdateDateToRetrievalDate() {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.find(anyString(), anyString(), any(LocalDate.class), any(LocalDate.class)))
        .thenReturn(List.of());
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    service.find("HE", "O", "2026-06-01", "");

    verify(repository)
        .find("HE", "O", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 1));
  }

  @Test
  void shouldUploadMatrixWorkbookWithLegacyUpdateProcedure() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn("0");
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook(), null, null);

    assertThat(result.status()).isEqualTo("accepted");
    assertThat(result.attemptedRowCount()).isEqualTo(12);
    assertThat(result.uploadedRowCount()).isEqualTo(12);
    verify(repository, times(12))
        .update(
            anyString(),
            anyString(),
            anyString(),
            eq(LocalDate.of(2026, 5, 1)),
            eq(LocalDate.of(2026, 6, 1)),
            any(BigDecimal.class));
    verify(repository, never())
        .insert(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(BigDecimal.class));
  }

  @Test
  void shouldUploadPineCellsToFunctionalPineCodes() throws IOException {
    OracleRtmEmsLogAmvRepository repository = mock(OracleRtmEmsLogAmvRepository.class);
    when(repository.update(
            anyString(),
            anyString(),
            anyString(),
            any(LocalDate.class),
            any(LocalDate.class),
            any(BigDecimal.class)))
        .thenReturn("0");
    OracleRtmEmsLogAmvService service = new OracleRtmEmsLogAmvService(repository, FIXED_CLOCK);

    RtmEmsLogAmvUploadResultDto result = service.upload(matrixWorkbook(), null, null);

    ArgumentCaptor<String> speciesCaptor = ArgumentCaptor.forClass(String.class);
    assertThat(result.status()).isEqualTo("accepted");
    verify(repository, times(12))
        .update(
            speciesCaptor.capture(),
            anyString(),
            anyString(),
            eq(LocalDate.of(2026, 5, 1)),
            eq(LocalDate.of(2026, 6, 1)),
            any(BigDecimal.class));
    assertThat(speciesCaptor.getAllValues())
        .contains("WH", "LO", "YE")
        .doesNotContain("PL", "PW", "PY");
  }

  private MultipartFile matrixWorkbook() throws IOException {
    return new MockMultipartFile(
        "file",
        "matrix.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        RtmEmsLogAmvWorkbookTestFixtures.matrixWorkbook());
  }
}

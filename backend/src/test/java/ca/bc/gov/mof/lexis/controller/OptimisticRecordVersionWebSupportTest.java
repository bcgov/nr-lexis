package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class OptimisticRecordVersionWebSupportTest {

  private static final OptimisticRecordVersion EXEMPTION_VERSION =
      new OptimisticRecordVersion(
          OptimisticRecordType.EXEMPTION,
          "440/2015",
          Instant.parse("2026-07-15T16:00:00Z"),
          "IDIR\\EDITOR",
          "abcdef");
  private static final OptimisticRecordVersion PERMIT_VERSION =
      new OptimisticRecordVersion(
          OptimisticRecordType.PERMIT,
          "77631",
          Instant.parse("2026-07-15T16:00:00Z"),
          "IDIR\\EDITOR",
          "123456");

  @Test
  void interceptorShouldPreReadVersionForMainExemptionDetail() {
    OracleOptimisticRecordVersionService versionService =
        mock(OracleOptimisticRecordVersionService.class);
    when(versionService.find(OptimisticRecordType.EXEMPTION, "440/2015"))
        .thenReturn(Optional.of(EXEMPTION_VERSION));
    MockHttpServletRequest request =
        new MockHttpServletRequest("GET", "/api/lexis/exemptions/440%2F2015");

    new OptimisticRecordVersionInterceptor(versionService)
        .preHandle(request, new MockHttpServletResponse(), new Object());

    assertThat(
            request.getAttribute(
                OptimisticRecordVersionInterceptor.RECORD_VERSION_ATTRIBUTE))
        .isEqualTo(EXEMPTION_VERSION);
  }

  @Test
  void interceptorShouldPreReadVersionForMainPermitDetail() {
    OracleOptimisticRecordVersionService versionService =
        mock(OracleOptimisticRecordVersionService.class);
    when(versionService.find(OptimisticRecordType.PERMIT, "77631"))
        .thenReturn(Optional.of(PERMIT_VERSION));
    MockHttpServletRequest request =
        new MockHttpServletRequest("GET", "/api/lexis/permits/77631");

    new OptimisticRecordVersionInterceptor(versionService)
        .preHandle(request, new MockHttpServletResponse(), new Object());

    assertThat(
            request.getAttribute(
                OptimisticRecordVersionInterceptor.RECORD_VERSION_ATTRIBUTE))
        .isEqualTo(PERMIT_VERSION);
  }

  @Test
  void responseAdviceShouldReturnFreshMutationVersionForAnyResponseBody() {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/lexis/rpc/test");
    request.setAttribute(
        OptimisticLockRequestReader.RESPONSE_VERSION_ATTRIBUTE, PERMIT_VERSION);
    HttpHeaders headers = writeResponse(Map.of("success", true), request);

    assertThat(headers.getFirst(OptimisticLockHeaders.RECORD_VERSION))
        .isEqualTo(PERMIT_VERSION.token());
    assertThat(headers.getETag()).isEqualTo('"' + PERMIT_VERSION.token() + '"');
  }

  @Test
  void responseAdviceShouldReturnPreReadVersionForMainDetailDtos() {
    MockHttpServletRequest exemptionRequest =
        new MockHttpServletRequest("GET", "/api/lexis/exemptions/440%2F2015");
    exemptionRequest.setAttribute(
        OptimisticRecordVersionInterceptor.RECORD_VERSION_ATTRIBUTE, EXEMPTION_VERSION);
    MockHttpServletRequest permitRequest =
        new MockHttpServletRequest("GET", "/api/lexis/permits/77631");
    permitRequest.setAttribute(
        OptimisticRecordVersionInterceptor.RECORD_VERSION_ATTRIBUTE, PERMIT_VERSION);

    assertThat(
            writeResponse(exemptionDetail(), exemptionRequest)
                .getFirst(OptimisticLockHeaders.RECORD_VERSION))
        .isEqualTo(EXEMPTION_VERSION.token());
    assertThat(
            writeResponse(permitDetail(), permitRequest)
                .getFirst(OptimisticLockHeaders.RECORD_VERSION))
        .isEqualTo(PERMIT_VERSION.token());
  }

  private ExemptionDetailDto exemptionDetail() {
    return new ExemptionDetailDto(
        "440/2015",
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
        0,
        0,
        0,
        null,
        false,
        List.of(),
        List.of());
  }

  private PermitDetailDto permitDetail() {
    return new PermitDetailDto(
        77631L,
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
        null,
        null,
        null,
        null,
        null,
        0,
        0,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null);
  }

  private HttpHeaders writeResponse(Object body, MockHttpServletRequest servletRequest) {
    HttpHeaders headers = new HttpHeaders();
    ServerHttpResponse response = mock(ServerHttpResponse.class);
    when(response.getHeaders()).thenReturn(headers);
    new OptimisticRecordVersionResponseAdvice()
        .beforeBodyWrite(
            body,
            mock(MethodParameter.class),
            MediaType.APPLICATION_JSON,
            MappingJackson2HttpMessageConverter.class,
            new ServletServerHttpRequest(servletRequest),
            response);
    return headers;
  }
}

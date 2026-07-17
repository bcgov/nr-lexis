package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.dto.application.LexisApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.exemption.ExemptionDetailDto;
import ca.bc.gov.mof.lexis.dto.federal.FederalApplicationDetailDto;
import ca.bc.gov.mof.lexis.dto.offer.PurchaseOfferDetailDto;
import ca.bc.gov.mof.lexis.dto.permit.PermitDetailDto;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockHeaders;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

@ControllerAdvice
class OptimisticRecordVersionResponseAdvice implements ResponseBodyAdvice<Object> {

  @Override
  public boolean supports(
      MethodParameter returnType,
      Class<? extends HttpMessageConverter<?>> converterType) {
    return true;
  }

  @Override
  public Object beforeBodyWrite(
      Object body,
      MethodParameter returnType,
      MediaType selectedContentType,
      Class<? extends HttpMessageConverter<?>> selectedConverterType,
      ServerHttpRequest request,
      ServerHttpResponse response) {
    if (!(request instanceof ServletServerHttpRequest servletRequest)) {
      return body;
    }
    Object attribute =
        servletRequest
            .getServletRequest()
            .getAttribute(OptimisticLockRequestReader.RESPONSE_VERSION_ATTRIBUTE);
    if (!(attribute instanceof OptimisticRecordVersion) && isVersionedDetail(body)) {
      attribute =
          servletRequest
              .getServletRequest()
              .getAttribute(OptimisticRecordVersionInterceptor.RECORD_VERSION_ATTRIBUTE);
    }
    if (attribute instanceof OptimisticRecordVersion version) {
      response.getHeaders().set(OptimisticLockHeaders.RECORD_VERSION, version.token());
      response.getHeaders().setETag('"' + version.token() + '"');
    }
    return body;
  }

  private boolean isVersionedDetail(Object body) {
    return body instanceof LexisApplicationDetailDto
        || body instanceof ExemptionDetailDto
        || body instanceof FederalApplicationDetailDto
        || body instanceof PurchaseOfferDetailDto
        || body instanceof PermitDetailDto
        || body instanceof ExemptionDetailsRpcController.ExemptionEditContextResponseDto
        || body instanceof PermitDetailsRpcController.PermitEditContextResponseDto;
  }
}

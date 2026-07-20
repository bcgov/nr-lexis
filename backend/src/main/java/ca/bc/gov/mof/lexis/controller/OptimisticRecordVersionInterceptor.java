package ca.bc.gov.mof.lexis.controller;

import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordType;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticRecordVersion;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriUtils;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@Profile("oracle")
public class OptimisticRecordVersionInterceptor implements HandlerInterceptor {

  static final String RECORD_VERSION_ATTRIBUTE =
      OptimisticRecordVersionInterceptor.class.getName() + ".recordVersion";

  private static final Pattern APPLICATION_PATH =
      Pattern.compile("^/api/lexis/(?:federal/)?applications/(\\d+)$");
  private static final Pattern OFFER_PATH =
      Pattern.compile("^/api/lexis/purchase-offers/(\\d+)$");
  private static final Pattern EXEMPTION_PATH =
      Pattern.compile("^/api/lexis/exemptions/([^/]+)$");

  private final OracleOptimisticRecordVersionService versionService;

  public OptimisticRecordVersionInterceptor(OracleOptimisticRecordVersionService versionService) {
    this.versionService = versionService;
  }

  @Override
  public boolean preHandle(
      HttpServletRequest request, HttpServletResponse response, Object handler) {
    if (!"GET".equalsIgnoreCase(request.getMethod())) {
      return true;
    }
    target(request)
        .flatMap(target -> versionService.find(target.recordType(), target.recordId()))
        .ifPresent(version -> request.setAttribute(RECORD_VERSION_ATTRIBUTE, version));
    return true;
  }

  private Optional<RecordTarget> target(HttpServletRequest request) {
    String path = request.getRequestURI().substring(request.getContextPath().length());
    Matcher application = APPLICATION_PATH.matcher(path);
    if (application.matches()) {
      return Optional.of(
          new RecordTarget(OptimisticRecordType.APPLICATION, application.group(1)));
    }
    Matcher offer = OFFER_PATH.matcher(path);
    if (offer.matches()) {
      return Optional.of(new RecordTarget(OptimisticRecordType.OFFER, offer.group(1)));
    }
    Matcher exemption = EXEMPTION_PATH.matcher(path);
    if (exemption.matches()) {
      return Optional.of(
          new RecordTarget(
              OptimisticRecordType.EXEMPTION,
              UriUtils.decode(exemption.group(1), StandardCharsets.UTF_8)));
    }
    if ("/api/lexis/rpc/exemption-details/edit-context".equals(path)) {
      return parameterTarget(request, "exemptionNumber", OptimisticRecordType.EXEMPTION);
    }
    if ("/api/lexis/rpc/permit-details/edit-context".equals(path)) {
      return parameterTarget(request, "permitNumber", OptimisticRecordType.PERMIT);
    }
    return Optional.empty();
  }

  private Optional<RecordTarget> parameterTarget(
      HttpServletRequest request, String parameter, OptimisticRecordType recordType) {
    String value = request.getParameter(parameter);
    return value == null || value.isBlank()
        ? Optional.empty()
        : Optional.of(new RecordTarget(recordType, value));
  }

  private record RecordTarget(OptimisticRecordType recordType, String recordId) {}
}

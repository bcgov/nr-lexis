package ca.bc.gov.mof.lexis.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

/**
 * The actions the route rules authorized for the current request. Record checks use them so a
 * regional grant limits what a request does, not only what its screen shows: province-wide Read
 * Only plus Cariboo Application Approver may open a Skeena permit but not save it.
 */
public final class LexisRequestActions {

  private static final String ATTRIBUTE = LexisRequestActions.class.getName();

  private LexisRequestActions() {}

  public static void record(HttpServletRequest request, List<String> actions) {
    if (request != null && actions != null && !actions.isEmpty()) {
      request.setAttribute(ATTRIBUTE, List.copyOf(actions));
    }
  }

  /** Empty outside a request, or when a route is authorized by role rather than action. */
  public static List<String> current() {
    RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
    Object actions =
        attributes == null ? null : attributes.getAttribute(ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
    return actions instanceof List<?> values
        ? values.stream().filter(String.class::isInstance).map(String.class::cast).toList()
        : List.of();
  }
}

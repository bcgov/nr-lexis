package ca.bc.gov.mof.lexis.service.session;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

@Component
@RequestScope
public class ForestClientSelectionContext {

  public static final String HEADER_NAME = "X-Lexis-Forest-Client-Number";

  private final HttpServletRequest request;

  public ForestClientSelectionContext(HttpServletRequest request) {
    this.request = request;
  }

  public String selectedForestClientNumber() {
    return trimToNull(request.getHeader(HEADER_NAME));
  }
}

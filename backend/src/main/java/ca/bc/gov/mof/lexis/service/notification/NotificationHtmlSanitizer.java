package ca.bc.gov.mof.lexis.service.notification;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
public class NotificationHtmlSanitizer {

  private static final PolicyFactory POLICY =
      new HtmlPolicyBuilder()
          .allowElements("p", "br", "strong", "em", "u", "s", "ul", "ol", "li")
          .allowElements("a")
          .allowAttributes("href")
          .onElements("a")
          .allowUrlProtocols("https", "mailto")
          .requireRelNofollowOnLinks()
          .toFactory();

  public String sanitize(String contentHtml) {
    return contentHtml == null ? "" : POLICY.sanitize(contentHtml);
  }

  public String sanitizePlainText(String value) {
    String sanitized = sanitize(value).replaceAll("<[^>]*>", "");
    return HtmlUtils.htmlUnescape(sanitized)
        .replace('\u00a0', ' ')
        .replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", "");
  }
}

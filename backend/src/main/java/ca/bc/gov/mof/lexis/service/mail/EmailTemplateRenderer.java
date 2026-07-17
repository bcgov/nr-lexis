package ca.bc.gov.mof.lexis.service.mail;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

/** Renders cached plaintext classpath templates using named placeholders. */
@Component
public class EmailTemplateRenderer {

  private static final Logger LOGGER = LoggerFactory.getLogger(EmailTemplateRenderer.class);
  private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*(\\w+)\\s*}}");
  private static final String TEMPLATE_ROOT = "mail/template/";

  private final Map<String, String> cache = new ConcurrentHashMap<>();

  public String render(String templateName, Map<String, String> context) {
    String body = cache.computeIfAbsent(templateName, this::loadFromClasspath);
    Matcher matcher = PLACEHOLDER.matcher(body);
    StringBuilder rendered = new StringBuilder();
    while (matcher.find()) {
      String key = matcher.group(1);
      String value = context.get(key);
      if (value == null) {
        if (!context.containsKey(key)) {
          LOGGER.warn(
              "Email template {} references {{{}}} without a context value; rendering empty.",
              templateName,
              key);
        }
        value = "";
      }
      matcher.appendReplacement(rendered, Matcher.quoteReplacement(value));
    }
    matcher.appendTail(rendered);
    return rendered.toString();
  }

  private String loadFromClasspath(String templateName) {
    String path = TEMPLATE_ROOT + templateName + ".txt";
    try (var input = new ClassPathResource(path).getInputStream()) {
      return StreamUtils.copyToString(input, StandardCharsets.UTF_8);
    } catch (IOException ex) {
      throw new IllegalStateException("Failed to load email template " + path, ex);
    }
  }
}

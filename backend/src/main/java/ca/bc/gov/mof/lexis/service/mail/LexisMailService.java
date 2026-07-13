package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class LexisMailService {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisMailService.class);
  private static final String DEFAULT_FROM_ADDRESS = "Provincial.Log.Export.Analyst@gov.bc.ca";

  private final JavaMailSender mailSender;
  private final boolean enabled;
  private final boolean nonProduction;
  private final String fromAddress;
  private final List<String> overrideRecipients;

  public LexisMailService(
      JavaMailSender mailSender,
      @Value("${lexis.mail.enabled:false}") boolean enabled,
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.from:" + DEFAULT_FROM_ADDRESS + "}") String fromAddress,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients) {
    this.mailSender = mailSender;
    this.enabled = enabled;
    this.nonProduction = nonProduction;
    this.fromAddress = trimToNull(fromAddress) == null ? DEFAULT_FROM_ADDRESS : fromAddress.trim();
    this.overrideRecipients = parseAddresses(overrideRecipients);
  }

  public boolean send(String subject, String body, List<String> recipients) {
    return send(subject, body, recipients, List.of());
  }

  public boolean send(
      String subject, String body, List<String> recipients, List<String> copyRecipients) {
    List<String> normalizedTo = validAddresses(recipients);
    List<String> normalizedCc = validAddresses(copyRecipients);
    if (!enabled) {
      LOGGER.info("event=lexis_email_delivery outcome=disabled");
      return false;
    }
    if (normalizedTo.isEmpty()) {
      LOGGER.warn("event=lexis_email_delivery outcome=no_valid_recipient");
      return false;
    }
    if (nonProduction && overrideRecipients.isEmpty()) {
      LOGGER.error("event=lexis_email_delivery outcome=missing_nonprod_override");
      return false;
    }

    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(fromAddress);
    if (nonProduction) {
      message.setTo(overrideRecipients.toArray(String[]::new));
      message.setSubject("[NON-PROD] " + safe(subject));
      message.setText(
          "Original To: "
              + String.join(", ", normalizedTo)
              + (normalizedCc.isEmpty() ? "" : "\nOriginal Cc: " + String.join(", ", normalizedCc))
              + "\n\n"
              + safe(body));
    } else {
      message.setTo(normalizedTo.toArray(String[]::new));
      if (!normalizedCc.isEmpty()) {
        message.setCc(normalizedCc.toArray(String[]::new));
      }
      message.setSubject(safe(subject));
      message.setText(safe(body));
    }

    try {
      mailSender.send(message);
      return true;
    } catch (MailException ex) {
      LOGGER.error(
          "event=lexis_email_delivery outcome=transport_failed failureType={}",
          exceptionType(ex));
      return false;
    }
  }

  private List<String> parseAddresses(String csv) {
    if (trimToNull(csv) == null) {
      return List.of();
    }
    return validAddresses(Arrays.asList(csv.split("[,;]")));
  }

  private List<String> validAddresses(List<String> values) {
    if (values == null) {
      return List.of();
    }
    Set<String> addresses = new LinkedHashSet<>();
    for (String value : values) {
      String normalized = trimToNull(value);
      if (normalized != null && isValidAddress(normalized)) {
        addresses.add(normalized);
      }
    }
    return List.copyOf(addresses);
  }

  private boolean isValidAddress(String value) {
    try {
      InternetAddress address = new InternetAddress(value, true);
      address.validate();
      return value.length() <= 254;
    } catch (AddressException ex) {
      return false;
    }
  }

  private String safe(String value) {
    return value == null ? "" : value;
  }
}

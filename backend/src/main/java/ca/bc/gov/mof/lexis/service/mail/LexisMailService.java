package ca.bc.gov.mof.lexis.service.mail;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;
import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class LexisMailService {

  private static final Logger LOGGER = LoggerFactory.getLogger(LexisMailService.class);
  private static final Set<String> INTERCEPTABLE_ROUTE_LABELS =
      Set.of("REGION_RCO", "REGION_RNI", "REGION_RSI");

  private final JavaMailSender mailSender;
  private final boolean nonProduction;
  private final String fromAddress;
  private final List<String> overrideRecipients;
  private final String environment;
  private final RegionalMailRecipientResolver regionalMailRecipientResolver;

  @Autowired
  public LexisMailService(
      JavaMailSender mailSender,
      @Value("${lexis.mail.non-production:true}") boolean nonProduction,
      @Value("${lexis.mail.from:}") String fromAddress,
      @Value("${lexis.mail.override-recipients:}") String overrideRecipients,
      @Value("${lexis.mail.environment:non-prod}") String environment,
      RegionalMailRecipientResolver regionalMailRecipientResolver) {
    this.mailSender = mailSender;
    this.nonProduction = nonProduction;
    this.fromAddress = trimToNull(fromAddress) == null ? "" : fromAddress.trim();
    this.overrideRecipients = parseAddresses(overrideRecipients);
    this.environment = subjectLabel(environment, "NON-PROD").toUpperCase(Locale.ROOT);
    this.regionalMailRecipientResolver = regionalMailRecipientResolver;
  }

  /** Convenience constructor for callers that only use the provincial sender. */
  public LexisMailService(
      JavaMailSender mailSender,
      boolean nonProduction,
      String fromAddress,
      String overrideRecipients,
      String environment) {
    this(
        mailSender,
        nonProduction,
        fromAddress,
        overrideRecipients,
        environment,
        new RegionalMailRecipientResolver("", "", ""));
  }

  public boolean send(String subject, String body, List<String> recipients) {
    return send(subject, body, recipients, List.of(), null, null);
  }

  public boolean send(
      String subject, String body, List<String> recipients, List<String> copyRecipients) {
    return send(subject, body, recipients, copyRecipients, null, null);
  }

  public boolean send(
      String subject,
      String body,
      List<String> recipients,
      List<String> copyRecipients,
      String recipientRouteLabel,
      String copyRecipientRouteLabel) {
    return send(
        subject,
        body,
        recipients,
        copyRecipients,
        recipientRouteLabel,
        copyRecipientRouteLabel,
        RegionalMailRoute.GENERAL);
  }

  public boolean send(
      String subject,
      String body,
      List<String> recipients,
      List<String> copyRecipients,
      String recipientRouteLabel,
      String copyRecipientRouteLabel,
      RegionalMailRoute senderRoute) {
    List<String> normalizedTo = validAddresses(recipients);
    List<String> normalizedCc = validAddresses(copyRecipients);
    String senderAddress = senderAddress(senderRoute);
    if (!isValidAddress(senderAddress)) {
      LOGGER.warn("event=lexis_email_delivery outcome=no_valid_sender");
      return false;
    }
    boolean intercept = nonProduction && !overrideRecipients.isEmpty();
    boolean routeOnlyTo =
        intercept
            && normalizedTo.isEmpty()
            && isInterceptableRouteLabel(recipientRouteLabel);
    if (normalizedTo.isEmpty() && !routeOnlyTo) {
      LOGGER.warn("event=lexis_email_delivery outcome=no_valid_recipient");
      return false;
    }
    boolean routeOnlyCc =
        intercept
            && normalizedCc.isEmpty()
            && isInterceptableRouteLabel(copyRecipientRouteLabel);

    SimpleMailMessage message = new SimpleMailMessage();
    message.setFrom(senderAddress);
    if (intercept) {
      message.setTo(overrideRecipients.toArray(String[]::new));
      message.setSubject(
          "["
              + environment
              + " - From "
              + intendedSender(senderAddress, senderRoute)
              + " - "
              + intendedRecipient(normalizedTo, recipientRouteLabel)
              + (normalizedCc.isEmpty() && !routeOnlyCc
                  ? ""
                  : "; CC " + intendedRecipient(normalizedCc, copyRecipientRouteLabel))
              + "] "
              + safe(subject));
      message.setText(
          "Original From: "
              + intendedSender(senderAddress, senderRoute)
              + "\nOriginal To: "
              + originalRecipient(normalizedTo, recipientRouteLabel)
              + (normalizedCc.isEmpty() && !routeOnlyCc
                  ? ""
                  : "\nOriginal Cc: "
                      + originalRecipient(normalizedCc, copyRecipientRouteLabel))
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

  private String intendedRecipient(List<String> recipients, String routeLabel) {
    return subjectLabel(routeLabel, String.join(", ", recipients));
  }

  private String intendedSender(String senderAddress, RegionalMailRoute senderRoute) {
    RegionalMailRoute route = senderRoute == null ? RegionalMailRoute.GENERAL : senderRoute;
    return route.label() + " <" + senderAddress + ">";
  }

  private String senderAddress(RegionalMailRoute senderRoute) {
    if (senderRoute == null || senderRoute == RegionalMailRoute.GENERAL) {
      return fromAddress;
    }
    return regionalMailRecipientResolver.addressFor(senderRoute).orElse("");
  }

  private String originalRecipient(List<String> recipients, String routeLabel) {
    if (!recipients.isEmpty()) {
      return String.join(", ", recipients);
    }
    return subjectLabel(routeLabel, "Not configured") + " (not configured)";
  }

  private boolean isInterceptableRouteLabel(String routeLabel) {
    String normalized = trimToNull(routeLabel);
    return normalized != null
        && INTERCEPTABLE_ROUTE_LABELS.contains(normalized.toUpperCase(Locale.ROOT));
  }

  private String subjectLabel(String value, String fallback) {
    String normalized = trimToNull(value);
    if (normalized == null) {
      return fallback;
    }
    return normalized.replace('\r', ' ').replace('\n', ' ').trim();
  }

  private String safe(String value) {
    return value == null ? "" : value;
  }
}

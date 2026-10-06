package ca.bc.gov.mof.lexis.service.scan;

public class VirusScanException extends RuntimeException {

  // Figma copy for a file item that fails the scan: the first sentence is its error title.
  public static final String INFECTED_MESSAGE =
      "File did not pass the security scan. "
          + "Check it with your own antivirus software, or upload a different copy.";

  private final String userMessage;

  private VirusScanException(String userMessage, String detail, Throwable cause) {
    super(detail == null ? userMessage : detail, cause);
    this.userMessage = userMessage;
  }

  public static VirusScanException infected(String detail) {
    return new VirusScanException(INFECTED_MESSAGE, detail, null);
  }

  public static VirusScanException unavailable(String detail, Throwable cause) {
    return new VirusScanException(
        "Virus scanning is unavailable. Try uploading again later.", detail, cause);
  }

  public String userMessage() {
    return userMessage;
  }
}

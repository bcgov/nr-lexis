package ca.bc.gov.mof.lexis.service.scan;

public class VirusScanException extends RuntimeException {

  private final String userMessage;

  private VirusScanException(String userMessage, String detail, Throwable cause) {
    super(detail == null ? userMessage : detail, cause);
    this.userMessage = userMessage;
  }

  public static VirusScanException infected(String detail) {
    return new VirusScanException("The uploaded file failed virus scanning.", detail, null);
  }

  public static VirusScanException unavailable(String detail, Throwable cause) {
    return new VirusScanException(
        "Virus scanning is unavailable. Try uploading again later.", detail, cause);
  }

  public String userMessage() {
    return userMessage;
  }
}

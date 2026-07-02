package ca.bc.gov.mof.lexis.service.report;

import java.util.Locale;

public enum LexisReportFormat {
  PDF("pdf", "application/pdf"),
  CSV("csv", "application/vnd.ms-excel"),
  XLS("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  XLSX("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  DOC("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  DOCX("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  RTF("rtf", "application/rtf");

  private final String extension;
  private final String mediaType;

  LexisReportFormat(String extension, String mediaType) {
    this.extension = extension;
    this.mediaType = mediaType;
  }

  public String extension() {
    return extension;
  }

  public String mediaType() {
    return mediaType;
  }

  public static LexisReportFormat fromNullable(String format) {
    if (format == null || format.isBlank()) {
      return PDF;
    }

    String normalized = format.trim().toUpperCase(Locale.ROOT);
    try {
      return valueOf(normalized);
    } catch (IllegalArgumentException ex) {
      return PDF;
    }
  }
}

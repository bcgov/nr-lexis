package ca.bc.gov.mof.lexis.service.report;

import java.io.IOException;
import java.io.Writer;
import java.util.Objects;

/** Rewrites Jasper CSV incrementally while neutralizing spreadsheet formulas. */
final class CsvSanitizingWriter extends Writer {

  private final Writer delegate;
  private final StringBuilder cell = new StringBuilder();
  private boolean quoted;
  private boolean quotePending;
  private boolean rowStarted;
  private boolean carriageReturnWritten;
  private boolean closed;

  CsvSanitizingWriter(Writer delegate) {
    this.delegate = Objects.requireNonNull(delegate, "delegate");
  }

  @Override
  public void write(char[] characters, int offset, int length) throws IOException {
    Objects.checkFromIndexSize(offset, length, characters.length);
    ensureOpen();
    for (int index = offset; index < offset + length; index++) {
      accept(characters[index]);
    }
  }

  @Override
  public void write(int character) throws IOException {
    ensureOpen();
    accept((char) character);
  }

  @Override
  public void flush() throws IOException {
    ensureOpen();
    delegate.flush();
  }

  @Override
  public void close() throws IOException {
    if (closed) {
      return;
    }
    if (quotePending) {
      quotePending = false;
      quoted = false;
    }
    if (rowStarted || !cell.isEmpty()) {
      writeSafeCell();
      delegate.write('\n');
    }
    closed = true;
    delegate.close();
  }

  private void accept(char current) throws IOException {
    if (carriageReturnWritten) {
      carriageReturnWritten = false;
      if (current == '\n') {
        return;
      }
    }

    if (quoted) {
      if (quotePending) {
        if (current == '"') {
          cell.append('"');
          quotePending = false;
          rowStarted = true;
          return;
        }
        quoted = false;
        quotePending = false;
        accept(current);
        return;
      }
      if (current == '"') {
        quotePending = true;
      } else {
        cell.append(current);
        rowStarted = true;
      }
      return;
    }

    if (current == '"' && cell.isEmpty()) {
      quoted = true;
      rowStarted = true;
    } else if (current == ',') {
      writeSafeCell();
      delegate.write(',');
      rowStarted = true;
    } else if (current == '\r' || current == '\n') {
      writeSafeCell();
      delegate.write('\n');
      rowStarted = false;
      carriageReturnWritten = current == '\r';
    } else {
      cell.append(current);
      rowStarted = true;
    }
  }

  private void writeSafeCell() throws IOException {
    String sanitized =
        cell.toString().replace("\"", "\"\"").replace("\n", "").replace("\r", "").replace("\f", "");
    String candidate = sanitized.stripLeading();
    boolean startsWithControl = !sanitized.isEmpty() && sanitized.charAt(0) == '\t';
    boolean startsWithFormula =
        !candidate.isEmpty()
            && (candidate.charAt(0) == '='
                || candidate.charAt(0) == '+'
                || candidate.charAt(0) == '-'
                || candidate.charAt(0) == '@');
    delegate.write('"');
    if (startsWithControl || startsWithFormula) {
      delegate.write('\'');
    }
    delegate.write(sanitized);
    delegate.write('"');
    cell.setLength(0);
  }

  private void ensureOpen() throws IOException {
    if (closed) {
      throw new IOException("CSV writer is closed.");
    }
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class TemporaryReportStreamingBodyTest {

  @Test
  void successfulTransferShouldDeleteTheTemporaryFileAndNotifyTheObserver() throws Exception {
    byte[] content = new byte[] {1, 2, 3};
    AtomicBoolean successful = new AtomicBoolean();
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.stage(
            content,
            (completed, durationNanos) -> {
              successful.set(completed);
              assertThat(durationNanos).isNotNegative();
            });
    Path temporaryFile = body.temporaryFile();
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    body.writeTo(output);

    assertThat(output.toByteArray()).containsExactly(content);
    assertThat(successful).isTrue();
    assertThat(temporaryFile).doesNotExist();
  }

  @Test
  void failedTransferShouldDeleteTheTemporaryFileAndNotifyTheObserver() throws Exception {
    AtomicBoolean successful = new AtomicBoolean(true);
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.stage(
            new byte[] {1, 2, 3},
            (completed, durationNanos) -> successful.set(completed));
    Path temporaryFile = body.temporaryFile();
    OutputStream failingOutput =
        new OutputStream() {
          @Override
          public void write(int value) throws IOException {
            throw new IOException("client disconnected");
          }

          @Override
          public void write(byte[] bytes, int offset, int length) throws IOException {
            throw new IOException("client disconnected");
          }
        };

    assertThatThrownBy(() -> body.writeTo(failingOutput))
        .isInstanceOf(IOException.class)
        .hasMessageContaining("client disconnected");
    assertThat(successful).isFalse();
    assertThat(temporaryFile).doesNotExist();
  }

  @Test
  void observerFailureShouldNotInterruptTransferOrCleanup() throws Exception {
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.stage(
            new byte[] {4, 5},
            (completed, durationNanos) -> {
              throw new IllegalStateException("metrics unavailable");
            });
    Path temporaryFile = body.temporaryFile();
    ByteArrayOutputStream output = new ByteArrayOutputStream();

    body.writeTo(output);

    assertThat(output.toByteArray()).containsExactly(4, 5);
    assertThat(Files.exists(temporaryFile)).isFalse();
  }
}

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
    Path artifact = Files.createTempFile("lexis-report-test-", ".tmp");
    Files.write(artifact, content);
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.fromArtifact(
            artifact,
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
    Path artifact = Files.createTempFile("lexis-report-test-", ".tmp");
    Files.write(artifact, new byte[] {1, 2, 3});
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.fromArtifact(
            artifact,
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
    Path artifact = Files.createTempFile("lexis-report-test-", ".tmp");
    Files.write(artifact, new byte[] {4, 5});
    TemporaryReportStreamingBody body =
        TemporaryReportStreamingBody.fromArtifact(
            artifact,
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

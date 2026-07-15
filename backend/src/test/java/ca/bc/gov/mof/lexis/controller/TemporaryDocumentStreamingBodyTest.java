package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TemporaryDocumentStreamingBodyTest {

  @TempDir Path temporaryDirectory;

  @Test
  void shouldStageContentBeforeWritingToClient() throws Exception {
    AtomicBoolean staged = new AtomicBoolean(false);
    TemporaryDocumentStreamingBody body =
        TemporaryDocumentStreamingBody.stream(
            output -> {
              output.write(new byte[] {1, 2, 3});
              staged.set(true);
            },
            temporaryDirectory);
    ByteArrayOutputStream client = new ByteArrayOutputStream();

    body.writeTo(
        new OutputStream() {
          @Override
          public void write(int value) {
            assertThat(staged).isTrue();
            client.write(value);
          }
        });

    assertThat(client.toByteArray()).containsExactly(1, 2, 3);
    try (var files = Files.list(temporaryDirectory)) {
      assertThat(files).isEmpty();
    }
  }

  @Test
  void shouldRemoveStagedFileWhenClientTransferFails() {
    TemporaryDocumentStreamingBody body =
        TemporaryDocumentStreamingBody.stream(
            output -> output.write(new byte[] {1, 2, 3}), temporaryDirectory);

    assertThatThrownBy(
            () ->
                body.writeTo(
                    new OutputStream() {
                      @Override
                      public void write(int value) throws IOException {
                        throw new IOException("client disconnected");
                      }
                    }))
        .isInstanceOf(IOException.class)
        .hasMessage("client disconnected");
    try (var files = uncheckedFiles()) {
      assertThat(files).isEmpty();
    }
  }

  @Test
  void concurrentDocumentTransfersShouldNotBeSerializedByTheApplication() throws Exception {
    CountDownLatch allStarted = new CountDownLatch(5);
    CountDownLatch release = new CountDownLatch(1);
    @SuppressWarnings("unchecked")
    Future<Void>[] transfers = new Future[5];

    try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
      for (int index = 0; index < 5; index++) {
        TemporaryDocumentStreamingBody body =
            TemporaryDocumentStreamingBody.stream(
                output -> {
                  allStarted.countDown();
                  try {
                    release.await();
                  } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IOException("staging interrupted", exception);
                  }
                  output.write(1);
                },
                temporaryDirectory);
        transfers[index] =
            executor.submit(
                () -> {
                  body.writeTo(new ByteArrayOutputStream());
                  return null;
                });
      }

      assertThat(allStarted.await(5, TimeUnit.SECONDS)).isTrue();
      release.countDown();
      for (Future<?> transfer : transfers) {
        transfer.get(5, TimeUnit.SECONDS);
      }
    } finally {
      release.countDown();
    }

    try (var files = Files.list(temporaryDirectory)) {
      assertThat(files).isEmpty();
    }
  }

  private java.util.stream.Stream<Path> uncheckedFiles() {
    try {
      return Files.list(temporaryDirectory);
    } catch (IOException exception) {
      throw new AssertionError(exception);
    }
  }
}

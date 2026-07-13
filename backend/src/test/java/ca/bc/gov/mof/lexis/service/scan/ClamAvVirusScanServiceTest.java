package ca.bc.gov.mof.lexis.service.scan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(OutputCaptureExtension.class)
class ClamAvVirusScanServiceTest {

  @Test
  void assertCleanShouldStreamFileToClamAvAndAcceptOkResponse() throws Exception {
    CapturingSocket socket = new CapturingSocket("stream: OK\0");
    MockMultipartFile file =
        new MockMultipartFile("file", "upload.txt", "text/plain", "clean".getBytes(StandardCharsets.UTF_8));
    ClamAvVirusScanService service = service(socket);

    service.assertClean(file);

    assertThat(readStreamedPayload(socket.requestBytes()))
        .isEqualTo("clean".getBytes(StandardCharsets.UTF_8));
  }

  @Test
  void assertCleanShouldRejectFoundResponseWithoutLoggingIngressDetails(CapturedOutput output)
      throws Exception {
    String scannerResponse = "stream: Private-Signature-Value FOUND\0";
    CapturingSocket socket = new CapturingSocket(scannerResponse);
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "private-recipient@example.com\r\nforged=true\u2028unicode=true.txt",
            "text/plain",
            "infected".getBytes(StandardCharsets.UTF_8));
    ClamAvVirusScanService service = service(socket);

    assertThatThrownBy(() -> service.assertClean(file))
        .isInstanceOf(VirusScanException.class)
        .hasMessageContaining("Private-Signature-Value");

    assertThat(readStreamedPayload(socket.requestBytes()))
        .isEqualTo("infected".getBytes(StandardCharsets.UTF_8));
    assertThat(output)
        .contains("event=lexis_upload_scan outcome=infected")
        .doesNotContain("private-recipient@example.com")
        .doesNotContain("Private-Signature-Value")
        .doesNotContain(
            file.getOriginalFilename(), "forged=true", "unicode=true", "\u2028");
  }

  @Test
  void assertCleanShouldRejectAnOversizedDaemonResponse() {
    CapturingSocket socket =
        new CapturingSocket("x".repeat(ClamAvVirusScanService.MAX_RESPONSE_BYTES + 1));
    MockMultipartFile file =
        new MockMultipartFile(
            "file", "upload.txt", "text/plain", "clean".getBytes(StandardCharsets.UTF_8));

    assertThatThrownBy(() -> service(socket).assertClean(file))
        .isInstanceOf(VirusScanException.class)
        .hasMessage("ClamAV scan failed.");
  }

  @Test
  void assertCleanShouldCloseAConnectedSocketWhenClamAvStopsReading() {
    StalledWriteSocket socket = new StalledWriteSocket();
    MockMultipartFile file =
        new MockMultipartFile(
            "file", "upload.txt", "text/plain", "clean".getBytes(StandardCharsets.UTF_8));
    ClamAvVirusScanService service =
        new ClamAvVirusScanService(
            new VirusScanProperties(true, "clamav", 3310, Duration.ofMillis(50), 4),
            (host, port, timeoutMillis) -> socket);

    long startedAt = System.nanoTime();
    assertThatThrownBy(() -> service.assertClean(file))
        .isInstanceOf(VirusScanException.class)
        .hasMessage("ClamAV scan failed.");

    assertThat(socket.wasClosed()).isTrue();
    assertThat(Duration.ofNanos(System.nanoTime() - startedAt)).isLessThan(Duration.ofSeconds(1));
  }

  @Test
  void assertCleanShouldIncludeConnectionTimeInTheOverallDeadline() {
    CapturingSocket socket = new CapturingSocket("stream: OK\0");
    MockMultipartFile file =
        new MockMultipartFile(
            "file", "upload.txt", "text/plain", "clean".getBytes(StandardCharsets.UTF_8));
    ClamAvVirusScanService service =
        new ClamAvVirusScanService(
            new VirusScanProperties(true, "clamav", 3310, Duration.ofMillis(10), 4),
            (host, port, timeoutMillis) -> {
              try {
                Thread.sleep(25);
              } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while connecting.", ex);
              }
              return socket;
            });

    assertThatThrownBy(() -> service.assertClean(file))
        .isInstanceOf(VirusScanException.class)
        .hasMessage("ClamAV scan failed.");
  }

  private ClamAvVirusScanService service(CapturingSocket socket) {
    return new ClamAvVirusScanService(
        new VirusScanProperties(true, "clamav", 3310, Duration.ofSeconds(2), 4),
        (host, port, timeoutMillis) -> socket);
  }

  private byte[] readStreamedPayload(byte[] requestBytes) throws IOException {
    try (DataInputStream inputStream = new DataInputStream(new ByteArrayInputStream(requestBytes))) {
      int commandByte;
      do {
        commandByte = inputStream.read();
      } while (commandByte > 0);

      ByteArrayOutputStream payload = new ByteArrayOutputStream();
      while (true) {
        int chunkSize = inputStream.readInt();
        if (chunkSize == 0) {
          break;
        }
        payload.write(inputStream.readNBytes(chunkSize));
      }
      return payload.toByteArray();
    }
  }

  private static final class CapturingSocket extends Socket {

    private final InputStream inputStream;
    private final ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

    private CapturingSocket(String response) {
      inputStream = new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public InputStream getInputStream() {
      return inputStream;
    }

    @Override
    public OutputStream getOutputStream() {
      return outputStream;
    }

    byte[] requestBytes() {
      return outputStream.toByteArray();
    }
  }

  private static final class StalledWriteSocket extends Socket {

    private final CountDownLatch closed = new CountDownLatch(1);
    private final OutputStream outputStream =
        new OutputStream() {
          @Override
          public void write(int value) throws IOException {
            awaitClose();
          }

          @Override
          public void write(byte[] bytes, int offset, int length) throws IOException {
            awaitClose();
          }
        };

    @Override
    public InputStream getInputStream() {
      return InputStream.nullInputStream();
    }

    @Override
    public OutputStream getOutputStream() {
      return outputStream;
    }

    @Override
    public synchronized void close() {
      closed.countDown();
    }

    boolean wasClosed() {
      return closed.getCount() == 0;
    }

    private void awaitClose() throws IOException {
      try {
        if (!closed.await(2, TimeUnit.SECONDS)) {
          throw new IOException("Test socket was not closed before its deadline.");
        }
      } catch (InterruptedException ex) {
        Thread.currentThread().interrupt();
        throw new IOException("Interrupted while waiting for socket close.", ex);
      }
      throw new IOException("Socket closed at scan deadline.");
    }
  }
}

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
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

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
  void assertCleanShouldRejectFoundResponse() throws Exception {
    CapturingSocket socket = new CapturingSocket("stream: Eicar-Test-Signature FOUND\0");
    MockMultipartFile file =
        new MockMultipartFile("file", "upload.txt", "text/plain", "infected".getBytes(StandardCharsets.UTF_8));
    ClamAvVirusScanService service = service(socket);

    assertThatThrownBy(() -> service.assertClean(file))
        .isInstanceOf(VirusScanException.class)
        .hasMessageContaining("Eicar-Test-Signature");

    assertThat(readStreamedPayload(socket.requestBytes()))
        .isEqualTo("infected".getBytes(StandardCharsets.UTF_8));
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
}

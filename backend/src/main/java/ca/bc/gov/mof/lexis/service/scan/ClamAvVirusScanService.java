package ca.bc.gov.mof.lexis.service.scan;

import static ca.bc.gov.mof.lexis.util.SafeLogFormatter.exceptionType;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ClamAvVirusScanService implements VirusScanService {

  private static final Logger LOGGER = LoggerFactory.getLogger(ClamAvVirusScanService.class);
  private static final byte[] INSTREAM_COMMAND = "zINSTREAM\0".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] END_OF_STREAM = new byte[] {0, 0, 0, 0};
  private static final ScheduledThreadPoolExecutor DEADLINE_SCHEDULER =
      createDeadlineScheduler();
  static final int MAX_RESPONSE_BYTES = 4096;

  private final VirusScanProperties properties;
  private final ClamAvSocketFactory socketFactory;

  @Autowired
  public ClamAvVirusScanService(VirusScanProperties properties) {
    this(properties, ClamAvVirusScanService::openSocket);
  }

  ClamAvVirusScanService(VirusScanProperties properties, ClamAvSocketFactory socketFactory) {
    this.properties = properties;
    this.socketFactory = socketFactory;
  }

  @Override
  public boolean isEnabled() {
    return properties.enabled();
  }

  @Override
  public void assertClean(MultipartFile file) {
    if (!properties.enabled() || file == null || file.isEmpty()) {
      return;
    }

    try (InputStream inputStream = file.getInputStream()) {
      String response = scan(inputStream);
      if (isClean(response)) {
        return;
      }
      if (isInfected(response)) {
        LOGGER.warn("event=lexis_upload_scan outcome=infected");
        throw VirusScanException.infected(response);
      }
      LOGGER.warn("event=lexis_upload_scan outcome=unexpected_response");
      throw VirusScanException.unavailable(response, null);
    } catch (VirusScanException ex) {
      throw ex;
    } catch (IOException ex) {
      LOGGER.warn(
          "event=lexis_upload_scan outcome=unavailable failureType={}", exceptionType(ex));
      throw VirusScanException.unavailable("ClamAV scan failed.", ex);
    }
  }

  private String scan(InputStream inputStream) throws IOException {
    int timeoutMillis = Math.toIntExact(properties.timeout().toMillis());
    long deadlineNanos = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
    byte[] buffer = new byte[properties.chunkSize()];

    try (Socket socket = socketFactory.open(properties.host(), properties.port(), timeoutMillis)) {
      long remainingNanos = deadlineNanos - System.nanoTime();
      if (remainingNanos <= 0) {
        throw new SocketTimeoutException("ClamAV scan exceeded its deadline.");
      }
      ScheduledFuture<?> deadline =
          DEADLINE_SCHEDULER.schedule(() -> closeQuietly(socket), remainingNanos, TimeUnit.NANOSECONDS);
      try {
        BufferedOutputStream outputStream = new BufferedOutputStream(socket.getOutputStream());
        outputStream.write(INSTREAM_COMMAND);

        int bytesRead;
        while ((bytesRead = inputStream.read(buffer)) >= 0) {
          if (bytesRead == 0) {
            throw new IOException("Upload stream made no progress.");
          }
          outputStream.write(ByteBuffer.allocate(Integer.BYTES).putInt(bytesRead).array());
          outputStream.write(buffer, 0, bytesRead);
        }
        outputStream.write(END_OF_STREAM);
        outputStream.flush();

        return readResponse(socket.getInputStream());
      } finally {
        deadline.cancel(false);
      }
    }
  }

  private static void closeQuietly(Socket socket) {
    try {
      socket.close();
    } catch (IOException ignored) {
      // The scan thread reports the original timeout or socket failure.
    }
  }

  private static ScheduledThreadPoolExecutor createDeadlineScheduler() {
    ScheduledThreadPoolExecutor scheduler =
        new ScheduledThreadPoolExecutor(
            1,
            task -> {
              Thread thread = new Thread(task, "clamav-scan-deadline");
              thread.setDaemon(true);
              return thread;
            });
    scheduler.setRemoveOnCancelPolicy(true);
    return scheduler;
  }

  private String readResponse(InputStream inputStream) throws IOException {
    ByteArrayOutputStream response = new ByteArrayOutputStream();
    int value;
    while ((value = inputStream.read()) >= 0) {
      if (value == 0) {
        break;
      }
      if (response.size() >= MAX_RESPONSE_BYTES) {
        throw new IOException("ClamAV response exceeded the configured safety limit.");
      }
      response.write(value);
    }
    return response.toString(StandardCharsets.UTF_8);
  }

  private boolean isClean(String response) {
    return response != null && response.endsWith(": OK");
  }

  private boolean isInfected(String response) {
    return response != null && response.endsWith(" FOUND");
  }

  private static Socket openSocket(String host, int port, int timeoutMillis) throws IOException {
    Socket socket = new Socket();
    socket.connect(new InetSocketAddress(host, port), timeoutMillis);
    socket.setSoTimeout(timeoutMillis);
    return socket;
  }

  @FunctionalInterface
  interface ClamAvSocketFactory {
    Socket open(String host, int port, int timeoutMillis) throws IOException;
  }
}

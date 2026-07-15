package ca.bc.gov.mof.lexis.service.scan;

import static ca.bc.gov.mof.lexis.util.TextUtils.trimToNull;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
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
  public void assertClean(MultipartFile file) {
    if (!properties.enabled() || file == null || file.isEmpty()) {
      return;
    }

    String fileName = trimToNull(file.getOriginalFilename());
    try (InputStream inputStream = file.getInputStream()) {
      String response = scan(inputStream);
      if (isClean(response)) {
        return;
      }
      if (isInfected(response)) {
        LOGGER.warn("ClamAV rejected uploaded file [{}]: {}", fileName, response);
        throw VirusScanException.infected(response);
      }
      LOGGER.warn("ClamAV returned an unexpected response for uploaded file [{}]: {}", fileName, response);
      throw VirusScanException.unavailable(response, null);
    } catch (VirusScanException ex) {
      throw ex;
    } catch (IOException ex) {
      LOGGER.warn("ClamAV scan failed for uploaded file [{}]: {}", fileName, ex.getMessage());
      throw VirusScanException.unavailable("ClamAV scan failed.", ex);
    }
  }

  private String scan(InputStream inputStream) throws IOException {
    int timeoutMillis = Math.toIntExact(properties.timeout().toMillis());
    byte[] buffer = new byte[properties.chunkSize()];

    try (Socket socket = socketFactory.open(properties.host(), properties.port(), timeoutMillis)) {
      BufferedOutputStream outputStream = new BufferedOutputStream(socket.getOutputStream());
      outputStream.write(INSTREAM_COMMAND);

      int bytesRead;
      while ((bytesRead = inputStream.read(buffer)) >= 0) {
        outputStream.write(ByteBuffer.allocate(Integer.BYTES).putInt(bytesRead).array());
        outputStream.write(buffer, 0, bytesRead);
      }
      outputStream.write(END_OF_STREAM);
      outputStream.flush();

      return readResponse(socket.getInputStream());
    }
  }

  private String readResponse(InputStream inputStream) throws IOException {
    ByteArrayOutputStream response = new ByteArrayOutputStream();
    int value;
    while ((value = inputStream.read()) >= 0) {
      if (value == 0) {
        break;
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

package ca.bc.gov.mof.lexis.service.upload;

import ca.bc.gov.mof.lexis.dto.upload.LexisUploadResultDto;
import ca.bc.gov.mof.lexis.service.scan.VirusScanException;
import ca.bc.gov.mof.lexis.service.scan.VirusScanService;
import java.math.BigDecimal;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
@Profile("!oracle")
public class InMemoryLexisUploadService implements LexisUploadService {

  private final VirusScanService virusScanService;

  public InMemoryLexisUploadService(VirusScanService virusScanService) {
    this.virusScanService = virusScanService;
  }

  InMemoryLexisUploadService() {
    this(VirusScanService.NO_OP);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadApplication(
      MultipartFile file, Long applicationNumber, String description, String entryUserId) {
    if (applicationNumber == null || applicationNumber < 1) {
      return Optional.empty();
    }
    return buildResult("application", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadPermit(
      MultipartFile file, Long permitNumber, String description, String entryUserId) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    return buildResult("permit", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadExemption(
      MultipartFile file, String exemptionNumber, String description, String entryUserId) {
    if (exemptionNumber == null || exemptionNumber.isBlank()) {
      return Optional.empty();
    }
    return buildResult("exemption", file);
  }

  @Override
  public Optional<LexisUploadResultDto> uploadInvoice(
      MultipartFile file,
      Long permitNumber,
      String salesInvoiceNumber,
      String description,
      BigDecimal exportValue,
      BigDecimal currencyConversionRate,
      BigDecimal feeInLieu,
      String entryUserId) {
    if (permitNumber == null || permitNumber < 1) {
      return Optional.empty();
    }
    if (salesInvoiceNumber == null || salesInvoiceNumber.isBlank()) {
      return Optional.empty();
    }
    return buildResult("invoice", file);
  }

  private Optional<LexisUploadResultDto> buildResult(String uploadType, MultipartFile file) {
    if (file == null || file.isEmpty()) {
      return Optional.empty();
    }

    String fileName =
        file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
            ? "uploaded-file"
            : file.getOriginalFilename();

    try {
      virusScanService.assertClean(file);
      return Optional.of(
          new LexisUploadResultDto(
              uploadType,
              fileName,
              file.getSize(),
              "accepted",
              "Upload accepted in local profile; persistence pipeline is not enabled."));
    } catch (VirusScanException ex) {
      return Optional.of(
          new LexisUploadResultDto(uploadType, fileName, file.getSize(), "rejected", ex.userMessage()));
    }
  }
}

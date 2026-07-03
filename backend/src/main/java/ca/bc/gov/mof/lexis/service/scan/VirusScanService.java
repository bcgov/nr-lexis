package ca.bc.gov.mof.lexis.service.scan;

import org.springframework.web.multipart.MultipartFile;

@FunctionalInterface
public interface VirusScanService {

  VirusScanService NO_OP = file -> {};

  void assertClean(MultipartFile file);
}

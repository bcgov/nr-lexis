package ca.bc.gov.mof.lexis.service.scan;

import org.springframework.web.multipart.MultipartFile;

@FunctionalInterface
public interface VirusScanService {

  VirusScanService NO_OP =
      new VirusScanService() {
        @Override
        public void assertClean(MultipartFile file) {}

        @Override
        public boolean isEnabled() {
          return false;
        }
      };

  void assertClean(MultipartFile file);

  default boolean isEnabled() {
    return true;
  }
}

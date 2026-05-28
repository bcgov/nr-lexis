package ca.bc.gov.mof.lexis.service.report;

import ca.bc.gov.mof.lexis.dto.report.LexisReportRequestDto;
import java.util.Optional;

public interface LexisReportService {

  Optional<LexisGeneratedReport> generateReport(String reportAction, LexisReportRequestDto request);
}


package ca.bc.gov.mof.lexis.service.coordination;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository.RootRecordSnapshot;
import java.util.Optional;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("oracle")
public class OracleOptimisticRecordVersionService {

  private final OracleAggregateLockRepository repository;

  public OracleOptimisticRecordVersionService(OracleAggregateLockRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public Optional<OptimisticRecordVersion> find(
      OptimisticRecordType recordType, String recordId) {
    String normalizedId = recordType.normalizeIdentifier(recordId);
    Optional<RootRecordSnapshot> snapshot =
        switch (recordType) {
          case APPLICATION -> repository.findApplicationVersion(Long.valueOf(normalizedId));
          case EXEMPTION -> repository.findExemptionVersion(normalizedId);
          case PERMIT -> repository.findPermitVersion(Long.valueOf(normalizedId));
          case OFFER -> repository.findOfferVersion(Long.valueOf(normalizedId));
        };
    return snapshot.map(value -> toVersion(recordType, normalizedId, value));
  }

  public OptimisticRecordVersion toVersion(
      OptimisticRecordType recordType, String recordId, RootRecordSnapshot snapshot) {
    return new OptimisticRecordVersion(
        recordType,
        recordId,
        snapshot.savedAt(),
        snapshot.updatedBy(),
        snapshot.fingerprint());
  }
}

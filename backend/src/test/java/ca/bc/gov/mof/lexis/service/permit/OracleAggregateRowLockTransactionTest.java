package ca.bc.gov.mof.lexis.service.permit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.repository.oracle.OracleAggregateLockRepository;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequest;
import ca.bc.gov.mof.lexis.service.coordination.OptimisticLockRequestReader;
import ca.bc.gov.mof.lexis.service.coordination.OracleOptimisticRecordVersionService;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

class OracleAggregateRowLockTransactionTest {

  @Test
  void shouldRollbackAndReturnStructuredFailureFromParticipatingService() throws SQLException {
    try (AnnotationConfigApplicationContext context =
        new AnnotationConfigApplicationContext(TestConfiguration.class)) {
      PermitOperationMutex mutex = context.getBean(PermitOperationMutex.class);
      ParticipatingFailureService failureService =
          context.getBean(ParticipatingFailureService.class);

      String result =
          mutex.executeApplications(List.of(10L), failureService::structuredFailure);

      assertThat(result).isEqualTo("structured-failure");
      Connection connection = context.getBean(Connection.class);
      verify(connection).rollback();
      verify(connection, never()).commit();
    }
  }

  @Configuration(proxyBeanMethods = false)
  @EnableTransactionManagement
  static class TestConfiguration {

    @Bean
    Connection connection() throws SQLException {
      Connection connection = mock(Connection.class);
      when(connection.getAutoCommit()).thenReturn(true);
      return connection;
    }

    @Bean
    DataSource dataSource(Connection connection) throws SQLException {
      DataSource dataSource = mock(DataSource.class);
      when(dataSource.getConnection()).thenReturn(connection);
      return dataSource;
    }

    @Bean
    PlatformTransactionManager transactionManager(DataSource dataSource) {
      return new DataSourceTransactionManager(dataSource);
    }

    @Bean
    OracleAggregateLockRepository aggregateLockRepository() {
      return mock(OracleAggregateLockRepository.class);
    }

    @Bean
    OptimisticLockRequestReader optimisticLockRequestReader() {
      OptimisticLockRequestReader reader = mock(OptimisticLockRequestReader.class);
      when(reader.currentRequest()).thenReturn(OptimisticLockRequest.none());
      return reader;
    }

    @Bean
    OracleOptimisticRecordVersionService optimisticRecordVersionService(
        OracleAggregateLockRepository repository) {
      return new OracleOptimisticRecordVersionService(repository);
    }

    @Bean
    OracleAggregateRowLockService aggregateRowLockService(
        OracleAggregateLockRepository repository,
        OptimisticLockRequestReader requestReader,
        OracleOptimisticRecordVersionService versionService) {
      return new OracleAggregateRowLockService(repository, requestReader, versionService);
    }

    @Bean
    PermitOperationMutex permitOperationMutex(
        ObjectProvider<OracleAggregateRowLockService> rowLockService) {
      return new PermitOperationMutex(rowLockService);
    }

    @Bean
    ParticipatingFailureService participatingFailureService() {
      return new ParticipatingFailureService();
    }
  }

  static class ParticipatingFailureService {

    @Transactional
    public String structuredFailure() {
      TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
      return "structured-failure";
    }
  }
}

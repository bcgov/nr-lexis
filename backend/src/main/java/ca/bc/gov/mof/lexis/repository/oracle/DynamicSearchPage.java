package ca.bc.gov.mof.lexis.repository.oracle;

import java.util.List;

public record DynamicSearchPage<T>(
    List<T> results,
    int total) {}

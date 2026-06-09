package ca.bc.gov.mof.lexis.repository.oracle;

import java.util.List;

public record SearchSlice<T>(
    List<T> content,
    int page,
    int size,
    boolean hasNext) {

  public SearchSlice {
    content = content == null ? List.of() : List.copyOf(content);
    page = Math.max(0, page);
    size = Math.max(1, size);
  }
}

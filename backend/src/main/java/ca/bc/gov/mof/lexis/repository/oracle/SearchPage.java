package ca.bc.gov.mof.lexis.repository.oracle;

import java.util.List;

public record SearchPage<T>(
    List<T> content,
    int totalElements,
    int page,
    int size) {

  public SearchPage(List<T> content, int totalElements) {
    this(content, totalElements, 0, content == null || content.isEmpty() ? 1 : content.size());
  }

  public SearchPage {
    content = content == null ? List.of() : List.copyOf(content);
    totalElements = Math.max(0, totalElements);
    page = Math.max(0, page);
    size = Math.max(1, size);
  }

  public int totalPages() {
    return (int) Math.ceil((double) totalElements / size);
  }

  public List<T> results() {
    return content;
  }

  public int total() {
    return totalElements;
  }
}

package ca.bc.gov.mof.lexis.service.summary;

import java.util.Iterator;
import java.util.TreeSet;

public final class SummaryPaginationHtmlRenderer {

  private static final long MAX_RESULTS_PER_PAGE = 10;

  private SummaryPaginationHtmlRenderer() {}

  public static String render(long recordCount, int currentPage, String itemDescription, String jsFunctionItem) {
    StringBuilder paginationHtml = new StringBuilder();

    long totalPages = recordCount / MAX_RESULTS_PER_PAGE;
    if (recordCount % MAX_RESULTS_PER_PAGE != 0) {
      totalPages++;
    }
    long previousPage = currentPage - 1L;
    if (previousPage < 0) {
      previousPage = 0;
    }

    long nextPage = currentPage + 1L;
    if (nextPage > totalPages - 1) {
      nextPage = totalPages - 1;
    }

    TreeSet<Integer> displayPages = new TreeSet<>();
    displayPages.add(0);

    for (int i = currentPage; i < totalPages && i < currentPage + 6; i++) {
      displayPages.add(i);
    }

    for (int i = currentPage; i > 0 && i > currentPage - 6; i--) {
      displayPages.add(i);
    }

    String divider = "<div class=\"paginatedUnlinked\">|</div>";

    if (recordCount > MAX_RESULTS_PER_PAGE) {
      paginationHtml.append(
          "<div onclick=\"set"
              + jsFunctionItem
              + "Page(0);get"
              + jsFunctionItem
              + "Items()\" class=\"paginated\">First</div>");
      paginationHtml.append(divider);
      paginationHtml.append(
          "<div onclick=\"set"
              + jsFunctionItem
              + "Page("
              + previousPage
              + ");get"
              + jsFunctionItem
              + "Items()\" class=\"paginated\">Previous</div>");
      paginationHtml.append(divider);

      for (Iterator<Integer> iterator = displayPages.iterator(); iterator.hasNext(); ) {
        Integer value = iterator.next();
        int pageNumber = value.intValue();

        if (pageNumber == currentPage) {
          paginationHtml.append(
              "<div class=\"paginatedUnlinked\" style='font-weight: bolder;'>["
                  + (pageNumber + 1)
                  + "]</div>");
        } else {
          paginationHtml.append(
              "<div onclick=\"set"
                  + jsFunctionItem
                  + "Page("
                  + pageNumber
                  + ");get"
                  + jsFunctionItem
                  + "Items()\" class=\"paginated\">"
                  + (pageNumber + 1)
                  + "</div>");
        }
      }

      paginationHtml.append(divider);
      paginationHtml.append(
          "<div onclick=\"set"
              + jsFunctionItem
              + "Page("
              + nextPage
              + ");get"
              + jsFunctionItem
              + "Items()\" class=\"paginated\">Next</div> ");
      paginationHtml.append(divider);
      paginationHtml.append(
          "<div onclick=\"set"
              + jsFunctionItem
              + "Page("
              + (totalPages - 1)
              + ");get"
              + jsFunctionItem
              + "Items()\" class=\"paginated\">Last</div>");
    }

    String pluralModifier = recordCount == 1 ? "" : "s";
    paginationHtml.append(
        "<div style='clear: both;'>"
            + recordCount
            + " "
            + itemDescription
            + pluralModifier
            + " found</div>");

    return paginationHtml.toString();
  }
}

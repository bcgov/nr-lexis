package ca.bc.gov.mof.lexis.service.summary;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | SummaryPaginationHtmlRenderer")
class SummaryPaginationHtmlRendererTest {

  @Test
  void shouldRenderCountOnlyWhenSinglePage() {
    String html = SummaryPaginationHtmlRenderer.render(1, 0, "application", "Application");

    assertThat(html).doesNotContain("setApplicationPage");
    assertThat(html).contains("1 application found");
  }

  @Test
  void shouldRenderNavLinksWhenMultiplePages() {
    String html = SummaryPaginationHtmlRenderer.render(25, 1, "application", "Application");

    assertThat(html).contains("setApplicationPage(0);getApplicationItems()");
    assertThat(html).contains("Previous");
    assertThat(html).contains("Next");
    assertThat(html).contains("Last");
    assertThat(html).contains("25 applications found");
  }
}

package ca.bc.gov.mof.lexis.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class LexisApplicationControllerTests {

  @Autowired private MockMvc mockMvc;

  @Test
  void searchReturnsPagedResults() throws Exception {
    mockMvc
        .perform(
            get("/api/lexis/applications/search")
                .param("applicationStatus", "REV")
                .param("page", "0")
                .param("size", "10"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(1))
        .andExpect(jsonPath("$.results[0].application").value(1000456));
  }

  @Test
  void detailReturnsSingleApplication() throws Exception {
    mockMvc
        .perform(get("/api/lexis/applications/1000123"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.applicationNumber").value(1000123))
        .andExpect(jsonPath("$.ownerClientNumber").value("00012345"));
  }

  @Test
  void verifyClientsEndpointReturnsBooleanPayload() throws Exception {
    mockMvc
        .perform(get("/api/lexis/applications/search/verify-clients").param("applications", "1000123,1000456"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.clientsMatch").value(false));
  }
}

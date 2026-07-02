package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class LexisFamUserAccessServiceTest {

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void searchRoleAssignmentsShouldForwardJwtAndMapFamRoleAssignments() {
    RestClient.Builder builder = RestClient.builder().baseUrl("https://fam.example");
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(builder.build(), 123L, "https://fam.example");
    setJwt("token-123");

    server
        .expect(
            requestTo(
                "https://fam.example/fam-applications/123/user-role-assignment"
                    + "?pageNumber=2&pageSize=25&sortBy=role_display_name&sortOrder=desc&search=smith"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-123"))
        .andRespond(
            withSuccess(
                """
                {
                  "meta": {
                    "total": 1,
                    "number_of_pages": 1,
                    "page_number": 2,
                    "page_size": 25
                  },
                  "results": [
                    {
                      "user_role_xref_id": 88,
                      "user_id": 44,
                      "role_id": 12,
                      "user": {
                        "user_name": " JSMITH ",
                        "user_type": {
                          "code": "I",
                          "description": "IDIR"
                        },
                        "first_name": " Jane ",
                        "last_name": " Smith ",
                        "email": " jane.smith@gov.bc.ca "
                      },
                      "role": {
                        "role_name": " LEXIS_ADMIN ",
                        "role_type_code": "C",
                        "role_id": 12,
                        "display_name": " Administrator ",
                        "description": "Full admin",
                        "forest_client": {
                          "forest_client_number": " 00012345 ",
                          "client_name": " ACME Timber ",
                          "status": {
                            "status_code": "ACT",
                            "description": "Active"
                          }
                        }
                      },
                      "create_date": "2026-06-30T08:00:00Z",
                      "expiry_date": null
                    }
                  ]
                }
                """,
                MediaType.APPLICATION_JSON));

    LexisFamUserRoleAssignmentSearchResponseDto response =
        service.searchRoleAssignments("smith", 2, 25, "role_display_name", "desc");

    assertThat(response.configured()).isTrue();
    assertThat(response.total()).isEqualTo(1);
    assertThat(response.pageNumber()).isEqualTo(2);
    assertThat(response.pageSize()).isEqualTo(25);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().getFirst())
        .satisfies(
            assignment -> {
              assertThat(assignment.assignmentId()).isEqualTo(88L);
              assertThat(assignment.userName()).isEqualTo("JSMITH");
              assertThat(assignment.fullName()).isEqualTo("Jane Smith");
              assertThat(assignment.email()).isEqualTo("jane.smith@gov.bc.ca");
              assertThat(assignment.roleName()).isEqualTo("LEXIS_ADMIN");
              assertThat(assignment.roleDisplayName()).isEqualTo("Administrator");
              assertThat(assignment.forestClientNumber()).isEqualTo("00012345");
              assertThat(assignment.forestClientName()).isEqualTo("ACME Timber");
              assertThat(assignment.forestClientStatusDescription()).isEqualTo("Active");
            });
    server.verify();
  }

  @Test
  void searchRoleAssignmentsShouldReturnConfiguredFalseWhenFamConfigMissing() {
    LexisFamUserAccessService service = new LexisFamUserAccessService(RestClient.create(), null, "");

    LexisFamUserRoleAssignmentSearchResponseDto response =
        service.searchRoleAssignments("smith", 1, 10, null, null);

    assertThat(response.configured()).isFalse();
    assertThat(response.results()).isEmpty();
    assertThat(response.message()).isEqualTo("FAM user access lookup is not configured.");
  }

  @Test
  void searchRoleAssignmentsShouldRequireThreeCharactersWhenSearchProvided() {
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(RestClient.create(), 123L, "https://fam.example");

    assertThatThrownBy(() -> service.searchRoleAssignments("ab", 1, 10, null, null))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("Enter at least 3 characters to search FAM users.");
  }

  private static void setJwt(String tokenValue) {
    Jwt jwt =
        Jwt.withTokenValue(tokenValue)
            .header("alg", "none")
            .claim("sub", "idir\\tester")
            .build();
    SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
  }
}

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
  void searchRoleAssignmentsShouldForwardJwtAndMapFamExternalUsers() {
    RestClient.Builder builder = RestClient.builder().baseUrl("https://fam.example");
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(builder.build(), "https://fam.example");
    setJwt("token-123");

    server
        .expect(requestTo("https://fam.example/external/v1/users?page=2&size=25&idpUsername=smith"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-123"))
        .andRespond(
            withSuccess(
                """
                {
                  "meta": {
                    "total": 1,
                    "pageCount": 1,
                    "page": 2,
                    "size": 25
                  },
                  "users": [
                    {
                      "firstName": " Jane ",
                      "lastName": " Smith ",
                      "idpUsername": " JSMITH ",
                      "idpUserGuid": "guid-1",
                      "idpType": "IDIR",
                      "roles": [
                        {
                          "applicationName": "LEXIS",
                          "roleName": " LEXIS_ADMIN ",
                          "roleDisplayName": " Administrator ",
                          "scopeType": "FOREST_CLIENT",
                          "value": [" 00012345 ", "00012346"]
                        },
                        {
                          "applicationName": "LEXIS",
                          "roleName": " LEXIS_READ_ONLY ",
                          "roleDisplayName": " Read only ",
                          "scopeType": null,
                          "value": []
                        }
                      ]
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
    assertThat(response.results()).hasSize(2);
    assertThat(response.results().getFirst())
        .satisfies(
            assignment -> {
              assertThat(assignment.assignmentId()).isNull();
              assertThat(assignment.userId()).isNull();
              assertThat(assignment.userName()).isEqualTo("JSMITH");
              assertThat(assignment.fullName()).isEqualTo("Jane Smith");
              assertThat(assignment.email()).isNull();
              assertThat(assignment.userTypeCode()).isEqualTo("IDIR");
              assertThat(assignment.userTypeDescription()).isEqualTo("IDIR");
              assertThat(assignment.roleName()).isEqualTo("LEXIS_ADMIN");
              assertThat(assignment.roleDisplayName()).isEqualTo("Administrator");
              assertThat(assignment.forestClientNumber()).isEqualTo("00012345, 00012346");
              assertThat(assignment.forestClientName()).isNull();
              assertThat(assignment.forestClientStatusDescription()).isNull();
              assertThat(assignment.scopeType()).isEqualTo("FOREST_CLIENT");
              assertThat(assignment.scopeValue()).isEqualTo("00012345, 00012346");
              assertThat(assignment.createDate()).isNull();
              assertThat(assignment.expiryDate()).isNull();
            });
    assertThat(response.results().get(1))
        .satisfies(
            assignment -> {
              assertThat(assignment.roleName()).isEqualTo("LEXIS_READ_ONLY");
              assertThat(assignment.scopeType()).isNull();
              assertThat(assignment.scopeValue()).isNull();
              assertThat(assignment.forestClientNumber()).isNull();
            });
    server.verify();
  }

  @Test
  void searchRoleAssignmentsShouldReturnConfiguredFalseWhenFamConfigMissing() {
    LexisFamUserAccessService service = new LexisFamUserAccessService(RestClient.create(), "");

    LexisFamUserRoleAssignmentSearchResponseDto response =
        service.searchRoleAssignments("smith", 1, 10, null, null);

    assertThat(response.configured()).isFalse();
    assertThat(response.results()).isEmpty();
    assertThat(response.message()).isEqualTo("FAM user access lookup is not configured.");
  }

  @Test
  void searchRoleAssignmentsShouldRequireThreeCharactersWhenSearchProvided() {
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(RestClient.create(), "https://fam.example");

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

package ca.bc.gov.mof.lexis.service.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import ca.bc.gov.mof.lexis.dto.admin.LexisFamUserRoleAssignmentSearchResponseDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
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
  void searchRoleAssignmentsShouldForwardJwtAndMapFamIdentityUsers() {
    RestClient.Builder builder = RestClient.builder().baseUrl("https://fam.example");
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(builder.build(), "https://fam.example");
    setJwt("token-123");

    server
        .expect(
            requestTo(
                "https://fam.example/external/v1/users/identity/idir/search?pageSize=25&userId=smith&username=smith"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-123"))
        .andRespond(
            withSuccess(
                """
                {
                  "totalItems": 1,
                  "pageSize": 25,
                  "items": [
                    {
                      "firstName": " Jane ",
                      "lastName": " Smith ",
                      "userId": " JSMITH ",
                      "guid": "guid-1",
                      "email": " jane.smith@gov.bc.ca "
                    }
                  ]
                }
                """,
                MediaType.APPLICATION_JSON));

    LexisFamUserRoleAssignmentSearchResponseDto response =
        service.searchRoleAssignments("smith", 1, 25, "role_display_name", "desc");

    assertThat(response.configured()).isTrue();
    assertThat(response.total()).isEqualTo(1);
    assertThat(response.pageNumber()).isEqualTo(1);
    assertThat(response.pageSize()).isEqualTo(25);
    assertThat(response.pageCount()).isEqualTo(1);
    assertThat(response.results()).hasSize(1);
    assertThat(response.results().getFirst())
        .satisfies(
            assignment -> {
              assertThat(assignment.assignmentId()).isNull();
              assertThat(assignment.userId()).isNull();
              assertThat(assignment.userName()).isEqualTo("JSMITH");
              assertThat(assignment.fullName()).isEqualTo("Jane Smith");
              assertThat(assignment.email()).isEqualTo("jane.smith@gov.bc.ca");
              assertThat(assignment.userTypeCode()).isEqualTo("IDIR");
              assertThat(assignment.userTypeDescription()).isEqualTo("IDIR");
              assertThat(assignment.roleName()).isNull();
              assertThat(assignment.roleDisplayName()).isNull();
              assertThat(assignment.forestClientNumber()).isNull();
              assertThat(assignment.forestClientName()).isNull();
              assertThat(assignment.forestClientStatusDescription()).isNull();
              assertThat(assignment.scopeType()).isNull();
              assertThat(assignment.scopeValue()).isNull();
              assertThat(assignment.createDate()).isNull();
              assertThat(assignment.expiryDate()).isNull();
            });
    server.verify();
  }

  @Test
  void searchRoleAssignmentsShouldReturnMessageWhenFamIdentityLookupFails() {
    RestClient.Builder builder = RestClient.builder().baseUrl("https://fam.example");
    MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    LexisFamUserAccessService service =
        new LexisFamUserAccessService(builder.build(), "https://fam.example");
    setJwt("token-123");

    server
        .expect(
            requestTo(
                "https://fam.example/external/v1/users/identity/idir/search?pageSize=10&userId=smith&username=smith"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-123"))
        .andRespond(
            withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                    """
                    {"detail":[{"loc":["roles",0,"roleName"],"msg":"String should have at most 25 characters"}]}
                    """));

    LexisFamUserRoleAssignmentSearchResponseDto response =
        service.searchRoleAssignments("smith", 1, 10, null, null);

    assertThat(response.configured()).isTrue();
    assertThat(response.results()).isEmpty();
    assertThat(response.message())
        .isEqualTo("FAM user access lookup failed while calling the FAM identity lookup API.");
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

package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import ca.bc.gov.mof.lexis.service.application.ApplicationDetailsRpcService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;

@ExtendWith(MockitoExtension.class)
@DisplayName("Unit Test | ApplicationDetailsRpcController")
class ApplicationDetailsRpcControllerTest {

  @Mock private ObjectProvider<ApplicationDetailsRpcService> serviceProvider;
  @Mock private ApplicationDetailsRpcService service;

  private ApplicationDetailsRpcController controller;

  @BeforeEach
  void setup() {
    controller = new ApplicationDetailsRpcController(serviceProvider);
  }

  @Test
  void documentDetailsShouldReturnNoContentWhenServiceMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(null);

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    verifyNoInteractions(service);
  }

  @Test
  void documentDetailsShouldMapServiceResponse() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocumentDetails(1000456L))
        .thenReturn(
            List.of(new ApplicationDetailsRpcService.DocumentItem(7L, "test.pdf", "Not on file", "Uploaded")));

    ResponseEntity<List<ApplicationDetailsRpcController.DocumentDetailsResponseDto>> response =
        controller.getDocumentDetails("1000456");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody()).hasSize(1);
    assertThat(response.getBody().get(0).id()).isEqualTo(7L);
    assertThat(response.getBody().get(0).name()).isEqualTo("test.pdf");
    verify(service).getDocumentDetails(1000456L);
  }

  @Test
  void getDocumentShouldReturnAttachmentPayload() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getDocument(55L))
        .thenReturn(Optional.of(new ApplicationDetailsRpcService.DocumentContent("test-content".getBytes())));

    ResponseEntity<byte[]> response = controller.getDocument("55", "../unsafe/path/test.pdf");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getHeaders().getContentDisposition().isAttachment()).isTrue();
    assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("test.pdf");
    assertThat(response.getBody()).isNotNull();
    assertThat(new String(response.getBody())).isEqualTo("test-content");
    verify(service).getDocument(55L);
  }

  @Test
  void removeDocumentShouldReturnSuccessFlag() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.removeDocument(55L)).thenReturn(true);

    ResponseEntity<ApplicationDetailsRpcController.RemoveDocumentResponseDto> response =
        controller.removeDocument("55");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().success()).isEqualTo("true");
    verify(service).removeDocument(55L);
  }

  @Test
  void getRemarkShouldReturnNotFoundWhenRemarkMissing() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    when(service.getRemark(999L)).thenReturn(Optional.empty());

    ResponseEntity<ApplicationDetailsRpcController.GetRemarkResponseDto> response =
        controller.getRemark("999");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().notfound()).isTrue();
    verify(service).getRemark(999L);
  }

  @Test
  void persistRemarkShouldReturnOkStatus() {
    when(serviceProvider.getIfAvailable()).thenReturn(service);
    Instant now = Instant.parse("2026-05-27T17:00:00Z");
    when(service.persistRemark("new", 1000456L, "Long remark", "idir\\jsmith"))
        .thenReturn(
            Optional.of(
                new ApplicationDetailsRpcService.PersistedRemark(
                    44L, "Long remark", "Long remark", "idir\\jsmith", now)));

    TestingAuthenticationToken authentication = new TestingAuthenticationToken("idir\\jsmith", "n/a");
    ResponseEntity<ApplicationDetailsRpcController.PersistRemarkResponseDto> response =
        controller.persistRemark("new", "1000456", "Long remark", authentication);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).isNotNull();
    assertThat(response.getBody().status()).isEqualTo("ok");
    assertThat(response.getBody().remarkId()).isEqualTo(44L);
    assertThat(response.getBody().user()).isEqualTo("idir\\jsmith");
    verify(service).persistRemark("new", 1000456L, "Long remark", "idir\\jsmith");
  }
}

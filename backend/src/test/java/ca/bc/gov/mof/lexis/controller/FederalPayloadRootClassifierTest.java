package ca.bc.gov.mof.lexis.controller;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Unit Test | FederalPayloadRootClassifier")
class FederalPayloadRootClassifierTest {

  @Test
  void shouldClassifyBareLexisAndSoapEnvelopeRoots() {
    assertThat(FederalPayloadRootClassifier.classify(xml("<lexis:LexisSubmission xmlns:lexis=\"urn:test\"/>")))
        .isEqualTo("lexis-submission");
    assertThat(FederalPayloadRootClassifier.classify(xml("<soapenv:Envelope xmlns:soapenv=\"urn:test\"/>")))
        .isEqualTo("soap-envelope");
  }

  @Test
  void shouldClassifySoapEnvelopePayloadModes() {
    String lexisXml = "<lexis:LexisSubmission xmlns:lexis=\"urn:test\"/>";

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
                      <soapenv:Body>
                        <esf:ESFSubmission xmlns:esf="urn:esf">
                          <esf:submissionContent>%s</esf:submissionContent>
                        </esf:ESFSubmission>
                      </soapenv:Body>
                    </soapenv:Envelope>
                    """
                        .formatted(lexisXml))))
        .isEqualTo("soap-envelope:esf-submission:lexis-child");

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
                      <soapenv:Body>
                        <submissionData>&lt;esf:ESFSubmission xmlns:esf=&quot;urn:esf&quot;/&gt;</submissionData>
                      </soapenv:Body>
                    </soapenv:Envelope>
                    """)))
        .isEqualTo("soap-envelope:escaped-esf-submission");

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
                      <soapenv:Body>%s</soapenv:Body>
                    </soapenv:Envelope>
                    """
                        .formatted(lexisXml))))
        .isEqualTo("soap-envelope:lexis-submission");
  }

  @Test
  void shouldClassifyEsfSubmissionContentModes() {
    String lexisXml = "<lexis:LexisSubmission xmlns:lexis=\"urn:test\"/>";

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <esf:ESFSubmission xmlns:esf="urn:esf">
                      <esf:submissionContent>%s</esf:submissionContent>
                    </esf:ESFSubmission>
                    """
                        .formatted(lexisXml))))
        .isEqualTo("esf-submission:lexis-child");

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <esf:ESFSubmission xmlns:esf="urn:esf">
                      <esf:submissionContent><![CDATA[%s]]></esf:submissionContent>
                    </esf:ESFSubmission>
                    """
                        .formatted(lexisXml))))
        .isEqualTo("esf-submission:cdata-lexis");

    assertThat(
            FederalPayloadRootClassifier.classify(
                xml(
                    """
                    <esf:ESFSubmission xmlns:esf="urn:esf">
                      <esf:submissionContent>&lt;lexis:LexisSubmission xmlns:lexis=&quot;urn:test&quot;/&gt;</esf:submissionContent>
                    </esf:ESFSubmission>
                    """)))
        .isEqualTo("esf-submission:escaped-lexis");
  }

  @Test
  void shouldKeepGenericEsfClassificationWhenContentModeIsNotVisible() {
    assertThat(FederalPayloadRootClassifier.classify(xml("<esf:ESFSubmission xmlns:esf=\"urn:esf\"/>")))
        .isEqualTo("esf-submission");
  }

  private static byte[] xml(String xml) {
    return xml.getBytes(StandardCharsets.UTF_8);
  }
}

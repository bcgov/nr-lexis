package ca.bc.gov.mof.lexis.service.federal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeout;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class FederalSubmissionPrevalidationXmlCodecTest {

  @Test
  void shouldParseAndReturnLowerCamelRawLegacyXml() {
    String xml =
        """
        <LogExportApplication xmlns="http://beans.validation.lexis.ws.mof.gov.bc.ca">
          <boomNumber>BOOM-1</boomNumber>
          <clientNumber>00123456</clientNumber>
          <locationCode>01</locationCode>
          <timberMark><item>TM001</item><item>TM002</item></timberMark>
        </LogExportApplication>
        """;

    var request = FederalSubmissionPrevalidationXmlCodec.parse(xml);

    assertThat(request.format())
        .isEqualTo(FederalSubmissionPrevalidationXmlCodec.Format.XML);
    assertThat(request.submission().boomNumber()).isEqualTo("BOOM-1");
    assertThat(request.submission().clientNumber()).isEqualTo("00123456");
    assertThat(request.submission().locationCode()).isEqualTo("01");
    assertThat(request.submission().timberMark()).containsExactly("TM001", "TM002");
    assertThat(FederalSubmissionPrevalidationXmlCodec.responseMediaType(request))
        .isEqualTo(MediaType.APPLICATION_XML);

    String response =
        FederalSubmissionPrevalidationXmlCodec.renderResponse(
            request,
            new FederalSubmissionPrevalidationDto(
                "BOOM-1",
                "00123456",
                List.of("timberMark: TM002"),
                "01",
                List.of("TM001", "TM002")));

    assertThat(response)
        .contains("<LogExportApplication")
        .contains("<boomNumber>BOOM-1</boomNumber>")
        .contains("<errors><item>timberMark: TM002</item></errors>")
        .contains("<timberMark><item>TM001</item><item>TM002</item></timberMark>");
  }

  @Test
  void shouldMirrorNexcolDotNetRawXmlShape() {
    String xml =
        """
        <?xml version="1.0" encoding="utf-8"?>
        <LogExportApplication xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <BoomNumber>NEXCOL-TEST-001</BoomNumber>
          <ClientNumber>00123456</ClientNumber>
          <Errors/>
          <LocationCode>01</LocationCode>
          <TimberMark>
            <string>TM001</string>
            <string>TM002</string>
          </TimberMark>
        </LogExportApplication>
        """;

    var request = FederalSubmissionPrevalidationXmlCodec.parse(xml);
    String response =
        FederalSubmissionPrevalidationXmlCodec.renderResponse(
            request,
            new FederalSubmissionPrevalidationDto(
                "NEXCOL-TEST-001",
                "00123456",
                List.of("timberMark: TM002"),
                "01",
                List.of("TM001", "TM002")));

    assertThat(request.submission().timberMark()).containsExactly("TM001", "TM002");
    assertThat(request.pascalCaseFields()).isTrue();
    assertThat(request.arrayItemName()).isEqualTo("string");
    assertThat(response)
        .contains("<BoomNumber>NEXCOL-TEST-001</BoomNumber>")
        .contains("<ClientNumber>00123456</ClientNumber>")
        .contains("<Errors><string>timberMark: TM002</string></Errors>")
        .contains("<LocationCode>01</LocationCode>")
        .contains("<TimberMark><string>TM001</string><string>TM002</string></TimberMark>")
        .doesNotContain("<boomNumber>");
  }

  @Test
  void shouldUseDotNetStringItemsWhenPascalCaseTimberMarkIsEmpty() {
    var request =
        FederalSubmissionPrevalidationXmlCodec.parse(
            """
            <LogExportApplication>
              <BoomNumber>NEXCOL-TEST-001</BoomNumber>
              <ClientNumber>00123456</ClientNumber>
              <LocationCode>01</LocationCode>
              <TimberMark/>
            </LogExportApplication>
            """);

    String response =
        FederalSubmissionPrevalidationXmlCodec.renderResponse(
            request,
            new FederalSubmissionPrevalidationDto(
                "NEXCOL-TEST-001",
                "00123456",
                List.of("timberMark: null"),
                "01",
                List.of()));

    assertThat(request.arrayItemName()).isEqualTo("string");
    assertThat(response).contains("<Errors><string>timberMark: null</string></Errors>");
  }

  @Test
  void shouldParseAnAxisSoap11MultiRefRequestAndReturnSoap() {
    String xml =
        """
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            xmlns:ns1="http://webservices.validation.lexis.ws.mof.gov.bc.ca"
            xmlns:ns2="http://beans.validation.lexis.ws.mof.gov.bc.ca">
          <soapenv:Body>
            <ns1:isValidApplication soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
              <logExportApplication href="#id0"/>
            </ns1:isValidApplication>
            <multiRef id="id0" xsi:type="ns2:LogExportApplication">
              <boomNumber xsi:type="xsd:string">BOOM-1</boomNumber>
              <clientNumber xsi:type="xsd:string">00123456</clientNumber>
              <locationCode xsi:type="xsd:string">01</locationCode>
              <timberMark href="#id1"/>
            </multiRef>
            <multiRef id="id1" xsi:type="soapenc:Array" soapenc:arrayType="xsd:string[2]">
              <item xsi:type="xsd:string">TM001</item>
              <item xsi:type="xsd:string">TM002</item>
            </multiRef>
          </soapenv:Body>
        </soapenv:Envelope>
        """;

    var request = FederalSubmissionPrevalidationXmlCodec.parse(xml);

    assertThat(request.format())
        .isEqualTo(FederalSubmissionPrevalidationXmlCodec.Format.SOAP_11);
    assertThat(request.operationName()).isEqualTo("isValidApplication");
    assertThat(request.submission().boomNumber()).isEqualTo("BOOM-1");
    assertThat(request.submission().clientNumber()).isEqualTo("00123456");
    assertThat(request.submission().locationCode()).isEqualTo("01");
    assertThat(request.submission().timberMark()).containsExactly("TM001", "TM002");
    assertThat(FederalSubmissionPrevalidationXmlCodec.responseMediaType(request))
        .isEqualTo(MediaType.TEXT_XML);

    String response =
        FederalSubmissionPrevalidationXmlCodec.renderResponse(
            request,
            new FederalSubmissionPrevalidationDto(
                "BOOM-1", "00123456", List.of(), "01", List.of("TM001", "TM002")));

    assertThat(response)
        .contains("<soapenv:Envelope")
        .contains("<ns1:isValidApplicationResponse")
        .contains("<isValidApplicationReturn href=\"#id0\"/>")
        .contains("<multiRef")
        .contains("id=\"id0\"")
        .contains("xsi:type=\"ns2:LogExportApplication\"")
        .contains("soapenc:arrayType=\"xsd:string[2]\"")
        .contains("<errors soapenc:arrayType=\"xsd:string[0]\"");
  }

  @Test
  void shouldParseLargeAxisArrayReferenceRequestWithinBoundedTime() {
    int referenceCount = 30_000;
    String items = "<item href=\"#timber-mark\"/>".repeat(referenceCount);
    String xml =
        """
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            xmlns:ns1="http://webservices.validation.lexis.ws.mof.gov.bc.ca"
            xmlns:ns2="http://beans.validation.lexis.ws.mof.gov.bc.ca">
          <soapenv:Body>
            <ns1:isValidApplication>
              <logExportApplication href="#application"/>
            </ns1:isValidApplication>
            <multiRef id="application" xsi:type="ns2:LogExportApplication">
              <boomNumber>BOOM-1</boomNumber>
              <clientNumber>00123456</clientNumber>
              <locationCode>01</locationCode>
              <timberMark href="#timber-marks"/>
            </multiRef>
            <multiRef id="timber-marks" xsi:type="soapenc:Array"
                soapenc:arrayType="xsd:string[30000]">%s</multiRef>
            <multiRef id="timber-mark" xsi:type="xsd:string">TM001</multiRef>
          </soapenv:Body>
        </soapenv:Envelope>
        """
            .formatted(items);

    var request =
        assertTimeout(
            Duration.ofSeconds(10), () -> FederalSubmissionPrevalidationXmlCodec.parse(xml));

    assertThat(request.submission().timberMark())
        .hasSize(referenceCount)
        .allMatch("TM001"::equals);
  }

  @Test
  void shouldPreserveFirstMatchingAxisReferenceBehavior() {
    String xml =
        """
        <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
            xmlns:soapenc="http://schemas.xmlsoap.org/soap/encoding/"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xmlns:xsd="http://www.w3.org/2001/XMLSchema"
            xmlns:ns1="http://webservices.validation.lexis.ws.mof.gov.bc.ca"
            xmlns:ns2="http://beans.validation.lexis.ws.mof.gov.bc.ca">
          <soapenv:Body>
            <ns1:isValidApplication>
              <logExportApplication href="#application"/>
            </ns1:isValidApplication>
            <multiRef id="application" xsi:type="ns2:LogExportApplication">
              <boomNumber>BOOM-1</boomNumber>
              <clientNumber>00123456</clientNumber>
              <locationCode>01</locationCode>
              <timberMark href="#timber-marks"/>
            </multiRef>
            <multiRef id="timber-marks" xsi:type="soapenc:Array"
                soapenc:arrayType="xsd:string[4]">
              <item href="#duplicate"/>
              <item href="#chain-first"/>
              <item href="#missing"/>
              <item href="#cycle-first"/>
            </multiRef>
            <multiRef id="duplicate" xsi:type="xsd:string">TM-FIRST</multiRef>
            <multiRef id="duplicate" xsi:type="xsd:string">TM-SECOND</multiRef>
            <multiRef id="chain-first" href="#chain-second"/>
            <multiRef id="chain-second" xsi:type="xsd:string">TM-CHAIN</multiRef>
            <multiRef id="cycle-first" href="#cycle-second"/>
            <multiRef id="cycle-second" href="#cycle-first"/>
          </soapenv:Body>
        </soapenv:Envelope>
        """;

    var request = FederalSubmissionPrevalidationXmlCodec.parse(xml);

    assertThat(request.submission().timberMark())
        .containsExactly("TM-FIRST", "TM-CHAIN", "", "");
  }

  @Test
  void shouldAcceptSoap12WithAnInlineLegacyBean() {
    String xml =
        """
        <env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"
            xmlns:m="urn:nexcol-lexis">
          <env:Body>
            <m:isValidApplication>
              <logExportApplication>
                <boomNumber>BOOM-2</boomNumber>
                <clientNumber>1234</clientNumber>
                <locationCode>02</locationCode>
                <timberMark><item>TM003</item></timberMark>
              </logExportApplication>
            </m:isValidApplication>
          </env:Body>
        </env:Envelope>
        """;

    var request = FederalSubmissionPrevalidationXmlCodec.parse(xml);
    String response =
        FederalSubmissionPrevalidationXmlCodec.renderResponse(
            request,
            new FederalSubmissionPrevalidationDto(
                "BOOM-2", "1234", List.of(), "02", List.of("TM003")));

    assertThat(request.format())
        .isEqualTo(FederalSubmissionPrevalidationXmlCodec.Format.SOAP_12);
    assertThat(request.operationNamespace()).isEqualTo("urn:nexcol-lexis");
    assertThat(FederalSubmissionPrevalidationXmlCodec.responseMediaType(request).toString())
        .isEqualTo("application/soap+xml");
    assertThat(response)
        .contains("xmlns:soapenv=\"http://www.w3.org/2003/05/soap-envelope\"")
        .contains("xmlns:ns1=\"urn:nexcol-lexis\"")
        .contains("<ns1:isValidApplicationResponse");
  }

  @Test
  void shouldRejectUnknownOrUnsafeXml() {
    assertThatThrownBy(
            () -> FederalSubmissionPrevalidationXmlCodec.parse("<notPrevalidation />"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                FederalSubmissionPrevalidationXmlCodec.parse(
                    "<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><x>&y;</x>"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("The prevalidation XML body is malformed.");
  }
}

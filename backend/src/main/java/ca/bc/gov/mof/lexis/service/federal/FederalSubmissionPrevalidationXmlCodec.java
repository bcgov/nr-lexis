package ca.bc.gov.mof.lexis.service.federal;

import ca.bc.gov.mof.lexis.dto.federal.FederalSubmissionPrevalidationDto;
import java.io.StringReader;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.springframework.http.MediaType;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;
import org.xml.sax.SAXParseException;
import org.xml.sax.helpers.DefaultHandler;

/** Converts the legacy Axis LogExportApplication XML and SOAP shapes to the modern DTO. */
public final class FederalSubmissionPrevalidationXmlCodec {

  static final String BEAN_NAMESPACE = "http://beans.validation.lexis.ws.mof.gov.bc.ca";
  static final String SERVICE_NAMESPACE =
      "http://webservices.validation.lexis.ws.mof.gov.bc.ca";
  static final String SOAP_11_NAMESPACE = "http://schemas.xmlsoap.org/soap/envelope/";
  static final String SOAP_12_NAMESPACE = "http://www.w3.org/2003/05/soap-envelope";
  private static final String SOAP_11_ENCODING = "http://schemas.xmlsoap.org/soap/encoding/";
  private static final String SOAP_12_ENCODING = "http://www.w3.org/2003/05/soap-encoding";
  private static final String[] REQUEST_FIELDS = {
    "boomNumber", "clientNumber", "locationCode", "timberMark"
  };

  private FederalSubmissionPrevalidationXmlCodec() {}

  public enum Format {
    XML,
    SOAP_11,
    SOAP_12
  }

  public record ParsedRequest(
      FederalSubmissionPrevalidationDto submission,
      Format format,
      String operationNamespace,
      String operationName,
      String rootNamespace,
      String rootName,
      boolean pascalCaseFields,
      String arrayItemName) {}

  public static ParsedRequest parse(String xml) {
    if (xml == null || xml.isBlank()) {
      throw new IllegalArgumentException("The prevalidation XML body is required.");
    }

    Document document = parseDocument(xml);
    Element root = document.getDocumentElement();
    if (root == null) {
      throw new IllegalArgumentException("The prevalidation XML body is required.");
    }

    String rootName = localName(root);
    String rootNamespace = root.getNamespaceURI();
    Format format = soapFormat(root);
    Element operation = null;
    Element bean;

    if (format == Format.XML) {
      bean = resolveBeanElement(document, root, root);
    } else {
      Element body = directChild(root, "Body", rootNamespace);
      if (body == null) {
        throw new IllegalArgumentException("The SOAP envelope must include a Body element.");
      }
      operation = soapOperation(body);
      bean = resolveBeanElement(document, operation, body);
    }

    if (bean == null || !hasRequestField(bean)) {
      throw new IllegalArgumentException(
          "The XML body must include a legacy LogExportApplication value.");
    }

    boolean pascalCaseFields = format == Format.XML && usesPascalCaseFields(bean);
    String arrayItemName =
        format == Format.XML ? arrayItemName(document, bean, pascalCaseFields) : "item";

    FederalSubmissionPrevalidationDto submission =
        new FederalSubmissionPrevalidationDto(
            stringField(document, bean, "boomNumber"),
            stringField(document, bean, "clientNumber"),
            null,
            stringField(document, bean, "locationCode"),
            stringArrayField(document, bean, "timberMark"));

    return new ParsedRequest(
        submission,
        format,
        operation == null || operation.getNamespaceURI() == null
            ? SERVICE_NAMESPACE
            : operation.getNamespaceURI(),
        operation == null ? "isValidApplication" : localName(operation),
        rootNamespace,
        rootName,
        pascalCaseFields,
        arrayItemName);
  }

  public static MediaType responseMediaType(ParsedRequest request) {
    return switch (request.format()) {
      case XML -> MediaType.APPLICATION_XML;
      case SOAP_11 -> MediaType.TEXT_XML;
      case SOAP_12 -> MediaType.parseMediaType("application/soap+xml");
    };
  }

  public static String renderResponse(
      ParsedRequest request, FederalSubmissionPrevalidationDto response) {
    Document document = newDocument();
    if (request.format() == Format.XML) {
      renderXmlResponse(document, request, response);
    } else {
      renderSoapResponse(document, request, response);
    }
    return serialize(document);
  }

  private static Document parseDocument(String xml) {
    try {
      var builder = secureDocumentBuilderFactory().newDocumentBuilder();
      builder.setErrorHandler(
          new DefaultHandler() {
            @Override
            public void error(SAXParseException exception) throws SAXParseException {
              throw exception;
            }

            @Override
            public void fatalError(SAXParseException exception) throws SAXParseException {
              throw exception;
            }
          });
      return builder.parse(new InputSource(new StringReader(xml)));
    } catch (Exception exception) {
      throw new IllegalArgumentException("The prevalidation XML body is malformed.", exception);
    }
  }

  private static Document newDocument() {
    try {
      return secureDocumentBuilderFactory().newDocumentBuilder().newDocument();
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to create the prevalidation XML response.", exception);
    }
  }

  private static DocumentBuilderFactory secureDocumentBuilderFactory() throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    factory.setXIncludeAware(false);
    factory.setExpandEntityReferences(false);
    factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
    factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
    factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
    factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    return factory;
  }

  private static Format soapFormat(Element root) {
    if (!"Envelope".equals(localName(root))) {
      return Format.XML;
    }
    if (SOAP_11_NAMESPACE.equals(root.getNamespaceURI())) {
      return Format.SOAP_11;
    }
    if (SOAP_12_NAMESPACE.equals(root.getNamespaceURI())) {
      return Format.SOAP_12;
    }
    return Format.XML;
  }

  private static Element soapOperation(Element body) {
    Element fallback = null;
    for (Node node = body.getFirstChild(); node != null; node = node.getNextSibling()) {
      if (!(node instanceof Element element) || "multiRef".equalsIgnoreCase(localName(element))) {
        continue;
      }
      if ("isValidApplication".equalsIgnoreCase(localName(element))) {
        return element;
      }
      if (fallback == null) {
        fallback = element;
      }
    }
    return fallback;
  }

  private static Element resolveBeanElement(
      Document document, Element preferredRoot, Element searchRoot) {
    if (preferredRoot != null) {
      Element resolved = resolveReference(document, preferredRoot);
      if (isBeanElement(resolved)) {
        return resolved;
      }
      for (Element child : directChildren(preferredRoot)) {
        resolved = resolveReference(document, child);
        if (isBeanElement(resolved)) {
          return resolved;
        }
      }
    }

    Element root = searchRoot == null ? document.getDocumentElement() : searchRoot;
    if (root == null) {
      return null;
    }
    var candidates = root.getElementsByTagName("*");
    for (int index = 0; index < candidates.getLength(); index++) {
      if (candidates.item(index) instanceof Element candidate) {
        Element resolved = resolveReference(document, candidate);
        if (isBeanElement(resolved)) {
          return resolved;
        }
      }
    }
    return null;
  }

  private static boolean isBeanElement(Element element) {
    if (element == null) {
      return false;
    }
    String name = localName(element);
    if ("LogExportApplication".equalsIgnoreCase(name)
        || "logExportApplication".equalsIgnoreCase(name)) {
      return true;
    }
    String type = attributeByLocalName(element, "type");
    return (type != null && type.endsWith(":LogExportApplication")) || hasRequestField(element);
  }

  private static boolean hasRequestField(Element element) {
    for (Element child : directChildren(element)) {
      for (String field : REQUEST_FIELDS) {
        if (field.equalsIgnoreCase(localName(child))) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean usesPascalCaseFields(Element element) {
    for (Element child : directChildren(element)) {
      String name = localName(child);
      if ("BoomNumber".equals(name)
          || "ClientNumber".equals(name)
          || "LocationCode".equals(name)
          || "TimberMark".equals(name)) {
        return true;
      }
    }
    return false;
  }

  private static String arrayItemName(
      Document document, Element bean, boolean pascalCaseFields) {
    List<Element> fields = directChildren(bean, "timberMark");
    if (fields.isEmpty()) {
      return pascalCaseFields ? "string" : "item";
    }
    Element container = resolveReference(document, fields.get(0));
    for (Element item : directChildren(container)) {
      if ("string".equals(localName(item))) {
        return "string";
      }
      if ("item".equals(localName(item))) {
        return "item";
      }
    }
    return pascalCaseFields ? "string" : "item";
  }

  private static String stringField(Document document, Element bean, String fieldName) {
    List<Element> fields = directChildren(bean, fieldName);
    if (fields.isEmpty()) {
      return null;
    }
    Element value = resolveReference(document, fields.get(0));
    return scalarValue(value);
  }

  private static List<String> stringArrayField(
      Document document, Element bean, String fieldName) {
    List<Element> fields = directChildren(bean, fieldName);
    if (fields.isEmpty()) {
      return null;
    }

    List<String> values = new ArrayList<>();
    if (fields.size() > 1) {
      for (Element field : fields) {
        values.add(scalarValue(resolveReference(document, field)));
      }
      return values;
    }

    Element container = resolveReference(document, fields.get(0));
    if (isNil(container)) {
      return null;
    }
    List<Element> items = directChildren(container);
    if (!items.isEmpty()) {
      for (Element item : items) {
        values.add(scalarValue(resolveReference(document, item)));
      }
      return values;
    }
    if (attributeByLocalName(container, "arrayType") != null) {
      return values;
    }
    values.add(scalarValue(container));
    return values;
  }

  private static String scalarValue(Element element) {
    if (element == null || isNil(element)) {
      return null;
    }
    return element.getTextContent();
  }

  private static boolean isNil(Element element) {
    String nil = attributeByLocalName(element, "nil");
    return "true".equalsIgnoreCase(nil) || "1".equals(nil);
  }

  private static Element resolveReference(Document document, Element element) {
    Element current = element;
    for (int depth = 0; current != null && depth < 8; depth++) {
      String href = attributeByLocalName(current, "href");
      if (href == null || href.isBlank()) {
        return current;
      }
      String id = href.startsWith("#") ? href.substring(1) : href;
      Element referenced = elementById(document, id);
      if (referenced == null || referenced == current) {
        return current;
      }
      current = referenced;
    }
    return current;
  }

  private static Element elementById(Document document, String id) {
    var elements = document.getElementsByTagName("*");
    for (int index = 0; index < elements.getLength(); index++) {
      if (elements.item(index) instanceof Element element
          && id.equals(attributeByLocalName(element, "id"))) {
        return element;
      }
    }
    return null;
  }

  private static Element directChild(Element parent, String name, String namespace) {
    for (Element child : directChildren(parent)) {
      if (name.equals(localName(child))
          && (namespace == null || namespace.equals(child.getNamespaceURI()))) {
        return child;
      }
    }
    return null;
  }

  private static List<Element> directChildren(Element parent, String name) {
    List<Element> children = new ArrayList<>();
    for (Element child : directChildren(parent)) {
      if (name.equalsIgnoreCase(localName(child))) {
        children.add(child);
      }
    }
    return children;
  }

  private static List<Element> directChildren(Element parent) {
    List<Element> children = new ArrayList<>();
    if (parent == null) {
      return children;
    }
    for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
      if (node instanceof Element element) {
        children.add(element);
      }
    }
    return children;
  }

  private static String attributeByLocalName(Element element, String name) {
    if (element == null) {
      return null;
    }
    NamedNodeMap attributes = element.getAttributes();
    for (int index = 0; index < attributes.getLength(); index++) {
      Node attribute = attributes.item(index);
      String localName = attribute.getLocalName();
      if (name.equalsIgnoreCase(localName == null ? attribute.getNodeName() : localName)) {
        return attribute.getNodeValue();
      }
    }
    return null;
  }

  private static String localName(Element element) {
    String localName = element.getLocalName();
    if (localName != null) {
      return localName;
    }
    String nodeName = element.getNodeName();
    int separator = nodeName.indexOf(':');
    return separator < 0 ? nodeName : nodeName.substring(separator + 1);
  }

  private static void renderXmlResponse(
      Document document,
      ParsedRequest request,
      FederalSubmissionPrevalidationDto response) {
    String namespace = request.rootNamespace();
    String name =
        request.rootName() == null || request.rootName().isBlank()
            ? "LogExportApplication"
            : request.rootName();
    Element root =
        namespace == null || namespace.isBlank()
            ? document.createElement(name)
            : document.createElementNS(namespace, name);
    if (namespace != null && !namespace.isBlank()) {
      root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns", namespace);
    }
    root.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI,
        "xmlns:xsi",
        XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI);
    document.appendChild(root);

    appendRawScalar(
        document,
        root,
        request.pascalCaseFields() ? "BoomNumber" : "boomNumber",
        response.boomNumber());
    appendRawScalar(
        document,
        root,
        request.pascalCaseFields() ? "ClientNumber" : "clientNumber",
        response.clientNumber());
    appendRawArray(
        document,
        root,
        request.pascalCaseFields() ? "Errors" : "errors",
        request.arrayItemName(),
        response.errors());
    appendRawScalar(
        document,
        root,
        request.pascalCaseFields() ? "LocationCode" : "locationCode",
        response.locationCode());
    appendRawArray(
        document,
        root,
        request.pascalCaseFields() ? "TimberMark" : "timberMark",
        request.arrayItemName(),
        response.timberMark());
  }

  private static void renderSoapResponse(
      Document document,
      ParsedRequest request,
      FederalSubmissionPrevalidationDto response) {
    String soapNamespace =
        request.format() == Format.SOAP_12 ? SOAP_12_NAMESPACE : SOAP_11_NAMESPACE;
    String encoding =
        request.format() == Format.SOAP_12 ? SOAP_12_ENCODING : SOAP_11_ENCODING;
    String operationNamespace =
        request.operationNamespace() == null || request.operationNamespace().isBlank()
            ? SERVICE_NAMESPACE
            : request.operationNamespace();
    String operationName =
        request.operationName() == null || request.operationName().isBlank()
            ? "isValidApplication"
            : request.operationName();

    Element envelope = document.createElementNS(soapNamespace, "soapenv:Envelope");
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:soapenv", soapNamespace);
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:soapenc", encoding);
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI,
        "xmlns:xsi",
        XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI);
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI,
        "xmlns:xsd",
        XMLConstants.W3C_XML_SCHEMA_NS_URI);
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:ns1", operationNamespace);
    envelope.setAttributeNS(
        XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:ns2", BEAN_NAMESPACE);
    document.appendChild(envelope);

    Element body = document.createElementNS(soapNamespace, "soapenv:Body");
    envelope.appendChild(body);
    Element operationResponse =
        document.createElementNS(operationNamespace, "ns1:" + operationName + "Response");
    operationResponse.setAttributeNS(soapNamespace, "soapenv:encodingStyle", encoding);
    body.appendChild(operationResponse);

    Element result = document.createElement("isValidApplicationReturn");
    operationResponse.appendChild(result);

    Element bean = result;
    if (request.format() == Format.SOAP_11) {
      result.setAttribute("href", "#id0");
      bean = document.createElement("multiRef");
      bean.setAttribute("id", "id0");
      bean.setAttributeNS(encoding, "soapenc:root", "0");
      bean.setAttributeNS(soapNamespace, "soapenv:encodingStyle", encoding);
      body.appendChild(bean);
    }
    bean.setAttributeNS(
        XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI,
        "xsi:type",
        "ns2:LogExportApplication");

    appendSoapScalar(document, bean, "boomNumber", response.boomNumber());
    appendSoapScalar(document, bean, "clientNumber", response.clientNumber());
    appendSoapArray(document, bean, "errors", response.errors(), encoding);
    appendSoapScalar(document, bean, "locationCode", response.locationCode());
    appendSoapArray(document, bean, "timberMark", response.timberMark(), encoding);
  }

  private static void appendRawScalar(
      Document document, Element parent, String name, String value) {
    Element element = document.createElement(name);
    if (value == null) {
      element.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:nil", "true");
    } else {
      element.setTextContent(value);
    }
    parent.appendChild(element);
  }

  private static void appendRawArray(
      Document document,
      Element parent,
      String name,
      String itemName,
      List<String> values) {
    Element array = document.createElement(name);
    if (values == null) {
      array.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:nil", "true");
    } else {
      for (String value : values) {
        appendArrayItem(document, array, itemName, value, false);
      }
    }
    parent.appendChild(array);
  }

  private static void appendSoapScalar(
      Document document, Element parent, String name, String value) {
    Element element = document.createElement(name);
    if (value == null) {
      element.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:nil", "true");
    } else {
      element.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:type", "xsd:string");
      element.setTextContent(value);
    }
    parent.appendChild(element);
  }

  private static void appendSoapArray(
      Document document,
      Element parent,
      String name,
      List<String> values,
      String encodingNamespace) {
    Element array = document.createElement(name);
    if (values == null) {
      array.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:nil", "true");
    } else {
      array.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:type", "soapenc:Array");
      array.setAttributeNS(
          encodingNamespace, "soapenc:arrayType", "xsd:string[" + values.size() + "]");
      for (String value : values) {
        appendArrayItem(document, array, "item", value, true);
      }
    }
    parent.appendChild(array);
  }

  private static void appendArrayItem(
      Document document, Element parent, String itemName, String value, boolean typed) {
    Element item = document.createElement(itemName);
    if (value == null) {
      item.setAttributeNS(
          XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:nil", "true");
    } else {
      if (typed) {
        item.setAttributeNS(
            XMLConstants.W3C_XML_SCHEMA_INSTANCE_NS_URI, "xsi:type", "xsd:string");
      }
      item.setTextContent(value);
    }
    parent.appendChild(item);
  }

  private static String serialize(Document document) {
    try {
      TransformerFactory factory = TransformerFactory.newInstance();
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
      factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
      var transformer = factory.newTransformer();
      transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
      transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
      transformer.setOutputProperty(OutputKeys.INDENT, "no");
      StringWriter writer = new StringWriter();
      transformer.transform(new DOMSource(document), new StreamResult(writer));
      return writer.toString();
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to create the prevalidation XML response.", exception);
    }
  }
}

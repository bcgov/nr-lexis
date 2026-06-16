import { getFileExtension } from './uploadQueueHelpers'

const ESF_NAMESPACE = 'http://www.for.gov.bc.ca/schema/esf'
const LEXIS_NAMESPACE = 'http://www.for.gov.bc.ca/schema/lexis'
const XML_QUALIFIED_NAME_PREFIX = String.raw`(?:[A-Za-z_][\w.-]*:)?`

export const XML_PREVIEW_UNAVAILABLE =
  'XML preview unavailable; server validation will run on upload.'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasNamespaceDeclaration = (xml: string, namespace: string): boolean =>
  xml.includes(`"${namespace}"`) || xml.includes(`'${namespace}'`)

const hasXmlRootElement = (xml: string, localName: string): boolean =>
  new RegExp(
    String.raw`^\s*(?:<\?xml\b[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}\b`,
  ).test(xml)

const countXmlElements = (xml: string, localName: string): number => {
  const elementPattern = new RegExp(
    String.raw`<${XML_QUALIFIED_NAME_PREFIX}${escapeRegExp(localName)}(?:\s|>|/)`,
    'g',
  )
  return xml.match(elementPattern)?.length ?? 0
}

export const buildLexisXmlPreviewMessage = async (file: File): Promise<string> => {
  const extension = getFileExtension(file.name)
  if (extension === '.zip') {
    return 'ZIP archive will be unpacked and validated on upload.'
  }
  if (extension !== '.xml') {
    return ''
  }

  try {
    const xml = await file.text()
    if (
      !hasXmlRootElement(xml, 'ESFSubmission') ||
      !hasNamespaceDeclaration(xml, ESF_NAMESPACE) ||
      !hasNamespaceDeclaration(xml, LEXIS_NAMESPACE) ||
      countXmlElements(xml, 'LexisSubmission') === 0
    ) {
      return XML_PREVIEW_UNAVAILABLE
    }

    const scaleRowCount = countXmlElements(xml, 'harvestedTimber')

    const details = [
      'LEXIS XML structure detected',
      scaleRowCount > 0 ? `${scaleRowCount} scale row${scaleRowCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean)

    return details.length > 0 ? `Preview: ${details.join(', ')}.` : XML_PREVIEW_UNAVAILABLE
  } catch (error) {
    console.warn('Unable to build LEXIS XML upload preview.', error)
    return XML_PREVIEW_UNAVAILABLE
  }
}

import { isRecord } from '@/utils/record'
import { getFileExtension } from './uploadQueueHelpers'

const ESF_NAMESPACE = 'http://www.for.gov.bc.ca/schema/esf'
const LEXIS_NAMESPACE = 'http://www.for.gov.bc.ca/schema/lexis'
const XML_QUALIFIED_NAME_PREFIX = String.raw`(?:[A-Za-z_][\w.-]*:)?`

export const XML_PREVIEW_UNAVAILABLE =
  'XML preview unavailable; server validation will run on upload.'
export const GEOJSON_PREVIEW_UNAVAILABLE =
  'GeoJSON preview unavailable; server validation will run on upload.'
export const CONTENT_PREVIEW_UNAVAILABLE =
  'Preview unavailable; server validation will inspect this submission file.'

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

const normalizeGeoJsonEntityType = (value: unknown): string =>
  typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : ''

const countGeoJsonScaleRows = (features: unknown[]): number =>
  features.filter((feature) => {
    if (!isRecord(feature) || feature.type !== 'Feature' || !isRecord(feature.properties)) {
      return false
    }
    return normalizeGeoJsonEntityType(feature.properties.lexisEntityType) === 'HARVESTEDTIMBER'
  }).length

const buildXmlPreviewMessage = async (file: File): Promise<string> => {
  try {
    const xml = await file.text()
    const hasLexisNamespace = hasNamespaceDeclaration(xml, LEXIS_NAMESPACE)
    const hasBareLexisPayload = hasXmlRootElement(xml, 'LexisSubmission')
    const hasEsfWrappedLexisPayload =
      hasXmlRootElement(xml, 'ESFSubmission') &&
      hasNamespaceDeclaration(xml, ESF_NAMESPACE) &&
      countXmlElements(xml, 'LexisSubmission') > 0

    if (!hasLexisNamespace || (!hasBareLexisPayload && !hasEsfWrappedLexisPayload)) {
      return XML_PREVIEW_UNAVAILABLE
    }

    const scaleRowCount = countXmlElements(xml, 'harvestedTimber')
    const harvestedWithoutSummaryCount = countXmlElements(
      xml,
      'harvestedTimberWithoutSummaryOfScale',
    )
    const standingTimberCount = countXmlElements(xml, 'standingTimber')

    const details = [
      'LEXIS XML structure detected',
      scaleRowCount > 0 ? `${scaleRowCount} scale row${scaleRowCount === 1 ? '' : 's'}` : '',
      harvestedWithoutSummaryCount > 0
        ? `${harvestedWithoutSummaryCount} no-summary timber mark${
            harvestedWithoutSummaryCount === 1 ? '' : 's'
          }`
        : '',
      standingTimberCount > 0
        ? `${standingTimberCount} standing timber mark${standingTimberCount === 1 ? '' : 's'}`
        : '',
    ].filter(Boolean)

    return details.length > 0 ? `Preview: ${details.join(', ')}.` : XML_PREVIEW_UNAVAILABLE
  } catch {
    return XML_PREVIEW_UNAVAILABLE
  }
}

const buildGeoJsonPreviewMessage = async (file: File): Promise<string> => {
  try {
    const parsed = JSON.parse(await file.text()) as unknown
    if (
      !isRecord(parsed) ||
      parsed.type !== 'FeatureCollection' ||
      !isRecord(parsed.lexis) ||
      !Array.isArray(parsed.features)
    ) {
      return GEOJSON_PREVIEW_UNAVAILABLE
    }

    const scaleRowCount = countGeoJsonScaleRows(parsed.features)
    const details = [
      'LEXIS GeoJSON structure detected',
      scaleRowCount > 0 ? `${scaleRowCount} scale row${scaleRowCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean)

    return details.length > 0 ? `Preview: ${details.join(', ')}.` : GEOJSON_PREVIEW_UNAVAILABLE
  } catch {
    return GEOJSON_PREVIEW_UNAVAILABLE
  }
}

const buildContentDetectedPreviewMessage = async (file: File): Promise<string> => {
  try {
    const text = await file.slice(0, 512).text()
    const trimmed = text.trimStart()
    if (trimmed.startsWith('<')) {
      return buildXmlPreviewMessage(file)
    }
    if (trimmed.startsWith('{')) {
      return buildGeoJsonPreviewMessage(file)
    }
  } catch {
    return CONTENT_PREVIEW_UNAVAILABLE
  }

  return CONTENT_PREVIEW_UNAVAILABLE
}

export const buildLexisXmlPreviewMessage = async (file: File): Promise<string> => {
  const extension = getFileExtension(file.name)
  if (extension === '.zip') {
    return 'ZIP archive will be unpacked and validated on upload.'
  }
  if (extension === '.geojson' || extension === '.json') {
    return buildGeoJsonPreviewMessage(file)
  }
  if (extension !== '.xml') {
    return buildContentDetectedPreviewMessage(file)
  }

  return buildXmlPreviewMessage(file)
}

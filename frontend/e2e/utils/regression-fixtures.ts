import type { APIResponse, Page } from '@playwright/test'
import { getWithAuth, postWithCsrf } from './regression-auth'

type RegressionReferences = {
  clientNumber: string
  locationCode: string
  regionCode: string
  timberMark: string
}

type ValidationResult = {
  status?: string
  packageNumber?: string
  scaleRows?: number
  errors?: unknown
}

// These are public XML schema codes, not environment-specific fixture identifiers.
const regionCodeByOrgUnit: Record<string, string> = {
  '1903': 'RCB',
  '1904': 'RKB',
  '1905': 'RNO',
  '1906': 'ROM',
  '1907': 'RTO',
  '1908': 'RSK',
  '1909': 'RSC',
  '1910': 'RWC',
}
const referenceSearchLimit = 25

const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const regressionSubmissionXml = (
  packageNumber: string,
  references: RegressionReferences,
): string => `<?xml version="1.0" encoding="UTF-8"?>
<esf:ESFSubmission xmlns:lexis="http://www.for.gov.bc.ca/schema/lexis" xmlns:esf="http://www.for.gov.bc.ca/schema/esf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.for.gov.bc.ca/schema/esf http://www.for.gov.bc.ca/schema/esf/1/xsd/MOF/esf-submission.xsd http://www.for.gov.bc.ca/schema/lexis http://www.for.gov.bc.ca/schema/lexis/2/xsd/MOF/mof-lexis.xsd">
  <esf:submissionContent>
    <lexis:LexisSubmission>
      <lexis:applicant>
        <lexis:applicantDetails>
          <lexis:clientNumber>${escapeXml(references.clientNumber)}</lexis:clientNumber>
          <lexis:clientLocnCode>${escapeXml(references.locationCode)}</lexis:clientLocnCode>
          <lexis:name>LEXIS E2E REGRESSION</lexis:name>
        </lexis:applicantDetails>
        <lexis:applicantContact>
          <lexis:contactSurname>REGRESSION</lexis:contactSurname>
          <lexis:contactFirstname>E2E</lexis:contactFirstname>
        </lexis:applicantContact>
      </lexis:applicant>
      <lexis:applicationDetail>
        <lexis:jurisdictionCode>P</lexis:jurisdictionCode>
        <lexis:bcForestRegionCode>${escapeXml(references.regionCode)}</lexis:bcForestRegionCode>
        <lexis:applStatusCode>A</lexis:applStatusCode>
        <lexis:exemptionRsnCde>S</lexis:exemptionRsnCde>
        <lexis:applicantTypeCode>O</lexis:applicantTypeCode>
      </lexis:applicationDetail>
      <lexis:productDetail>
        <lexis:productTypeCode>H</lexis:productTypeCode>
        <lexis:boomNumber>${escapeXml(packageNumber)}</lexis:boomNumber>
        <lexis:speciesEndUseSort>HE/PL</lexis:speciesEndUseSort>
        <lexis:productLocation>LEXIS E2E REGRESSION</lexis:productLocation>
        <lexis:ageClass>S</lexis:ageClass>
        <lexis:avgLength>6.7</lexis:avgLength>
        <lexis:avgDiameter>12.8</lexis:avgDiameter>
        <lexis:harvestedTimber>
          <lexis:timberMark>${escapeXml(references.timberMark)}</lexis:timberMark>
          <lexis:numberOfPieces>1500</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>H</lexis:grade>
          <lexis:quantityVolume>500</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>${escapeXml(references.timberMark)}</lexis:timberMark>
          <lexis:numberOfPieces>50</lexis:numberOfPieces>
          <lexis:species>HE</lexis:species>
          <lexis:grade>J</lexis:grade>
          <lexis:quantityVolume>24.5</lexis:quantityVolume>
        </lexis:harvestedTimber>
        <lexis:harvestedTimber>
          <lexis:timberMark>${escapeXml(references.timberMark)}</lexis:timberMark>
          <lexis:numberOfPieces>1</lexis:numberOfPieces>
          <lexis:species>FI</lexis:species>
          <lexis:grade>J</lexis:grade>
          <lexis:quantityVolume>0.5</lexis:quantityVolume>
        </lexis:harvestedTimber>
      </lexis:productDetail>
    </lexis:LexisSubmission>
  </esf:submissionContent>
</esf:ESFSubmission>`

const readReferenceJson = async <T>(response: APIResponse): Promise<T> => {
  if (response.status() !== 200) {
    throw new Error('Regression reference lookup failed.')
  }
  return response.json() as Promise<T>
}

const isUnavailableReference = (error: unknown): boolean =>
  typeof error === 'string' &&
  (/^Application (?:owner location|region) does not exist\.$/.test(error) ||
    /^Timber mark .+ (?:does not exist\.|is not valid for this region\.|is not valid for provincial applications\.|is not valid for this scale(?: due to a status of .+)?\.)$/.test(
      error,
    ))

export const regressionSubmissionFile = (packageNumber: string, xml: string) => ({
  userReference: `E2E regression ${packageNumber}`,
  file: {
    name: `${packageNumber}.xml`,
    mimeType: 'application/xml',
    buffer: Buffer.from(xml, 'utf8'),
  },
})

// LEXIS cannot create CLIENT/FTA master data. Read candidate keys only; never reuse or mutate
// a source application/package, or copy its contacts, quantities or other business fields.
// Preflight is read-only. Only an explicit obsolete reference permits trying another candidate;
// authentication, server, schema and other validation failures must remain test failures.
export const resolveRegressionSubmission = async (
  page: Page,
  packageNumber: string,
): Promise<{ ownerClientNumber: string; xml: string; validation: ValidationResult }> => {
  const search = await readReferenceJson<{ results: { application: number }[] }>(
    await getWithAuth(page, '/api/lexis/applications/search', {
      params: {
        productTypeCode: 'H',
        // The existing package search accepts wildcards. Exclude applications whose packages
        // were removed by earlier runs, so retained synthetic applications cannot crowd this out.
        packageNumber: '%',
        region: Object.keys(regionCodeByOrgUnit).join(','),
        sortField: 'application DESC',
        page: '0',
        size: String(referenceSearchLimit),
      },
    }),
  )
  const checked = new Set<string>()
  for (const row of search.results.slice(0, referenceSearchLimit)) {
    const params = { applicationNumber: String(row.application) }
    const summary = await readReferenceJson<{
      ownerClientNumber?: string
      ownerClientLocationCode?: string
      orgUnitNumber?: number
    }>(
      await getWithAuth(page, '/api/lexis/rpc/application-details/application-summary', { params }),
    )
    const clientNumber = summary.ownerClientNumber?.trim() ?? ''
    const locationCode = summary.ownerClientLocationCode?.trim() ?? ''
    const regionCode = regionCodeByOrgUnit[String(summary.orgUnitNumber)]
    if (!clientNumber || !locationCode || !regionCode) continue
    const scales = await readReferenceJson<{ timberMark: string }[]>(
      await getWithAuth(page, '/api/lexis/rpc/application-details/unique-scales', { params }),
    )
    for (const scale of scales) {
      const timberMark = scale.timberMark?.trim()
      if (!timberMark) continue
      const references = { clientNumber, locationCode, regionCode, timberMark }
      const key = JSON.stringify(references)
      if (checked.has(key)) continue
      if (checked.size >= referenceSearchLimit) break
      checked.add(key)
      const xml = regressionSubmissionXml(packageNumber, references)
      const response = await postWithCsrf(page, '/api/lexis/application-submissions/validation', {
        multipart: regressionSubmissionFile(packageNumber, xml),
      })
      if (response.status() !== 200 && response.status() !== 422) {
        throw new Error('Regression submission preflight request failed.')
      }
      const validation = (await response.json()) as ValidationResult
      if (response.status() === 200 && validation.status === 'validated') {
        return { ownerClientNumber: clientNumber, xml, validation }
      }
      if (
        response.status() !== 422 ||
        validation.status !== 'rejected' ||
        !Array.isArray(validation.errors) ||
        validation.errors.length === 0 ||
        !validation.errors.every(isUnavailableReference)
      ) {
        throw new Error('Regression submission preflight failed beyond reference availability.')
      }
    }
    if (checked.size >= referenceSearchLimit) break
  }
  throw new Error(
    'Regression reference data unavailable: no valid client/location/region/timber mark combination in the bounded lookup. LEXIS cannot provision CLIENT/FTA master data.',
  )
}

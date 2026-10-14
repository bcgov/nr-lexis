import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  LexisXmlSubmissionSummaryLabels,
  UploadQueueItem,
} from '@/components/uploads/uploadQueueTypes'
import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import {
  fetchProvincialApplicationOptions,
  fetchReportOptions,
  type SearchOption,
} from '@/service/search-options-service'

export type SubmissionReferenceAccess = {
  applicationOptions: boolean
  endUses: boolean
  jurisdictions: boolean
}

type ApplicationReferenceOptions = Pick<
  Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>,
  'exemptionReasons' | 'growthTypes' | 'productTypes' | 'regions'
>

const NO_APPLICATION_REFERENCE_OPTIONS: ApplicationReferenceOptions = {
  exemptionReasons: [],
  growthTypes: [],
  productTypes: [],
  regions: [],
}

// Application and Exemption details name applicant types the same way.
const APPLICANT_TYPE_LABELS: Record<string, string> = {
  A: 'Agent',
  M: 'Ministerial',
  O: 'Owner',
}

const optionLabel = (
  options: SearchOption[] | undefined,
  code: string | number | null | undefined,
): string | undefined => {
  const value = String(code ?? '').trim()
  return value ? options?.find((option) => option.value === value)?.label : undefined
}

// End uses are looked up for the submission's region and species, as on Application details.
const endUseLookupKey = (summary: LexisXmlSubmissionSummary): string =>
  summary.orgUnitNumber && summary.speciesCodes?.length && summary.endUseCode
    ? `${summary.orgUnitNumber}|${summary.speciesCodes.join(',')}`
    : ''

/** Adds reference descriptions to submission summaries; a code keeps showing until one loads. */
export const useSubmissionSummaryLabels = (
  items: UploadQueueItem[],
  access: SubmissionReferenceAccess,
): UploadQueueItem[] => {
  const [applicationOptions, setApplicationOptions] = useState<ApplicationReferenceOptions | null>(
    null,
  )
  const [jurisdictions, setJurisdictions] = useState<SearchOption[]>([])
  const [endUsesByKey, setEndUsesByKey] = useState<Record<string, ApplicationCodeOption[]>>({})
  const requestedRef = useRef({
    applicationOptions: false,
    jurisdictions: false,
    endUses: new Set<string>(),
  })
  const hasSummaries = items.some((item) => item.details?.submissionSummary)
  const endUseKeys = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((item) => item.details?.submissionSummary)
            .filter((summary): summary is LexisXmlSubmissionSummary => !!summary)
            .map(endUseLookupKey)
            .filter(Boolean),
        ),
      ).join(';'),
    [items],
  )

  useEffect(() => {
    const requested = requestedRef.current
    if (!hasSummaries) {
      return
    }

    if (access.applicationOptions && !requested.applicationOptions) {
      requested.applicationOptions = true
      void fetchProvincialApplicationOptions()
        .then(setApplicationOptions)
        .catch(() => setApplicationOptions(NO_APPLICATION_REFERENCE_OPTIONS))
    }

    // Jurisdiction descriptions are only published with the report options.
    if (access.jurisdictions && !requested.jurisdictions) {
      requested.jurisdictions = true
      void fetchReportOptions()
        .then((options) => setJurisdictions(options.reportJurisdictions))
        .catch(() => setJurisdictions([]))
    }

    if (!access.endUses) {
      return
    }
    for (const key of endUseKeys.split(';').filter(Boolean)) {
      if (requested.endUses.has(key)) {
        continue
      }
      requested.endUses.add(key)
      const [orgUnitNumber, speciesCodes] = key.split('|')
      void fetchApplicationEndUsesForSpeciesRegion(orgUnitNumber, speciesCodes.split(','))
        .catch((): ApplicationCodeOption[] => [])
        .then((options) => setEndUsesByKey((current) => ({ ...current, [key]: options })))
    }
  }, [access.applicationOptions, access.endUses, access.jurisdictions, endUseKeys, hasSummaries])

  return useMemo(
    () =>
      items.map((item) => {
        const summary = item.details?.submissionSummary
        if (!summary) {
          return item
        }

        const endUses = endUsesByKey[endUseLookupKey(summary)]
        const submissionSummaryLabels: LexisXmlSubmissionSummaryLabels = {
          orgUnitNumber: optionLabel(applicationOptions?.regions, summary.orgUnitNumber),
          jurisdictionCode: optionLabel(jurisdictions, summary.jurisdictionCode),
          exemptionReasonCode: optionLabel(
            applicationOptions?.exemptionReasons,
            summary.exemptionReasonCode,
          ),
          applicantTypeCode:
            APPLICANT_TYPE_LABELS[summary.applicantTypeCode?.trim().toUpperCase() ?? ''],
          productTypeCode: optionLabel(applicationOptions?.productTypes, summary.productTypeCode),
          ageClass: optionLabel(applicationOptions?.growthTypes, summary.ageClass),
          endUseCode: endUses?.find((option) => option.code === summary.endUseCode)?.description,
        }
        return { ...item, details: { ...item.details, submissionSummaryLabels } }
      }),
    [applicationOptions, endUsesByKey, items, jurisdictions],
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LexisXmlSubmissionSummary } from '@/service/admin-upload-service'
import {
  fetchApplicationEndUsesForSpeciesRegion,
  type ApplicationCodeOption,
} from '@/service/provincial-application-items-service'
import {
  fetchProvincialApplicationOptions,
  type SearchOption,
} from '@/service/search-options-service'

export type SubmissionReferenceAccess = {
  applicationOptions: boolean
  endUses: boolean
}

/** Reference descriptions for a submission's codes; a code without one is shown as is. */
export type SubmissionSummaryLabels = {
  exemptionReason?: string
  productType?: string
  ageClass?: string
  endUse?: string
}

type ApplicationReferenceOptions = Pick<
  Awaited<ReturnType<typeof fetchProvincialApplicationOptions>>,
  'exemptionReasons' | 'growthTypes' | 'productTypes'
>

const NO_APPLICATION_REFERENCE_OPTIONS: ApplicationReferenceOptions = {
  exemptionReasons: [],
  growthTypes: [],
  productTypes: [],
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

/** Looks up descriptions for submission codes; a code keeps showing until one loads. */
export const useSubmissionSummaryLabels = (
  summaries: LexisXmlSubmissionSummary[],
  access: SubmissionReferenceAccess,
): ((summary: LexisXmlSubmissionSummary) => SubmissionSummaryLabels) => {
  const [applicationOptions, setApplicationOptions] = useState<ApplicationReferenceOptions | null>(
    null,
  )
  const [endUsesByKey, setEndUsesByKey] = useState<Record<string, ApplicationCodeOption[]>>({})
  const requestedRef = useRef({ applicationOptions: false, endUses: new Set<string>() })
  const hasSummaries = summaries.length > 0
  const endUseKeys = useMemo(
    () => Array.from(new Set(summaries.map(endUseLookupKey).filter(Boolean))).join(';'),
    [summaries],
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
  }, [access.applicationOptions, access.endUses, endUseKeys, hasSummaries])

  return useCallback(
    (summary: LexisXmlSubmissionSummary): SubmissionSummaryLabels => ({
      exemptionReason: optionLabel(
        applicationOptions?.exemptionReasons,
        summary.exemptionReasonCode,
      ),
      productType: optionLabel(applicationOptions?.productTypes, summary.productTypeCode),
      ageClass: optionLabel(applicationOptions?.growthTypes, summary.ageClass),
      endUse: endUsesByKey[endUseLookupKey(summary)]?.find(
        (option) => option.code === summary.endUseCode,
      )?.description,
    }),
    [applicationOptions, endUsesByKey],
  )
}

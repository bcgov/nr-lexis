import type {
  ApplicationClientContact,
  ApplicationClientLocation,
} from '@/service/application-client-lookup-service'
import type { ApplicationCodeOption } from '@/service/provincial-application-items-service'
import type { SearchOption } from '@/service/search-options-service'
import {
  atMostOneDecimalFieldError,
  firstValidationError,
  maxNumericValueFieldError,
  numericFieldError,
  requiredFieldError,
} from '@/pages/shared/create-form-utils'

const CLIENT_NUMBER_PATTERN = /^\d{1,8}$/

export const CLIENT_LOOKUP_UNAVAILABLE_MESSAGE =
  'Client details could not be retrieved. Existing selections were preserved. Please try again.'

const comparableClientNumber = (value: string): string => {
  const normalized = value.trim()
  return CLIENT_NUMBER_PATTERN.test(normalized) ? normalized.padStart(8, '0') : normalized
}

export const clientLookupNumbersMatch = (left: string, right: string): boolean =>
  comparableClientNumber(left) === comparableClientNumber(right)

export const isSelectableClientLocation = (location: ApplicationClientLocation): boolean =>
  location.locationCode !== '0'

export const isSelectableClientContact = (contact: ApplicationClientContact): boolean =>
  contact.contactId !== '0'

export const clientLocationLabel = (locationCode: string, locationName: string): string => {
  const code = locationCode.trim()
  const name = locationName.trim()
  if (!code) {
    return name
  }
  if (!name || name === code || name.startsWith(`${code} - `)) {
    return name || code
  }
  return `${code} - ${name}`
}

export const resolveClientLocationCode = (
  locations: ApplicationClientLocation[],
  currentCode: string,
): string => {
  const normalizedCurrentCode = currentCode.trim()
  if (
    normalizedCurrentCode &&
    locations.some(
      (location) =>
        isSelectableClientLocation(location) && location.locationCode === normalizedCurrentCode,
    )
  ) {
    return normalizedCurrentCode
  }

  const selectedLocation = locations.find(
    (location) => isSelectableClientLocation(location) && location.selected,
  )
  if (selectedLocation) {
    return selectedLocation.locationCode
  }

  return locations.find(isSelectableClientLocation)?.locationCode ?? ''
}

export const resolveClientContactName = (
  contacts: ApplicationClientContact[],
  currentName: string,
): string => {
  const normalizedCurrentName = currentName.trim()
  if (
    normalizedCurrentName &&
    contacts.some(
      (contact) =>
        isSelectableClientContact(contact) && contact.contactName === normalizedCurrentName,
    )
  ) {
    return normalizedCurrentName
  }

  return contacts.find(isSelectableClientContact)?.contactName ?? normalizedCurrentName
}

export const productTypeRequiresGrowthType = (productTypeCode: string): boolean =>
  ['H', 'S'].includes(productTypeCode.trim().toUpperCase())

export const productTypeRequiresLogDetails = (productTypeCode: string): boolean =>
  productTypeCode.trim().toUpperCase() === 'H'

export const averageLogVolumeFieldError = (value: string): string | undefined =>
  firstValidationError(
    () => requiredFieldError(value, 'Average log volume'),
    () => {
      const parsed = Number(value.trim())
      return value.trim() && Number.isFinite(parsed) && parsed < 0
        ? 'Average log volume must be greater than or equal to 0.'
        : null
    },
    () => numericFieldError(value, 'Average log volume'),
    () => maxNumericValueFieldError(value, 99.9, 'Average log volume'),
    () => atMostOneDecimalFieldError(value, 'Average log volume'),
  )

export const isAgentApplicant = (applicantTypeCode: string): boolean => applicantTypeCode === 'A'

export const codeOptionLabel = (option: ApplicationCodeOption): string =>
  option.description && option.description !== option.code
    ? `${option.code} - ${option.description}`
    : option.code

export const toSearchOption = (option: ApplicationCodeOption): SearchOption => ({
  value: option.code,
  label: codeOptionLabel(option),
})

export const toApplicationCodeOption = (option: SearchOption): ApplicationCodeOption => ({
  code: option.value,
  description: option.label,
})

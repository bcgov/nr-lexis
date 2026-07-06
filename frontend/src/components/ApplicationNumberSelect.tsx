import { ComboBox } from '@carbon/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { shouldFilterSearchableDropdownItem } from './dropdown-filtering'
import {
  searchProvincialApplicationNumberOptions,
  type ProvincialApplicationNumberOption,
} from '@/service/provincial-application-search-service'
import { leadingDigits } from '@/utils/text'

export type ApplicationNumberSelectProps = {
  id: string
  labelText: ReactNode
  value: string
  invalid?: boolean
  invalidText?: ReactNode
  disabled?: boolean
  onBlur?: () => void
  onChange: (value: string) => void
}

const createManualApplicationNumberOption = (value: string): ProvincialApplicationNumberOption => ({
  value,
  label: value,
  status: '',
  applicantClientNumber: '',
  ownerClientNumber: '',
  region: '',
  listingDate: '',
  exemptionNumber: '',
})

const itemToString = (item: ProvincialApplicationNumberOption | string | null | undefined) => {
  if (typeof item === 'string') {
    return item
  }
  return item?.label ?? ''
}

export default function ApplicationNumberSelect({
  id,
  labelText,
  value,
  invalid = false,
  invalidText,
  disabled = false,
  onBlur,
  onChange,
}: ApplicationNumberSelectProps) {
  const [options, setOptions] = useState<ProvincialApplicationNumberOption[]>([])
  const [inputText, setInputText] = useState(value)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (disabled) {
      return
    }

    let ignore = false
    const timeout = window.setTimeout(() => {
      setIsLoading(true)
      void searchProvincialApplicationNumberOptions(leadingDigits(inputText))
        .then((items) => {
          if (!ignore) {
            setOptions(items)
          }
        })
        .catch((error) => {
          console.warn('Unable to load application number options.', error)
          if (!ignore) {
            setOptions([])
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoading(false)
          }
        })
    }, 250)

    return () => {
      ignore = true
      window.clearTimeout(timeout)
    }
  }, [disabled, inputText])

  const selectedItem = useMemo<ProvincialApplicationNumberOption | null>(() => {
    const matchingOption = options.find((option) => option.value === value)
    if (matchingOption) {
      return matchingOption
    }
    return value ? createManualApplicationNumberOption(value) : null
  }, [options, value])

  return (
    <ComboBox
      id={id}
      titleText={labelText}
      items={options}
      selectedItem={selectedItem}
      itemToString={itemToString}
      shouldFilterItem={({ item, inputValue }) =>
        shouldFilterSearchableDropdownItem({ item, inputValue, optionCount: options.length })
      }
      placeholder={isLoading ? 'Loading applications...' : 'Search application number'}
      allowCustomValue
      disabled={disabled}
      invalid={invalid}
      invalidText={invalidText}
      onBlur={onBlur}
      onInputChange={(inputValue) => {
        setInputText(inputValue)
        onChange(leadingDigits(inputValue))
      }}
      onChange={({ selectedItem, inputValue }) => {
        if (typeof selectedItem === 'string') {
          onChange(leadingDigits(selectedItem))
          return
        }
        onChange(selectedItem?.value ?? leadingDigits(inputValue ?? ''))
      }}
    />
  )
}

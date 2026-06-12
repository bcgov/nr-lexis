import { ComboBox } from '@carbon/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  searchProvincialApplicationNumberOptions,
  type ProvincialApplicationNumberOption,
} from '@/service/provincial-application-search-service'

type ApplicationNumberSelectProps = {
  id: string
  labelText: ReactNode
  value: string
  invalid?: boolean
  invalidText?: ReactNode
  disabled?: boolean
  onBlur?: () => void
  onChange: (value: string) => void
}

const itemToString = (item: ProvincialApplicationNumberOption | string | null | undefined) => {
  if (typeof item === 'string') {
    return item
  }
  return item?.label ?? ''
}

const applicationNumberFromInput = (input: string): string => input.match(/^\d+/)?.[0] ?? ''

const shouldFilterItem = ({
  item,
  inputValue,
}: {
  item: ProvincialApplicationNumberOption
  inputValue: string | null
}): boolean => {
  const query = inputValue?.trim().toLowerCase()
  if (!query) {
    return true
  }

  return item.label.toLowerCase().includes(query) || item.value.includes(query)
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
      void searchProvincialApplicationNumberOptions(applicationNumberFromInput(inputText))
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
    return value ? { value, label: value } : null
  }, [options, value])

  return (
    <ComboBox
      id={id}
      titleText={labelText}
      items={options}
      selectedItem={selectedItem}
      itemToString={itemToString}
      shouldFilterItem={shouldFilterItem}
      placeholder={isLoading ? 'Loading applications...' : 'Search application number'}
      allowCustomValue
      disabled={disabled}
      invalid={invalid}
      invalidText={invalidText}
      onBlur={onBlur}
      onInputChange={(inputValue) => {
        setInputText(inputValue)
        onChange(applicationNumberFromInput(inputValue))
      }}
      onChange={({ selectedItem, inputValue }) => {
        if (typeof selectedItem === 'string') {
          onChange(applicationNumberFromInput(selectedItem))
          return
        }
        onChange(selectedItem?.value ?? applicationNumberFromInput(inputValue ?? ''))
      }}
    />
  )
}

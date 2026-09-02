import { DatePicker, DatePickerInput } from '@carbon/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'

const ISO_DATE_INPUT_PATTERN = String.raw`\d{4}-\d{2}-\d{2}`

export const parseIsoDate = (value: string): Date | false => {
  if (!value.trim() || !isValidIsoDate(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsedDate = new Date(year, month - 1, day)
  if (year < 100) parsedDate.setFullYear(year)
  return parsedDate
}

type IsoDatePickerProps = {
  id: string
  labelText: ReactNode
  value: string
  invalid?: boolean
  invalidText?: ReactNode
  disabled?: boolean
  onBlur?: () => void
  onChange: (value: string) => void
}

export default function IsoDatePicker({
  id,
  labelText,
  value,
  invalid = false,
  invalidText,
  disabled = false,
  onBlur,
  onChange,
}: IsoDatePickerProps) {
  const flatpickrValue = value.trim() && isValidIsoDate(value) ? value : undefined
  const latestInputValueRef = useRef(value)

  useEffect(() => {
    latestInputValueRef.current = value
  }, [value])

  return (
    <DatePicker
      datePickerType="single"
      dateFormat="Y-m-d"
      allowInput
      parseDate={parseIsoDate}
      value={flatpickrValue}
      onChange={(_selectedDates, dateString) => {
        const latestInputValue = latestInputValueRef.current
        if (!dateString && latestInputValue.trim() && !isValidIsoDate(latestInputValue)) {
          return
        }
        if (dateString !== value) {
          latestInputValueRef.current = dateString
          onChange(dateString)
        }
      }}
    >
      <DatePickerInput
        id={id}
        labelText={labelText}
        placeholder="YYYY-MM-DD"
        pattern={ISO_DATE_INPUT_PATTERN}
        data-1p-ignore="true"
        data-lpignore="true"
        invalid={invalid}
        invalidText={invalidText}
        disabled={disabled}
        onBlur={(event) => {
          const input = event.currentTarget
          const latestInputValue = latestInputValueRef.current
          onBlur?.()

          if (latestInputValue.trim() && !isValidIsoDate(latestInputValue)) {
            requestAnimationFrame(() => {
              if (latestInputValueRef.current === latestInputValue) {
                input.value = latestInputValue
              }
            })
          }
        }}
        onChange={(event) => {
          latestInputValueRef.current = event.target.value
          if (event.target.value !== value) {
            onChange(event.target.value)
          }
        }}
      />
    </DatePicker>
  )
}

import { DatePicker, DatePickerInput } from '@carbon/react'
import type { ReactNode } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'

const ISO_DATE_INPUT_PATTERN = String.raw`\d{4}-\d{2}-\d{2}`

export const parseIsoDate = (value: string): Date | false => {
  if (!value.trim() || !isValidIsoDate(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export type IsoDatePickerProps = {
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

  return (
    <DatePicker
      datePickerType="single"
      dateFormat="Y-m-d"
      allowInput
      parseDate={parseIsoDate}
      value={flatpickrValue}
      onChange={(_selectedDates, dateString) => {
        if (dateString !== value) {
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
        onBlur={onBlur}
        onChange={(event) => {
          if (event.target.value !== value) {
            onChange(event.target.value)
          }
        }}
      />
    </DatePicker>
  )
}

import { DatePicker, DatePickerInput } from '@carbon/react'
import type { ReactNode } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'

type Props = {
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
}: Props) {
  const flatpickrValue = value.trim() && isValidIsoDate(value) ? value : undefined

  return (
    <DatePicker
      datePickerType="single"
      dateFormat="Y-m-d"
      allowInput
      value={flatpickrValue}
      onChange={(_selectedDates, dateString) => onChange(dateString)}
    >
      <DatePickerInput
        id={id}
        labelText={labelText}
        placeholder="YYYY-MM-DD"
        invalid={invalid}
        invalidText={invalidText}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
    </DatePicker>
  )
}

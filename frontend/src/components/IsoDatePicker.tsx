import { DatePicker, DatePickerInput } from '@carbon/react'
import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import { fieldErrorText } from '@/utils/field-error'

const ISO_DATE_INPUT_PATTERN = String.raw`\d{4}-\d{2}-\d{2}`

export const parseIsoDate = (value: string): Date | false => {
  if (!value.trim() || !isValidIsoDate(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsedDate = new Date(year, month - 1, day)
  if (year < 100) parsedDate.setFullYear(year)
  return parsedDate
}

type CalendarOpenHook = NonNullable<ComponentProps<typeof DatePicker>['onOpen']>

/**
 * The calendar is placed under its field when it opens. A field that is still moving then, such
 * as one in a side panel that is sliding in, would leave the calendar behind, so the calendar is
 * placed again once that motion ends.
 */
const placeCalendarAfterMotion: CalendarOpenHook = (_dates, _value, calendar) => {
  const field = calendar._positionElement
  const motion =
    document.getAnimations?.().filter((animation) => {
      const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null
      return target?.contains(field)
    }) ?? []
  if (motion.length === 0) return
  void Promise.allSettled(motion.map((animation) => animation.finished)).then(() => {
    if (calendar.isOpen) calendar._positionCalendar()
  })
}

type IsoDatePickerProps = {
  id: string
  labelText: ReactNode
  value: string
  invalid?: boolean
  invalidText?: ReactNode
  required?: boolean
  disabled?: boolean
  readOnly?: boolean
  onBlur?: () => void
  onChange: (value: string) => void
}

export default function IsoDatePicker({
  id,
  labelText,
  value,
  invalid = false,
  invalidText,
  required = false,
  disabled = false,
  readOnly = false,
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
      readOnly={readOnly}
      value={flatpickrValue}
      onOpen={placeCalendarAfterMotion}
      onChange={(_selectedDates, dateString, calendar) => {
        const latestInputValue = latestInputValueRef.current
        if (!dateString && latestInputValue.trim() && !isValidIsoDate(latestInputValue)) {
          // Enter makes Flatpickr empty the input without blurring it, so put the text back.
          requestAnimationFrame(() => {
            if (latestInputValueRef.current === latestInputValue) {
              calendar.input.value = latestInputValue
            }
          })
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
        placeholder={readOnly ? undefined : 'YYYY-MM-DD'}
        helperText={readOnly ? undefined : 'year-month-day'}
        pattern={ISO_DATE_INPUT_PATTERN}
        data-1p-ignore="true"
        data-lpignore="true"
        invalid={invalid}
        invalidText={fieldErrorText(invalidText)}
        aria-required={required || undefined}
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

import { DatePicker, DatePickerInput } from '@carbon/react'
import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react'
import { isValidIsoDate } from '@/pages/shared/create-form-utils'
import { fieldErrorText } from '@/utils/field-error'
import { closeDateCalendar, focusDateCalendarDay, type DateInput } from '@/utils/focus'

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
  /** The earliest day the calendar offers, as YYYY-MM-DD. A typed earlier date is kept as typed. */
  minDate?: string
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
  minDate,
  onBlur,
  onChange,
}: IsoDatePickerProps) {
  // Text Flatpickr can't select: a partial or impossible date, or a day before minDate.
  const isUnselectable = (text: string): boolean =>
    Boolean(text.trim()) && (!isValidIsoDate(text) || (minDate !== undefined && text < minDate))
  const flatpickrValue = value.trim() && !isUnselectable(value) ? value : undefined
  const latestInputValueRef = useRef(value)

  useEffect(() => {
    latestInputValueRef.current = value
  }, [value])

  useEffect(() => {
    // An ancestor's capture listener runs before Carbon's own listener on the input.
    const picker = document.getElementById(id)?.parentElement
    if (!picker) return
    // Tab leaves the date for the next field and closes its calendar; the Down arrow moves into
    // the calendar. Carbon would move Tab into the calendar instead.
    const onKeyDown = (event: KeyboardEvent) => {
      const input = event.target as DateInput
      if (!(input instanceof HTMLInputElement)) return
      if (event.key === 'Tab' && !event.shiftKey) {
        event.stopPropagation()
        closeDateCalendar(input)
        return
      }
      const calendar = input._flatpickr
      if (event.key !== 'ArrowDown' || !calendar) return
      if (focusDateCalendarDay(calendar)) event.preventDefault()
    }
    picker.addEventListener('keydown', onKeyDown, true)
    return () => picker.removeEventListener('keydown', onKeyDown, true)
  }, [id])

  return (
    <DatePicker
      datePickerType="single"
      dateFormat="Y-m-d"
      allowInput
      parseDate={parseIsoDate}
      readOnly={readOnly}
      minDate={minDate}
      value={flatpickrValue}
      onOpen={placeCalendarAfterMotion}
      onChange={(_selectedDates, dateString, calendar) => {
        const latestInputValue = latestInputValueRef.current
        if (!dateString && isUnselectable(latestInputValue)) {
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

          if (isUnselectable(latestInputValue)) {
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

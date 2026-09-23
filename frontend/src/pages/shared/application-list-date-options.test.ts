import { describe, expect, it } from 'vitest'
import { applicationListDateOptions, NO_LIST_DATE_VALUE } from './application-list-date-options'

const nextSchedules = [
  { value: '101', label: '2026-09-30' },
  { value: '102', label: '2026-10-07' },
  { value: '', label: 'Blank' },
]

const currentSchedules = [
  { value: '100', label: '2026-09-23' },
  { value: '101', label: '2026-09-30' },
  { value: '', label: 'Blank' },
]

describe('application list date options', () => {
  it('shows clients only the next two dates', () => {
    expect(
      applicationListDateOptions(nextSchedules, currentSchedules, false, '2026-09-23'),
    ).toEqual(nextSchedules.slice(0, 2))
  })

  it('adds No list date for an approver', () => {
    expect(applicationListDateOptions(nextSchedules, currentSchedules, true, '2026-09-22')).toEqual(
      [...nextSchedules.slice(0, 2), { value: NO_LIST_DATE_VALUE, label: 'No list date' }],
    )
  })

  it('also shows today when it is a list date for an approver', () => {
    expect(applicationListDateOptions(nextSchedules, currentSchedules, true, '2026-09-23')).toEqual(
      [
        currentSchedules[0],
        ...nextSchedules.slice(0, 2),
        { value: NO_LIST_DATE_VALUE, label: 'No list date' },
      ],
    )
  })
})

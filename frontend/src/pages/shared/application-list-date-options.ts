import type { SearchOption } from '@/service/search-options-service'

export const NO_LIST_DATE_VALUE = 'no-list-date'

// INTENTIONAL_LEGACY_DIVERGENCE(APPLICATION_LIST_DATE_SELECTION): Approvers also see
// today's list date and an explicitly named No list date choice.
export const applicationListDateOptions = (
  nextSchedules: SearchOption[],
  currentSchedules: SearchOption[],
  canReviewApplications: boolean,
  today: string,
): SearchOption[] => {
  const nextTwo = nextSchedules.filter((option) => option.value.trim()).slice(0, 2)
  const todaySchedule = canReviewApplications
    ? currentSchedules.find((option) => option.value.trim() && option.label === today)
    : undefined

  return [
    ...(todaySchedule && !nextTwo.some((option) => option.value === todaySchedule.value)
      ? [todaySchedule]
      : []),
    ...nextTwo,
    ...(canReviewApplications ? [{ value: NO_LIST_DATE_VALUE, label: 'No list date' }] : []),
  ]
}

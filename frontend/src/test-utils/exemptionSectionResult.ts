import { expect } from 'vitest'

// A section's save result sits in its tab panel, directly before the card it reports on.
export const expectResultAboveCard = (resultText: HTMLElement, cardHeading: HTMLElement) => {
  const notice = resultText.closest('.app-inline-notification') as HTMLElement
  const card = cardHeading.closest('.cds--tile') as HTMLElement
  expect(notice.closest('.cds--tile')).toBeNull()
  expect(notice.closest('[role="tabpanel"]')).toBe(card.closest('[role="tabpanel"]'))
  expect(notice.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const noticeWrapper = Array.from(card.parentElement?.children ?? []).find((child) =>
    child.contains(notice),
  )
  expect(noticeWrapper?.nextElementSibling).toBe(card)
}

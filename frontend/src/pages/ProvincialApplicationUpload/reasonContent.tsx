import type { ReactNode } from 'react'
import { REPORT_ISSUE_HREF } from '@/utils/support'

const REPORT_ISSUE_TEXT = 'report an issue'

// A reason that ends by asking the user to report an issue links that request to support.
export const reasonContent = (reason: string): ReactNode => {
  const linkStart = reason.lastIndexOf(REPORT_ISSUE_TEXT)
  if (linkStart < 0 || reason.slice(linkStart + REPORT_ISSUE_TEXT.length) !== '.') {
    return reason
  }
  return (
    <>
      {reason.slice(0, linkStart)}
      <a href={REPORT_ISSUE_HREF}>{REPORT_ISSUE_TEXT}</a>.
    </>
  )
}

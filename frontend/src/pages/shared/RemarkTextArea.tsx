import { TextArea, type TextAreaProps } from '@carbon/react'
import type { Ref } from 'react'
import { STORED_REMARK_MAX_LENGTH, storedRemarkLength } from './remark-storage'
import './RemarkTextArea.scss'

type RemarkTextAreaProps = Omit<
  TextAreaProps,
  'value' | 'enableCounter' | 'maxCount' | 'helperText'
> & {
  value: string
  ref?: Ref<HTMLTextAreaElement>
}

/** What a screen reader announces as the stored length nears, reaches or passes the limit. */
const lengthAnnouncement = (stored: number): string => {
  const remaining = STORED_REMARK_MAX_LENGTH - stored
  if (remaining < 0) {
    return `${-remaining} ${remaining === -1 ? 'character' : 'characters'} over the limit.`
  }
  if (remaining === 0) {
    return 'Maximum characters reached.'
  }
  if (remaining <= 10) {
    return `${remaining} ${remaining === 1 ? 'character' : 'characters'} left.`
  }
  return ''
}

/**
 * A remark field whose counter shows the length once stored, where &, < and > count as their
 * escaped forms. The count passes the limit exactly when saving refuses the remark. The limit is
 * the field's accessible description, and a live region announces the remaining count near it.
 */
export function RemarkTextArea({ value, maxLength, ...props }: RemarkTextAreaProps) {
  const stored = storedRemarkLength(value)
  return (
    <div className="remark-text-area">
      <TextArea
        {...props}
        value={value}
        maxLength={maxLength ?? STORED_REMARK_MAX_LENGTH}
        helperText={
          <span className="cds--visually-hidden">{`Character limit ${STORED_REMARK_MAX_LENGTH}`}</span>
        }
      />
      <div
        className="cds--label cds--text-area__label-counter remark-text-area__counter"
        aria-hidden="true"
      >
        {`${stored}/${STORED_REMARK_MAX_LENGTH}`}
      </div>
      <div className="cds--visually-hidden" aria-live="polite" aria-atomic="true">
        {lengthAnnouncement(stored)}
      </div>
    </div>
  )
}

import { TextArea, type TextAreaProps } from '@carbon/react'
import type { Ref } from 'react'
import { STORED_REMARK_MAX_LENGTH, storedRemarkLength } from './remark-storage'
import './RemarkTextArea.scss'

type RemarkTextAreaProps = Omit<TextAreaProps, 'value' | 'enableCounter' | 'maxCount'> & {
  value: string
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * A remark field whose counter shows the length once stored, where &, < and > count as their
 * escaped forms. The count passes the limit exactly when saving refuses the remark.
 */
export function RemarkTextArea({ value, maxLength, ...props }: RemarkTextAreaProps) {
  return (
    <div className="remark-text-area">
      <TextArea {...props} value={value} maxLength={maxLength ?? STORED_REMARK_MAX_LENGTH} />
      <div
        className="cds--label cds--text-area__label-counter remark-text-area__counter"
        aria-hidden="true"
      >
        {`${storedRemarkLength(value)}/${STORED_REMARK_MAX_LENGTH}`}
      </div>
    </div>
  )
}

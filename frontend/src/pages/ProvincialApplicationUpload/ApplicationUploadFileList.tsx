import { useRef, type MouseEvent } from 'react'
import { Loading } from '@carbon/react'
import { CheckmarkFilled, Close, WarningFilled } from '@carbon/icons-react'
import type { ApplicationUploadFile } from './applicationUploadFiles'

type ApplicationUploadFileListProps = {
  files: ApplicationUploadFile[]
  onRemove: (id: string) => void
  /** Takes focus when the last removable file is removed. */
  emptyFocusTargetId: string
}

/** Each added file with its validation status; a file can be removed once it has a result. */
function ApplicationUploadFileList({
  files,
  onRemove,
  emptyFocusTargetId,
}: ApplicationUploadFileListProps) {
  const listRef = useRef<HTMLUListElement>(null)

  // Focus moves to the next file's Remove, else the previous one's, else the upload field.
  const removeFile = (event: MouseEvent<HTMLButtonElement>, id: string): void => {
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('.application-upload-file__remove') ??
        [],
    )
    const index = buttons.indexOf(event.currentTarget)
    const nextFocus =
      buttons[index + 1] ?? buttons[index - 1] ?? document.getElementById(emptyFocusTargetId)
    onRemove(id)
    nextFocus?.focus()
  }

  return (
    <ul ref={listRef} className="application-upload-files" aria-label="Added application files">
      {files.map((item) => (
        <li
          key={item.id}
          className={`application-upload-file application-upload-file--${item.status}`}
        >
          <span className="application-upload-file__name">{item.file.name}</span>
          <span className="application-upload-file__status">
            {item.status === 'validating' ? (
              <Loading small withOverlay={false} description="Validating file" />
            ) : item.status === 'validated' ? (
              <>
                <CheckmarkFilled size={16} aria-hidden="true" />
                Validated
              </>
            ) : (
              <>
                <WarningFilled size={16} aria-hidden="true" />
                Failed
              </>
            )}
          </span>
          {item.status !== 'validating' && (
            <button
              type="button"
              className="application-upload-file__remove"
              aria-label={`Remove ${item.file.name}`}
              onClick={(event) => removeFile(event, item.id)}
            >
              <Close size={16} aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

export default ApplicationUploadFileList

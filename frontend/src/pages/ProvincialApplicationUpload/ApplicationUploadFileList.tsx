import { Loading } from '@carbon/react'
import { CheckmarkFilled, Close, WarningFilled } from '@carbon/icons-react'
import type { ApplicationUploadFile } from './applicationUploadFiles'

type ApplicationUploadFileListProps = {
  files: ApplicationUploadFile[]
  onRemove: (id: string) => void
}

/** Each added file with its validation status; a file can be removed once it has a result. */
function ApplicationUploadFileList({ files, onRemove }: ApplicationUploadFileListProps) {
  return (
    <ul className="application-upload-files" aria-label="Added application files">
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
              onClick={() => onRemove(item.id)}
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

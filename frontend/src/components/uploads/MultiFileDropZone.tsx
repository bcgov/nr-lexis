import { useState, type DragEvent, type FC } from 'react'
import { Upload } from '@carbon/icons-react'

type MultiFileDropZoneProps = {
  title: string
  description: string
  inputId: string
  inputKey: number
  inputLabel: string
  accept?: string
  invalidText?: string
  disabled?: boolean
  disabledDescription?: string
  onFilesSelected: (files: FileList | null) => void
}

const MultiFileDropZone: FC<MultiFileDropZoneProps> = ({
  title,
  description,
  inputId,
  inputKey,
  inputLabel,
  accept,
  invalidText,
  disabled = false,
  disabledDescription = 'File upload is not available.',
  onFilesSelected,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const onDropUploadFiles = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDraggingOver(false)
    if (disabled) {
      return
    }
    onFilesSelected(event.dataTransfer.files)
  }

  const dropZoneClassName = [
    'admin-upload-drop-zone',
    isDraggingOver ? 'is-dragging' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className="admin-upload-panel" aria-labelledby={`${inputId}-panel-title`}>
      <div className="admin-upload-panel__header">
        <div>
          <h2 id={`${inputId}-panel-title`}>{title}</h2>
          <p>{description}. Multiple files can be queued and submitted together.</p>
        </div>
      </div>

      <div
        className={dropZoneClassName}
        onDragEnter={(event) => {
          event.preventDefault()
          if (disabled) {
            return
          }
          setIsDraggingOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (disabled) {
            return
          }
          setIsDraggingOver(true)
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={onDropUploadFiles}
      >
        <div className="admin-upload-drop-zone__icon" aria-hidden="true">
          <Upload size={32} />
        </div>
        <div className="admin-upload-drop-zone__copy">
          <p>Drag and drop files here, or browse for files.</p>
          <p>{disabled ? disabledDescription : description}</p>
        </div>
        <input
          key={inputKey}
          id={inputId}
          className="admin-upload-native-input"
          type="file"
          aria-label={inputLabel}
          aria-invalid={!!invalidText}
          aria-describedby={invalidText ? `${inputId}-error` : undefined}
          accept={accept}
          multiple
          disabled={disabled}
          onChange={(event) => {
            const target = event.target as HTMLInputElement
            if (disabled) {
              return
            }
            onFilesSelected(target.files)
          }}
        />
        <label
          className={`cds--btn cds--btn--primary admin-upload-browse-button${disabled ? ' cds--btn--disabled' : ''}`}
          htmlFor={disabled ? undefined : inputId}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault()
            }
          }}
        >
          Browse files
        </label>
      </div>

      {invalidText && (
        <p
          className="legacy-search-error admin-upload-file-error"
          id={`${inputId}-error`}
          role="alert"
        >
          {invalidText}
        </p>
      )}
    </section>
  )
}

export default MultiFileDropZone

import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Upload } from '@carbon/icons-react'

export type MultiFileDropZoneProps = {
  title: string
  description: string
  inputId: string
  inputKey: number
  inputLabel: string
  accept?: string
  invalidText?: string
  disabled?: boolean
  disabledDescription?: string
  renderAsPanel?: boolean
  variant?: 'default' | 'fspts'
  onFilesSelected: (files: FileList | null) => void
}

function MultiFileDropZone({
  title,
  description,
  inputId,
  inputKey,
  inputLabel,
  accept,
  invalidText,
  disabled = false,
  disabledDescription = 'File upload is not available.',
  renderAsPanel = true,
  variant = 'default',
  onFilesSelected,
}: MultiFileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const openFileDialog = () => {
    if (disabled) {
      return
    }

    inputRef.current?.click()
  }

  const onDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    openFileDialog()
  }

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
    variant === 'fspts' ? 'admin-upload-drop-zone--fspts' : '',
    isDraggingOver ? 'is-dragging' : '',
    disabled ? 'is-disabled' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const fieldContent = (
    <>
      {renderAsPanel ? (
        <div className="admin-upload-panel__header">
          <div>
            <h2 id={`${inputId}-panel-title`}>{title}</h2>
            <p>{description}. Multiple files can be queued and saved together.</p>
          </div>
        </div>
      ) : (
        <div className="admin-upload-field-header">
          <div>
            <span className="admin-upload-field-label" id={`${inputId}-panel-title`}>
              {title}
            </span>
            <p className="admin-upload-field-helper">
              {disabled && variant === 'fspts'
                ? disabledDescription
                : `${description}. Multiple files can be queued and saved together.`}
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
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

      <div
        className={dropZoneClassName}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={`Choose files for ${title}`}
        onClick={openFileDialog}
        onKeyDown={onDropZoneKeyDown}
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
        {variant !== 'fspts' && (
          <div className="admin-upload-drop-zone__icon" aria-hidden="true">
            <Upload size={32} />
          </div>
        )}
        <div>
          <div className="admin-upload-drop-zone__copy">
            <p>
              {variant === 'fspts'
                ? 'Drag and drop files here or click to upload'
                : 'Drag and drop files here, or browse for files.'}
            </p>
            {variant !== 'fspts' && <p>{disabled ? disabledDescription : description}</p>}
          </div>
        </div>
        {variant !== 'fspts' && (
          <span
            className={`cds--btn cds--btn--primary admin-upload-browse-button${disabled ? ' cds--btn--disabled' : ''}`}
            aria-disabled={disabled}
          >
            Browse files
          </span>
        )}
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
    </>
  )

  if (!renderAsPanel) {
    return <div className="admin-upload-drop-zone-field">{fieldContent}</div>
  }

  return (
    <section className="admin-upload-panel" aria-labelledby={`${inputId}-panel-title`}>
      {fieldContent}
    </section>
  )
}

export default MultiFileDropZone

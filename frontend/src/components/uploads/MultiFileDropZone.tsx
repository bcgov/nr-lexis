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
  onFilesSelected,
}) => {
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const onDropUploadFiles = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDraggingOver(false)
    onFilesSelected(event.dataTransfer.files)
  }

  return (
    <section className="admin-upload-panel" aria-labelledby={`${inputId}-panel-title`}>
      <div className="admin-upload-panel__header">
        <div>
          <h2 id={`${inputId}-panel-title`}>{title}</h2>
          <p>{description}. Multiple files can be queued and submitted together.</p>
        </div>
      </div>

      <div
        className={`admin-upload-drop-zone${isDraggingOver ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDraggingOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
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
          <p>{description}</p>
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
          onChange={(event) => {
            const target = event.target as HTMLInputElement
            onFilesSelected(target.files)
          }}
        />
        <label className="cds--btn cds--btn--primary admin-upload-browse-button" htmlFor={inputId}>
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

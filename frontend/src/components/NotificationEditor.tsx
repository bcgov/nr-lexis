import {
  Link,
  ListBulleted,
  ListNumbered,
  TextBold,
  TextItalic,
  TextStrikethrough,
  Unlink,
} from '@carbon/icons-react'
import { Button, TextInput } from '@carbon/react'
import { EditorContent, useEditor } from '@tiptap/react'
import LinkExtension from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '@/components/Modal'
import './NotificationEditor.scss'

type NotificationEditorProps = {
  value: string
  disabled?: boolean
  required?: boolean
  onChange: (value: string) => void
}

const resolveLinkUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

const isSupportedLinkUrl = (value: string): boolean => {
  if (!value) {
    return true
  }

  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

export default function NotificationEditor({
  value,
  disabled = false,
  required = false,
  onChange,
}: NotificationEditorProps) {
  const generatedId = useId().replaceAll(':', '')
  const linkInputId = `notification-editor-link-url-${generatedId}`
  const linkButtonRef = useRef<HTMLButtonElement>(null)
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
      LinkExtension.configure({
        autolink: true,
        defaultProtocol: 'https',
        openOnClick: false,
      }),
    ],
    content: value || '<p></p>',
    editable: !disabled,
    editorProps: {
      attributes: {
        'aria-label': 'Notification content editor',
        ...(required ? { 'aria-required': 'true' } : {}),
        class: 'notification-editor__content',
      },
    },
    onUpdate: ({ editor: updatedEditor }) => onChange(updatedEditor.getHTML()),
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (editor && editor.getHTML() !== value) {
      editor.commands.setContent(value || '<p></p>', { emitUpdate: false })
    }
  }, [editor, value])

  const openLinkModal = (): void => {
    if (!editor || disabled) {
      return
    }

    setLinkUrl(String(editor.getAttributes('link').href ?? ''))
    setIsLinkModalOpen(true)
  }

  const closeLinkModal = (): void => {
    setIsLinkModalOpen(false)
  }

  const applyLink = (): void => {
    if (!editor || disabled) {
      return
    }

    const url = resolveLinkUrl(linkUrl)
    if (!isSupportedLinkUrl(url)) {
      return
    }

    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      closeLinkModal()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    closeLinkModal()
  }

  const editorReady = Boolean(editor)
  const resolvedLinkUrl = resolveLinkUrl(linkUrl)
  const linkUrlIsValid = isSupportedLinkUrl(resolvedLinkUrl)

  return (
    <>
      <div className="notification-editor">
        <div className="notification-editor__toolbar" role="toolbar" aria-label="Text formatting">
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Bold"
            aria-pressed={editor?.isActive('bold') ?? false}
            title="Bold"
            disabled={!editorReady || disabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <TextBold size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Italic"
            aria-pressed={editor?.isActive('italic') ?? false}
            title="Italic"
            disabled={!editorReady || disabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <TextItalic size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Strikethrough"
            aria-pressed={editor?.isActive('strike') ?? false}
            title="Strikethrough"
            disabled={!editorReady || disabled}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <TextStrikethrough size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Bulleted list"
            aria-pressed={editor?.isActive('bulletList') ?? false}
            title="Bulleted list"
            disabled={!editorReady || disabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListBulleted size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Numbered list"
            aria-pressed={editor?.isActive('orderedList') ?? false}
            title="Numbered list"
            disabled={!editorReady || disabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListNumbered size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Add or edit link"
            aria-pressed={editor?.isActive('link') ?? false}
            title="Add or edit link"
            disabled={!editorReady || disabled}
            onClick={openLinkModal}
            ref={linkButtonRef}
          >
            <Link size={16} />
          </button>
          <button
            type="button"
            className="notification-editor__toolbar-button"
            aria-label="Remove link"
            title="Remove link"
            disabled={!editorReady || disabled || !editor?.isActive('link')}
            onClick={() => editor?.chain().focus().unsetLink().run()}
          >
            <Unlink size={16} />
          </button>
        </div>
        <EditorContent editor={editor} />
      </div>
      {createPortal(
        <Modal
          open={isLinkModalOpen}
          passiveModal
          className="notification-editor__link-modal"
          size="sm"
          modalHeading="Add or edit link"
          aria-label="Add or edit link"
          launcherButtonRef={linkButtonRef}
          selectorPrimaryFocus={`#${linkInputId}`}
          onRequestClose={closeLinkModal}
        >
          <TextInput
            id={linkInputId}
            labelText="Link URL"
            helperText="Enter an HTTPS URL or mailto link. Clear the URL to remove an existing link."
            value={linkUrl}
            invalid={!linkUrlIsValid}
            invalidText="Enter a valid HTTPS URL or mailto link."
            disabled={disabled}
            onChange={(event) => setLinkUrl(event.currentTarget.value)}
          />
          <div className="notification-editor__link-modal-actions">
            <Button kind="secondary" onClick={closeLinkModal}>
              Cancel
            </Button>
            <Button kind="primary" disabled={!linkUrlIsValid} onClick={applyLink}>
              Apply link
            </Button>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  )
}

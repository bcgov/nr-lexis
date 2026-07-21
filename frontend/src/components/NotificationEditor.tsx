import {
  Link,
  ListBulleted,
  ListNumbered,
  TextBold,
  TextItalic,
  TextUnderline,
  Unlink,
} from '@carbon/icons-react'
import { EditorContent, useEditor } from '@tiptap/react'
import LinkExtension from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import './NotificationEditor.scss'

type NotificationEditorProps = {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

const resolveLinkUrl = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

export default function NotificationEditor({
  value,
  disabled = false,
  onChange,
}: NotificationEditorProps) {
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
      Underline,
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

  const applyLink = (): void => {
    if (!editor || disabled) {
      return
    }

    const existingUrl = String(editor.getAttributes('link').href ?? '')
    const suppliedUrl = window.prompt('Enter an HTTPS or mailto link URL.', existingUrl)
    if (suppliedUrl === null) {
      return
    }

    const url = resolveLinkUrl(suppliedUrl)
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const editorReady = Boolean(editor)

  return (
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
          aria-label="Underline"
          aria-pressed={editor?.isActive('underline') ?? false}
          title="Underline"
          disabled={!editorReady || disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <TextUnderline size={16} />
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
          onClick={applyLink}
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
  )
}

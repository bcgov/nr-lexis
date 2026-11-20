import { DismissibleTag } from '@carbon/react'
import { memo, useCallback, useLayoutEffect, useRef } from 'react'

type SelectedItemTagsProps<T> = {
  items: readonly T[]
  itemKey: (item: T) => string
  itemText: (item: T) => string
  disabled?: boolean
  onRemove: (item: T) => void
}

type RemovableTagProps = {
  text: string
  index: number
  disabled: boolean
  onRemoveAt: (index: number) => void
}

// Carbon's dismiss tooltip is costly to render, so a tag renders again only when it changes.
const RemovableTag = memo(function RemovableTag({
  text,
  index,
  disabled,
  onRemoveAt,
}: RemovableTagProps) {
  return (
    <DismissibleTag
      type="gray"
      text={text}
      title={`Remove ${text}`}
      disabled={disabled}
      onClose={() => onRemoveAt(index)}
    />
  )
})

/**
 * A multi-select's chosen items as removable tags below the field. Place it right after the field,
 * in the same wrapper. Removing a tag moves focus to the next tag, or to the field once none remain.
 */
export default function SelectedItemTags<T>({
  items,
  itemKey,
  itemText,
  disabled = false,
  onRemove,
}: SelectedItemTagsProps<T>) {
  const tagsRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef({ items, onRemove })
  useLayoutEffect(() => {
    latestRef.current = { items, onRemove }
  })

  const removeAt = useCallback((index: number) => {
    const { items: currentItems, onRemove: remove } = latestRef.current
    if (index >= currentItems.length) return
    remove(currentItems[index])
    requestAnimationFrame(() => {
      const tags = tagsRef.current
      const buttons = tags?.querySelectorAll<HTMLButtonElement>('button')
      const next = buttons?.[Math.min(index, buttons.length - 1)]
      ;(next ?? tags?.parentElement?.querySelector<HTMLInputElement>('input'))?.focus()
    })
  }, [])

  return (
    <div ref={tagsRef} className="selected-item-tags" aria-live="polite">
      {items.map((item, index) => (
        <RemovableTag
          key={itemKey(item)}
          text={itemText(item)}
          index={index}
          disabled={disabled}
          onRemoveAt={removeAt}
        />
      ))}
    </div>
  )
}

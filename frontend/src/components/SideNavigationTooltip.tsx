import { useId, useState, type ReactNode } from 'react'
import { Popover, PopoverContent } from '@carbon/react'

type SideNavigationTooltipProps = {
  enabled: boolean
  label: string
  children: (descriptionId: string | undefined) => ReactNode
}

function SideNavigationTooltip({ enabled, label, children }: SideNavigationTooltipProps) {
  const id = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const open = enabled && (hovered || focused)
  const close = () => {
    setHovered(false)
    setFocused(false)
  }

  // Match Carbon Tooltip's shadow setting: a filter would contain and clip the fixed popover.
  return (
    <Popover
      as="div"
      className="cds--tooltip cds--icon-tooltip csp-side-nav__tooltip"
      align="right"
      autoAlign
      highContrast
      dropShadow={false}
      open={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={close}
      onRequestClose={close}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className="csp-side-nav__tooltip-trigger">{children(enabled ? id : undefined)}</div>
      <PopoverContent id={id} role="tooltip" aria-hidden={!open} className="cds--tooltip-content">
        {label}
      </PopoverContent>
    </Popover>
  )
}

export default SideNavigationTooltip

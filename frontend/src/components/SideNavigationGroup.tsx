import { useId, useRef, type ReactNode } from 'react'
import { ChevronDown, type CarbonIconType } from '@carbon/icons-react'
import SideNavigationTooltip from '@/components/SideNavigationTooltip'

type SideNavigationGroupProps = {
  label: string
  icon: CarbonIconType
  activePage?: string
  collapsed: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  children: (expanded: boolean) => ReactNode
}

function SideNavigationGroup({
  label,
  icon: Icon,
  activePage,
  collapsed,
  open,
  onToggle,
  onClose,
  children,
}: SideNavigationGroupProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const expanded = !collapsed && open
  const isCurrentGroup = Boolean(activePage) && !expanded

  return (
    <li
      className={`cds--side-nav__item csp-side-nav__section${
        isCurrentGroup ? ' cds--side-nav__item--active' : ''
      }`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.stopPropagation()
          onClose()
          buttonRef.current?.focus()
        }
      }}
    >
      <SideNavigationTooltip
        enabled={collapsed}
        label={activePage ? `${label}: ${activePage}` : label}
      >
        {(descriptionId) => (
          <button
            ref={buttonRef}
            type="button"
            className="cds--side-nav__submenu csp-side-nav__group"
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={menuId}
            aria-current={isCurrentGroup ? 'true' : undefined}
            aria-description={isCurrentGroup ? `Contains current page: ${activePage}` : undefined}
            aria-describedby={descriptionId}
            data-label={activePage ? `${label}: ${activePage}` : label}
            onClick={onToggle}
          >
            <span className="cds--side-nav__icon csp-side-nav__icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <span className="cds--side-nav__submenu-title csp-side-nav__link-text">{label}</span>
            <span className="cds--side-nav__submenu-chevron" aria-hidden="true">
              <ChevronDown size={20} />
            </span>
          </button>
        )}
      </SideNavigationTooltip>
      <ul id={menuId} className="cds--side-nav__menu" hidden={!expanded}>
        {children(expanded)}
      </ul>
    </li>
  )
}

export default SideNavigationGroup

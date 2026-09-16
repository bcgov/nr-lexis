import { useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, type CarbonIconType } from '@carbon/icons-react'

type SideNavigationGroupProps = {
  label: string
  icon: CarbonIconType
  activePage?: string
  collapsed: boolean
  onExpandNavigation: () => void
  children: (expanded: boolean) => ReactNode
}

function SideNavigationGroup({
  label,
  icon: Icon,
  activePage,
  collapsed,
  onExpandNavigation,
  children,
}: SideNavigationGroupProps) {
  const [isOpen, setIsOpen] = useState(Boolean(activePage))
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const expanded = !collapsed && isOpen
  const isCurrentGroup = Boolean(activePage) && !expanded

  return (
    <li
      className={`cds--side-nav__item csp-side-nav__section${
        isCurrentGroup ? ' cds--side-nav__item--active' : ''
      }`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.stopPropagation()
          setIsOpen(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="cds--side-nav__submenu csp-side-nav__group"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={menuId}
        aria-current={isCurrentGroup ? 'true' : undefined}
        aria-description={isCurrentGroup ? `Contains current page: ${activePage}` : undefined}
        data-label={activePage ? `${label}: ${activePage}` : label}
        onClick={() => {
          if (collapsed) {
            setIsOpen(true)
            onExpandNavigation()
          } else {
            setIsOpen((current) => !current)
          }
        }}
      >
        <span className="cds--side-nav__icon csp-side-nav__icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span className="cds--side-nav__submenu-title csp-side-nav__link-text">{label}</span>
        <span className="cds--side-nav__submenu-chevron" aria-hidden="true">
          <ChevronDown size={20} />
        </span>
      </button>
      <ul id={menuId} className="cds--side-nav__menu" hidden={!expanded}>
        {children(expanded)}
      </ul>
    </li>
  )
}

export default SideNavigationGroup

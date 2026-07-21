import type { ReactElement } from 'react'
import { Tooltip } from '@carbon/react'

type DisabledButtonTooltipProps = {
  disabled: boolean
  description?: string
  children: ReactElement
}

const DisabledButtonTooltip = ({ disabled, description, children }: DisabledButtonTooltipProps) => {
  if (!disabled || !description) {
    return children
  }

  return (
    <Tooltip align="top" description={description}>
      <span className="disabled-button-tooltip" tabIndex={0} aria-disabled="true">
        {children}
      </span>
    </Tooltip>
  )
}

export default DisabledButtonTooltip

import { Checkbox, Tooltip } from '@carbon/react'

type IneligibleRowCheckboxProps = {
  id: string
  labelText: string
  reason: string
}

/**
 * A row checkbox the batch action can't use. It looks disabled but stays reachable by keyboard,
 * shows the reason on hover or focus, and ignores selection.
 */
const IneligibleRowCheckbox = ({ id, labelText, reason }: IneligibleRowCheckboxProps) => {
  const reasonId = `${id}-reason`
  return (
    <Tooltip align="top" autoAlign className="disabled-button-tooltip-popover" description={reason}>
      <span className="ineligible-row-checkbox">
        <Checkbox
          id={id}
          hideLabel
          labelText={labelText}
          checked={false}
          readOnly
          aria-disabled="true"
          aria-describedby={reasonId}
        />
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      </span>
    </Tooltip>
  )
}

export default IneligibleRowCheckbox

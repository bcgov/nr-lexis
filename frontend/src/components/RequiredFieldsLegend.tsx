import { requiredLabel } from '@/utils/required-label'

type RequiredFieldsLegendProps = {
  className?: string
  /** Reads "Required field" for a card or panel with a single required field. */
  single?: boolean
}

/** The "* Required fields" line, below the card or panel title and above the first field. */
const RequiredFieldsLegend = ({ className, single = false }: RequiredFieldsLegendProps) => (
  <p className={['required-fields-legend', className].filter(Boolean).join(' ')}>
    {requiredLabel(single ? 'Required field' : 'Required fields')}
  </p>
)

export default RequiredFieldsLegend

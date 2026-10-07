import { requiredLabel } from '@/utils/required-label'

type RequiredFieldsLegendProps = {
  className?: string
}

/** The "* Required fields" line, below the card or panel title and above the first field. */
const RequiredFieldsLegend = ({ className }: RequiredFieldsLegendProps) => (
  <p className={['required-fields-legend', className].filter(Boolean).join(' ')}>
    {requiredLabel('Required fields')}
  </p>
)

export default RequiredFieldsLegend

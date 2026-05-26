import { Column, Grid } from '@carbon/react'
import type { FC } from 'react'
import { useParams } from 'react-router-dom'

const ProvincialExemptionDetailsPage: FC = () => {
  const { exemptionNumber } = useParams()

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>Provincial Exemption Details</h1>
        <p>
          Exemption <code>{exemptionNumber}</code> detail route is wired and ready for tab
          migration.
        </p>
        <p>
          Legacy source reference:{' '}
          <code>src/main/webapp/WEB-INF/jsp/provincial/exemption/exemption.jsp</code>
        </p>
      </Column>
    </Grid>
  )
}

export default ProvincialExemptionDetailsPage

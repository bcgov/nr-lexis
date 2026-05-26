import { Column, Grid } from '@carbon/react'
import type { FC } from 'react'
import { useParams } from 'react-router-dom'

const FederalApplicationDetailsPage: FC = () => {
  const { applicationNumber } = useParams()

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>Federal Application Details</h1>
        <p>
          Federal application <code>{applicationNumber}</code> detail route is wired and ready for
          tab migration.
        </p>
        <p>
          Legacy source reference:{' '}
          <code>src/main/webapp/WEB-INF/jsp/federal/application/application.jsp</code>
        </p>
      </Column>
    </Grid>
  )
}

export default FederalApplicationDetailsPage

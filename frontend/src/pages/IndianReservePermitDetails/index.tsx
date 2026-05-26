import { Column, Grid } from '@carbon/react'
import type { FC } from 'react'
import { useParams } from 'react-router-dom'

const IndianReservePermitDetailsPage: FC = () => {
  const { permitNumber } = useParams()

  return (
    <Grid fullWidth className="default-grid">
      <Column sm={4} md={8} lg={12}>
        <h1>Indian Reserve Permit Details</h1>
        <p>
          Indian Reserve permit <code>{permitNumber}</code> detail route is wired and ready for tab
          migration.
        </p>
        <p>
          Legacy source reference:{' '}
          <code>src/main/webapp/WEB-INF/jsp/indianReserve/permit/permit.jsp</code>
        </p>
      </Column>
    </Grid>
  )
}

export default IndianReservePermitDetailsPage
